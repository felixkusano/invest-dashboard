import { describe, expect, it } from "vitest";
import { costBasisConsistency, exposureBy, summarizePortfolio, themeExposure, toEur, valuePosition, type PositionInput } from "@/domain/portfolio";
import { SCREENSHOT_HOLDINGS } from "@/db/seed-data";

const base = (o: Partial<PositionInput>): PositionInput => ({
  holdingId: 1, instrumentId: 1, symbol: "X", name: "X", assetClass: "equity", currency: "EUR", sector: null, country: null, region: null, themes: [],
  quantity: null, costBasisEur: null, importedValueEur: null, importedPerfPct: null, price: null, ...o,
});
const px = (close: number, prevClose: number | null, currency = "EUR") => ({ close, prevClose, currency, priceDate: "2026-10-23", dataType: "eod" as const, asOf: new Date(), provider: "test" });

describe("Währungsumrechnung", () => {
  it("rechnet nach EZB-Notation (1 EUR = rate Fremdwährung)", () => {
    expect(toEur(108, "USD", { USD: 1.08 })).toBeCloseTo(100);
    expect(toEur(116, "NOK", { NOK: 11.6 })).toBeCloseTo(10);
    expect(toEur(50, "EUR", {})).toBe(50);
  });
  it("liefert null statt 0 bei fehlendem Kurs", () => {
    expect(toEur(100, "USD", {})).toBeNull();
    expect(toEur(100, "USD", { USD: 0 })).toBeNull();
  });
});

describe("Positionsbewertung", () => {
  it("berechnet Marktwert, Tagesveränderung und Performance seit Kauf", () => {
    const v = valuePosition(base({ quantity: 10, costBasisEur: 800, currency: "USD", price: px(108, 100, "USD") }), { USD: 1.08 });
    expect(v.valueSource).toBe("market");
    expect(v.marketValueEur).toBeCloseTo(1000);
    expect(v.dailyChangeEur).toBeCloseTo(80 / 1.08);
    expect(v.dailyChangePct).toBeCloseTo(8);
    expect(v.unrealizedPnlEur).toBeCloseTo(200);
    expect(v.totalReturnPct).toBeCloseTo(25);
  });
  it("behandelt fehlenden Kurs nie als 0, sondern fällt auf den markierten Screenshot-Wert zurück", () => {
    const v = valuePosition(base({ quantity: 10, importedValueEur: 500 }), {});
    expect(v.marketValueEur).toBeNull();
    expect(v.provisionalValueEur).toBe(500);
    expect(v.valueSource).toBe("imported");
    expect(v.issues.join()).toContain("nicht verifiziert");
  });
  it("berechnet ohne Einstand keine Performance seit Kauf", () => {
    const v = valuePosition(base({ quantity: 1, price: px(100, 99) }), {});
    expect(v.totalReturnPct).toBeNull();
    expect(v.unrealizedPnlEur).toBeNull();
  });
  it("nutzt Screenshot-Performance nicht als Tagesrendite", () => {
    const v = valuePosition(base({ importedValueEur: 2357.35, importedPerfPct: 331.62 }), {});
    expect(v.dailyChangePct).toBeNull();
    expect(v.totalReturnPct).toBeNull();
  });
  it("ohne Vortagesschluss keine Tagesrendite", () => {
    const v = valuePosition(base({ quantity: 1, price: px(100, null) }), {});
    expect(v.dailyChangeEur).toBeNull();
  });
});

describe("Portfoliosummen", () => {
  const inputs = [
    base({ holdingId: 1, instrumentId: 1, symbol: "A", quantity: 10, costBasisEur: 500, price: px(100, 95) }),
    base({ holdingId: 2, instrumentId: 2, symbol: "B", importedValueEur: 1000 }),
    base({ holdingId: 3, instrumentId: 3, symbol: "C" }),
    base({ holdingId: 4, instrumentId: 4, symbol: "BTC", assetClass: "crypto", importedValueEur: 4000 }),
    base({ holdingId: 5, instrumentId: 1, symbol: "A-dup", quantity: 10, price: px(100, 95) }),
  ];
  const s = summarizePortfolio(inputs, {});
  it("zählt keine Position doppelt", () => {
    expect(s.duplicatesDropped).toEqual(["A-dup"]);
    expect(s.positions.filter((p) => p.instrumentId === 1)).toHaveLength(1);
  });
  it("trennt verifizierten und vorläufigen Wert", () => {
    expect(s.securities.verifiedValueEur).toBe(1000);
    expect(s.securities.provisionalValueEur).toBe(2000);
    expect(s.securities.missingCount).toBe(1);
  });
  it("führt Krypto separat und nicht im Depotwert", () => {
    expect(s.crypto.provisionalValueEur).toBe(4000);
    expect(s.combinedProvisionalEur).toBe(6000);
    expect(s.positions.find((p) => p.symbol === "BTC")!.weightPct).toBeNull();
  });
  it("Gewichte summieren sich auf 100 % (vorläufige Basis)", () => {
    const sum = s.positions.filter((p) => p.weightPct != null).reduce((a, p) => a + p.weightPct!, 0);
    expect(sum).toBeCloseTo(100);
    expect(s.weightBasis).toBe("provisional");
    expect(s.completeness).toBe("partial");
  });
  it("Tagesveränderung nur bei vollständigen verifizierten Daten", () => {
    expect(s.securities.dailyChangeEur).toBeCloseTo(50);
    expect(s.securities.dailyChangePct).toBeCloseTo((50 / 950) * 100);
  });
  it("Exposure absteigend sortiert, Themen aus direkten Titeln", () => {
    const sec = s.positions.filter((p) => p.assetClass !== "crypto");
    const e = exposureBy(sec, (p) => p.symbol);
    expect(e.map((x) => x.label)).toEqual(["A", "B"]);
    expect(themeExposure(sec)).toEqual({});
  });
});

describe("Plausibilisierung der Einstände gegen Screenshot", () => {
  it("bestätigt die übernommenen Einstände und lehnt veraltete ETF-Einstände ab", () => {
    for (const h of SCREENSHOT_HOLDINGS.filter((x) => x.costBasis != null)) {
      const c = costBasisConsistency(h.costBasis!, h.value, h.perf);
      expect(c.consistent, h.key).toBe(true);
    }
    const etf = costBasisConsistency(314, 644.48, 3.26);
    expect(etf.consistent).toBe(false);
    expect(etf.implied).toBeCloseTo(624.13, 1);
  });
});
