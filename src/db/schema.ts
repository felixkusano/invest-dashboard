/**
 * Relationales Schema. Gilt identisch für Supabase/Postgres (Produktion) und PGlite (lokal, Tests).
 * Grundsätze: stabile IDs, Unique Constraints gegen Doppelimporte, Herkunft (provider, retrieved_at)
 * und Qualitätsflags an jeder Marktdatenzeile, Reports und Thesen append-only.
 */
import {
  pgTable, serial, integer, text, boolean, timestamp, date, jsonb, numeric,
  uniqueIndex, index, primaryKey,
} from "drizzle-orm/pg-core";

const num = (name: string) => numeric(name, { mode: "number" });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  language: text("language").notNull().default("de"),
  currency: text("currency").notNull().default("EUR"),
  monthlyBudgetEur: num("monthly_budget_eur").notNull().default(500),
  coreSharePct: num("core_share_pct").notNull().default(80),
  coreInstrumentId: integer("core_instrument_id"),
  minOrderEur: num("min_order_eur").notNull().default(50),
  riskProfile: text("risk_profile").notNull().default("wachstumsorientiert"),
  horizon: text("horizon").notNull().default("langfristig plus taktische Chancen"),
  preferredSectors: jsonb("preferred_sectors").$type<string[]>().notNull().default([]),
  excludedSectors: jsonb("excluded_sectors").$type<string[]>().notNull().default([]),
  availableCashEur: num("available_cash_eur"),
  emergencyReserveEur: num("emergency_reserve_eur"),
  savingsPlans: jsonb("savings_plans").$type<{ instrumentId: number; amountEur: number; dayOfMonth: number }[]>().notNull().default([]),
  limits: jsonb("limits").$type<RiskLimits>().notNull(),
  holdBackPreference: text("hold_back_preference").notNull().default("core_etf"), // core_etf | cash
  scoreThreshold: integer("score_threshold").notNull().default(65),
  notification: jsonb("notification").$type<NotificationPrefs>().notNull(),
  schedule: jsonb("schedule").$type<{ refresh: string; briefing: string; available: string }>().notNull(),
  demoMode: boolean("demo_mode").notNull().default(false),
  dataCompleteness: text("data_completeness").notNull().default("partial"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export type RiskLimits = {
  maxSinglePositionPct: number;
  maxThemePct: number;
  maxTop3Pct: number;
  maxUsdPct: number;
  smallCapTargetPct: number;
};
export type NotificationPrefs = {
  enabled: boolean;
  email: string | null;
  webhookUrl: string | null;
  minNewsRelevance: number;
  minRiskSeverity: number;
  minCandidateScore: number;
  notifyFailedUpdates: boolean;
};

export const instruments = pgTable("instruments", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(), // ISIN wenn bekannt, sonst SYMBOL:EXCHANGE
  symbol: text("symbol").notNull(),
  exchange: text("exchange").notNull(),
  isin: text("isin"),
  isinVerified: boolean("isin_verified").notNull().default(false),
  name: text("name").notNull(),
  assetClass: text("asset_class").notNull(), // equity | etf | crypto
  currency: text("currency").notNull(),
  sector: text("sector"),
  country: text("country"),
  region: text("region"),
  themes: jsonb("themes").$type<string[]>().notNull().default([]),
  providerSymbols: jsonb("provider_symbols").$type<Record<string, string>>().notNull().default({}),
  aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
  notes: text("notes"),
}, (t) => [uniqueIndex("instruments_key_uq").on(t.key)]);

export const holdings = pgTable("holdings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  instrumentId: integer("instrument_id").notNull().references(() => instruments.id),
  quantity: num("quantity"),
  costBasisEur: num("cost_basis_eur"),
  costBasisSource: text("cost_basis_source"), // user | transactions | prior_statement
  importedValueEur: num("imported_value_eur"),
  importedPerfPct: num("imported_perf_pct"),
  importedAt: ts("imported_at"),
  importedSource: text("imported_source"),
  dataQuality: text("data_quality").notNull().default("unverified"), // unverified | partial | verified
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("holdings_user_instr_uq").on(t.userId, t.instrumentId)]);

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  instrumentId: integer("instrument_id").notNull().references(() => instruments.id),
  tradeDate: date("trade_date").notNull(),
  side: text("side").notNull(), // buy | sell
  quantity: num("quantity").notNull(),
  price: num("price").notNull(),
  currency: text("currency").notNull(),
  feesEur: num("fees_eur").notNull().default(0),
  totalEur: num("total_eur").notNull(),
  source: text("source").notNull(),
  importHash: text("import_hash").notNull(),
}, (t) => [uniqueIndex("transactions_hash_uq").on(t.userId, t.importHash)]);

export const prices = pgTable("prices", {
  id: serial("id").primaryKey(),
  instrumentId: integer("instrument_id").notNull().references(() => instruments.id),
  provider: text("provider").notNull(),
  priceDate: date("price_date").notNull(),
  close: num("close").notNull(),
  prevClose: num("prev_close"),
  open: num("open"),
  high: num("high"),
  low: num("low"),
  volume: num("volume"),
  currency: text("currency").notNull(),
  asOf: ts("as_of").notNull(),
  retrievedAt: ts("retrieved_at").notNull().defaultNow(),
  dataType: text("data_type").notNull(), // realtime | delayed | eod | demo
}, (t) => [
  uniqueIndex("prices_uq").on(t.instrumentId, t.provider, t.priceDate),
  index("prices_instr_date_idx").on(t.instrumentId, t.priceDate),
]);

export const fxRates = pgTable("fx_rates", {
  id: serial("id").primaryKey(),
  base: text("base").notNull(),
  quote: text("quote").notNull(),
  rateDate: date("rate_date").notNull(),
  rate: num("rate").notNull(),
  provider: text("provider").notNull(),
  retrievedAt: ts("retrieved_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("fx_uq").on(t.base, t.quote, t.rateDate, t.provider)]);

export const marketIndices = pgTable("market_quotes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(), // SPX, NDX, DAX, SX5E, EURUSD, BRENT, ...
  provider: text("provider").notNull(),
  quoteDate: date("quote_date").notNull(),
  value: num("value").notNull(),
  prevValue: num("prev_value"),
  unit: text("unit"),
  dataType: text("data_type").notNull(),
  asOf: ts("as_of").notNull(),
  retrievedAt: ts("retrieved_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("market_quotes_uq").on(t.code, t.provider, t.quoteDate)]);

export const fundamentals = pgTable("fundamentals", {
  id: serial("id").primaryKey(),
  instrumentId: integer("instrument_id").notNull().references(() => instruments.id),
  provider: text("provider").notNull(),
  asOf: date("as_of").notNull(),
  metrics: jsonb("metrics").$type<Record<string, number | null>>().notNull(),
  retrievedAt: ts("retrieved_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("fundamentals_uq").on(t.instrumentId, t.provider, t.asOf)]);

export const newsArticles = pgTable("news_articles", {
  id: serial("id").primaryKey(),
  urlHash: text("url_hash").notNull(),
  url: text("url").notNull(),
  headline: text("headline").notNull(),
  publisher: text("publisher").notNull(),
  publishedAt: ts("published_at").notNull(),
  retrievedAt: ts("retrieved_at").notNull().defaultNow(),
  provider: text("provider").notNull(),
  summary: text("summary"),
  category: text("category").notNull(), // company | sector | macro | central_bank | earnings | regulatory | geopolitical | commentary
  rawTickers: jsonb("raw_tickers").$type<string[]>().notNull().default([]),
  duplicateOf: integer("duplicate_of"),
  isDemo: boolean("is_demo").notNull().default(false),
}, (t) => [uniqueIndex("news_url_uq").on(t.urlHash), index("news_published_idx").on(t.publishedAt)]);

export const newsMappings = pgTable("news_mappings", {
  newsId: integer("news_id").notNull().references(() => newsArticles.id, { onDelete: "cascade" }),
  instrumentId: integer("instrument_id").notNull().references(() => instruments.id),
  matchType: text("match_type").notNull(), // provider_ticker | alias | sector
}, (t) => [primaryKey({ columns: [t.newsId, t.instrumentId] })]);

export const newsAssessments = pgTable("news_assessments", {
  id: serial("id").primaryKey(),
  newsId: integer("news_id").notNull().references(() => newsArticles.id, { onDelete: "cascade" }),
  generatedBy: text("generated_by").notNull(), // "rules-v1" oder Modell-ID
  relevance: integer("relevance").notNull(),
  impact: text("impact").notNull(), // positive | negative | mixed | unclear
  fundamentalImpact: text("fundamental_impact"),
  marketImpact: text("market_impact"),
  horizon: text("horizon"),
  thesisEffect: text("thesis_effect"), // temporary | potentially_thesis_changing | unclear
  evidenceQuality: text("evidence_quality"), // high | medium | low
  whyItMatters: text("why_it_matters"),
  monitorNext: text("monitor_next"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("news_assess_uq").on(t.newsId, t.generatedBy)]);

export const macroSeries = pgTable("macro_series", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  providerRef: text("provider_ref").notNull(),
  unit: text("unit").notNull(),
  frequency: text("frequency").notNull(),
  category: text("category").notNull(),
}, (t) => [uniqueIndex("macro_series_uq").on(t.code)]);

export const macroObservations = pgTable("macro_observations", {
  id: serial("id").primaryKey(),
  seriesId: integer("series_id").notNull().references(() => macroSeries.id, { onDelete: "cascade" }),
  obsDate: date("obs_date").notNull(),
  value: num("value").notNull(),
  retrievedAt: ts("retrieved_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("macro_obs_uq").on(t.seriesId, t.obsDate)]);

export const calendarEvents = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  eventKey: text("event_key").notNull(),
  eventType: text("event_type").notNull(), // earnings | central_bank | inflation | employment | indicator | corporate | regulatory | dividend
  title: text("title").notNull(),
  startsAt: ts("starts_at").notNull(),
  allDay: boolean("all_day").notNull().default(false),
  instrumentId: integer("instrument_id").references(() => instruments.id),
  region: text("region"),
  importance: integer("importance").notNull().default(2), // 1 niedrig … 3 hoch
  consensus: text("consensus"),
  status: text("status").notNull(), // confirmed | estimated | unverified
  source: text("source").notNull(),
  sourceUrl: text("source_url"),
  retrievedAt: ts("retrieved_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("calendar_key_uq").on(t.eventKey), index("calendar_starts_idx").on(t.startsAt)]);

export const candidates = pgTable("candidates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  instrumentId: integer("instrument_id").notNull().references(() => instruments.id),
  status: text("status").notNull().default("universe"), // universe | watchlist | dismissed
  source: text("source").notNull().default("default_universe"), // default_universe | manual
  note: text("note"),
  addedAt: ts("added_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("candidates_uq").on(t.userId, t.instrumentId)]);

export const investmentScores = pgTable("investment_scores", {
  id: serial("id").primaryKey(),
  instrumentId: integer("instrument_id").notNull().references(() => instruments.id),
  scoredAt: ts("scored_at").notNull().defaultNow(),
  scoreDate: date("score_date").notNull(),
  total: num("total"),
  quality: num("quality"),
  growth: num("growth"),
  valuation: num("valuation"),
  catalysts: num("catalysts"),
  risk: num("risk"),
  confidence: text("confidence").notNull(), // high | medium | low | insufficient
  explanation: jsonb("explanation").$type<Record<string, string>>().notNull(),
  inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull(),
}, (t) => [uniqueIndex("scores_uq").on(t.instrumentId, t.scoreDate)]);

export const allocationRecommendations = pgTable("allocation_recommendations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: ts("created_at").notNull().defaultNow(),
  month: text("month").notNull(),
  budgetEur: num("budget_eur").notNull(),
  result: jsonb("result").$type<Record<string, unknown>>().notNull(),
  reportId: integer("report_id"),
});

export const dailyReports = pgTable("daily_reports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reportDate: date("report_date").notNull(),
  kind: text("kind").notNull().default("daily"),
  version: integer("version").notNull().default(1),
  status: text("status").notNull(), // complete | partial
  createdAt: ts("created_at").notNull().defaultNow(),
  generator: text("generator").notNull(), // Modell-ID oder "rules-v1"
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  sources: jsonb("sources").$type<{ title: string; url: string; publisher?: string }[]>().notNull().default([]),
  inputTimestamps: jsonb("input_timestamps").$type<Record<string, string | null>>().notNull().default({}),
  runId: integer("run_id"),
}, (t) => [uniqueIndex("reports_uq").on(t.userId, t.reportDate, t.kind, t.version)]);

export const theses = pgTable("theses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  instrumentId: integer("instrument_id").notNull().references(() => instruments.id),
  createdAt: ts("created_at").notNull().defaultNow(),
  summary: text("summary").notNull(),
  evidence: text("evidence"),
  risks: text("risks"),
  catalysts: text("catalysts"),
  invalidation: text("invalidation"),
  status: text("status").notNull().default("active"), // active | review | invalidated | closed
  lastReviewAt: ts("last_review_at"),
});

export const thesisReviews = pgTable("thesis_reviews", {
  id: serial("id").primaryKey(),
  thesisId: integer("thesis_id").notNull().references(() => theses.id, { onDelete: "cascade" }),
  createdAt: ts("created_at").notNull().defaultNow(),
  status: text("status").notNull(),
  note: text("note").notNull(),
  reportId: integer("report_id"),
  author: text("author").notNull(), // user | Modell-ID | rules-v1
});

export const pipelineRuns = pgTable("pipeline_runs", {
  id: serial("id").primaryKey(),
  trigger: text("trigger").notNull(), // cron | manual | cli
  startedAt: ts("started_at").notNull().defaultNow(),
  finishedAt: ts("finished_at"),
  status: text("status").notNull(), // running | success | partial | failed | skipped
  steps: jsonb("steps").$type<StepResult[]>().notNull().default([]),
});
export type StepResult = { step: string; status: "ok" | "skipped" | "failed"; message: string; durationMs: number; items?: number };

export const providerStatus = pgTable("provider_status", {
  provider: text("provider").primaryKey(),
  lastSuccessAt: ts("last_success_at"),
  lastErrorAt: ts("last_error_at"),
  lastError: text("last_error"),
  dataType: text("data_type"),
});

export const ingestionLog = pgTable("ingestion_log", {
  id: serial("id").primaryKey(),
  runId: integer("run_id"),
  provider: text("provider"),
  step: text("step").notNull(),
  level: text("level").notNull(), // info | warn | error
  message: text("message").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("ingestion_log_created_idx").on(t.createdAt)]);

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: ts("created_at").notNull().defaultNow(),
  kind: text("kind").notNull(),
  severity: integer("severity").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  delivery: jsonb("delivery").$type<Record<string, string>>().notNull().default({}),
  readAt: ts("read_at"),
}, (t) => [uniqueIndex("notifications_dedupe_uq").on(t.userId, t.dedupeKey)]);

export const etfConstituents = pgTable("etf_constituents", {
  id: serial("id").primaryKey(),
  etfInstrumentId: integer("etf_instrument_id").notNull().references(() => instruments.id),
  constituentKey: text("constituent_key").notNull(), // ISIN oder Ticker
  constituentName: text("constituent_name").notNull(),
  weightPct: num("weight_pct").notNull(),
  sector: text("sector"),
  country: text("country"),
  asOf: date("as_of").notNull(),
  source: text("source").notNull(),
}, (t) => [uniqueIndex("etf_constituents_uq").on(t.etfInstrumentId, t.constituentKey, t.asOf)]);
