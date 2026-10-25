import { describe, expect, it, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type Db } from "@/db/client";
import * as s from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import { runPipeline } from "@/pipeline/run";
import type { Providers } from "@/providers/registry";
import type { ProviderInstrument, QuoteProvider, QuoteResult } from "@/providers/types";
import { loadHoldingRows, loadNews, loadPortfolio, latestReport } from "@/server/data";
import { computeAnalytics } from "@/server/analytics";

const NOW = new Date("2026-10-26T05:30:00Z"); // Montag 06:30 Berlin (Winterzeit)

class FakeQuotes implements QuoteProvider {
  readonly name = "fake"; readonly dataType = "eod" as const;
  constructor(private fail = false) {}
  supports(i: ProviderInstrument) { return !!i.providerSymbols.eodhd; }
  async getDaily(i: ProviderInstrument): Promise<QuoteResult | null> {
    if (this.fail) throw new Error("Provider down");
    const base = i.symbol.length * 10;
    // Freitag 23.10. ist der letzte Handelstag, am Wochenende keine Balken
    return { instrumentId: i.id, provider: this.name, currency: i.currency, dataType: "eod", asOf: new Date("2026-10-23T22:00:00Z"),
      bars: [{ date: "2026-10-22", open: null, high: null, low: null, close: base, volume: null }, { date: "2026-10-23", open: null, high: null, low: null, close: base * 1.02, volume: null }] };
  }
}

const providers = (fail = false): Providers => ({
  quotes: [new FakeQuotes(fail)], indices: [],
  news: [{
    name: "fakenews",
    companyNews: async () => [],
    marketNews: async () => {
      if (fail) throw new Error("news down");
      return [
        { url: "https://www.reuters.com/a?utm_source=x", headline: "Nvidia raises guidance after record quarter", publisher: "Reuters", publishedAt: new Date("2026-10-25T20:00:00Z"), summary: null, tickers: ["NVDA"], provider: "fakenews" },
        { url: "https://reuters.com/a", headline: "Nvidia raises guidance after record quarter", publisher: "Reuters", publishedAt: new Date("2026-10-25T20:00:00Z"), summary: null, tickers: ["NVDA"], provider: "fakenews" },
        { url: "https://other.example/b", headline: "Nvidia raises guidance after a record quarter", publisher: "Other", publishedAt: new Date("2026-10-25T21:00:00Z"), summary: null, tickers: [], provider: "fakenews" },
      ];
    },
  }],
  fundamentals: [{ name: "fakefund", supports: () => true, metrics: async () => (fail ? null : { grossMargin: 60, operatingMargin: 25, roic: 20, revenueGrowthYoy: 25, revenueGrowth3y: 20, epsGrowthYoy: 30, peTtm: 30, evEbitda: 20, fcfYield: 3, debtToEquity: 0.3, currentRatio: 2, beta: 1.2, priceReturn52w: 20, relStrength52w: 5 }) }],
  calendar: [], macro: {},
  fx: [{ name: "fakefx", latest: async () => { if (fail) throw new Error("fx down"); return { date: "2026-10-23", rates: { USD: 1.08, NOK: 11.6 }, provider: "ecb" }; } }],
  demo: false,
});

describe("Pipeline mit Datenbank (PGlite)", () => {
  let db: Db; let userId: number;
  beforeAll(async () => { db = await createTestDb(); userId = await ensureSeeded(db, "me@example.com"); });

  it("Seed ist idempotent und legt das Startportfolio unverifiziert an", async () => {
    expect(await ensureSeeded(db, "me@example.com")).toBe(userId);
    const rows = await loadHoldingRows(db, userId);
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.h.quantity == null && r.h.dataQuality === "unverified")).toBe(true);
    const p = await loadPortfolio(db, userId);
    expect(p.summary.securities.provisionalValueEur).toBeCloseTo(8147.9, 1);
    expect(p.summary.crypto.provisionalValueEur).toBeCloseTo(4178.89);
    expect(p.summary.missing.find((m) => m.symbol === "AAPL")!.issues).toContain("Kein Wert verfügbar");
  });

  it("vollständiger Lauf: speichert Kurse, News ohne Dubletten, Scores, Report und Allokation", async () => {
    const r = await runPipeline({ db, userId, trigger: "cli", now: NOW, providers: providers(), env: {} as NodeJS.ProcessEnv });
    expect(r.status).toBe("success");
    const rep = await latestReport(db, userId);
    expect(rep!.version).toBe(1);
    expect(rep!.generator).toBe("rules-v1");
    const news = await loadNews(db, { sinceDays: 30, limit: 50 });
    expect(news).toHaveLength(2); // gleiche URL nur einmal
    expect(news.filter((n) => n.duplicateOf != null)).toHaveLength(1); // inhaltsgleiche Wiederholung markiert
    expect(news.find((n) => !n.duplicateOf)!.symbols).toContain("NVDA");
    const alloc = (rep!.content as { allocation: { totalEur: number } }).allocation;
    expect(alloc.totalEur).toBe(500);
  });

  it("ohne Stückzahlen bleibt der Depotwert vorläufig; mit Stückzahl wird er verifiziert", async () => {
    let p = await loadPortfolio(db, userId);
    expect(p.summary.securities.verifiedValueEur).toBe(0);
    const nv = p.rows.find((r) => r.i.symbol === "NVDA")!;
    await db.update(s.holdings).set({ quantity: 10 }).where(eq(s.holdings.id, nv.h.id));
    p = await loadPortfolio(db, userId);
    const pos = p.summary.positions.find((x) => x.symbol === "NVDA")!;
    expect(pos.valueSource).toBe("market");
    expect(pos.price!.priceDate).toBe("2026-10-23"); // Wochenende: letzter Handelstag, kein künstlicher Tag
    expect(pos.marketValueEur).toBeCloseTo((10 * 40 * 1.02) / 1.08);
    expect(pos.dailyChangePct).toBeCloseTo(2);
    expect(pos.totalReturnPct).not.toBeNull(); // Einstand 546 aus früherer Angabe
  });

  it("Allokation respektiert das Cluster-Limit und summiert auf das Budget", async () => {
    const a = await computeAnalytics(db, userId, NOW);
    expect(a.allocation.totalEur).toBe(500);
    const opp = a.allocation.lines.find((l) => l.kind === "opportunity");
    if (opp) {
      const c = a.allocCandidates.find((x) => x.instrumentId === opp.instrumentId)!;
      for (const t of c.themes) expect(a.themeWeights[t] ?? 0).toBeLessThan(a.settings.limits.maxThemePct);
    }
    const aiCands = a.allocCandidates.filter((c) => c.themes.includes("ai_infrastructure"));
    if ((a.themeWeights.ai_infrastructure ?? 0) >= a.settings.limits.maxThemePct) {
      expect(aiCands.every((c) => a.allocation.excluded.some((e) => e.symbol === c.symbol))).toBe(true);
    }
  });

  it("fehlgeschlagener Lauf erhält den letzten erfolgreichen Report und dupliziert nichts", async () => {
    const before = await latestReport(db, userId);
    const r = await runPipeline({ db, userId, trigger: "cli", now: new Date(NOW.getTime() + 3600e3), providers: providers(true), env: {} as NodeJS.ProcessEnv });
    expect(r.status).toBe("partial");
    expect(r.steps.find((x) => x.step === "prices")!.status).toBe("failed");
    const after = await latestReport(db, userId);
    expect(after!.version).toBe(2); // neue Version angehängt
    const first = (await db.select().from(s.dailyReports).where(eq(s.dailyReports.id, before!.id)))[0];
    expect(first.content).toEqual(before!.content); // alter Report unverändert
    const prices = await db.select().from(s.prices);
    const keys = prices.map((p) => `${p.instrumentId}-${p.provider}-${p.priceDate}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("Lock verhindert parallele Läufe", async () => {
    await db.insert(s.pipelineRuns).values({ trigger: "manual", status: "running", startedAt: new Date(NOW.getTime() + 7200e3) });
    const r = await runPipeline({ db, userId, trigger: "cron", now: new Date(NOW.getTime() + 7300e3), providers: providers(), env: {} as NodeJS.ProcessEnv });
    expect(r.status).toBe("skipped");
  });

  it("EODHD-Free-Budget: Tageslimit wird eingehalten, wiederholte Läufe rufen nichts doppelt ab", async () => {
    let calls = 0; const seen: number[] = [];
    class CountingEod extends FakeQuotes { override readonly name = "eodhd"; override async getDaily(i: ProviderInstrument) { calls++; seen.push(i.id); const r = await super.getDaily(i); return r && { ...r, provider: "eodhd" }; } }
    const pv = { ...providers(), quotes: [new CountingEod()] } as unknown as Providers;
    await db.update(s.pipelineRuns).set({ status: "failed" }).where(eq(s.pipelineRuns.status, "running")); // Lock aus vorherigem Test lösen
    const t = new Date(); // retrievedAt nutzt die echte Uhr
    await runPipeline({ db, userId, trigger: "cli", now: t, providers: pv, env: { EODHD_DAILY_LIMIT: "4" } as unknown as NodeJS.ProcessEnv });
    expect(calls).toBe(4);
    await runPipeline({ db, userId, trigger: "cli", now: new Date(t.getTime() + 60e3), providers: pv, env: { EODHD_DAILY_LIMIT: "4" } as unknown as NodeJS.ProcessEnv });
    expect(calls).toBe(8);
    expect(new Set(seen).size).toBe(8); // bereits heute geladene Instrumente werden nicht erneut abgerufen
  });

  it("Datenisolation: ein zweiter Nutzer sieht keine fremden Positionen", async () => {
    const other = await ensureSeeded(db, "other@example.com");
    const mine = await loadHoldingRows(db, userId);
    const theirs = await loadHoldingRows(db, other);
    expect(new Set(mine.map((r) => r.h.id)).size).toBe(mine.length);
    expect(theirs.some((t) => mine.some((m) => m.h.id === t.h.id))).toBe(false);
    expect(theirs.every((t) => t.h.userId === other)).toBe(true);
  });

  it("Demo-Daten werden nie als echte Kurse gelesen", async () => {
    const [nv] = await db.select().from(s.instruments).where(eq(s.instruments.symbol, "VNA"));
    await db.insert(s.prices).values({ instrumentId: nv.id, provider: "demo", priceDate: "2026-10-30", close: 999, currency: "EUR", asOf: new Date(), dataType: "demo" });
    const p = await loadPortfolio(db, userId);
    expect(p.summary.positions.find((x) => x.symbol === "VNA")!.price!.close).not.toBe(999);
  });
});
