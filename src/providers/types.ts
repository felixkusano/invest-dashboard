import type { Metrics } from "@/domain/scoring";
import type { RawArticle } from "@/domain/news";

export type ProviderInstrument = {
  id: number;
  symbol: string;
  exchange: string;
  currency: string;
  assetClass: string;
  providerSymbols: Record<string, string>;
};

export type DailyBar = { date: string; open: number | null; high: number | null; low: number | null; close: number; volume: number | null };

export type QuoteResult = {
  instrumentId: number;
  provider: string;
  currency: string;
  dataType: "realtime" | "delayed" | "eod" | "demo";
  asOf: Date;
  bars: DailyBar[]; // aufsteigend sortiert, letzter Eintrag = aktuellster Handelstag
  prevClose?: number | null; // falls der Provider den Vortagesschluss separat liefert
};

export interface QuoteProvider {
  readonly name: string;
  readonly dataType: QuoteResult["dataType"];
  supports(i: ProviderInstrument): boolean;
  getDaily(i: ProviderInstrument, fromDate: string): Promise<QuoteResult | null>;
}

export interface NewsProvider {
  readonly name: string;
  companyNews(i: ProviderInstrument, from: string, to: string): Promise<RawArticle[]>;
  marketNews(): Promise<RawArticle[]>;
}

export interface FundamentalsProvider {
  readonly name: string;
  supports(i: ProviderInstrument): boolean;
  metrics(i: ProviderInstrument): Promise<Metrics | null>;
}

export type EarningsEvent = { symbol: string; date: string; hour: string | null; epsEstimate: number | null; revenueEstimate: number | null; provider: string };
export interface CalendarProvider {
  readonly name: string;
  earnings(from: string, to: string): Promise<EarningsEvent[]>;
}

export type Observation = { date: string; value: number };
export interface MacroProvider {
  readonly name: string;
  series(ref: string, start: string): Promise<Observation[]>;
}

export type FxSnapshot = { date: string; rates: Record<string, number>; provider: string };
export interface FxProvider {
  readonly name: string;
  latest(currencies: string[]): Promise<FxSnapshot>;
}

export type IndexQuoteProvider = {
  readonly name: string;
  indexDaily(code: string, providerSymbol: string, fromDate: string): Promise<{ bars: DailyBar[]; asOf: Date } | null>;
};

/** Erwartete Abdeckung, dokumentiert in README und in der Einstellungsseite angezeigt. */
export type ProviderInfo = {
  name: string;
  label: string;
  role: string;
  configured: boolean;
  envVar: string | null;
  dataType: string;
  coverage: string;
  limits: string;
  docsUrl: string;
};
