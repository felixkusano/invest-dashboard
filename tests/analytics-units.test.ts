import { describe, expect, it } from "vitest";
import { lookThrough, structuralOverlapNote, weightOverlapPct } from "@/domain/overlap";
import { band, scoreCompany } from "@/domain/scoring";
import { mechanicalScenarios } from "@/domain/scenarios";
import { dashboardStatus, priceFreshness } from "@/domain/freshness";
import { addDays, berlinDate, berlinToUtc, isTradingDay, isWithinBerlinWindow, lastCompletedTradingDay, shouldRunDaily } from "@/lib/time";
import { computeRisks } from "@/domain/risk";
import { summarizePortfolio } from "@/domain/portfolio";

describe("ETF-Overlap", () => {
  const a = [{ key: "NVDA", name: "N", weightPct: 5 }, { key: "AAPL", name: "A", weightPct: 4 }, { key: "X", name: "X", weightPct: 1 }];
  const b = [{ key: "NVDA", name: "N", weightPct: 4 }, { key: "AAPL", name: "A", weightPct: 4.5 }, { key: "TSM", name: "T", weightPct: 1 }];
  it("Summe der Minimum-Gewichte", () => expect(weightOverlapPct(a, b)).toBeCloseTo(8));
  it("Durchschau addiert direkte und indirekte Exposures", () => {
    const r = lookThrough({ directPositions: [{ key: "NVDA", name: "N", valueEur: 2000 }], etfs: [{ name: "W", valueEur: 1000, constituents: a }, { name: "S", valueEur: 500, constituents: null }] }, 3500);
    const nv = r.rows.find((x) => x.key === "NVDA")!;
    expect(nv.totalEur).toBeCloseTo(2050);
    expect(r.approximate).toBe(true);
    expect(r.coveragePct).toBeCloseTo(66.67, 1);
  });
  it("ohne Holdings nur qualitative Einordnung, keine Zahl", () => {
    const n = structuralOverlapNote("iShares Core MSCI World", "Vanguard FTSE All-World")!;
    expect(n).toContain("Schwellenländer");
    expect(n).not.toMatch(/\d+ ?%/);
  });
});

describe("Scoring", () => {
  it("vergibt ohne Daten keinen Score", () => {
    const r = scoreCompany({}, { sector: "Software", upcomingEarningsDays: null, newsBalance: null });
    expect(r.total).toBeNull();
    expect(r.confidence).toBe("insufficient");
  });
  it("bleibt in den Komponentengrenzen und nutzt den Bank-Kennzahlensatz", () => {
    const r = scoreCompany({ roe: 17, netMargin: 32, peTtm: 12, pb: 1.9, revenueGrowthYoy: 8, epsGrowthYoy: 12, revenueGrowth3y: 6, beta: 1.1, priceReturn52w: 30, relStrength52w: 10 }, { sector: "Banken", upcomingEarningsDays: 10, newsBalance: 0.2 });
    expect(r.archetype).toBe("bank");
    expect(r.quality).toBeLessThanOrEqual(25);
    expect(r.total).not.toBeNull();
    expect(r.total!).toBeGreaterThan(0);
    expect(r.total!).toBeLessThanOrEqual(100);
    expect(r.explanation.method).toContain("Bank");
  });
  it("band ist begrenzt und richtungsfähig", () => {
    expect(band(100, 0, 10)).toBe(1);
    expect(band(-5, 0, 10)).toBe(0);
    expect(band(20, 40, 10)).toBeCloseTo(2 / 3);
    expect(band(null, 0, 1)).toBeNull();
  });
});

describe("Szenarien", () => {
  it("rechnet mechanisch und transparent", () => {
    const s = mechanicalScenarios(20, 30)!;
    expect(s[1].priceChangePct).toBeCloseTo(20);
    expect(s[2].priceChangePct).toBeCloseTo((1.06 * 0.75 - 1) * 100);
  });
  it("ohne positives KGV keine Szenarien", () => expect(mechanicalScenarios(10, -5)).toBeNull());
  it("Bull > Base > Bear auch bei negativem Gewinntrend", () => {
    const s = mechanicalScenarios(-5, 32)!;
    expect(s[0].priceChangePct).toBeGreaterThan(s[1].priceChangePct);
    expect(s[1].priceChangePct).toBeGreaterThan(s[2].priceChangePct);
  });
  it("PEG wird nicht als Prozent ausgewiesen", () => {
    const r = scoreCompany({ peTtm: 30, epsGrowthYoy: 20, grossMargin: 50 }, { sector: "Software", upcomingEarningsDays: null, newsBalance: null });
    expect(r.explanation.valuation).toMatch(/PEG \(KGV\/Wachstum\): 1,50(?! %)/);
  });
});

describe("Zeitzonen und Handelstage", () => {
  it("Cron-Gate toleriert verspätete GitHub-Starts in Sommer- und Winterzeit", () => {
    // Winterzeit: Starts um 06:13 und 07:12 Berlin (beobachtete Verspätung) liegen im Fenster
    expect(isWithinBerlinWindow(new Date("2026-10-30T05:13:00Z"), "06:30")).toBe(true);
    expect(isWithinBerlinWindow(new Date("2026-10-30T06:12:00Z"), "06:30")).toBe(true);
    // Sommerzeit: 04:30 UTC = 06:30 Berlin
    expect(isWithinBerlinWindow(new Date("2026-07-01T04:30:00Z"), "06:30")).toBe(true);
    // Nachts und nachmittags nicht
    expect(isWithinBerlinWindow(new Date("2026-10-30T02:00:00Z"), "06:30")).toBe(false);
    expect(isWithinBerlinWindow(new Date("2026-10-30T13:00:00Z"), "06:30")).toBe(false);
  });
  it("nur ein automatischer Lauf pro Tag", () => {
    const first = new Date("2026-10-30T05:13:00Z");
    expect(shouldRunDaily(first, "06:30", new Date("2026-10-29T05:20:00Z")).run).toBe(true); // gestern
    expect(shouldRunDaily(new Date("2026-10-30T06:12:00Z"), "06:30", new Date("2026-10-30T05:15:00Z")).run).toBe(false); // heute schon gelaufen
    expect(shouldRunDaily(first, "06:30", new Date("2026-10-30T03:00:00Z")).run).toBe(true); // manueller Lauf um 04:00 zählt nicht
    expect(shouldRunDaily(first, "06:30", null).run).toBe(true);
  });
  it("Umstellungstag 25.10.2026", () => {
    expect(berlinToUtc("2026-10-25", "06:30").toISOString()).toBe("2026-10-25T05:30:00.000Z");
    expect(berlinToUtc("2026-10-24", "06:30").toISOString()).toBe("2026-10-24T04:30:00.000Z");
    expect(berlinDate(new Date("2026-10-25T22:30:00Z"))).toBe("2026-10-25");
  });
  it("Wochenende und Feiertage ohne Handel", () => {
    expect(isTradingDay("XETRA", "2026-10-25")).toBe(false);
    expect(isTradingDay("NYSE", "2026-11-26")).toBe(false);
    expect(isTradingDay("XETRA", "2026-11-26")).toBe(true);
    expect(lastCompletedTradingDay("XETRA", new Date("2026-10-25T10:00:00Z"))).toBe("2026-10-23");
    expect(lastCompletedTradingDay("NYSE", new Date("2026-10-26T10:00:00Z"))).toBe("2026-10-23");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("Datenstatus", () => {
  const now = new Date("2026-10-26T07:00:00Z");
  it("unterscheidet aktuell, teilweise, veraltet, fehlgeschlagen", () => {
    expect(dashboardStatus(null, null, now)).toBe("never");
    expect(dashboardStatus({ status: "success", finishedAt: new Date("2026-10-26T05:40:00Z"), startedAt: now }, new Date("2026-10-26T05:40:00Z"), now)).toBe("current");
    expect(dashboardStatus({ status: "partial", finishedAt: new Date("2026-10-26T05:40:00Z"), startedAt: now }, new Date("2026-10-26T05:40:00Z"), now)).toBe("partial");
    expect(dashboardStatus({ status: "success", finishedAt: new Date("2026-10-23T05:40:00Z"), startedAt: now }, new Date("2026-10-23T05:40:00Z"), now)).toBe("stale");
    expect(dashboardStatus({ status: "failed", finishedAt: now, startedAt: now }, new Date("2026-10-26T05:40:00Z"), now)).toBe("failed");
    expect(priceFreshness("2026-10-22", "2026-10-23")).toBe("lagging");
    expect(priceFreshness(null, "2026-10-23")).toBe("missing");
  });
});

describe("Risikomonitor", () => {
  it("meldet Klumpen, Cluster und Datenlücken, sortiert nach Schwere", () => {
    const mk = (id: number, sym: string, v: number, themes: string[], currency = "USD") => ({ holdingId: id, instrumentId: id, symbol: sym, name: sym, assetClass: "equity" as const, currency, sector: null, country: null, region: null, themes, quantity: null, costBasisEur: null, importedValueEur: v, importedPerfPct: null, price: null });
    const s = summarizePortfolio([mk(1, "NVDA", 2357, ["ai_infrastructure"]), mk(2, "VST", 1079, ["ai_infrastructure"]), mk(3, "AMD", 586, ["ai_infrastructure"]), mk(4, "VNA", 1593, ["rate_sensitive"], "EUR"), mk(5, "ETF", 2000, [], "EUR")], {});
    const sec = s.positions;
    const tw: Record<string, number> = {};
    for (const p of sec) for (const t of p.themes) tw[t] = (tw[t] ?? 0) + p.weightPct!;
    const r = computeRisks({ positions: sec, cryptoValueEur: 4179, limits: { maxSinglePositionPct: 15, maxThemePct: 35, maxTop3Pct: 50, maxUsdPct: 60 }, themeWeights: tw, fundamentals: {}, upcomingEvents: [], globalEtfCount: 2 });
    const codes = r.map((x) => x.code);
    expect(codes).toContain("single_NVDA");
    expect(codes).toContain("theme_ai_infrastructure");
    expect(codes).toContain("data");
    expect(codes).toContain("etf_overlap");
    for (let i = 1; i < r.length; i++) expect(r[i - 1].severity).toBeGreaterThanOrEqual(r[i].severity);
    expect(r.every((x) => !/verkauf(en)? wegen kursrückgang/i.test(x.suggestion))).toBe(true);
  });
});
