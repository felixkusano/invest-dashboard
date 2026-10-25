import { describe, expect, it } from "vitest";
import { findNearDuplicate, inferCategory, matchArticle, normalizeUrl, ruleAssessment, sourceTier, urlHash, type MatchableInstrument, type RawArticle } from "@/domain/news";
import { parseConstituentsCsv, parseHoldingsCsv, parseNumber, sanitizeText } from "@/domain/csv";
import { analyzeWithClaude, extractFigures, ruleBasedReport, validateReport, type AnalysisInput } from "@/ai/analyst";
import { createSession, loginRateLimited, recordLoginFailure, verifySession } from "@/lib/auth";
import { checkAdminPassword, hashPassword, verifyPassword } from "@/lib/password";

const art = (o: Partial<RawArticle> = {}): RawArticle => ({ url: "https://www.reuters.com/x?utm_source=a", headline: "Nvidia raises guidance after record quarter", publisher: "Reuters", publishedAt: new Date("2026-10-24T12:00:00Z"), summary: null, tickers: [], provider: "t", ...o });
const instruments: MatchableInstrument[] = [
  { id: 1, symbol: "NVDA", aliases: ["Nvidia", "NVIDIA"], providerSymbols: { finnhub: "NVDA" }, sector: "Halbleiter", weightPct: 25 },
  { id: 2, symbol: "VNA", aliases: ["Vonovia"], providerSymbols: { eodhd: "VNA.XETRA" }, sector: "Immobilien", weightPct: 17 },
  { id: 3, symbol: "AMD", aliases: ["AMD"], providerSymbols: {}, sector: null, weightPct: 6 },
];

describe("News", () => {
  it("normalisiert URLs und erkennt identische Links trotz Tracking-Parametern", () => {
    expect(normalizeUrl("https://www.reuters.com/x/?utm_source=a#top")).toBe("https://reuters.com/x");
    expect(urlHash("https://www.reuters.com/x?utm_source=a")).toBe(urlHash("https://reuters.com/x"));
  });
  it("erkennt inhaltsgleiche Wiederholungen", () => {
    const ex = [{ id: 9, headline: "Nvidia raises guidance after a record quarter", publishedAt: new Date("2026-10-24T08:00:00Z") }];
    expect(findNearDuplicate(art(), ex)?.id).toBe(9);
    expect(findNearDuplicate(art({ headline: "Vonovia sells portfolio in Berlin" }), ex)).toBeNull();
    expect(findNearDuplicate(art({ publishedAt: new Date("2026-10-28T08:00:00Z") }), ex)).toBeNull();
  });
  it("ordnet über Ticker und Namen zu, kurze Aliase case-sensitiv", () => {
    expect(matchArticle(art(), instruments).map((m) => m.instrumentId)).toEqual([1]);
    expect(matchArticle(art({ headline: "Vonovia mit Neubewertung", tickers: [] }), instruments)[0]).toEqual({ instrumentId: 2, matchType: "alias" });
    expect(matchArticle(art({ headline: "Banks amend lending terms", tickers: [] }), instruments)).toEqual([]);
    expect(matchArticle(art({ headline: "x", tickers: ["VNA.DE"] }), instruments)[0].instrumentId).toBe(2);
  });
  it("Kategorie und Relevanz: Ergebnisse mit Depotbezug hoch, Spekulation gedeckelt", () => {
    expect(inferCategory(art(), 1)).toBe("earnings");
    expect(inferCategory(art({ headline: "ECB holds rates, Lagarde signals patience" }), 0)).toBe("central_bank");
    const hi = ruleAssessment(art(), "earnings", [25], new Date("2026-10-24T18:00:00Z"));
    const lo = ruleAssessment(art({ publisher: "Motley Fool", url: "https://fool.com/x", headline: "Is it time to buy this stock that could soar?" }), "commentary", [25], new Date("2026-10-24T18:00:00Z"));
    expect(hi.relevance).toBeGreaterThan(70);
    expect(hi.impact).toBe("positive");
    expect(lo.relevance).toBeLessThanOrEqual(30);
    expect(sourceTier("Federal Reserve", "https://www.federalreserve.gov/x")).toBe(1);
  });
});

describe("CSV-Import", () => {
  it("liest deutsche Zahlen und Semikolon", () => {
    expect(parseNumber("1.234,56 €")).toBeCloseTo(1234.56);
    expect(parseNumber("1,234.56")).toBeCloseTo(1234.56);
    expect(parseNumber("abc")).toBeNull();
    const { rows, errors } = parseHoldingsCsv("ISIN;Name;Stück;Einstandswert;Währung\nUS67066G1040;NVIDIA;12;546,00;USD\nUS67066G1040;NVIDIA;3;100;USD\nXX123;Kaputt;1;1;EUR\n");
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(15);
    expect(rows[0].costBasisEur).toBe(646);
    expect(errors.some((e) => e.includes("ungültige ISIN"))).toBe(true);
    expect(errors.some((e) => e.includes("zusammengeführt"))).toBe(true);
  });
  it("lehnt Dateien ohne Kennung ab und entschärft Formeln", () => {
    expect(parseHoldingsCsv("Name,Stück\nA,1").errors[0]).toContain("ISIN oder Symbol");
    expect(sanitizeText("=HYPERLINK(evil)")).toBe("HYPERLINK(evil)");
  });
  it("liest iShares-Holdings mit Vorspann und prüft Gewichtssumme", () => {
    const csv = `iShares Core MSCI World\nFondsbestände per,23.10.2026\n\nEmittententicker,Name,Sektor,Anlageklasse,Gewichtung (%),Standort\nNVDA,NVIDIA CORP,IT,Aktien,"5,21",Vereinigte Staaten\nAAPL,APPLE INC,IT,Aktien,"4,60",Vereinigte Staaten\n`;
    const r = parseConstituentsCsv(csv);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ key: "NVDA", weightPct: 5.21 });
    expect(r.errors[0]).toContain("unplausibel");
  });
});

const input: AnalysisInput = {
  date: "2026-10-26", marketStatus: "m",
  holdings: [{ symbol: "NVDA", name: "NVIDIA", weightPct: 25.1, valueSource: "market", dailyChangePct: 2.5, totalReturnPct: 331.6, themes: [], priceDate: "2026-10-23" }],
  news: [{ id: 7, headline: "h", publisher: "Reuters", publishedAt: "2026-10-25T00:00:00Z", summary: null, category: "earnings", symbols: ["NVDA"], ruleRelevance: 80, ruleImpact: "positive", url: "https://r", duplicate: false }],
  macro: [], events: [], risks: [{ title: "Klumpen", severity: 4, evidence: "e" }], candidates: [], allocation: [{ label: "VWCE", amountEur: 500, reason: "r" }], previous: null,
};
const validRaw = () => ({
  executiveSummary: [{ text: "NVDA steigt um 2.5 % nach Meldung.", kind: "fact", sourceNewsIds: [7, 99] }, { text: "Ohne Beleg wichtige Aussage.", kind: "fact", sourceNewsIds: [] }],
  marketSummary: [], portfolioImplications: [],
  newsAssessments: [{ newsId: 7, summary: "s", relevance: 80, impact: "positive", fundamentalImpact: "f", marketImpact: "m", horizon: "Wochen", thesisEffect: "temporary", evidenceQuality: "high", whyItMatters: "w", monitorNext: "n" },
    { newsId: 123, summary: "s", relevance: 10, impact: "unclear", fundamentalImpact: "", marketImpact: "", horizon: "unklar", thesisEffect: "unclear", evidenceQuality: "low", whyItMatters: "", monitorNext: "" }],
  macro: { whatChanged: "Kursziel 180 € erhöht", why: "", equityImplications: "", mostExposedHoldings: [], upcomingCatalysts: "" },
  topRisks: [], opportunities: [{ symbol: "ZZZZ", comment: "erfunden", kind: "judgment" }], thesisChanges: [], uncertainties: [],
});

describe("KI-Validierung", () => {
  it("verwirft unbekannte IDs und Symbole, stuft unbelegte Fakten herab, meldet erfundene Zahlen", () => {
    const { report, warnings } = validateReport(validRaw(), input);
    expect(report.newsAssessments.map((n) => n.newsId)).toEqual([7]);
    expect(report.executiveSummary[0].sourceNewsIds).toEqual([7]);
    expect(report.executiveSummary[1].kind).toBe("judgment");
    expect(report.opportunities).toHaveLength(0);
    expect(warnings.join()).toContain("180");
    expect(warnings.join()).not.toContain(" 2.5");
  });
  it("lehnt schemawidrige Ausgaben ab", () => {
    expect(() => validateReport({ executiveSummary: [] }, input)).toThrow();
  });
  it("Zahlen werden erkannt", () => expect(extractFigures("plus 3,5 % und 120 €")).toEqual(["3.5", "120"]));
  it("ohne Key: regelbasierter Report, klar gekennzeichnet", async () => {
    const r = await analyzeWithClaude(input, {} as NodeJS.ProcessEnv);
    expect(r.generator).toBe("rules-v1");
    expect(r.report.executiveSummary.length).toBeGreaterThan(0);
  });
  it("mit Key: nutzt Tool-Output und Modell-ID", async () => {
    const f = (async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      expect(body.tool_choice.name).toBe("submit_report");
      expect((init!.headers as Record<string, string>)["x-api-key"]).toBe("sk");
      return new Response(JSON.stringify({ model: "claude-test", content: [{ type: "tool_use", name: "submit_report", input: validRaw() }] }), { status: 200 });
    }) as typeof fetch;
    const r = await analyzeWithClaude(input, { ANTHROPIC_API_KEY: "sk" } as unknown as NodeJS.ProcessEnv, f);
    expect(r.generator).toBe("claude-test");
  });
  it("bei ungültiger KI-Antwort Fallback statt Absturz", async () => {
    const f = (async () => new Response(JSON.stringify({ content: [{ type: "tool_use", name: "submit_report", input: { nonsense: true } }] }), { status: 200 })) as typeof fetch;
    const r = await analyzeWithClaude(input, { ANTHROPIC_API_KEY: "sk" } as unknown as NodeJS.ProcessEnv, f);
    expect(r.generator).toBe("rules-v1");
    expect(r.warnings[0]).toContain("fehlgeschlagen");
  });
  it("regelbasierter Report erfindet keine Kausalität", () => {
    const r = ruleBasedReport(input);
    expect(r.macro.why).toContain("keine Zuordnung ohne Beleg");
  });
});

describe("Authentifizierung", () => {
  process.env.SESSION_SECRET = "x".repeat(40);
  it("signiert und prüft Sessions, manipulierte Tokens werden abgelehnt", async () => {
    const t = await createSession("me@example.com");
    expect(await verifySession(t)).toEqual({ email: "me@example.com" });
    expect(await verifySession(t.slice(0, -2) + "xx")).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
  });
  it("scrypt-Hash und Admin-Prüfung", () => {
    const h = hashPassword("korrektes-pferd-batterie");
    expect(verifyPassword("korrektes-pferd-batterie", h)).toBe(true);
    expect(verifyPassword("falsch", h)).toBe(false);
    expect(checkAdminPassword("korrektes-pferd-batterie", { ADMIN_PASSWORD_HASH: h } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(checkAdminPassword("klartext", { ADMIN_PASSWORD: "klartext", NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });
  it("begrenzt Login-Versuche", () => {
    const ip = "1.2.3.4";
    for (let i = 0; i < 5; i++) recordLoginFailure(ip);
    expect(loginRateLimited(ip)).toBe(true);
    expect(loginRateLimited("5.6.7.8")).toBe(false);
  });
});
