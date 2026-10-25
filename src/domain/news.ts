/**
 * News: Normalisierung, Dublettenerkennung, Zuordnung zu Positionen, regelbasierte Relevanz (0–100).
 * Die regelbasierte Einstufung ist eine Heuristik und wird in der UI als solche gekennzeichnet.
 * Eine KI-Einstufung (falls konfiguriert) wird separat gespeichert und ersetzt die Heuristik nicht stillschweigend.
 */
import { createHash } from "node:crypto";

export type RawArticle = {
  url: string;
  headline: string;
  publisher: string;
  publishedAt: Date;
  summary: string | null;
  tickers: string[];
  provider: string;
  categoryHint?: string | null;
};

export type MatchableInstrument = { id: number; symbol: string; aliases: string[]; providerSymbols: Record<string, string>; sector: string | null; weightPct: number | null };

export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    for (const k of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|cmpid)/i.test(k)) url.searchParams.delete(k);
    url.hostname = url.hostname.replace(/^www\./, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return u.trim();
  }
}

export const urlHash = (u: string) => createHash("sha256").update(normalizeUrl(u)).digest("hex").slice(0, 32);

const STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "for", "and", "is", "as", "at", "by", "with", "der", "die", "das", "und", "im", "mit", "von", "zu", "auf", "ein", "eine"]);
export function titleTokens(t: string): Set<string> {
  return new Set(t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Findet für jeden Artikel eine frühere, inhaltlich gleiche Meldung (Titelähnlichkeit ≥ 0,7 innerhalb 48 h). */
export function findNearDuplicate<T extends { id: number; headline: string; publishedAt: Date }>(article: { headline: string; publishedAt: Date }, existing: T[], threshold = 0.7): T | null {
  const tok = titleTokens(article.headline);
  let best: T | null = null;
  let bestScore = 0;
  for (const e of existing) {
    if (Math.abs(e.publishedAt.getTime() - article.publishedAt.getTime()) > 48 * 3600e3) continue;
    const s = jaccard(tok, titleTokens(e.headline));
    if (s >= threshold && s > bestScore) { best = e; bestScore = s; }
  }
  return best;
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function matchArticle(a: RawArticle, instruments: MatchableInstrument[]): { instrumentId: number; matchType: "provider_ticker" | "alias" }[] {
  const text = `${a.headline} ${a.summary ?? ""}`;
  const tickers = new Set(a.tickers.map((t) => t.toUpperCase().split(/[.:]/)[0]));
  const out: { instrumentId: number; matchType: "provider_ticker" | "alias" }[] = [];
  for (const i of instruments) {
    const syms = [i.symbol, ...Object.values(i.providerSymbols)].map((s) => s.toUpperCase().split(/[.:]/)[0]);
    if (syms.some((s) => tickers.has(s))) { out.push({ instrumentId: i.id, matchType: "provider_ticker" }); continue; }
    const hit = i.aliases.some((al) => new RegExp(`(^|[^\\p{L}])${escapeRe(al)}([^\\p{L}]|$)`, al.length <= 4 ? "u" : "iu").test(text));
    if (hit) out.push({ instrumentId: i.id, matchType: "alias" });
  }
  return out;
}

const CATEGORY_RULES: [string, RegExp][] = [
  ["central_bank", /\b(fed|fomc|ecb|ezb|powell|lagarde|rate (cut|hike|decision)|zinsentscheid|leitzins|central bank|notenbank)\b/i],
  ["earnings", /\b(earnings|quarterly results|q[1-4] results|guidance|eps|revenue (beat|miss)|quartalszahlen|prognose|outlook)\b/i],
  ["regulatory", /\b(regulat|antitrust|sec |doj|export (control|ban|restriction)|sanction|kartell|eu commission|lawsuit|klage)\b/i],
  ["geopolitical", /\b(tariff|zoll|war|krieg|china|taiwan|ukraine|middle east|geopolit)\b/i],
  ["macro", /\b(inflation|cpi|pce|gdp|bip|payrolls|unemployment|arbeitsmarkt|pmi|ifo|yields?|treasur|bund)\b/i],
  ["commentary", /\b(opinion|column|kommentar|should you buy|is it time|stock to buy|prediction|could soar|millionaire)\b/i],
];

export function inferCategory(a: RawArticle, matched: number): string {
  const text = `${a.headline} ${a.summary ?? ""}`;
  for (const [cat, re] of CATEGORY_RULES) if (re.test(text)) {
    if (cat === "macro" && matched > 0) return "company";
    return cat;
  }
  if (a.categoryHint && ["company", "sector", "macro"].includes(a.categoryHint)) return a.categoryHint;
  return matched > 0 ? "company" : "sector";
}

/** Quellenqualität: Tier 1 Primärquellen/Agenturen, Tier 2 etablierte Finanzpresse, Tier 3 Rest. */
export function sourceTier(publisher: string, url: string): 1 | 2 | 3 {
  const s = `${publisher} ${url}`.toLowerCase();
  if (/(reuters|bloomberg|federalreserve\.gov|ecb\.europa\.eu|sec\.gov|businesswire|globenewswire|prnewswire|investor\.|ir\.|destatis|eurostat|bls\.gov|bea\.gov)/.test(s)) return 1;
  if (/(wsj|ft\.com|financial times|cnbc|marketwatch|barron|handelsblatt|faz|boersen-zeitung|economist|nikkei|associated press|apnews)/.test(s)) return 2;
  return 3;
}

const IMPACT_WORDS = {
  pos: /\b(beat|beats|raises guidance|upgrade|record|surge|wins|contract|approval|buyback|outperform|hebt prognose|rekord|übertrifft)\b/i,
  neg: /\b(miss|misses|cuts guidance|downgrade|probe|investigation|recall|plunge|lawsuit|delay|warns|senkt prognose|verfehlt|kapitalerhöhung|dilution|offering)\b/i,
};

export function ruleAssessment(a: RawArticle, category: string, matchedWeights: number[], now: Date) {
  const tier = sourceTier(a.publisher, a.url);
  const exposure = matchedWeights.reduce((s, w) => s + w, 0);
  const ageH = (now.getTime() - a.publishedAt.getTime()) / 3600e3;
  const text = `${a.headline} ${a.summary ?? ""}`;
  let score = 0;
  score += Math.min(35, exposure * 1.5); // direkte Portfoliobetroffenheit
  score += { earnings: 25, central_bank: 22, regulatory: 18, macro: 14, geopolitical: 12, company: 12, sector: 6, commentary: 0 }[category] ?? 5;
  score += tier === 1 ? 15 : tier === 2 ? 10 : 3;
  score += ageH <= 24 ? 10 : ageH <= 72 ? 5 : 0;
  if (IMPACT_WORDS.pos.test(text) || IMPACT_WORDS.neg.test(text)) score += 10;
  if (category === "commentary") score = Math.min(score, 30);
  const pos = IMPACT_WORDS.pos.test(text), neg = IMPACT_WORDS.neg.test(text);
  const impact = pos && neg ? "mixed" : pos ? "positive" : neg ? "negative" : "unclear";
  return {
    relevance: Math.max(0, Math.min(100, Math.round(score))),
    impact: impact as "positive" | "negative" | "mixed" | "unclear",
    evidenceQuality: tier === 1 ? "high" : tier === 2 ? "medium" : "low",
    thesisEffect: category === "earnings" || category === "regulatory" ? "unclear" : category === "commentary" ? "temporary" : "unclear",
  };
}
