/**
 * Finnhub (finnhub.io). Free Tier: US-Aktien und -ETFs (Echtzeit-Quote), Unternehmensnews nordamerikanischer Firmen,
 * Basis-Kennzahlen (/stock/metric), Earnings-Kalender. 60 Calls/Minute. Keine Abdeckung von XETRA/Oslo im Free Tier.
 * Rolle hier: Fallback-Kurse für US-Titel, Primärquelle für News, Kennzahlen und Earnings-Termine.
 */
import { getJson } from "@/lib/http";
import type { Metrics } from "@/domain/scoring";
import type { RawArticle } from "@/domain/news";
import type { CalendarProvider, EarningsEvent, FundamentalsProvider, NewsProvider, ProviderInstrument, QuoteProvider, QuoteResult } from "./types";
import { snippet } from "./eodhd";

const BASE = "https://finnhub.io/api/v1";
const US = new Set(["NASDAQ", "NYSE"]);

export class FinnhubProvider implements QuoteProvider, NewsProvider, FundamentalsProvider, CalendarProvider {
  readonly name = "finnhub";
  readonly dataType = "realtime" as const;
  constructor(private token: string, private fetchImpl?: typeof fetch, private premium = false) {}

  private get<T>(path: string, params: Record<string, string>) {
    const q = new URLSearchParams(params);
    return getJson<T>(`${BASE}${path}?${q}`, { provider: this.name, fetchImpl: this.fetchImpl, headers: { "X-Finnhub-Token": this.token }, minIntervalMs: 1050 });
  }

  supports(i: ProviderInstrument) {
    return !!i.providerSymbols.finnhub && (this.premium || (US.has(i.exchange.toUpperCase()) && !i.providerSymbols.finnhub.includes(".")));
  }

  /** Liefert nur den aktuellen und den Vortagesschluss (2 Bars); Historie kommt vom Primärprovider. */
  async getDaily(i: ProviderInstrument): Promise<QuoteResult | null> {
    if (!this.supports(i)) return null;
    type Q = { c: number; pc: number; o: number; h: number; l: number; t: number };
    const q = await this.get<Q>("/quote", { symbol: i.providerSymbols.finnhub });
    if (!q || !(q.c > 0) || !q.t) return null; // Finnhub liefert 0 für unbekannte Symbole
    const asOf = new Date(q.t * 1000);
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(asOf); // US-Handelstag
    return {
      instrumentId: i.id, provider: this.name, currency: i.currency,
      dataType: Date.now() - asOf.getTime() < 20 * 60e3 ? "realtime" : "delayed",
      asOf, prevClose: q.pc > 0 ? q.pc : null,
      bars: [{ date, open: q.o, high: q.h, low: q.l, close: q.c, volume: null }],
    };
  }

  async companyNews(i: ProviderInstrument, from: string, to: string): Promise<RawArticle[]> {
    if (!this.supports(i)) return [];
    type N = { headline: string; source: string; datetime: number; url: string; summary: string; related: string; category: string };
    const rows = await this.get<N[]>("/company-news", { symbol: i.providerSymbols.finnhub, from, to });
    return (Array.isArray(rows) ? rows : []).slice(0, 25).filter((r) => r.url && r.headline).map((r) => ({
      url: r.url, headline: r.headline, publisher: r.source || "unbekannt", publishedAt: new Date(r.datetime * 1000),
      summary: snippet(r.summary), tickers: (r.related || i.providerSymbols.finnhub).split(",").map((s) => s.trim()).filter(Boolean),
      provider: this.name, categoryHint: "company",
    }));
  }

  async marketNews(): Promise<RawArticle[]> {
    type N = { headline: string; source: string; datetime: number; url: string; summary: string; related: string; category: string };
    const rows = await this.get<N[]>("/news", { category: "general" });
    return (Array.isArray(rows) ? rows : []).slice(0, 40).filter((r) => r.url && r.headline).map((r) => ({
      url: r.url, headline: r.headline, publisher: r.source || "unbekannt", publishedAt: new Date(r.datetime * 1000),
      summary: snippet(r.summary), tickers: r.related ? r.related.split(",").map((s) => s.trim()) : [], provider: this.name, categoryHint: "macro",
    }));
  }

  async metrics(i: ProviderInstrument): Promise<Metrics | null> {
    if (!this.supports(i)) return null;
    const d = await this.get<{ metric?: Record<string, number | null> }>("/stock/metric", { symbol: i.providerSymbols.finnhub, metric: "all" });
    return d?.metric ? mapFinnhubMetrics(d.metric) : null;
  }

  async earnings(from: string, to: string): Promise<EarningsEvent[]> {
    type E = { date: string; hour: string; epsEstimate: number | null; revenueEstimate: number | null; symbol: string };
    const d = await this.get<{ earningsCalendar?: E[] }>("/calendar/earnings", { from, to });
    return (d?.earningsCalendar ?? []).map((e) => ({ symbol: e.symbol, date: e.date, hour: e.hour || null, epsEstimate: e.epsEstimate ?? null, revenueEstimate: e.revenueEstimate ?? null, provider: this.name }));
  }
}

export function mapFinnhubMetrics(m: Record<string, number | null | undefined>): Metrics {
  const pick = (...keys: string[]) => {
    for (const k of keys) { const v = m[k]; if (typeof v === "number" && Number.isFinite(v)) return v; }
    return null;
  };
  const pfcf = pick("pfcfShareTTM", "pfcfShareAnnual");
  return {
    grossMargin: pick("grossMarginTTM", "grossMarginAnnual"),
    operatingMargin: pick("operatingMarginTTM", "operatingMarginAnnual"),
    netMargin: pick("netProfitMarginTTM", "netProfitMarginAnnual"),
    roic: pick("roiTTM", "roiAnnual"),
    roe: pick("roeTTM", "roeRfy"),
    revenueGrowthYoy: pick("revenueGrowthTTMYoy", "revenueGrowthQuarterlyYoy"),
    revenueGrowth3y: pick("revenueGrowth3Y"),
    epsGrowthYoy: pick("epsGrowthTTMYoy", "epsGrowthQuarterlyYoy"),
    epsGrowth3y: pick("epsGrowth3Y"),
    peTtm: pick("peTTM", "peExclExtraTTM", "peBasicExclExtraTTM"),
    forwardPe: pick("forwardPE"),
    psTtm: pick("psTTM"),
    evSales: pick("evRevenueTTM"),
    evEbitda: pick("evEbitdaTTM"),
    pb: pick("pbQuarterly", "pbAnnual", "pb"),
    fcfYield: pfcf && pfcf > 0 ? 100 / pfcf : pfcf != null && pfcf < 0 ? -100 / Math.abs(pfcf) : null,
    debtToEquity: pick("totalDebt/totalEquityQuarterly", "totalDebt/totalEquityAnnual"),
    netDebtToEbitda: null,
    currentRatio: pick("currentRatioQuarterly", "currentRatioAnnual"),
    priceReturn52w: pick("52WeekPriceReturnDaily"),
    priceReturn13w: pick("13WeekPriceReturnDaily"),
    relStrength52w: pick("priceRelativeToS&P50052Week"),
    beta: pick("beta"),
    marketCapUsdM: pick("marketCapitalization"),
  };
}
