/**
 * Provider-Registry. Austauschbar über Umgebungsvariablen; die Pipeline kennt nur die Interfaces.
 * Reihenfolge = Priorität. Fällt ein Provider aus, wird der nächste versucht.
 */
import { EodhdProvider } from "./eodhd";
import { FinnhubProvider } from "./finnhub";
import { FredProvider, EcbProvider, FrankfurterProvider } from "./macro";
import { OfficialRssProvider } from "./rss";
import { DemoProvider, DemoFxProvider } from "./demo";
import type { CalendarProvider, FundamentalsProvider, FxProvider, IndexQuoteProvider, MacroProvider, NewsProvider, ProviderInfo, QuoteProvider } from "./types";

export type Providers = {
  quotes: QuoteProvider[];
  indices: IndexQuoteProvider[];
  news: NewsProvider[];
  fundamentals: FundamentalsProvider[];
  calendar: CalendarProvider[];
  macro: Record<string, MacroProvider>;
  fx: FxProvider[];
  demo: boolean;
};

export function buildProviders(opts: { demo: boolean; env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch }): Providers {
  const env = opts.env ?? process.env;
  const f = opts.fetchImpl;
  if (opts.demo) {
    const d = new DemoProvider();
    return { quotes: [d], indices: [], news: [], fundamentals: [d], calendar: [], macro: {}, fx: [new EcbProvider(f), new FrankfurterProvider(f), new DemoFxProvider()], demo: true };
  }
  const eod = env.EODHD_API_KEY ? new EodhdProvider(env.EODHD_API_KEY, f, env.EODHD_FUNDAMENTALS === "true") : null;
  const fh = env.FINNHUB_API_KEY ? new FinnhubProvider(env.FINNHUB_API_KEY, f, env.FINNHUB_PREMIUM === "true") : null;
  const macro: Record<string, MacroProvider> = { ecb: new EcbProvider(f) };
  if (env.FRED_API_KEY) macro.fred = new FredProvider(env.FRED_API_KEY, f);
  return {
    quotes: [eod, fh].filter(Boolean) as QuoteProvider[],
    indices: eod ? [eod] : [],
    news: [fh, eod && env.EODHD_NEWS === "true" ? eod : null, new OfficialRssProvider(f)].filter(Boolean) as NewsProvider[],
    fundamentals: [fh, eod && env.EODHD_FUNDAMENTALS === "true" ? eod : null].filter(Boolean) as FundamentalsProvider[],
    calendar: fh ? [fh] : [],
    macro,
    fx: [new EcbProvider(f), new FrankfurterProvider(f)],
    demo: false,
  };
}

export function providerCatalog(env: NodeJS.ProcessEnv = process.env): ProviderInfo[] {
  return [
    { name: "eodhd", label: "EODHD", role: "Kurse (primär), optional Fundamentaldaten und News", configured: !!env.EODHD_API_KEY, envVar: "EODHD_API_KEY", dataType: "Tagesschluss (EOD)", coverage: "US, XETRA, Oslo, Euronext, UCITS-ETFs, Indizes", limits: "Sandbox 20 Calls/Tag; All-World 100.000/Tag", docsUrl: "https://eodhd.com/financial-apis/" },
    { name: "finnhub", label: "Finnhub", role: "US-Kurse (Fallback), Unternehmensnews, Kennzahlen, Earnings-Kalender", configured: !!env.FINNHUB_API_KEY, envVar: "FINNHUB_API_KEY", dataType: "Echtzeit (US, Free Tier)", coverage: "Free Tier: US-Titel; Europa nur kostenpflichtig", limits: "60 Calls/Minute", docsUrl: "https://finnhub.io/docs/api" },
    { name: "fred", label: "FRED (St. Louis Fed)", role: "US-Makrodaten, Renditen, Spreads, Rohstoffe, S&P 500, Nasdaq-100, VIX", configured: !!env.FRED_API_KEY, envVar: "FRED_API_KEY", dataType: "Offizielle Statistik, täglich/monatlich", coverage: "USA, globale Rohstoffpreise", limits: "120 Requests/Minute", docsUrl: "https://fred.stlouisfed.org/docs/api/fred/" },
    { name: "ecb", label: "EZB Data Portal", role: "Euroraum-Inflation, Leitzins, Renditen, Referenzwechselkurse", configured: true, envVar: null, dataType: "Offizielle Statistik", coverage: "Euroraum", limits: "ohne Key", docsUrl: "https://data.ecb.europa.eu/help/api/overview" },
    { name: "frankfurter", label: "Frankfurter", role: "FX-Fallback (EZB-Referenzkurse)", configured: true, envVar: null, dataType: "Tagesreferenzkurs", coverage: "rund 30 Währungen", limits: "ohne Key", docsUrl: "https://frankfurter.dev" },
    { name: "rss", label: "EZB und Fed Pressemitteilungen", role: "Offizielle Notenbank-Meldungen", configured: true, envVar: null, dataType: "RSS", coverage: "EZB, Federal Reserve", limits: "ohne Key", docsUrl: "https://www.ecb.europa.eu/home/html/rss.en.html" },
    { name: "anthropic", label: "Anthropic Claude", role: "KI-Analyse mit validiertem JSON-Schema", configured: !!env.ANTHROPIC_API_KEY, envVar: "ANTHROPIC_API_KEY", dataType: "Kommentar (keine Fakten)", coverage: "Zusammenfassung, Einordnung, Thesen", limits: "nach Kontingent", docsUrl: "https://docs.claude.com" },
  ];
}
