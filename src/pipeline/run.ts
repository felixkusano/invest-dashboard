/**
 * Tägliche Pipeline. Jeder Schritt ist isoliert: ein Fehler stoppt nur diesen Schritt, wird protokolliert
 * und führt zum Status "partial". Der letzte erfolgreiche Report bleibt immer erhalten (Reports sind append-only).
 *
 * Schritte: FX -> Kurse -> Indizes -> Makro -> News -> Kalender -> Fundamentaldaten -> Scores -> Analyse/Report -> Benachrichtigungen
 */
import { and, desc, eq, gte, inArray, max, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as s from "@/db/schema";
import { buildProviders, type Providers } from "@/providers/registry";
import type { ProviderInstrument } from "@/providers/types";
import { addDays, berlinDate, isTradingDay, lastCompletedTradingDay, toExchange } from "@/lib/time";
import { findNearDuplicate, inferCategory, matchArticle, ruleAssessment, urlHash, type RawArticle } from "@/domain/news";
import { scoreCompany } from "@/domain/scoring";
import { computeAnalytics } from "@/server/analytics";
import { analyzeWithClaude, type AnalysisInput } from "@/ai/analyst";
import { dispatch, type NotificationDraft } from "@/server/notify";
import { loadMacro, loadNews, latestReport } from "@/server/data";
import { INDEX_QUOTES } from "@/db/seed-data";
import { fmtDate } from "@/lib/format";

export type PipelineOptions = {
  db: Db;
  userId: number;
  trigger: "cron" | "manual" | "cli";
  now?: Date;
  providers?: Providers;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  skipAi?: boolean;
};

export type PipelineResult = { runId: number; status: string; steps: s.StepResult[]; reportId: number | null };

export async function runPipeline(o: PipelineOptions): Promise<PipelineResult> {
  const { db, userId } = o;
  const now = o.now ?? new Date();
  const env = o.env ?? process.env;

  // Doppelausführung verhindern (z. B. Cron + manueller Klick gleichzeitig)
  const running = await db.select().from(s.pipelineRuns).where(and(eq(s.pipelineRuns.status, "running"), gte(s.pipelineRuns.startedAt, new Date(now.getTime() - 15 * 60e3))));
  if (running.length) {
    const [skip] = await db.insert(s.pipelineRuns).values({ trigger: o.trigger, status: "skipped", startedAt: now, finishedAt: now, steps: [{ step: "lock", status: "skipped", message: "Es läuft bereits eine Aktualisierung.", durationMs: 0 }] }).returning();
    return { runId: skip.id, status: "skipped", steps: skip.steps, reportId: null };
  }

  const [settings] = await db.select().from(s.settings).where(eq(s.settings.userId, userId));
  const providers = o.providers ?? buildProviders({ demo: settings.demoMode, env, fetchImpl: o.fetchImpl });
  const [run] = await db.insert(s.pipelineRuns).values({ trigger: o.trigger, status: "running", startedAt: now }).returning();
  const steps: s.StepResult[] = [];
  const log = (step: string, level: "info" | "warn" | "error", message: string, provider?: string) =>
    db.insert(s.ingestionLog).values({ runId: run.id, step, level, message: message.slice(0, 2000), provider: provider ?? null });
  const okProvider = (provider: string, dataType?: string) =>
    db.insert(s.providerStatus).values({ provider, lastSuccessAt: new Date(), dataType: dataType ?? null })
      .onConflictDoUpdate({ target: s.providerStatus.provider, set: { lastSuccessAt: new Date(), ...(dataType ? { dataType } : {}) } });
  const errProvider = (provider: string, err: string) =>
    db.insert(s.providerStatus).values({ provider, lastErrorAt: new Date(), lastError: err.slice(0, 500) })
      .onConflictDoUpdate({ target: s.providerStatus.provider, set: { lastErrorAt: new Date(), lastError: err.slice(0, 500) } });

  async function step(name: string, fn: () => Promise<{ message: string; items?: number; skipped?: boolean; failed?: boolean }>) {
    const t0 = Date.now();
    try {
      const r = await fn();
      steps.push({ step: name, status: r.failed ? "failed" : r.skipped ? "skipped" : "ok", message: r.message, durationMs: Date.now() - t0, items: r.items });
      if (r.failed) await log(name, "error", r.message);
    } catch (e) {
      const msg = (e as Error).message;
      steps.push({ step: name, status: "failed", message: msg, durationMs: Date.now() - t0 });
      await log(name, "error", msg);
    }
  }

  // Instrumente: Depot + nicht verworfene Kandidaten
  const holdingInstr = await db.select({ i: s.instruments }).from(s.holdings).innerJoin(s.instruments, eq(s.holdings.instrumentId, s.instruments.id)).where(and(eq(s.holdings.userId, userId), eq(s.holdings.active, true)));
  const candInstr = await db.select({ i: s.instruments }).from(s.candidates).innerJoin(s.instruments, eq(s.candidates.instrumentId, s.instruments.id)).where(and(eq(s.candidates.userId, userId), ne(s.candidates.status, "dismissed")));
  const instrMap = new Map<number, typeof s.instruments.$inferSelect>();
  for (const r of [...holdingInstr, ...candInstr]) instrMap.set(r.i.id, r.i);
  const instruments = [...instrMap.values()];
  const holdingIds = new Set(holdingInstr.map((r) => r.i.id));
  const pi = (i: typeof s.instruments.$inferSelect): ProviderInstrument => ({ id: i.id, symbol: i.symbol, exchange: i.exchange, currency: i.currency, assetClass: i.assetClass, providerSymbols: i.providerSymbols });

  // 1. FX
  await step("fx", async () => {
    const currencies = [...new Set(instruments.map((i) => i.currency).concat(["USD", "NOK"]))].filter((c) => c !== "EUR");
    for (const p of providers.fx) {
      try {
        const snap = await p.latest(currencies);
        for (const [q, rate] of Object.entries(snap.rates)) {
          await db.insert(s.fxRates).values({ base: "EUR", quote: q, rateDate: snap.date, rate, provider: snap.provider }).onConflictDoUpdate({ target: [s.fxRates.base, s.fxRates.quote, s.fxRates.rateDate, s.fxRates.provider], set: { rate, retrievedAt: new Date() } });
        }
        await okProvider(p.name, "Referenzkurs");
        return { message: `${Object.keys(snap.rates).length} Kurse vom ${snap.date} (${p.name})`, items: Object.keys(snap.rates).length };
      } catch (e) { await errProvider(p.name, (e as Error).message); await log("fx", "warn", (e as Error).message, p.name); }
    }
    return { message: "Kein FX-Provider erreichbar. Fremdwährungspositionen bleiben ohne verifizierten EUR-Wert.", failed: true };
  });

  // 2. Kurse
  await step("prices", async () => {
    if (!providers.quotes.length) return { message: "Kein Kurs-Provider konfiguriert (EODHD_API_KEY oder FINNHUB_API_KEY setzen).", skipped: true };
    let ok = 0; const missing: string[] = [];
    for (const i of instruments.filter((x) => x.assetClass !== "crypto" || Object.keys(x.providerSymbols).length)) {
      const [last] = await db.select({ d: max(s.prices.priceDate) }).from(s.prices).where(and(eq(s.prices.instrumentId, i.id), providers.demo ? eq(s.prices.provider, "demo") : ne(s.prices.provider, "demo")));
      const from = last?.d ? addDays(last.d, -7) : addDays(berlinDate(now), holdingIds.has(i.id) ? -400 : -30);
      let done = false;
      for (const p of providers.quotes) {
        if (!p.supports(pi(i))) continue;
        try {
          const q = await p.getDaily(pi(i), from);
          if (!q || !q.bars.length) continue;
          for (let k = 0; k < q.bars.length; k++) {
            const b = q.bars[k];
            const prev = k > 0 ? q.bars[k - 1].close : k === q.bars.length - 1 && q.prevClose != null ? q.prevClose : null;
            await db.insert(s.prices).values({ instrumentId: i.id, provider: q.provider, priceDate: b.date, close: b.close, prevClose: prev, open: b.open, high: b.high, low: b.low, volume: b.volume, currency: q.currency, asOf: k === q.bars.length - 1 ? q.asOf : new Date(b.date + "T23:59:00Z"), dataType: q.dataType })
              .onConflictDoUpdate({ target: [s.prices.instrumentId, s.prices.provider, s.prices.priceDate], set: { close: b.close, ...(prev != null ? { prevClose: prev } : {}), asOf: q.asOf, retrievedAt: new Date(), dataType: q.dataType } });
          }
          // Vortagesschluss für die erste Bar aus der DB nachtragen
          await db.execute(sql`UPDATE prices p SET prev_close = (SELECT close FROM prices q WHERE q.instrument_id = p.instrument_id AND q.provider = p.provider AND q.price_date < p.price_date ORDER BY q.price_date DESC LIMIT 1) WHERE p.instrument_id = ${i.id} AND p.provider = ${q.provider} AND p.prev_close IS NULL`);
          await okProvider(p.name, q.dataType);
          ok++; done = true; break;
        } catch (e) { await errProvider(p.name, (e as Error).message); await log("prices", "warn", `${i.symbol}: ${(e as Error).message}`, p.name); }
      }
      if (!done) missing.push(i.symbol);
    }
    const msg = `${ok} Instrumente aktualisiert${missing.length ? `, ohne Kurs: ${missing.join(", ")}` : ""}`;
    return { message: msg, items: ok, failed: ok === 0 };
  });

  // 3. Indizes über Kurs-Provider (DAX, Euro Stoxx 50, Gold)
  await step("indices", async () => {
    if (!providers.indices.length) return { message: "Kein Index-Provider (EODHD) konfiguriert; S&P 500 und Nasdaq-100 kommen über FRED.", skipped: true };
    let n = 0;
    for (const ix of INDEX_QUOTES) {
      for (const p of providers.indices) {
        try {
          const r = await p.indexDaily(ix.code, ix.eodhd, addDays(berlinDate(now), -400));
          if (!r) continue;
          for (let k = 0; k < r.bars.length; k++) {
            const b = r.bars[k];
            await db.insert(s.marketIndices).values({ code: ix.code, provider: p.name, quoteDate: b.date, value: b.close, prevValue: k > 0 ? r.bars[k - 1].close : null, unit: ix.code === "GOLD" ? "USD/oz" : "Punkte", dataType: "eod", asOf: new Date(b.date + "T23:59:00Z") })
              .onConflictDoUpdate({ target: [s.marketIndices.code, s.marketIndices.provider, s.marketIndices.quoteDate], set: { value: b.close, retrievedAt: new Date() } });
          }
          n++; break;
        } catch (e) { await log("indices", "warn", `${ix.code}: ${(e as Error).message}`, p.name); }
      }
    }
    return { message: `${n} von ${INDEX_QUOTES.length} Indizes aktualisiert`, items: n, failed: n === 0 };
  });

  // 4. Makro
  await step("macro", async () => {
    const series = await db.select().from(s.macroSeries);
    let n = 0; const skipped: string[] = [];
    for (const se of series) {
      const p = providers.macro[se.provider];
      if (!p) { skipped.push(se.code); continue; }
      try {
        const [last] = await db.select({ d: max(s.macroObservations.obsDate) }).from(s.macroObservations).where(eq(s.macroObservations.seriesId, se.id));
        const start = last?.d ? addDays(last.d, -60) : addDays(berlinDate(now), -800);
        const obs = await p.series(se.providerRef, start);
        for (const ob of obs) {
          await db.insert(s.macroObservations).values({ seriesId: se.id, obsDate: ob.date, value: ob.value }).onConflictDoUpdate({ target: [s.macroObservations.seriesId, s.macroObservations.obsDate], set: { value: ob.value, retrievedAt: new Date() } });
        }
        await okProvider(p.name, "offizielle Statistik");
        n++;
      } catch (e) { await errProvider(se.provider, (e as Error).message); await log("macro", "warn", `${se.code}: ${(e as Error).message}`, se.provider); }
    }
    return { message: `${n} von ${series.length} Reihen aktualisiert${skipped.length ? ` (ohne Provider: ${skipped.length}, z. B. FRED_API_KEY fehlt)` : ""}`, items: n, failed: n === 0 && series.length - skipped.length > 0 };
  });

  // 5. News
  await step("news", async () => {
    if (!providers.news.length) return { message: "Kein News-Provider aktiv.", skipped: true };
    const from = addDays(berlinDate(now), -3), to = berlinDate(now);
    const raw: RawArticle[] = [];
    const errors: string[] = [];
    for (const p of providers.news) {
      try { raw.push(...(await p.marketNews())); await okProvider(p.name, "News"); } catch (e) { errors.push(`${p.name}: ${(e as Error).message}`); await errProvider(p.name, (e as Error).message); }
      for (const i of instruments.filter((x) => holdingIds.has(x.id))) {
        try { raw.push(...(await p.companyNews(pi(i), from, to))); } catch (e) { errors.push(`${p.name}/${i.symbol}: ${(e as Error).message}`); }
      }
    }
    const matchables = instruments.map((i) => ({ id: i.id, symbol: i.symbol, aliases: i.aliases, providerSymbols: i.providerSymbols, sector: i.sector, weightPct: null }));
    const analytics = await computeAnalytics(db, userId, now);
    const weights = new Map(analytics.summary.positions.map((p) => [p.instrumentId, p.weightPct ?? 0]));
    const recent = await db.select({ id: s.newsArticles.id, headline: s.newsArticles.headline, publishedAt: s.newsArticles.publishedAt }).from(s.newsArticles).where(gte(s.newsArticles.publishedAt, new Date(now.getTime() - 4 * 86400e3)));
    let inserted = 0;
    for (const a of raw) {
      if (!a.url || !a.headline || Number.isNaN(a.publishedAt.getTime())) continue;
      if (a.publishedAt.getTime() > now.getTime() + 3600e3) continue; // Zeitstempel in der Zukunft verwerfen
      const hash = urlHash(a.url);
      const dup = findNearDuplicate(a, recent);
      const matches = matchArticle(a, matchables);
      const category = inferCategory(a, matches.length);
      const [row] = await db.insert(s.newsArticles).values({
        urlHash: hash, url: a.url, headline: a.headline.slice(0, 500), publisher: a.publisher.slice(0, 120), publishedAt: a.publishedAt,
        provider: a.provider, summary: a.summary, category, rawTickers: a.tickers.slice(0, 20), duplicateOf: dup?.id ?? null, isDemo: false,
      }).onConflictDoNothing().returning({ id: s.newsArticles.id });
      if (!row) continue; // URL bereits bekannt
      inserted++;
      recent.push({ id: row.id, headline: a.headline, publishedAt: a.publishedAt });
      for (const m of matches) await db.insert(s.newsMappings).values({ newsId: row.id, instrumentId: m.instrumentId, matchType: m.matchType }).onConflictDoNothing();
      const ra = ruleAssessment(a, category, matches.filter((m) => holdingIds.has(m.instrumentId)).map((m) => weights.get(m.instrumentId) ?? 0), now);
      await db.insert(s.newsAssessments).values({ newsId: row.id, generatedBy: "rules-v1", relevance: dup ? Math.min(ra.relevance, 20) : ra.relevance, impact: ra.impact, evidenceQuality: ra.evidenceQuality, thesisEffect: ra.thesisEffect }).onConflictDoNothing();
    }
    if (errors.length) await log("news", "warn", errors.slice(0, 10).join(" | "));
    return { message: `${inserted} neue Meldungen (${raw.length} abgerufen)${errors.length ? `, ${errors.length} Fehler` : ""}`, items: inserted, failed: raw.length === 0 && errors.length > 0 };
  });

  // 6. Kalender
  await step("calendar", async () => {
    if (!providers.calendar.length) return { message: "Kein Kalender-Provider (FINNHUB_API_KEY). Nur manuell gepflegte Termine.", skipped: true };
    const bySym = new Map(instruments.map((i) => [(i.providerSymbols.finnhub ?? i.symbol).toUpperCase(), i]));
    let n = 0;
    for (const p of providers.calendar) {
      try {
        const evs = await p.earnings(berlinDate(now), addDays(berlinDate(now), 21));
        for (const e of evs) {
          const i = bySym.get(e.symbol.toUpperCase());
          if (!i) continue;
          // Finnhub-Termine sind Provider-Angaben; Uhrzeit nur als bmo/amc bekannt -> ganztägig
          await db.insert(s.calendarEvents).values({
            eventKey: `earn-${i.symbol}-${e.date}`, eventType: "earnings", title: `${i.name} Quartalszahlen${e.hour === "bmo" ? " (vor US-Börsenstart)" : e.hour === "amc" ? " (nach US-Börsenschluss)" : ""}`,
            startsAt: new Date(e.date + "T12:00:00Z"), allDay: true, instrumentId: i.id, region: i.region, importance: holdingIds.has(i.id) ? 3 : 2,
            consensus: e.epsEstimate != null ? `EPS-Schätzung ${e.epsEstimate}${e.revenueEstimate ? ` | Umsatz ${(e.revenueEstimate / 1e9).toFixed(2)} Mrd.` : ""} (Finnhub)` : null,
            status: "estimated", source: "Finnhub Earnings-Kalender", sourceUrl: "https://finnhub.io/docs/api/earnings-calendar",
          }).onConflictDoUpdate({ target: s.calendarEvents.eventKey, set: { consensus: e.epsEstimate != null ? `EPS-Schätzung ${e.epsEstimate} (Finnhub)` : null, retrievedAt: new Date() } });
          n++;
        }
        await okProvider(p.name);
      } catch (e) { await errProvider(p.name, (e as Error).message); throw e; }
    }
    return { message: `${n} Termine aktualisiert`, items: n };
  });

  // 7. Fundamentaldaten (wöchentlich je Instrument)
  await step("fundamentals", async () => {
    if (!providers.fundamentals.length) return { message: "Kein Fundamentaldaten-Provider konfiguriert.", skipped: true };
    let n = 0; const fails: string[] = [];
    const weekAgo = addDays(berlinDate(now), -7);
    for (const i of instruments.filter((x) => x.assetClass === "equity")) {
      const [last] = await db.select({ d: max(s.fundamentals.asOf) }).from(s.fundamentals).where(and(eq(s.fundamentals.instrumentId, i.id), providers.demo ? eq(s.fundamentals.provider, "demo") : ne(s.fundamentals.provider, "demo")));
      if (last?.d && last.d > weekAgo) continue;
      for (const p of providers.fundamentals) {
        if (!p.supports(pi(i))) continue;
        try {
          const m = await p.metrics(pi(i));
          if (!m) continue;
          await db.insert(s.fundamentals).values({ instrumentId: i.id, provider: p.name, asOf: berlinDate(now), metrics: m as Record<string, number | null> })
            .onConflictDoUpdate({ target: [s.fundamentals.instrumentId, s.fundamentals.provider, s.fundamentals.asOf], set: { metrics: m as Record<string, number | null>, retrievedAt: new Date() } });
          n++;
        } catch (e) { fails.push(`${i.symbol} (${p.name})`); await log("fundamentals", "warn", `${i.symbol}: ${(e as Error).message}`, p.name); }
      }
    }
    return { message: `${n} Kennzahlensätze aktualisiert${fails.length ? `, Fehler: ${fails.slice(0, 8).join(", ")}` : ""}`, items: n };
  });

  // 8. Scores
  await step("scores", async () => {
    const { latestFundamentals } = await import("@/server/data");
    const funds = await latestFundamentals(db, instruments.map((i) => i.id), providers.demo);
    const news = await loadNews(db, { sinceDays: 14, demo: providers.demo, limit: 500 });
    const evs = await db.select().from(s.calendarEvents).where(and(gte(s.calendarEvents.startsAt, now), eq(s.calendarEvents.eventType, "earnings")));
    let n = 0;
    for (const i of instruments.filter((x) => x.assetClass === "equity")) {
      const f = funds.get(i.id);
      if (!f) continue;
      const rel = news.filter((x) => x.symbols.includes(i.symbol) && !x.duplicateOf && x.best);
      const bal = rel.length >= 3 ? rel.reduce((acc, x) => acc + (x.best!.impact === "positive" ? 1 : x.best!.impact === "negative" ? -1 : 0), 0) / rel.length : null;
      const ev = evs.filter((e) => e.instrumentId === i.id).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
      const sc = scoreCompany(f.metrics, { sector: i.sector, upcomingEarningsDays: ev ? Math.ceil((ev.startsAt.getTime() - now.getTime()) / 86400e3) : null, newsBalance: bal });
      const vals = { total: sc.total, quality: sc.quality, growth: sc.growth, valuation: sc.valuation, catalysts: sc.catalysts, risk: sc.risk, confidence: sc.confidence, explanation: sc.explanation, inputs: { metrics: f.metrics, provider: f.provider, fundamentalsAsOf: f.asOf, coveragePct: sc.coveragePct, archetype: sc.archetype, demo: providers.demo } };
      await db.insert(s.investmentScores).values({ instrumentId: i.id, scoreDate: berlinDate(now), ...vals }).onConflictDoUpdate({ target: [s.investmentScores.instrumentId, s.investmentScores.scoreDate], set: { ...vals, scoredAt: new Date() } });
      n++;
    }
    return { message: n ? `${n} Scores berechnet` : "Keine Fundamentaldaten vorhanden, keine Scores.", items: n, skipped: n === 0 };
  });

  // 9. Analyse und Report
  let reportId: number | null = null;
  await step("report", async () => {
    const a = await computeAnalytics(db, userId, now);
    const news = await loadNews(db, { sinceDays: 2, demo: providers.demo, limit: 80 });
    const macro = await loadMacro(db);
    const prev = await latestReport(db, userId);
    const anyEx = a.summary.positions.find((p) => p.price)?.price;
    const closedToday = !isTradingDay("XETRA", berlinDate(now)) && !isTradingDay("NYSE", berlinDate(now));
    const marketStatus = closedToday
      ? `Heute kein Handelstag an XETRA und NYSE. Letzte Schlusskurse: XETRA ${fmtDate(lastCompletedTradingDay("XETRA", now))}, US ${fmtDate(lastCompletedTradingDay("NYSE", now))}.`
      : `Letzter abgeschlossener Handelstag: XETRA ${fmtDate(lastCompletedTradingDay("XETRA", now))}, US ${fmtDate(lastCompletedTradingDay("NYSE", now))}.`;
    const input: AnalysisInput = {
      date: berlinDate(now), marketStatus,
      holdings: a.summary.positions.map((p) => ({ symbol: p.symbol, name: p.name, weightPct: p.weightPct != null ? round(p.weightPct) : null, valueSource: p.valueSource, dailyChangePct: p.dailyChangePct != null ? round(p.dailyChangePct) : null, totalReturnPct: p.totalReturnPct != null ? round(p.totalReturnPct) : null, themes: p.themes, priceDate: p.price?.priceDate ?? null })),
      news: news.slice(0, 40).map((n) => ({ id: n.id, headline: n.headline, publisher: n.publisher, publishedAt: n.publishedAt.toISOString(), summary: n.summary, category: n.category, symbols: n.symbols, ruleRelevance: n.rules?.relevance ?? 0, ruleImpact: n.rules?.impact ?? "unclear", url: n.url, duplicate: !!n.duplicateOf })),
      macro: macro.map((m) => { const o = m.observations; const l = o[o.length - 1], pv = o[o.length - 2]; return { code: m.code, name: m.name, latest: l?.value ?? null, latestDate: l?.date ?? null, previous: pv?.value ?? null, unit: m.unit }; }),
      events: a.events.map((e) => ({ title: e.e.title, date: e.e.startsAt.toISOString().slice(0, 10), status: e.e.status, symbol: e.symbol, importance: e.e.importance })),
      risks: a.risks.slice(0, 8).map((r) => ({ title: r.title, severity: r.severity, evidence: r.evidence })),
      candidates: a.allocCandidates.map((c) => ({ symbol: c.symbol, name: c.name, total: c.total, confidence: c.confidence, isHolding: c.isHolding })),
      allocation: a.allocation.lines.map((l) => ({ label: l.label, amountEur: l.amountEur, reason: l.reason })),
      previous: prev ? { date: prev.reportDate, executiveSummary: ((prev.content as { report?: { executiveSummary?: { text: string }[] } }).report?.executiveSummary ?? []).map((x) => x.text) } : null,
    };
    void anyEx;
    const res = o.skipAi ? { report: (await import("@/ai/analyst")).ruleBasedReport(input), generator: "rules-v1", warnings: [] as string[] } : await analyzeWithClaude(input, env, o.fetchImpl);

    // KI-News-Bewertungen getrennt von den Regeln speichern
    if (res.generator !== "rules-v1") {
      for (const na of res.report.newsAssessments) {
        await db.insert(s.newsAssessments).values({ newsId: na.newsId, generatedBy: res.generator, relevance: na.relevance, impact: na.impact, fundamentalImpact: na.fundamentalImpact, marketImpact: na.marketImpact, horizon: na.horizon, thesisEffect: na.thesisEffect, evidenceQuality: na.evidenceQuality, whyItMatters: na.whyItMatters, monitorNext: na.monitorNext })
          .onConflictDoUpdate({ target: [s.newsAssessments.newsId, s.newsAssessments.generatedBy], set: { relevance: na.relevance, impact: na.impact, whyItMatters: na.whyItMatters, monitorNext: na.monitorNext, createdAt: new Date() } });
      }
    }
    const date = berlinDate(now);
    const [v] = await db.select({ v: max(s.dailyReports.version) }).from(s.dailyReports).where(and(eq(s.dailyReports.userId, userId), eq(s.dailyReports.reportDate, date), eq(s.dailyReports.kind, "daily")));
    const failedSteps = steps.filter((x) => x.status === "failed").map((x) => x.step);
    const cited = new Set(res.report.executiveSummary.concat(res.report.marketSummary, res.report.portfolioImplications).flatMap((x) => x.sourceNewsIds).concat(res.report.newsAssessments.map((x) => x.newsId)));
    const sources = news.filter((n) => cited.has(n.id)).map((n) => ({ title: n.headline, url: n.url, publisher: n.publisher }));
    const [rep] = await db.insert(s.dailyReports).values({
      userId, reportDate: date, kind: "daily", version: (v?.v ?? 0) + 1, status: failedSteps.length ? "partial" : "complete", generator: res.generator,
      content: { report: res.report, warnings: res.warnings, failedSteps, marketStatus, demo: providers.demo, allocation: a.allocation, portfolio: { securities: a.summary.securities, crypto: a.summary.crypto, completeness: a.summary.completeness }, risks: a.risks.slice(0, 10) },
      sources,
      inputTimestamps: {
        fx: a.fx.date, latestPrice: a.summary.positions.map((p) => p.price?.priceDate).filter(Boolean).sort().pop() ?? null,
        newsNewest: news[0]?.publishedAt.toISOString() ?? null, macroNewest: input.macro.map((m) => m.latestDate).filter(Boolean).sort().pop() ?? null,
        generatedAt: new Date().toISOString(),
      },
      runId: run.id,
    }).returning({ id: s.dailyReports.id });
    reportId = rep.id;
    await db.insert(s.allocationRecommendations).values({ userId, month: date.slice(0, 7), budgetEur: a.settings.monthlyBudgetEur, result: a.allocation as unknown as Record<string, unknown>, reportId: rep.id });

    // Thesen: Änderungen werden angehängt, nie überschrieben
    for (const tc of res.report.thesisChanges) {
      const instr = [...instrMap.values()].find((i) => i.symbol === tc.symbol);
      if (!instr) continue;
      const [th] = await db.select().from(s.theses).where(and(eq(s.theses.userId, userId), eq(s.theses.instrumentId, instr.id))).orderBy(desc(s.theses.createdAt)).limit(1);
      if (!th) continue;
      await db.insert(s.thesisReviews).values({ thesisId: th.id, status: tc.status, note: tc.change, reportId: rep.id, author: res.generator });
      await db.update(s.theses).set({ lastReviewAt: new Date(), status: tc.status === "active" ? th.status : tc.status }).where(eq(s.theses.id, th.id));
    }
    return { message: `Report v${(v?.v ?? 0) + 1} erstellt (${res.generator})${res.warnings.length ? `, ${res.warnings.length} Hinweis(e)` : ""}`, items: 1 };
  });

  // 10. Benachrichtigungen
  await step("notifications", async () => {
    const a = await computeAnalytics(db, userId, now);
    const prefs = a.settings.notification;
    const drafts: NotificationDraft[] = [];
    const date = berlinDate(now);
    for (const r of a.risks.filter((x) => x.severity >= prefs.minRiskSeverity)) drafts.push({ kind: "risk", severity: r.severity, title: r.title, body: r.evidence, dedupeKey: `risk-${r.code}-${date.slice(0, 7)}` });
    const news = await loadNews(db, { sinceDays: 1, demo: providers.demo, limit: 100 });
    for (const n of news.filter((x) => x.symbols.length && (x.best?.relevance ?? 0) >= prefs.minNewsRelevance && !x.duplicateOf)) drafts.push({ kind: "news", severity: 3, title: `${n.symbols.join(", ")}: ${n.headline}`, body: `${n.publisher} | ${n.url}`, dedupeKey: `news-${n.id}` });
    for (const c of a.allocCandidates.filter((x) => !x.isHolding && (x.total ?? 0) >= prefs.minCandidateScore && x.confidence !== "low" && x.confidence !== "insufficient")) drafts.push({ kind: "candidate", severity: 2, title: `Kandidat ${c.symbol} erreicht Score ${c.total!.toFixed(0)}`, body: c.thesis, dedupeKey: `cand-${c.instrumentId}-${date.slice(0, 7)}` });
    const failed = steps.filter((x) => x.status === "failed");
    if (failed.length && prefs.notifyFailedUpdates) drafts.push({ kind: "update_failed", severity: 3, title: `Aktualisierung teilweise fehlgeschlagen (${failed.map((f) => f.step).join(", ")})`, body: failed.map((f) => `${f.step}: ${f.message}`).join("\n"), dedupeKey: `fail-${date}-${failed.map((f) => f.step).join("-")}` });
    const sent = await dispatch(db, userId, prefs, drafts, env, o.fetchImpl);
    return { message: `${sent.length} neue Benachrichtigung(en)`, items: sent.length };
  });

  const failed = steps.filter((x) => x.status === "failed");
  const reportOk = steps.find((x) => x.step === "report")?.status === "ok";
  const status = !reportOk ? "failed" : failed.length ? "partial" : "success";
  await db.update(s.pipelineRuns).set({ status, steps, finishedAt: new Date() }).where(eq(s.pipelineRuns.id, run.id));
  return { runId: run.id, status, steps, reportId };
}

const round = (v: number) => Math.round(v * 100) / 100;
void inArray; void toExchange;
