/**
 * Lesemodelle für UI und Pipeline. Alle Abfragen sind auf die userId beschränkt (Datenisolation),
 * Marktdaten sind nutzerübergreifend, aber Demo-Zeilen werden nur im Demo-Modus gelesen.
 */
import { and, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as s from "@/db/schema";
import { summarizePortfolio, type FxTable, type PositionInput, type PriceQuote } from "@/domain/portfolio";
import type { Metrics } from "@/domain/scoring";

export type SettingsRow = typeof s.settings.$inferSelect;
export type InstrumentRow = typeof s.instruments.$inferSelect;

export async function loadSettings(db: Db, userId: number): Promise<SettingsRow> {
  const [row] = await db.select().from(s.settings).where(eq(s.settings.userId, userId));
  if (!row) throw new Error("Einstellungen fehlen");
  return row;
}

export async function loadFx(db: Db, demo: boolean): Promise<{ fx: FxTable; date: string | null; provider: string | null }> {
  const rows = await db.select().from(s.fxRates)
    .where(demo ? sql`true` : ne(s.fxRates.provider, "demo"))
    .orderBy(desc(s.fxRates.rateDate), desc(s.fxRates.retrievedAt));
  const fx: FxTable = {};
  let date: string | null = null, provider: string | null = null;
  for (const r of rows) {
    if (fx[r.quote] == null) { fx[r.quote] = r.rate; date ??= r.rateDate; provider ??= r.provider; }
  }
  return { fx, date, provider };
}

/** Jüngster Kurs je Instrument (über alle zugelassenen Provider), inkl. Vortagesschluss. */
export async function latestPrices(db: Db, instrumentIds: number[], demo: boolean): Promise<Map<number, PriceQuote>> {
  const out = new Map<number, PriceQuote>();
  if (!instrumentIds.length) return out;
  const rows = await db.select().from(s.prices)
    .where(and(inArray(s.prices.instrumentId, instrumentIds), demo ? eq(s.prices.provider, "demo") : ne(s.prices.provider, "demo")))
    .orderBy(desc(s.prices.priceDate), desc(s.prices.asOf));
  for (const r of rows) {
    if (out.has(r.instrumentId)) continue;
    out.set(r.instrumentId, { close: r.close, prevClose: r.prevClose, currency: r.currency, priceDate: r.priceDate, dataType: r.dataType as PriceQuote["dataType"], asOf: r.asOf, provider: r.provider });
  }
  return out;
}

export async function priceHistory(db: Db, instrumentId: number, demo: boolean, fromDate: string) {
  const rows = await db.select({ date: s.prices.priceDate, close: s.prices.close, provider: s.prices.provider, currency: s.prices.currency })
    .from(s.prices)
    .where(and(eq(s.prices.instrumentId, instrumentId), gte(s.prices.priceDate, fromDate), demo ? eq(s.prices.provider, "demo") : ne(s.prices.provider, "demo")))
    .orderBy(s.prices.priceDate);
  const byDate = new Map<string, { date: string; close: number; currency: string }>();
  for (const r of rows) if (!byDate.has(r.date) || r.provider === "eodhd") byDate.set(r.date, r);
  return [...byDate.values()];
}

export async function loadHoldingRows(db: Db, userId: number) {
  return db.select({ h: s.holdings, i: s.instruments }).from(s.holdings)
    .innerJoin(s.instruments, eq(s.holdings.instrumentId, s.instruments.id))
    .where(and(eq(s.holdings.userId, userId), eq(s.holdings.active, true)));
}

export async function loadPortfolio(db: Db, userId: number) {
  const settings = await loadSettings(db, userId);
  const demo = settings.demoMode;
  const rows = await loadHoldingRows(db, userId);
  const prices = await latestPrices(db, rows.map((r) => r.i.id), demo);
  const fxInfo = await loadFx(db, demo);
  const inputs: PositionInput[] = rows.map(({ h, i }) => ({
    holdingId: h.id, instrumentId: i.id, symbol: i.symbol, name: i.name, assetClass: i.assetClass as PositionInput["assetClass"],
    currency: i.currency, sector: i.sector, country: i.country, region: i.region, themes: i.themes,
    quantity: h.quantity, costBasisEur: h.costBasisEur, costBasisSource: h.costBasisSource, importedValueEur: h.importedValueEur, importedPerfPct: h.importedPerfPct,
    price: prices.get(i.id) ?? null,
  }));
  const summary = summarizePortfolio(inputs, fxInfo.fx);
  return { settings, summary, fx: fxInfo, rows, demo };
}

export async function latestFundamentals(db: Db, instrumentIds: number[], demo: boolean): Promise<Map<number, { metrics: Metrics; asOf: string; provider: string }>> {
  const out = new Map<number, { metrics: Metrics; asOf: string; provider: string }>();
  if (!instrumentIds.length) return out;
  const rows = await db.select().from(s.fundamentals)
    .where(and(inArray(s.fundamentals.instrumentId, instrumentIds), demo ? eq(s.fundamentals.provider, "demo") : ne(s.fundamentals.provider, "demo")))
    .orderBy(desc(s.fundamentals.asOf));
  for (const r of rows) {
    const cur = out.get(r.instrumentId);
    if (!cur) out.set(r.instrumentId, { metrics: r.metrics as Metrics, asOf: r.asOf, provider: r.provider });
    else if (cur.asOf === r.asOf) {
      // Provider kombinieren: fehlende Kennzahlen aus zweiter Quelle ergänzen
      for (const [k, v] of Object.entries(r.metrics)) if ((cur.metrics as Record<string, unknown>)[k] == null && v != null) (cur.metrics as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

export async function latestScores(db: Db, instrumentIds?: number[]) {
  const rows = await db.select().from(s.investmentScores)
    .where(instrumentIds?.length ? inArray(s.investmentScores.instrumentId, instrumentIds) : sql`true`)
    .orderBy(desc(s.investmentScores.scoreDate));
  const out = new Map<number, typeof s.investmentScores.$inferSelect>();
  for (const r of rows) if (!out.has(r.instrumentId)) out.set(r.instrumentId, r);
  return out;
}

export async function loadEvents(db: Db, from: Date, to: Date) {
  return db.select({ e: s.calendarEvents, symbol: s.instruments.symbol, name: s.instruments.name })
    .from(s.calendarEvents).leftJoin(s.instruments, eq(s.calendarEvents.instrumentId, s.instruments.id))
    .where(and(gte(s.calendarEvents.startsAt, from), lte(s.calendarEvents.startsAt, to)))
    .orderBy(s.calendarEvents.startsAt);
}

export type NewsItem = Awaited<ReturnType<typeof loadNews>>[number];

export async function loadNews(db: Db, opts: { limit?: number; sinceDays?: number; instrumentId?: number; demo?: boolean } = {}) {
  const since = new Date(Date.now() - (opts.sinceDays ?? 7) * 86400e3);
  let ids: number[] | null = null;
  if (opts.instrumentId) {
    ids = (await db.select({ id: s.newsMappings.newsId }).from(s.newsMappings).where(eq(s.newsMappings.instrumentId, opts.instrumentId))).map((r) => r.id);
    if (!ids.length) return [];
  }
  const articles = await db.select().from(s.newsArticles)
    .where(and(gte(s.newsArticles.publishedAt, since), eq(s.newsArticles.isDemo, !!opts.demo), ids ? inArray(s.newsArticles.id, ids) : sql`true`))
    .orderBy(desc(s.newsArticles.publishedAt)).limit(opts.limit ?? 200);
  if (!articles.length) return [];
  const aIds = articles.map((a) => a.id);
  const maps = await db.select({ newsId: s.newsMappings.newsId, symbol: s.instruments.symbol, instrumentId: s.instruments.id, sector: s.instruments.sector })
    .from(s.newsMappings).innerJoin(s.instruments, eq(s.newsMappings.instrumentId, s.instruments.id)).where(inArray(s.newsMappings.newsId, aIds));
  const assess = await db.select().from(s.newsAssessments).where(inArray(s.newsAssessments.newsId, aIds)).orderBy(desc(s.newsAssessments.createdAt));
  return articles.map((a) => {
    const all = assess.filter((x) => x.newsId === a.id);
    const ai = all.find((x) => x.generatedBy !== "rules-v1") ?? null;
    const rules = all.find((x) => x.generatedBy === "rules-v1") ?? null;
    return { ...a, symbols: maps.filter((m) => m.newsId === a.id).map((m) => m.symbol), sectors: [...new Set(maps.filter((m) => m.newsId === a.id).map((m) => m.sector).filter(Boolean))] as string[], ai, rules, best: ai ?? rules };
  });
}

export async function loadMacro(db: Db) {
  const series = await db.select().from(s.macroSeries);
  const obs = await db.select().from(s.macroObservations)
    .where(gte(s.macroObservations.obsDate, new Date(Date.now() - 800 * 86400e3).toISOString().slice(0, 10)))
    .orderBy(s.macroObservations.obsDate);
  return series.map((se) => {
    const o = obs.filter((x) => x.seriesId === se.id);
    return { ...se, observations: o.map((x) => ({ date: x.obsDate, value: x.value, retrievedAt: x.retrievedAt })) };
  });
}

export async function loadMarketQuotes(db: Db, demo: boolean) {
  const rows = await db.select().from(s.marketIndices)
    .where(demo ? sql`true` : ne(s.marketIndices.provider, "demo"))
    .orderBy(s.marketIndices.quoteDate);
  const by = new Map<string, typeof rows>();
  for (const r of rows) { const a = by.get(r.code) ?? []; a.push(r); by.set(r.code, a); }
  return by;
}

export async function latestReport(db: Db, userId: number, kind = "daily") {
  const [r] = await db.select().from(s.dailyReports).where(and(eq(s.dailyReports.userId, userId), eq(s.dailyReports.kind, kind)))
    .orderBy(desc(s.dailyReports.reportDate), desc(s.dailyReports.version)).limit(1);
  return r ?? null;
}

export async function previousReport(db: Db, userId: number, beforeId: number) {
  const cur = (await db.select().from(s.dailyReports).where(eq(s.dailyReports.id, beforeId)))[0];
  if (!cur) return null;
  const [r] = await db.select().from(s.dailyReports)
    .where(and(eq(s.dailyReports.userId, userId), eq(s.dailyReports.kind, cur.kind), sql`(${s.dailyReports.reportDate} < ${cur.reportDate} OR (${s.dailyReports.reportDate} = ${cur.reportDate} AND ${s.dailyReports.version} < ${cur.version}))`))
    .orderBy(desc(s.dailyReports.reportDate), desc(s.dailyReports.version)).limit(1);
  return r ?? null;
}

export async function lastRuns(db: Db, n = 10) {
  return db.select().from(s.pipelineRuns).orderBy(desc(s.pipelineRuns.startedAt)).limit(n);
}

export async function lastSuccessfulRun(db: Db) {
  const [r] = await db.select().from(s.pipelineRuns).where(inArray(s.pipelineRuns.status, ["success", "partial"])).orderBy(desc(s.pipelineRuns.finishedAt)).limit(1);
  return r ?? null;
}

export async function providerStatuses(db: Db) {
  return db.select().from(s.providerStatus);
}
