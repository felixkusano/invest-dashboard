/**
 * Transparentes 100-Punkte-Scoring. Jede Teilnote entsteht ausschließlich aus vorhandenen Kennzahlen.
 * Fehlen Kennzahlen, sinkt die Datenabdeckung; unter 30 % Abdeckung wird kein Gesamtscore vergeben.
 *
 *   Fundamentale Qualität 25 | Wachstum 20 | Bewertung 25 | Katalysatoren & Momentum 15 | Risiko 15
 *   (Risiko: höher = geringeres bzw. besser beherrschtes Risiko)
 *
 * Kennzahlensätze werden nach Geschäftsmodell gewählt: Banken (P/B, ROE statt EV/EBITDA, Margen),
 * Immobilien (P/B als NAV-Näherung, Verschuldung), übrige Unternehmen (Margen, ROIC, EV-Multiples).
 */
export type Metrics = Partial<Record<CanonicalMetric, number | null>>;
export type CanonicalMetric =
  | "revenueGrowthYoy" | "revenueGrowth3y" | "epsGrowthYoy" | "epsGrowth3y"
  | "grossMargin" | "operatingMargin" | "netMargin" | "roic" | "roe"
  | "peTtm" | "forwardPe" | "evEbitda" | "evSales" | "psTtm" | "pb" | "fcfYield"
  | "netDebtToEbitda" | "debtToEquity" | "currentRatio"
  | "priceReturn52w" | "priceReturn13w" | "relStrength52w" | "beta" | "marketCapUsdM";

export type Archetype = "bank" | "real_estate" | "general";

export function archetypeFor(sector: string | null | undefined): Archetype {
  const s = (sector ?? "").toLowerCase();
  if (s.includes("bank") || s.includes("financ") || s.includes("finanz")) return "bank";
  if (s.includes("real estate") || s.includes("immobil")) return "real_estate";
  return "general";
}

/** Lineares Mapping auf 0..1 zwischen "schlecht" und "gut" (bad kann größer als good sein). */
export function band(v: number | null | undefined, bad: number, good: number): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const t = (v - bad) / (good - bad);
  return Math.max(0, Math.min(1, t));
}

type Sub = { name: string; value: number | null | undefined; score: number | null };

function component(max: number, subs: Sub[]) {
  const avail = subs.filter((s) => s.score != null);
  const coverage = subs.length ? avail.length / subs.length : 0;
  const points = avail.length ? (avail.reduce((s, x) => s + x.score!, 0) / avail.length) * max : null;
  return { points: points == null ? null : Math.round(points * 10) / 10, coverage, subs };
}

export type ScoreContext = {
  sector: string | null;
  upcomingEarningsDays: number | null; // Tage bis zum nächsten bestätigten/geschätzten Termin
  newsBalance: number | null; // (positiv − negativ) / Anzahl relevanter News der letzten 14 Tage, −1..1 (regelbasiert/KI)
};

export type ScoreResult = {
  total: number | null;
  quality: number | null; growth: number | null; valuation: number | null; catalysts: number | null; risk: number | null;
  coveragePct: number;
  confidence: "high" | "medium" | "low" | "insufficient";
  explanation: Record<string, string>;
  archetype: Archetype;
};

const f = (v: number | null | undefined, d = 1, unit = "") => (v == null || !Number.isFinite(v) ? "n. v." : `${v.toFixed(d).replace(".", ",")}${unit}`);

export function scoreCompany(m: Metrics, ctx: ScoreContext): ScoreResult {
  const arch = archetypeFor(ctx.sector);

  const qualitySubs: Sub[] = arch === "bank"
    ? [
        { name: "ROE", value: m.roe, score: band(m.roe, 6, 16) },
        { name: "Nettomarge", value: m.netMargin, score: band(m.netMargin, 10, 30) },
      ]
    : arch === "real_estate"
      ? [
          { name: "Operative Marge", value: m.operatingMargin, score: band(m.operatingMargin, 20, 60) },
          { name: "ROE", value: m.roe, score: band(m.roe, -2, 8) },
        ]
      : [
          { name: "Bruttomarge", value: m.grossMargin, score: band(m.grossMargin, 20, 65) },
          { name: "Operative Marge", value: m.operatingMargin, score: band(m.operatingMargin, 0, 30) },
          { name: "ROIC", value: m.roic, score: band(m.roic, 2, 25) },
        ];

  const growthSubs: Sub[] = [
    { name: "Umsatzwachstum YoY", value: m.revenueGrowthYoy, score: band(m.revenueGrowthYoy, -5, 30) },
    { name: "Umsatzwachstum 3J p. a.", value: m.revenueGrowth3y, score: band(m.revenueGrowth3y, 0, 25) },
    { name: "EPS-Wachstum YoY", value: m.epsGrowthYoy, score: band(m.epsGrowthYoy, -10, 35) },
  ];

  // Bewertung relativ zum Wachstum: KGV wird mit Wachstum adjustiert (PEG-Logik), damit Wachstumswerte nicht pauschal abgestraft werden.
  const g = Math.max(m.epsGrowth3y ?? m.epsGrowthYoy ?? 0, 3);
  const pe = m.forwardPe ?? m.peTtm;
  const peg = pe != null && pe > 0 ? pe / g : null;
  const valuationSubs: Sub[] = arch === "bank"
    ? [
        { name: "KGV", value: pe, score: pe != null && pe > 0 ? band(pe, 20, 8) : null },
        { name: "KBV", value: m.pb, score: band(m.pb, 2.5, 0.8) },
      ]
    : arch === "real_estate"
      ? [
          { name: "KBV (NAV-Näherung)", value: m.pb, score: band(m.pb, 1.3, 0.5) },
          { name: "FCF-Rendite", value: m.fcfYield, score: band(m.fcfYield, 1, 7) },
        ]
      : [
          { name: "PEG (KGV/Wachstum)", value: peg, score: peg != null ? band(peg, 3, 0.8) : pe != null && pe <= 0 ? 0 : null },
          { name: "EV/EBITDA", value: m.evEbitda, score: m.evEbitda != null && m.evEbitda > 0 ? band(m.evEbitda, 35, 8) : m.evEbitda != null ? 0 : null },
          { name: "FCF-Rendite", value: m.fcfYield, score: band(m.fcfYield, 0, 6) },
        ];

  const catalystSubs: Sub[] = [
    { name: "Kursentwicklung 52W", value: m.priceReturn52w, score: band(m.priceReturn52w, -30, 40) },
    { name: "Relative Stärke 52W", value: m.relStrength52w, score: band(m.relStrength52w, -20, 20) },
    { name: "Nachrichtenlage 14T", value: ctx.newsBalance, score: ctx.newsBalance == null ? null : band(ctx.newsBalance, -1, 1) },
    { name: "Termin in 30 Tagen", value: ctx.upcomingEarningsDays, score: ctx.upcomingEarningsDays == null ? null : ctx.upcomingEarningsDays <= 30 ? 0.7 : 0.4 },
  ];

  const riskSubs: Sub[] = arch === "bank"
    ? [{ name: "Beta", value: m.beta, score: band(m.beta, 2, 0.8) }]
    : [
        { name: "Nettoverschuldung/EBITDA", value: m.netDebtToEbitda, score: band(m.netDebtToEbitda, arch === "real_estate" ? 20 : 4, arch === "real_estate" ? 10 : 0) },
        { name: "Verschuldung/Eigenkapital", value: m.debtToEquity, score: band(m.debtToEquity, arch === "real_estate" ? 2.5 : 2, arch === "real_estate" ? 1 : 0.2) },
        { name: "Beta", value: m.beta, score: band(m.beta, 2.2, 0.8) },
        { name: "Liquidität (Current Ratio)", value: m.currentRatio, score: arch === "real_estate" ? null : band(m.currentRatio, 0.8, 2) },
      ].filter((s) => !(arch === "real_estate" && s.name.startsWith("Liquidität")));

  const q = component(25, qualitySubs);
  const gr = component(20, growthSubs);
  const v = component(25, valuationSubs);
  const c = component(15, catalystSubs);
  const r = component(15, riskSubs);
  const comps = [q, gr, v, c, r];
  const weights = [25, 20, 25, 15, 15];
  const coverage = comps.reduce((s, x, i) => s + x.coverage * weights[i], 0) / 100;

  // Fehlende Komponenten werden nicht mit 0 bewertet, sondern der Gesamtscore wird auf die verfügbaren Punkte hochskaliert.
  const availMax = comps.reduce((s, x, i) => s + (x.points != null ? weights[i] : 0), 0);
  const availPts = comps.reduce((s, x) => s + (x.points ?? 0), 0);
  const confidence: ScoreResult["confidence"] = coverage >= 0.8 ? "high" : coverage >= 0.55 ? "medium" : coverage >= 0.3 ? "low" : "insufficient";
  const total = confidence === "insufficient" || availMax < 50 ? null : Math.round((availPts / availMax) * 1000) / 10;

  const explain = (subs: Sub[], unitHint: (n: string) => string) =>
    subs.map((s) => `${s.name}: ${f(s.value, s.name.includes("PEG") || s.name.includes("Beta") || s.name.includes("/") || s.name.includes("KBV") || s.name.includes("KGV") || s.name.includes("Ratio") ? 2 : 1, unitHint(s.name))}`).join(" | ");
  const pctUnit = (n: string) => (!/(PEG|\/|KGV|KBV|Beta|Ratio)/.test(n) && /(marge|wachstum|roe|roic|rendite|entwicklung|stärke)/i.test(n) ? " %" : "");

  return {
    total, quality: q.points, growth: gr.points, valuation: v.points, catalysts: c.points, risk: r.points,
    coveragePct: Math.round(coverage * 100), confidence, archetype: arch,
    explanation: {
      quality: explain(qualitySubs, pctUnit),
      growth: explain(growthSubs, pctUnit),
      valuation: explain(valuationSubs, pctUnit),
      catalysts: explain(catalystSubs, pctUnit),
      risk: explain(riskSubs, pctUnit),
      method: arch === "bank" ? "Kennzahlensatz Bank (ROE, Nettomarge, KGV, KBV)" : arch === "real_estate" ? "Kennzahlensatz Immobilien (KBV als NAV-Näherung, Verschuldung)" : "Kennzahlensatz Industrie/Tech (Margen, ROIC, PEG, EV/EBITDA, FCF-Rendite)",
    },
  };
}
