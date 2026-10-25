/**
 * KI-Analyse (serverseitig). Claude erhält ausschließlich strukturierte Pipeline-Daten und muss einen
 * per JSON-Schema erzwungenen Report liefern. Danach:
 *  - zod-Validierung,
 *  - Referenzprüfung (nur bekannte News-IDs und Symbole),
 *  - Zahlenprüfung (Prozent-/Euro-Werte im Text müssen in den Eingangsdaten vorkommen, sonst Warnung).
 * Ohne API-Key oder bei Fehlern greift ein regelbasierter Report, der als solcher gekennzeichnet ist.
 */
import { DailyReportSchema, reportJsonSchema, type DailyReport } from "./schemas";
import { fetchWithRetry } from "@/lib/http";

export type AnalysisInput = {
  date: string;
  marketStatus: string;
  holdings: { symbol: string; name: string; weightPct: number | null; valueSource: string; dailyChangePct: number | null; totalReturnPct: number | null; themes: string[]; priceDate: string | null }[];
  news: { id: number; headline: string; publisher: string; publishedAt: string; summary: string | null; category: string; symbols: string[]; ruleRelevance: number; ruleImpact: string; url: string; duplicate: boolean }[];
  macro: { code: string; name: string; latest: number | null; latestDate: string | null; previous: number | null; unit: string }[];
  events: { title: string; date: string; status: string; symbol: string | null; importance: number }[];
  risks: { title: string; severity: number; evidence: string }[];
  candidates: { symbol: string; name: string; total: number | null; confidence: string; isHolding: boolean }[];
  allocation: { label: string; amountEur: number; reason: string }[];
  previous: { date: string; executiveSummary: string[] } | null;
};

export type AnalysisResult = { report: DailyReport; generator: string; warnings: string[] };

const SYSTEM = `Du bist ein nüchterner Senior Equity Analyst für ein privates Depot (Wachstumsprofil, langfristig plus taktische Chancen).
Regeln:
- Nutze ausschließlich die gelieferten Daten. Erfinde keine Kurse, Kennzahlen, Termine, Analystenziele oder Konsensschätzungen.
- Jede Aussage bekommt einen Typ: fact (in den Daten belegt), expectation (Markterwartung laut Quelle), judgment (deine Einschätzung), forecast (unsichere Prognose).
- Verweise für Fakten auf News-IDs (sourceNewsIds). Ohne Beleg: als judgment oder forecast kennzeichnen oder in uncertainties aufnehmen.
- Ordne Kursbewegungen keinen Ursachen zu, wenn die Daten keinen Beleg liefern.
- Ein Kursrückgang allein ist kein Verkaufsargument. Unterscheide Bewertung, Fundamentaldaten, Konzentration, temporäre Volatilität, ungültige These.
- Wiederholte Meldungen ohne neue Information (duplicate=true) erhalten niedrige Relevanz.
- Sprache: Deutsch, präzise, institutionell, keine Marketingfloskeln, keine Gedankenstriche als Satzzeichen.
- Liefere das Ergebnis ausschließlich über das Tool submit_report.`;

export async function analyzeWithClaude(input: AnalysisInput, env: NodeJS.ProcessEnv = process.env, fetchImpl?: typeof fetch): Promise<AnalysisResult> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return { report: ruleBasedReport(input), generator: "rules-v1", warnings: ["Kein ANTHROPIC_API_KEY: regelbasierter Report ohne KI."] };
  const model = env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
  const body = {
    model,
    max_tokens: 8000,
    system: SYSTEM,
    tools: [{ name: "submit_report", description: "Täglichen Investment-Report im vorgegebenen Schema übermitteln.", input_schema: reportJsonSchema() }],
    tool_choice: { type: "tool", name: "submit_report" },
    messages: [{ role: "user", content: `Eingangsdaten (JSON):\n${JSON.stringify(input)}` }],
  };
  try {
    const res = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      provider: "anthropic", method: "POST", timeoutMs: 120000, retries: 2, fetchImpl,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { content?: { type: string; name?: string; input?: unknown }[]; model?: string };
    const tool = data.content?.find((c) => c.type === "tool_use" && c.name === "submit_report");
    if (!tool) throw new Error("Antwort enthält keinen Tool-Aufruf");
    const { report, warnings } = validateReport(tool.input, input);
    return { report, generator: data.model ?? model, warnings };
  } catch (e) {
    return { report: ruleBasedReport(input), generator: "rules-v1", warnings: [`KI-Analyse fehlgeschlagen, regelbasierter Report verwendet: ${(e as Error).message}`] };
  }
}

/** Validiert und bereinigt KI-Output. Wirft bei Schemaverletzung. */
export function validateReport(raw: unknown, input: AnalysisInput): { report: DailyReport; warnings: string[] } {
  const report = DailyReportSchema.parse(raw);
  const warnings: string[] = [];
  const ids = new Set(input.news.map((n) => n.id));
  const symbols = new Set([...input.holdings.map((h) => h.symbol), ...input.candidates.map((c) => c.symbol)]);

  const before = report.newsAssessments.length;
  report.newsAssessments = report.newsAssessments.filter((a) => ids.has(a.newsId));
  if (report.newsAssessments.length < before) warnings.push(`${before - report.newsAssessments.length} News-Bewertung(en) mit unbekannter ID verworfen.`);
  for (const group of [report.executiveSummary, report.marketSummary, report.portfolioImplications]) {
    for (const s of group) {
      const bad = s.sourceNewsIds.filter((i) => !ids.has(i));
      if (bad.length) { s.sourceNewsIds = s.sourceNewsIds.filter((i) => ids.has(i)); warnings.push("Unbekannte Quellen-IDs entfernt."); }
      if (s.kind === "fact" && s.sourceNewsIds.length === 0 && !mentionsInputNumbersOnly(s.text, input)) {
        s.kind = "judgment"; warnings.push(`Aussage ohne Beleg von "Fakt" auf "Einschätzung" herabgestuft: ${s.text.slice(0, 60)}…`);
      }
    }
  }
  report.opportunities = report.opportunities.filter((o) => symbols.has(o.symbol));
  report.thesisChanges = report.thesisChanges.filter((t) => symbols.has(t.symbol));

  const unverified = unknownNumbers(JSON.stringify(report), input);
  if (unverified.length) warnings.push(`Zahlen im KI-Text ohne Entsprechung in den Eingangsdaten: ${unverified.slice(0, 8).join(", ")}. Bitte gegenprüfen.`);
  return { report, warnings };
}

/** Extrahiert Prozent- und Eurozahlen aus Text. */
export function extractFigures(text: string): string[] {
  return [...text.matchAll(/(\d+(?:[.,]\d+)?)\s?(%|€|EUR|Prozent)/g)].map((m) => m[1].replace(",", "."));
}

function inputNumberSet(input: AnalysisInput): Set<string> {
  const set = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) {
      for (const d of [0, 1, 2]) { set.add(Math.abs(v).toFixed(d)); set.add(String(Number(Math.abs(v).toFixed(d)))); }
    } else if (typeof v === "string") extractFigures(v).forEach((x) => set.add(String(Number(x))));
    else if (v && typeof v === "object") Object.values(v).forEach(add);
  };
  add(input);
  return set;
}

export function unknownNumbers(text: string, input: AnalysisInput): string[] {
  const known = inputNumberSet(input);
  return [...new Set(extractFigures(text).map((x) => String(Number(x))))].filter((x) => !known.has(x) && !known.has(Number(x).toFixed(1)));
}

function mentionsInputNumbersOnly(text: string, input: AnalysisInput): boolean {
  const figs = extractFigures(text);
  return figs.length > 0 && unknownNumbers(text, input).length === 0;
}

/** Deterministischer Report ohne KI. Enthält nur Aussagen, die direkt aus den Daten folgen. */
export function ruleBasedReport(input: AnalysisInput): DailyReport {
  const f1 = (v: number) => v.toFixed(1).replace(".", ",");
  const movers = input.holdings.filter((h) => h.dailyChangePct != null).sort((a, b) => Math.abs(b.dailyChangePct!) - Math.abs(a.dailyChangePct!)).slice(0, 3);
  const topNews = [...input.news].filter((n) => !n.duplicate).sort((a, b) => b.ruleRelevance - a.ruleRelevance).slice(0, 5);
  const exec: DailyReport["executiveSummary"] = [];
  const verifiedCount = input.holdings.filter((h) => h.valueSource === "market").length;
  exec.push({ text: `${verifiedCount} von ${input.holdings.length} Positionen mit verifiziertem Marktwert. ${input.marketStatus}`, kind: "fact", sourceNewsIds: [] });
  if (movers.length) exec.push({ text: `Größte Tagesbewegungen (letzter Handelstag): ${movers.map((m) => `${m.symbol} ${m.dailyChangePct! > 0 ? "+" : ""}${f1(m.dailyChangePct!)} %`).join(", ")}.`, kind: "fact", sourceNewsIds: [] });
  if (input.risks[0]) exec.push({ text: `Höchstes Portfoliorisiko: ${input.risks[0].title}. ${input.risks[0].evidence}`, kind: "fact", sourceNewsIds: [] });
  if (topNews[0]) exec.push({ text: `Relevanteste Meldung (heuristisch): ${topNews[0].headline} (${topNews[0].publisher}).`, kind: "fact", sourceNewsIds: [topNews[0].id] });
  if (input.allocation.length) exec.push({ text: `Allokationsvorschlag: ${input.allocation.map((a) => `${a.label} ${a.amountEur} €`).join(" | ")}.`, kind: "judgment", sourceNewsIds: [] });

  const macroLines = input.macro.filter((m) => m.latest != null && m.previous != null && m.latest !== m.previous).slice(0, 6)
    .map((m) => `${m.name}: ${m.previous} → ${m.latest} ${m.unit} (${m.latestDate})`);

  return {
    executiveSummary: exec,
    marketSummary: macroLines.length ? [{ text: `Veränderte Makroindikatoren: ${macroLines.join("; ")}.`, kind: "fact", sourceNewsIds: [] }] : [],
    portfolioImplications: [{ text: "Regelbasierter Modus: keine kausale Interpretation der Bewegungen. Für Einordnung ANTHROPIC_API_KEY konfigurieren.", kind: "judgment", sourceNewsIds: [] }],
    newsAssessments: topNews.map((n) => ({
      newsId: n.id, summary: n.summary ?? n.headline, relevance: n.ruleRelevance, impact: n.ruleImpact as "positive" | "negative" | "mixed" | "unclear",
      fundamentalImpact: "Nicht bewertet (regelbasiert).", marketImpact: "Nicht bewertet (regelbasiert).", horizon: "unklar", thesisEffect: "unclear",
      evidenceQuality: "medium", whyItMatters: n.symbols.length ? `Betrifft ${n.symbols.join(", ")} im Depot.` : "Marktweite Meldung.", monitorNext: "Folgemeldungen und Kursreaktion beobachten.",
    })),
    macro: {
      whatChanged: macroLines.join("; ") || "Keine neuen Makrowerte seit dem letzten Lauf.",
      why: "Ursachenanalyse erfordert KI-Modus oder manuelle Einordnung; keine Zuordnung ohne Beleg.",
      equityImplications: "Nicht bewertet (regelbasiert).",
      mostExposedHoldings: input.holdings.filter((h) => h.themes.includes("rate_sensitive")).map((h) => h.symbol),
      upcomingCatalysts: input.events.slice(0, 5).map((e) => `${e.date}: ${e.title}${e.status !== "confirmed" ? " (unbestätigt)" : ""}`).join("; ") || "Keine Termine erfasst.",
    },
    topRisks: input.risks.slice(0, 3).map((r) => ({ title: r.title, explanation: r.evidence, affected: [], kind: "fact" as const })),
    opportunities: input.candidates.filter((c) => c.total != null).sort((a, b) => b.total! - a.total!).slice(0, 3).map((c) => ({ symbol: c.symbol, comment: `Score ${f1(c.total!)} (Datenvertrauen ${c.confidence}).`, kind: "fact" as const })),
    thesisChanges: [],
    uncertainties: input.holdings.filter((h) => h.valueSource !== "market").length ? ["Teile des Depots ohne verifizierte Kurse oder Stückzahlen."] : [],
  };
}
