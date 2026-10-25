/**
 * ETF-Overlap und Durchschau. Funktioniert nur mit echten Konstituentendaten (z. B. importierte
 * Holdings-CSV des Emittenten). Ohne Daten wird kein Zahlenwert erfunden, sondern "nicht verfügbar" geliefert.
 */
export type Constituent = { key: string; name: string; weightPct: number; sector?: string | null; country?: string | null };

/** Klassisches Overlap-Maß: Summe der Minimum-Gewichte gemeinsamer Titel (0–100 %). */
export function weightOverlapPct(a: Constituent[], b: Constituent[]): number {
  const mb = new Map(b.map((c) => [c.key, c.weightPct]));
  let s = 0;
  for (const c of a) {
    const w = mb.get(c.key);
    if (w != null) s += Math.min(c.weightPct, w);
  }
  return Math.min(100, s);
}

export type LookThroughInput = {
  directPositions: { key: string; name: string; valueEur: number }[];
  etfs: { name: string; valueEur: number; constituents: Constituent[] | null }[];
};

export type LookThroughRow = { key: string; name: string; directEur: number; viaEtfEur: number; totalEur: number; pctOfPortfolio: number };

export function lookThrough(input: LookThroughInput, portfolioValueEur: number): { rows: LookThroughRow[]; coveragePct: number; approximate: boolean } {
  const m = new Map<string, LookThroughRow>();
  const get = (key: string, name: string) => {
    let r = m.get(key);
    if (!r) { r = { key, name, directEur: 0, viaEtfEur: 0, totalEur: 0, pctOfPortfolio: 0 }; m.set(key, r); }
    return r;
  };
  for (const d of input.directPositions) get(d.key, d.name).directEur += d.valueEur;
  const etfTotal = input.etfs.reduce((s, e) => s + e.valueEur, 0);
  let covered = 0;
  for (const e of input.etfs) {
    if (!e.constituents?.length) continue;
    covered += e.valueEur;
    for (const c of e.constituents) get(c.key, c.name).viaEtfEur += (e.valueEur * c.weightPct) / 100;
  }
  const rows = [...m.values()].map((r) => {
    r.totalEur = r.directEur + r.viaEtfEur;
    r.pctOfPortfolio = portfolioValueEur > 0 ? (r.totalEur / portfolioValueEur) * 100 : 0;
    return r;
  }).sort((a, b) => b.totalEur - a.totalEur);
  const coveragePct = etfTotal > 0 ? (covered / etfTotal) * 100 : 100;
  return { rows, coveragePct, approximate: coveragePct < 100 };
}

/**
 * Strukturelle Einordnung zweier globaler Indizes ohne Konstituentendaten: rein qualitativ.
 * Bewusst ohne Prozentzahl, da diese ohne Holdings-Daten nicht belegt wäre.
 */
export function structuralOverlapNote(aName: string, bName: string): string | null {
  const n = (s: string) => s.toLowerCase();
  const a = n(aName), b = n(bName);
  const isWorld = (s: string) => s.includes("msci world") && !s.includes("small");
  const isAllWorld = (s: string) => s.includes("all-world") || s.includes("all world") || s.includes("acwi");
  if ((isWorld(a) && isAllWorld(b)) || (isWorld(b) && isAllWorld(a))) {
    return "MSCI World (Industrieländer, Large/Mid Cap) ist strukturell weitgehend in FTSE All-World (zusätzlich Schwellenländer) enthalten. Parallele Besparung erhöht vor allem die Kosten- und Verwaltungskomplexität, kaum die Diversifikation. Belastbare Overlap-Quote erst nach Import der Holdings-Dateien beider ETFs.";
  }
  if ((isWorld(a) && b.includes("small")) || (isWorld(b) && a.includes("small"))) {
    return "MSCI World und MSCI World Small Cap überschneiden sich strukturell kaum (unterschiedliche Größensegmente); der Small-Cap-ETF ergänzt die Größenstreuung.";
  }
  return null;
}
