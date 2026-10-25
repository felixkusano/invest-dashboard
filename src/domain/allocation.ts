/**
 * Monatliche Kapitalallokation. Deterministisch, regelbasiert, nachvollziehbar.
 * Keine Renditeprognosen, keine "optimierte" Portfoliokonstruktion ohne belastbare Inputs.
 *
 * Ablauf:
 *  1. Bestehende Sparpläne werden vom Budget abgezogen (sie sind bereits gebunden).
 *  2. Kernanteil (Standard 80 %) geht in genau einen Kern-ETF.
 *  3. Chancenanteil geht nur an einen Titel, der Score-Schwelle, Datenvertrauen und Konzentrationslimits erfüllt.
 *     Kein Titel qualifiziert -> Small-Cap (falls unter Zielquote), sonst Kern-ETF oder Cash (Einstellung).
 *  4. Summe der Zeilen = Budget, Cash wird explizit ausgewiesen.
 */
export type AllocCandidate = {
  instrumentId: number;
  symbol: string;
  name: string;
  isHolding: boolean;
  total: number | null;
  confidence: "high" | "medium" | "low" | "insufficient";
  themes: string[];
  sector: string | null;
  currentWeightPct: number; // im Wertpapierdepot
  mainRisk: string;
  thesis: string;
};

export type AllocEtf = { instrumentId: number; symbol: string; name: string; weightPct: number };

export type AllocInput = {
  budgetEur: number;
  coreSharePct: number;
  minOrderEur: number;
  holdBackPreference: "core_etf" | "cash";
  scoreThreshold: number;
  portfolioValueEur: number; // vorläufiger Depotwert (ohne Krypto)
  coreEtf: AllocEtf | null;
  otherGlobalEtfs: AllocEtf[];
  smallCapEtf: AllocEtf | null;
  smallCapTargetPct: number;
  limits: { maxSinglePositionPct: number; maxThemePct: number };
  themeWeights: Record<string, number>; // % des Depots, direkte Einzeltitel
  excludedSectors: string[];
  candidates: AllocCandidate[];
  savingsPlans: { instrumentId: number; symbol: string; amountEur: number }[];
  emergencyReserveKnown: boolean;
  dataCompleteness: "complete" | "partial" | "insufficient";
};

export type AllocLine = {
  priority: number;
  kind: "savings_plan" | "core_etf" | "opportunity" | "small_cap" | "cash";
  instrumentId: number | null;
  label: string;
  amountEur: number;
  reason: string;
  mainRisk: string;
};

export type AllocOption = {
  option: "global_etf" | "existing_stock" | "new_stock" | "small_cap" | "cash";
  label: string;
  verdict: "empfohlen" | "möglich" | "nicht empfohlen" | "keine Daten";
  rationale: string;
};

export type AllocResult = {
  lines: AllocLine[];
  options: AllocOption[];
  totalEur: number;
  heldBackEur: number;
  warnings: string[];
  assumptions: string[];
  excluded: { symbol: string; reason: string }[];
};

const r0 = (v: number) => Math.round(v);
const de = (v: number, d = 1) => v.toFixed(d).replace(".", ",");
const THEME_LABEL: Record<string, string> = {
  ai_infrastructure: "KI-Infrastruktur", semiconductors: "Halbleiter", power_infrastructure: "Energieinfrastruktur",
  real_estate: "Immobilien", rate_sensitive: "Zinssensitiv", financials: "Finanzwerte", hydrogen: "Wasserstoff",
  mega_cap_tech: "Mega-Cap-Tech", consumer_tech: "Consumer Tech", crypto: "Krypto", unprofitable_growth: "Unprofitables Wachstum",
  small_cap: "Small Cap", software: "Software", cybersecurity: "Cybersecurity", healthtech: "Healthcare Tech", robotics: "Automation und Robotik",
};
export const themeLabel = (t: string) => THEME_LABEL[t] ?? t;

export function allocate(input: AllocInput): AllocResult {
  const warnings: string[] = [];
  const assumptions: string[] = [
    "Keine Renditeprognose: Empfehlung basiert auf Score, Datenvertrauen und Konzentrationsregeln.",
    `Score-Schwelle für Einzeltitel: ${input.scoreThreshold}/100, Datenvertrauen mindestens "mittel".`,
    `Limits: Einzelposition max. ${input.limits.maxSinglePositionPct} %, Themencluster max. ${input.limits.maxThemePct} % des Depots.`,
  ];
  const excluded: { symbol: string; reason: string }[] = [];
  const lines: AllocLine[] = [];
  let remaining = r0(input.budgetEur);

  if (!input.emergencyReserveKnown) warnings.push("Notreserve unbekannt: Die Empfehlung setzt voraus, dass Liquiditätsbedarf außerhalb des Depots gedeckt ist.");
  if (input.dataCompleteness !== "complete") warnings.push("Depotdaten unvollständig (Stückzahlen/Kurse fehlen teilweise). Gewichte sind vorläufig.");
  if (input.otherGlobalEtfs.length > 0 && input.coreEtf) {
    warnings.push(`Parallel gehaltene globale ETFs (${input.otherGlobalEtfs.map((e) => e.symbol).join(", ")}) überschneiden sich stark mit dem Kern-ETF. Neue Mittel nur in einen Kern-ETF lenken.`);
  }

  // 1. Sparpläne
  for (const sp of input.savingsPlans) {
    if (remaining <= 0) break;
    const amt = Math.min(r0(sp.amountEur), remaining);
    lines.push({ priority: 0, kind: "savings_plan", instrumentId: sp.instrumentId, label: `Sparplan ${sp.symbol}`, amountEur: amt, reason: "Bereits eingerichteter Sparplan, Mittel gebunden.", mainRisk: "Marktrisiko des Zielinvestments" });
    remaining -= amt;
  }
  const planTotal = input.savingsPlans.reduce((s, p) => s + p.amountEur, 0);
  if (planTotal > input.budgetEur) warnings.push(`Sparpläne (${planTotal} €) übersteigen das Monatsbudget (${input.budgetEur} €).`);

  const free = remaining;
  let core = r0((free * input.coreSharePct) / 100);
  let opp = free - core;

  // 3. Chancenanteil
  let oppLine: AllocLine | null = null;
  const pv = Math.max(input.portfolioValueEur, 1);
  const eligible = input.candidates
    .filter((c) => {
      if (c.total == null || c.confidence === "insufficient" || c.confidence === "low") { excluded.push({ symbol: c.symbol, reason: c.total == null ? "Kein belastbarer Score (Datenlage)" : "Datenvertrauen zu gering" }); return false; }
      if (c.total < input.scoreThreshold) { excluded.push({ symbol: c.symbol, reason: `Score ${de(c.total, 0)} unter Schwelle ${input.scoreThreshold}` }); return false; }
      if (c.sector && input.excludedSectors.some((s) => s.toLowerCase() === c.sector!.toLowerCase())) { excluded.push({ symbol: c.symbol, reason: "Sektor ausgeschlossen" }); return false; }
      const postWeight = ((c.currentWeightPct / 100) * pv + opp) / (pv + input.budgetEur) * 100;
      if (postWeight > input.limits.maxSinglePositionPct) { excluded.push({ symbol: c.symbol, reason: `Position nach Kauf ${de(postWeight, 1)} % > Limit ${input.limits.maxSinglePositionPct} %` }); return false; }
      const breached = c.themes.find((t) => (input.themeWeights[t] ?? 0) >= input.limits.maxThemePct);
      if (breached) { excluded.push({ symbol: c.symbol, reason: `Cluster ${themeLabel(breached)} bereits ${de(input.themeWeights[breached], 1)} % ≥ Limit ${input.limits.maxThemePct} %` }); return false; }
      return true;
    })
    .sort((a, b) => b.total! - a.total!);

  if (opp > 0 && opp < input.minOrderEur) {
    assumptions.push(`Chancenanteil ${opp} € liegt unter der Mindestordergröße ${input.minOrderEur} € und wird dem Kern-ETF zugeschlagen.`);
    core += opp; opp = 0;
  }

  if (opp > 0 && eligible.length > 0) {
    const best = eligible[0];
    oppLine = {
      priority: 2, kind: "opportunity", instrumentId: best.instrumentId, label: `${best.name} (${best.symbol})`, amountEur: opp,
      reason: `Score ${de(best.total!, 0)}/100, Datenvertrauen ${best.confidence === "high" ? "hoch" : "mittel"}. ${best.thesis}`.trim(),
      mainRisk: best.mainRisk,
    };
  } else if (opp > 0) {
    const sc = input.smallCapEtf;
    if (sc && sc.weightPct < input.smallCapTargetPct) {
      oppLine = { priority: 2, kind: "small_cap", instrumentId: sc.instrumentId, label: sc.name, amountEur: opp, reason: `Kein Einzeltitel qualifiziert. Small-Cap-Quote ${de(sc.weightPct, 1)} % unter Ziel ${input.smallCapTargetPct} %.`, mainRisk: "Höhere Zyklik und Zinssensitivität kleiner Unternehmen" };
    } else if (input.holdBackPreference === "cash") {
      oppLine = { priority: 3, kind: "cash", instrumentId: null, label: "Liquidität halten", amountEur: opp, reason: "Kein Einzeltitel qualifiziert. Mittel werden gemäß Einstellung vorerst nicht investiert.", mainRisk: "Opportunitätskosten bei steigenden Märkten" };
    } else {
      core += opp;
      assumptions.push("Kein Einzeltitel qualifiziert. Chancenanteil fließt in den Kern-ETF (kein Zwangskauf).");
    }
    opp = oppLine ? opp : 0;
  }

  if (core > 0) {
    if (input.coreEtf) {
      lines.push({ priority: 1, kind: "core_etf", instrumentId: input.coreEtf.instrumentId, label: input.coreEtf.name, amountEur: core, reason: "Breite globale Basis, senkt Einzeltitel- und Clusterkonzentration mechanisch.", mainRisk: "Globales Aktienmarktrisiko, hoher US- und Tech-Anteil im Index" });
    } else {
      lines.push({ priority: 1, kind: "cash", instrumentId: null, label: "Kern-ETF nicht festgelegt", amountEur: core, reason: "Bitte Kern-ETF in den Einstellungen wählen. Betrag bis dahin nicht zugeordnet.", mainRisk: "Keine Investition" });
      warnings.push("Kein Kern-ETF gewählt.");
    }
  }
  if (oppLine) lines.push(oppLine);

  lines.sort((a, b) => a.priority - b.priority);
  lines.forEach((l, i) => (l.priority = i + 1));
  const totalEur = lines.reduce((s, l) => s + l.amountEur, 0);
  const heldBackEur = lines.filter((l) => l.kind === "cash").reduce((s, l) => s + l.amountEur, 0);
  if (totalEur !== r0(input.budgetEur)) warnings.push(`Interner Prüffehler: Summe ${totalEur} € ≠ Budget ${input.budgetEur} €.`);

  // Vergleich der fünf Verwendungsoptionen
  const bestHolding = input.candidates.filter((c) => c.isHolding && c.total != null).sort((a, b) => b.total! - a.total!)[0];
  const bestNew = input.candidates.filter((c) => !c.isHolding && c.total != null).sort((a, b) => b.total! - a.total!)[0];
  const isEligible = (c?: AllocCandidate) => !!c && eligible.some((e) => e.instrumentId === c.instrumentId);
  const reasonFor = (c?: AllocCandidate) => (c ? excluded.find((e) => e.symbol === c.symbol)?.reason ?? "" : "");
  const options: AllocOption[] = [
    { option: "global_etf", label: input.coreEtf ? `Globaler ETF (${input.coreEtf.symbol})` : "Globaler ETF", verdict: input.coreEtf ? "empfohlen" : "keine Daten", rationale: "Kernbaustein. Verdünnt bestehende Klumpen ohne Verkauf und ohne Steuerrealisation." },
    bestHolding
      ? { option: "existing_stock", label: `Bestehender Titel: ${bestHolding.symbol} (${de(bestHolding.total!, 0)})`, verdict: isEligible(bestHolding) ? (oppLine?.instrumentId === bestHolding.instrumentId ? "empfohlen" : "möglich") : "nicht empfohlen", rationale: isEligible(bestHolding) ? bestHolding.thesis : reasonFor(bestHolding) }
      : { option: "existing_stock", label: "Bestehender Einzeltitel", verdict: "keine Daten", rationale: "Keine Fundamentaldaten für bestehende Titel verfügbar." },
    bestNew
      ? { option: "new_stock", label: `Neuer Titel: ${bestNew.symbol} (${de(bestNew.total!, 0)})`, verdict: isEligible(bestNew) ? (oppLine?.instrumentId === bestNew.instrumentId ? "empfohlen" : "möglich") : "nicht empfohlen", rationale: isEligible(bestNew) ? bestNew.thesis : reasonFor(bestNew) }
      : { option: "new_stock", label: "Neuer Einzeltitel", verdict: "keine Daten", rationale: "Scanner hat noch keine bewerteten Kandidaten (Fundamentaldaten fehlen)." },
    input.smallCapEtf
      ? { option: "small_cap", label: `Small Caps (${input.smallCapEtf.symbol})`, verdict: oppLine?.kind === "small_cap" ? "empfohlen" : input.smallCapEtf.weightPct < input.smallCapTargetPct ? "möglich" : "nicht empfohlen", rationale: `Aktuelle Quote ${de(input.smallCapEtf.weightPct, 1)} %, Ziel ${input.smallCapTargetPct} %.` }
      : { option: "small_cap", label: "Small Caps", verdict: "keine Daten", rationale: "Kein Small-Cap-ETF im Depot hinterlegt." },
    { option: "cash", label: "Liquidität halten", verdict: oppLine?.kind === "cash" ? "empfohlen" : "nicht empfohlen", rationale: "Sinnvoll nur bei fehlender Notreserve oder bewusstem Warten auf einen Katalysator. Kein Timing-Signal." },
  ];

  return { lines, options, totalEur, heldBackEur, warnings, assumptions, excluded };
}
