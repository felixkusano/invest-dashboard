/**
 * Portfolio-Bewertung. Reine Funktionen, vollständig getestet.
 *
 * Regeln:
 *  - Marktwert gilt nur als "verifiziert", wenn Stückzahl, Kurs und (bei Fremdwährung) FX-Kurs vorliegen.
 *  - Fehlt etwas, wird der importierte Screenshot-Wert als "vorläufig" verwendet und klar markiert.
 *  - Fehlende Kurse werden nie als 0 behandelt.
 *  - Jedes Instrument zählt höchstens einmal (Duplikate werden verworfen und gemeldet).
 *  - Krypto ist eine eigene Anlageklasse und wird separat ausgewiesen.
 */
export type PriceQuote = {
  close: number;
  prevClose: number | null;
  currency: string;
  priceDate: string;
  dataType: "realtime" | "delayed" | "eod" | "demo";
  asOf: Date;
  provider: string;
};

export type PositionInput = {
  holdingId: number;
  instrumentId: number;
  symbol: string;
  name: string;
  assetClass: "equity" | "etf" | "crypto";
  currency: string;
  sector: string | null;
  country: string | null;
  region: string | null;
  themes: string[];
  quantity: number | null;
  costBasisEur: number | null;
  costBasisSource?: string | null;
  importedValueEur: number | null;
  importedPerfPct: number | null;
  price: PriceQuote | null;
};

/** ECB-Notation: 1 EUR = rate Einheiten der Fremdwährung (z. B. USD 1,08). */
export type FxTable = Record<string, number>;

export type ValueSource = "market" | "imported" | "missing";

export type PositionValuation = PositionInput & {
  valueSource: ValueSource;
  marketValueEur: number | null; // nur bei valueSource = market
  provisionalValueEur: number | null; // market oder imported
  priceEur: number | null;
  dailyChangeEur: number | null;
  dailyChangePct: number | null;
  unrealizedPnlEur: number | null;
  totalReturnPct: number | null;
  weightPct: number | null;
  issues: string[];
};

export function toEur(amount: number, currency: string, fx: FxTable): number | null {
  if (!Number.isFinite(amount)) return null;
  const c = currency.toUpperCase();
  if (c === "EUR") return amount;
  // Pence/Öre-Notierungen werden vom Provider-Adapter bereits normalisiert.
  const rate = fx[c];
  if (!rate || !Number.isFinite(rate) || rate <= 0) return null;
  return amount / rate;
}

export function valuePosition(p: PositionInput, fx: FxTable): PositionValuation {
  const issues: string[] = [];
  let marketValueEur: number | null = null;
  let priceEur: number | null = null;
  let dailyChangeEur: number | null = null;
  let dailyChangePct: number | null = null;

  if (p.price) {
    priceEur = toEur(p.price.close, p.price.currency, fx);
    if (priceEur == null) issues.push(`Kein FX-Kurs für ${p.price.currency}`);
  } else {
    issues.push("Kein aktueller Kurs");
  }
  if (p.quantity == null) issues.push("Stückzahl fehlt");
  else if (p.quantity < 0) issues.push("Negative Stückzahl");

  if (p.quantity != null && p.quantity >= 0 && priceEur != null && p.price) {
    marketValueEur = p.quantity * priceEur;
    if (p.price.prevClose != null && p.price.prevClose > 0) {
      const ch = toEur(p.quantity * (p.price.close - p.price.prevClose), p.price.currency, fx);
      dailyChangeEur = ch;
      dailyChangePct = ((p.price.close - p.price.prevClose) / p.price.prevClose) * 100;
    }
  }

  const valueSource: ValueSource = marketValueEur != null ? "market" : p.importedValueEur != null ? "imported" : "missing";
  const provisionalValueEur = marketValueEur ?? p.importedValueEur ?? null;
  if (valueSource === "imported") issues.push("Wert aus Screenshot-Import, nicht verifiziert");
  if (valueSource === "missing") issues.push("Kein Wert verfügbar");

  let unrealizedPnlEur: number | null = null;
  let totalReturnPct: number | null = null;
  if (p.costBasisEur == null) issues.push("Einstandswert fehlt");
  else if (marketValueEur != null && p.costBasisEur > 0) {
    unrealizedPnlEur = marketValueEur - p.costBasisEur;
    totalReturnPct = (unrealizedPnlEur / p.costBasisEur) * 100;
  }

  return { ...p, valueSource, marketValueEur, provisionalValueEur, priceEur, dailyChangeEur, dailyChangePct, unrealizedPnlEur, totalReturnPct, weightPct: null, issues };
}

export type PortfolioSummary = {
  positions: PositionValuation[];
  duplicatesDropped: string[];
  securities: SleeveTotals;
  crypto: SleeveTotals;
  combinedProvisionalEur: number;
  weightBasis: "verified" | "provisional";
  completeness: "complete" | "partial" | "insufficient";
  missing: { symbol: string; name: string; issues: string[] }[];
};

export type SleeveTotals = {
  verifiedValueEur: number;
  provisionalValueEur: number;
  verifiedCount: number;
  importedCount: number;
  missingCount: number;
  dailyChangeEur: number | null;
  dailyChangePct: number | null;
  costBasisEur: number | null; // nur wenn für alle verifizierten Positionen bekannt
  unrealizedPnlEur: number | null;
  totalReturnPct: number | null;
};

function sleeve(ps: PositionValuation[]): SleeveTotals {
  const verified = ps.filter((p) => p.valueSource === "market");
  const verifiedValueEur = verified.reduce((s, p) => s + (p.marketValueEur ?? 0), 0);
  const provisionalValueEur = ps.reduce((s, p) => s + (p.provisionalValueEur ?? 0), 0);
  const withDaily = verified.filter((p) => p.dailyChangeEur != null);
  const dailyChangeEur = verified.length > 0 && withDaily.length === verified.length ? withDaily.reduce((s, p) => s + p.dailyChangeEur!, 0) : null;
  const prevValue = dailyChangeEur != null ? verifiedValueEur - dailyChangeEur : null;
  const dailyChangePct = dailyChangeEur != null && prevValue && prevValue > 0 ? (dailyChangeEur / prevValue) * 100 : null;
  const allCost = verified.length > 0 && verified.every((p) => p.costBasisEur != null);
  const costBasisEur = allCost ? verified.reduce((s, p) => s + p.costBasisEur!, 0) : null;
  const unrealizedPnlEur = costBasisEur != null ? verifiedValueEur - costBasisEur : null;
  const totalReturnPct = costBasisEur && costBasisEur > 0 && unrealizedPnlEur != null ? (unrealizedPnlEur / costBasisEur) * 100 : null;
  return {
    verifiedValueEur, provisionalValueEur,
    verifiedCount: verified.length,
    importedCount: ps.filter((p) => p.valueSource === "imported").length,
    missingCount: ps.filter((p) => p.valueSource === "missing").length,
    dailyChangeEur, dailyChangePct, costBasisEur, unrealizedPnlEur, totalReturnPct,
  };
}

export function summarizePortfolio(inputs: PositionInput[], fx: FxTable): PortfolioSummary {
  const seen = new Set<number>();
  const duplicatesDropped: string[] = [];
  const unique: PositionInput[] = [];
  for (const p of inputs) {
    if (seen.has(p.instrumentId)) { duplicatesDropped.push(p.symbol); continue; }
    seen.add(p.instrumentId);
    unique.push(p);
  }
  const positions = unique.map((p) => valuePosition(p, fx));
  const sec = positions.filter((p) => p.assetClass !== "crypto");
  const cry = positions.filter((p) => p.assetClass === "crypto");
  const securities = sleeve(sec);
  const crypto = sleeve(cry);

  // Gewichte innerhalb des Wertpapierdepots (ohne Krypto). Basis: verifiziert, falls vollständig, sonst vorläufig.
  const allVerified = sec.length > 0 && sec.every((p) => p.valueSource === "market");
  const weightBasis = allVerified ? "verified" : "provisional";
  const base = allVerified ? securities.verifiedValueEur : securities.provisionalValueEur;
  for (const p of sec) {
    const v = allVerified ? p.marketValueEur : p.provisionalValueEur;
    p.weightPct = v != null && base > 0 ? (v / base) * 100 : null;
  }
  const combinedProvisionalEur = securities.provisionalValueEur + crypto.provisionalValueEur;
  const missing = positions.filter((p) => p.valueSource !== "market").map((p) => ({ symbol: p.symbol, name: p.name, issues: p.issues }));
  const missingShare = positions.length ? positions.filter((p) => p.valueSource === "missing").length / positions.length : 1;
  const completeness = missing.length === 0 ? "complete" : missingShare > 0.5 ? "insufficient" : "partial";

  positions.sort((a, b) => (b.provisionalValueEur ?? -1) - (a.provisionalValueEur ?? -1));
  return { positions, duplicatesDropped, securities, crypto, combinedProvisionalEur, weightBasis, completeness, missing };
}

/** Aggregation nach einem Merkmal (Anlageklasse, Sektor, Region, Währung), absteigend sortiert. */
export function exposureBy(
  positions: PositionValuation[],
  key: (p: PositionValuation) => string | null,
): { label: string; valueEur: number; pct: number }[] {
  const m = new Map<string, number>();
  let total = 0;
  for (const p of positions) {
    const v = p.provisionalValueEur;
    if (v == null) continue;
    const k = key(p) ?? "Unbekannt";
    m.set(k, (m.get(k) ?? 0) + v);
    total += v;
  }
  return [...m.entries()]
    .map(([label, valueEur]) => ({ label, valueEur, pct: total > 0 ? (valueEur / total) * 100 : 0 }))
    .sort((a, b) => b.valueEur - a.valueEur);
}

/** Anteil der Positionen, die ein Thema tragen (direkte Einzeltitel, ohne ETF-Durchschau). */
export function themeExposure(positions: PositionValuation[]): Record<string, number> {
  const total = positions.reduce((s, p) => s + (p.provisionalValueEur ?? 0), 0);
  const out: Record<string, number> = {};
  for (const p of positions) {
    for (const t of p.themes) out[t] = (out[t] ?? 0) + (p.provisionalValueEur ?? 0);
  }
  for (const k of Object.keys(out)) out[k] = total > 0 ? (out[k] / total) * 100 : 0;
  return out;
}

/** Implizierter Einstand aus Screenshot-Wert und -Performance. Nur zur Plausibilisierung, nie als Einstand übernommen. */
export function impliedCostFromImport(valueEur: number | null, perfPct: number | null): number | null {
  if (valueEur == null || perfPct == null || perfPct <= -100) return null;
  return valueEur / (1 + perfPct / 100);
}

/** Abgleich eines erfassten Einstands mit dem Screenshot. Abweichung > Toleranz deutet auf veralteten Einstand oder Zukäufe. */
export function costBasisConsistency(costBasisEur: number | null, valueEur: number | null, perfPct: number | null, tolerancePct = 3) {
  const implied = impliedCostFromImport(valueEur, perfPct);
  if (implied == null || costBasisEur == null || costBasisEur <= 0) return { implied, deviationPct: null, consistent: null as boolean | null };
  const deviationPct = ((costBasisEur - implied) / implied) * 100;
  return { implied, deviationPct, consistent: Math.abs(deviationPct) <= tolerancePct };
}
