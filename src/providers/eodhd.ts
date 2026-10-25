/**
 * EODHD (eodhd.com). Primärquelle für Kurse, weil sie US, XETRA, Oslo, Euronext und UCITS-ETFs in einem Plan abdeckt.
 * Plan "EOD Historical All-World" (Personal): Tagesschlusskurse aller Börsen, 100.000 Calls/Tag.
 * Fundamentaldaten nur in "Fundamentals" bzw. "All-in-One". Kostenloser Sandbox-Key: 20 Calls/Tag.
 * Datentyp: Tagesschluss (EOD). Es wird nie als Echtzeit ausgewiesen.
 */
import { getJson } from "@/lib/http";
import type { Metrics } from "@/domain/scoring";
import type { RawArticle } from "@/domain/news";
import type { DailyBar, FundamentalsProvider, IndexQuoteProvider, NewsProvider, ProviderInstrument, QuoteProvider, QuoteResult } from "./types";

const BASE = "https://eodhd.com/api";

type EodBar = { date: string; open: number; high: number; low: number; close: number; adjusted_close?: number; volume: number };

/** Börsen, deren Kurse in Untereinheiten notieren (z. B. LSE in Pence). */
const SUBUNIT: Record<string, { currency: string; factor: number }> = { LSE: { currency: "GBP", factor: 0.01 } };

export function parseEodBars(rows: EodBar[], exchangeSuffix: string): DailyBar[] {
  const sub = SUBUNIT[exchangeSuffix];
  const f = sub?.factor ?? 1;
  return rows
    .filter((r) => r && typeof r.close === "number" && Number.isFinite(r.close) && r.close > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
    .map((r) => ({ date: r.date, open: r.open * f, high: r.high * f, low: r.low * f, close: r.close * f, volume: r.volume ?? null }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((b, i, arr) => i === 0 || arr[i - 1].date !== b.date);
}

export class EodhdProvider implements QuoteProvider, FundamentalsProvider, NewsProvider, IndexQuoteProvider {
  readonly name = "eodhd";
  readonly dataType = "eod" as const;
  constructor(private token: string, private fetchImpl?: typeof fetch, private fundamentalsEnabled = false) {}

  supports(i: ProviderInstrument) { return !!i.providerSymbols.eodhd; }

  private url(path: string, params: Record<string, string> = {}) {
    const q = new URLSearchParams({ api_token: this.token, fmt: "json", ...params });
    return `${BASE}${path}?${q}`;
  }

  async getDaily(i: ProviderInstrument, fromDate: string): Promise<QuoteResult | null> {
    const sym = i.providerSymbols.eodhd;
    if (!sym) return null;
    const rows = await getJson<EodBar[]>(this.url(`/eod/${encodeURIComponent(sym)}`, { from: fromDate, period: "d" }), { provider: this.name, fetchImpl: this.fetchImpl, minIntervalMs: 80 });
    if (!Array.isArray(rows)) return null;
    const suffix = sym.split(".").pop() ?? "";
    const bars = parseEodBars(rows, suffix);
    if (!bars.length) return null;
    const currency = SUBUNIT[suffix]?.currency ?? i.currency;
    return { instrumentId: i.id, provider: this.name, currency, dataType: "eod", asOf: new Date(bars[bars.length - 1].date + "T23:59:00Z"), bars };
  }

  async indexDaily(_code: string, providerSymbol: string, fromDate: string) {
    const rows = await getJson<EodBar[]>(this.url(`/eod/${encodeURIComponent(providerSymbol)}`, { from: fromDate, period: "d" }), { provider: this.name, fetchImpl: this.fetchImpl, minIntervalMs: 80 });
    if (!Array.isArray(rows)) return null;
    const bars = parseEodBars(rows, providerSymbol.split(".").pop() ?? "");
    return bars.length ? { bars, asOf: new Date(bars[bars.length - 1].date + "T23:59:00Z") } : null;
  }

  async metrics(i: ProviderInstrument): Promise<Metrics | null> {
    if (!this.fundamentalsEnabled || !i.providerSymbols.eodhd) return null;
    type F = { Highlights?: Record<string, number | string | null>; Valuation?: Record<string, number | string | null>; Technicals?: Record<string, number | string | null> };
    const d = await getJson<F>(this.url(`/fundamentals/${encodeURIComponent(i.providerSymbols.eodhd)}`), { provider: this.name, fetchImpl: this.fetchImpl, minIntervalMs: 120 });
    return mapEodhdFundamentals(d);
  }

  async companyNews(i: ProviderInstrument, from: string, to: string): Promise<RawArticle[]> {
    const sym = i.providerSymbols.eodhd;
    if (!sym) return [];
    type N = { date: string; title: string; content?: string; link: string; symbols?: string[] };
    const rows = await getJson<N[]>(this.url("/news", { s: sym, from, to, limit: "20" }), { provider: this.name, fetchImpl: this.fetchImpl, minIntervalMs: 120 });
    return (Array.isArray(rows) ? rows : []).filter((r) => r.title && r.link).map((r) => ({
      url: r.link, headline: r.title, publisher: hostOf(r.link), publishedAt: new Date(r.date), summary: snippet(r.content),
      tickers: (r.symbols ?? []).map((s) => s.split(".")[0]), provider: this.name,
    }));
  }

  async marketNews(): Promise<RawArticle[]> { return []; }
}

const n = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : (v as number);
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};

export function mapEodhdFundamentals(d: { Highlights?: Record<string, unknown>; Valuation?: Record<string, unknown>; Technicals?: Record<string, unknown> }): Metrics | null {
  if (!d || (!d.Highlights && !d.Valuation)) return null;
  const H = d.Highlights ?? {}, V = d.Valuation ?? {}, T = d.Technicals ?? {};
  const pct = (v: unknown) => { const x = n(v); return x == null ? null : x * 100; };
  const rev = n(H.RevenueTTM), gp = n(H.GrossProfitTTM), mcap = n(H.MarketCapitalization);
  return {
    grossMargin: rev && gp != null ? (gp / rev) * 100 : null,
    operatingMargin: pct(H.OperatingMarginTTM),
    netMargin: pct(H.ProfitMargin),
    roe: pct(H.ReturnOnEquityTTM),
    roic: null, // EODHD liefert kein ROIC; ROA wird bewusst nicht als ROIC ausgegeben
    revenueGrowthYoy: pct(H.QuarterlyRevenueGrowthYOY),
    epsGrowthYoy: pct(H.QuarterlyEarningsGrowthYOY),
    peTtm: n(V.TrailingPE) ?? n(H.PERatio),
    forwardPe: n(V.ForwardPE),
    psTtm: n(V.PriceSalesTTM),
    evSales: n(V.EnterpriseValueRevenue),
    evEbitda: n(V.EnterpriseValueEbitda),
    pb: n(V.PriceBookMRQ),
    beta: n(T.Beta),
    marketCapUsdM: mcap != null ? mcap / 1e6 : null,
  };
}

function hostOf(u: string) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "unbekannt"; } }
export function snippet(t?: string | null, max = 280): string | null {
  if (!t) return null;
  const clean = t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max).replace(/\s+\S*$/, "") + " …" : clean;
}
