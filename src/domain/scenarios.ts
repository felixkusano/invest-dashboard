/**
 * Mechanische 12-Monats-Szenarien aus Gewinnwachstum und Multiple-Veränderung.
 * Keine Prognose: Die Annahmen sind explizit und dienen der Einordnung der Asymmetrie.
 * Kursänderung = (1 + Gewinnwachstum) × (1 + Multiple-Veränderung) − 1
 */
export type Scenario = { name: "Bull" | "Base" | "Bear"; epsGrowthPct: number; multipleChangePct: number; priceChangePct: number; assumption: string };

export function mechanicalScenarios(epsGrowthPct: number | null | undefined, pe: number | null | undefined): Scenario[] | null {
  if (epsGrowthPct == null || !Number.isFinite(epsGrowthPct) || pe == null || !(pe > 0)) return null;
  const g = Math.max(-50, Math.min(80, epsGrowthPct));
  // Multiple-Annahmen hängen vom Ausgangsniveau ab: hohe KGVs haben mehr Abwärtsspielraum.
  const derate = pe > 40 ? -35 : pe > 25 ? -25 : -15;
  const rerate = pe > 40 ? 5 : pe > 25 ? 10 : 15;
  const mk = (name: Scenario["name"], eg: number, mc: number, assumption: string): Scenario => ({ name, epsGrowthPct: eg, multipleChangePct: mc, priceChangePct: ((1 + eg / 100) * (1 + mc / 100) - 1) * 100, assumption });
  return [
    // Abweichungen relativ zum Betrag des Trends, damit Bull auch bei negativem Trend über Base liegt
    mk("Bull", g + Math.abs(g) * 0.3, rerate, `Gewinnwachstum 30 % über Trend, KGV +${rerate} %`),
    mk("Base", g, 0, "Gewinnwachstum im Trend, KGV unverändert"),
    mk("Bear", g - Math.abs(g) * 0.7, derate, `Gewinnwachstum 70 % unter Trend, KGV ${derate} %`),
  ];
}
