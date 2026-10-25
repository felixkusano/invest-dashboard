/**
 * Risikomonitor. Jede Warnung trägt Evidenz, Schweregrad (1–5) und die Art der Handlungsrelevanz.
 * Ein Kursrückgang allein ist nie ein Verkaufsgrund.
 */
import type { PositionValuation } from "./portfolio";
import { themeLabel } from "./allocation";
import type { Metrics } from "./scoring";

export type RiskCategory = "concentration" | "overlap" | "theme" | "valuation" | "fundamentals" | "leverage" | "dilution" | "event" | "currency" | "rates" | "data";
export type ActionType = "Konzentration zu hoch" | "Bewertung ambitioniert" | "Fundamentals verschlechtern sich" | "Temporäre Volatilität" | "These prüfen" | "Datenlücke" | "Beobachten";

export type RiskFlag = {
  code: string;
  title: string;
  category: RiskCategory;
  severity: 1 | 2 | 3 | 4 | 5;
  evidence: string;
  affected: string[];
  actionType: ActionType;
  suggestion: string;
};

export type RiskInput = {
  positions: PositionValuation[]; // Wertpapierdepot (ohne Krypto)
  cryptoValueEur: number;
  limits: { maxSinglePositionPct: number; maxThemePct: number; maxTop3Pct: number; maxUsdPct: number };
  themeWeights: Record<string, number>;
  fundamentals: Record<string, Metrics | undefined>; // nach Symbol
  upcomingEvents: { title: string; symbol: string | null; daysAhead: number; importance: number }[];
  globalEtfCount: number;
};

const sev = (n: number) => Math.max(1, Math.min(5, Math.round(n))) as RiskFlag["severity"];
const pct = (v: number) => `${v.toFixed(1).replace(".", ",")} %`;

export function computeRisks(input: RiskInput): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const ps = input.positions.filter((p) => p.weightPct != null).sort((a, b) => b.weightPct! - a.weightPct!);
  const L = input.limits;

  for (const p of ps.filter((x) => x.assetClass === "equity")) {
    if (p.weightPct! > L.maxSinglePositionPct) {
      const over = p.weightPct! / L.maxSinglePositionPct;
      flags.push({
        code: `single_${p.symbol}`, title: `Einzelposition ${p.symbol} über Limit`, category: "concentration",
        severity: sev(2 + over), evidence: `${p.name}: ${pct(p.weightPct!)} des Depots, Limit ${pct(L.maxSinglePositionPct)}.`,
        affected: [p.symbol], actionType: "Konzentration zu hoch",
        suggestion: "Keine Zukäufe; Verdünnung über ETF-Zuflüsse bevorzugen. Teilverkauf nur bei separater Steuer- und Bewertungsprüfung.",
      });
    }
  }
  const top3 = ps.slice(0, 3).reduce((s, p) => s + p.weightPct!, 0);
  if (ps.length >= 3 && top3 > L.maxTop3Pct) {
    flags.push({ code: "top3", title: "Hohe Konzentration in den drei größten Positionen", category: "concentration", severity: sev(2 + (top3 - L.maxTop3Pct) / 10),
      evidence: `Top 3 (${ps.slice(0, 3).map((p) => p.symbol).join(", ")}) = ${pct(top3)}, Limit ${pct(L.maxTop3Pct)}.`, affected: ps.slice(0, 3).map((p) => p.symbol), actionType: "Konzentration zu hoch",
      suggestion: "Neue Mittel vorrangig in breit gestreute ETFs." });
  }
  for (const [t, w] of Object.entries(input.themeWeights).sort((a, b) => b[1] - a[1])) {
    if (w > L.maxThemePct && !["mega_cap_tech", "consumer_tech"].includes(t)) {
      const members = input.positions.filter((p) => p.themes.includes(t)).map((p) => p.symbol);
      flags.push({ code: `theme_${t}`, title: `Cluster ${themeLabel(t)} dominiert`, category: "theme", severity: sev(2 + (w - L.maxThemePct) / 8),
        evidence: `Direkte Einzeltitel mit Thema ${themeLabel(t)}: ${pct(w)} des Depots (${members.join(", ")}), Limit ${pct(L.maxThemePct)}. ETF-Durchschau nicht enthalten, tatsächliches Exposure also höher.`,
        affected: members, actionType: "Konzentration zu hoch",
        suggestion: "Gleicher ökonomischer Treiber (KI-Investitionszyklus). Keine weiteren Zukäufe im Cluster bis Quote unter Limit." });
    }
  }
  if (input.globalEtfCount > 1) {
    flags.push({ code: "etf_overlap", title: "Überlappende globale ETFs", category: "overlap", severity: 2,
      evidence: `${input.globalEtfCount} globale Large/Mid-Cap-ETFs im Depot, strukturell stark überlappend.`, affected: [], actionType: "Beobachten",
      suggestion: "Einen Kern-ETF festlegen; bestehende Anteile halten (keine steuerpflichtige Umschichtung nötig)." });
  }
  const usd = input.positions.filter((p) => p.currency === "USD").reduce((s, p) => s + (p.weightPct ?? 0), 0);
  if (usd > L.maxUsdPct) {
    flags.push({ code: "usd", title: "Hohe USD-Quote (Einzeltitel)", category: "currency", severity: sev(1 + (usd - L.maxUsdPct) / 15),
      evidence: `In USD notierte Einzeltitel: ${pct(usd)} des Depots (ohne Währungsanteil der ETFs).`, affected: input.positions.filter((p) => p.currency === "USD").map((p) => p.symbol), actionType: "Beobachten",
      suggestion: "EUR/USD-Bewegungen wirken direkt auf den EUR-Depotwert." });
  }
  const rateSens = input.positions.filter((p) => p.themes.includes("rate_sensitive"));
  const rsW = rateSens.reduce((s, p) => s + (p.weightPct ?? 0), 0);
  if (rsW > 10) {
    flags.push({ code: "rates", title: "Zinssensitive Positionen", category: "rates", severity: sev(1 + rsW / 10),
      evidence: `${rateSens.map((p) => p.symbol).join(", ")}: ${pct(rsW)} des Depots. Bewertung reagiert stark auf langfristige Zinsen (Bund 10J, Swap-Sätze).`,
      affected: rateSens.map((p) => p.symbol), actionType: "Beobachten", suggestion: "Renditen 10J und Refinanzierungskonditionen im Makro-Bereich verfolgen." });
  }

  for (const p of input.positions) {
    const m = input.fundamentals[p.symbol];
    if (!m) continue;
    const pe = m.forwardPe ?? m.peTtm;
    if (pe != null && pe > 45 && (m.epsGrowthYoy ?? 0) < pe * 0.6) {
      flags.push({ code: `val_${p.symbol}`, title: `Bewertung ${p.symbol} anspruchsvoll`, category: "valuation", severity: sev(2 + pe / 40),
        evidence: `KGV ${pe.toFixed(1)} bei EPS-Wachstum ${m.epsGrowthYoy?.toFixed(1) ?? "n. v."} %.`, affected: [p.symbol], actionType: "Bewertung ambitioniert",
        suggestion: "Erwartungen hoch eingepreist; Enttäuschungen bei Guidance wirken überproportional." });
    }
    if (m.revenueGrowthYoy != null && m.revenueGrowthYoy < -10) {
      flags.push({ code: `fund_${p.symbol}`, title: `Umsatzrückgang ${p.symbol}`, category: "fundamentals", severity: sev(2 + Math.abs(m.revenueGrowthYoy) / 20),
        evidence: `Umsatz YoY ${m.revenueGrowthYoy.toFixed(1)} %.`, affected: [p.symbol], actionType: "Fundamentals verschlechtern sich", suggestion: "Investmentthese auf Gültigkeit prüfen." });
    }
    const lev = p.themes.includes("real_estate") ? 18 : 4;
    if (m.netDebtToEbitda != null && m.netDebtToEbitda > lev) {
      flags.push({ code: `lev_${p.symbol}`, title: `Hohe Verschuldung ${p.symbol}`, category: "leverage", severity: sev(2 + m.netDebtToEbitda / lev),
        evidence: `Nettoverschuldung/EBITDA ${m.netDebtToEbitda.toFixed(1)}x (Schwelle ${lev}x).`, affected: [p.symbol], actionType: "These prüfen",
        suggestion: "Refinanzierungsfälligkeiten und Zinsdeckung prüfen." });
    }
    if (p.themes.includes("unprofitable_growth") && (m.operatingMargin ?? 0) < 0) {
      flags.push({ code: `dil_${p.symbol}`, title: `Finanzierungs- und Verwässerungsrisiko ${p.symbol}`, category: "dilution", severity: 3,
        evidence: `Operative Marge ${m.operatingMargin?.toFixed(1)} %. Negatives operatives Ergebnis erhöht Wahrscheinlichkeit von Kapitalerhöhungen.`, affected: [p.symbol], actionType: "These prüfen",
        suggestion: "Cash-Reichweite und Auftragsbestand prüfen. Position ist wertmäßig klein, das Risiko betrifft vor allem die These." });
    }
  }

  for (const e of input.upcomingEvents.filter((e) => e.importance >= 3 && e.daysAhead <= 7)) {
    flags.push({ code: `event_${e.title}`, title: `Termin: ${e.title}`, category: "event", severity: 2,
      evidence: `In ${e.daysAhead} Tag(en).`, affected: e.symbol ? [e.symbol] : [], actionType: "Temporäre Volatilität",
      suggestion: "Ereignisrisiko, kein Handlungssignal für langfristige Positionen." });
  }

  const missing = input.positions.filter((p) => p.valueSource !== "market");
  if (missing.length) {
    flags.push({ code: "data", title: "Unvollständige Depotdaten", category: "data", severity: missing.length > input.positions.length / 2 ? 3 : 2,
      evidence: `${missing.length} von ${input.positions.length} Positionen ohne verifizierten Marktwert (${missing.map((p) => p.symbol).join(", ")}).`,
      affected: missing.map((p) => p.symbol), actionType: "Datenlücke", suggestion: "Stückzahlen erfassen und Kursdaten-Provider konfigurieren." });
  }
  if (input.cryptoValueEur > 0) {
    const total = input.positions.reduce((s, p) => s + (p.provisionalValueEur ?? 0), 0) + input.cryptoValueEur;
    const w = total > 0 ? (input.cryptoValueEur / total) * 100 : 0;
    if (w > 20) flags.push({ code: "crypto", title: "Hoher Krypto-Anteil am Gesamtvermögen (erfasst)", category: "concentration", severity: sev(2 + (w - 20) / 10),
      evidence: `Krypto ${pct(w)} von Depot plus Wallet.`, affected: ["Krypto"], actionType: "Konzentration zu hoch", suggestion: "Krypto als separates Risikobudget führen." });
  }
  return flags.sort((a, b) => b.severity - a.severity || a.title.localeCompare(b.title));
}
