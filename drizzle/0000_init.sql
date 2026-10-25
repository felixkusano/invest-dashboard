CREATE TABLE "allocation_recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"month" text NOT NULL,
	"budget_eur" numeric NOT NULL,
	"result" jsonb NOT NULL,
	"report_id" integer
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"instrument_id" integer,
	"region" text,
	"importance" integer DEFAULT 2 NOT NULL,
	"consensus" text,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"source_url" text,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"status" text DEFAULT 'universe' NOT NULL,
	"source" text DEFAULT 'default_universe' NOT NULL,
	"note" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"report_date" date NOT NULL,
	"kind" text DEFAULT 'daily' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generator" text NOT NULL,
	"content" jsonb NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_timestamps" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"run_id" integer
);
--> statement-breakpoint
CREATE TABLE "etf_constituents" (
	"id" serial PRIMARY KEY NOT NULL,
	"etf_instrument_id" integer NOT NULL,
	"constituent_key" text NOT NULL,
	"constituent_name" text NOT NULL,
	"weight_pct" numeric NOT NULL,
	"sector" text,
	"country" text,
	"as_of" date NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fundamentals" (
	"id" serial PRIMARY KEY NOT NULL,
	"instrument_id" integer NOT NULL,
	"provider" text NOT NULL,
	"as_of" date NOT NULL,
	"metrics" jsonb NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"base" text NOT NULL,
	"quote" text NOT NULL,
	"rate_date" date NOT NULL,
	"rate" numeric NOT NULL,
	"provider" text NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"quantity" numeric,
	"cost_basis_eur" numeric,
	"cost_basis_source" text,
	"imported_value_eur" numeric,
	"imported_perf_pct" numeric,
	"imported_at" timestamp with time zone,
	"imported_source" text,
	"data_quality" text DEFAULT 'unverified' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer,
	"provider" text,
	"step" text NOT NULL,
	"level" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"symbol" text NOT NULL,
	"exchange" text NOT NULL,
	"isin" text,
	"isin_verified" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"asset_class" text NOT NULL,
	"currency" text NOT NULL,
	"sector" text,
	"country" text,
	"region" text,
	"themes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider_symbols" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "investment_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"instrument_id" integer NOT NULL,
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL,
	"score_date" date NOT NULL,
	"total" numeric,
	"quality" numeric,
	"growth" numeric,
	"valuation" numeric,
	"catalysts" numeric,
	"risk" numeric,
	"confidence" text NOT NULL,
	"explanation" jsonb NOT NULL,
	"inputs" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "macro_observations" (
	"id" serial PRIMARY KEY NOT NULL,
	"series_id" integer NOT NULL,
	"obs_date" date NOT NULL,
	"value" numeric NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "macro_series" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text NOT NULL,
	"unit" text NOT NULL,
	"frequency" text NOT NULL,
	"category" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"provider" text NOT NULL,
	"quote_date" date NOT NULL,
	"value" numeric NOT NULL,
	"prev_value" numeric,
	"unit" text,
	"data_type" text NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"url_hash" text NOT NULL,
	"url" text NOT NULL,
	"headline" text NOT NULL,
	"publisher" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider" text NOT NULL,
	"summary" text,
	"category" text NOT NULL,
	"raw_tickers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duplicate_of" integer,
	"is_demo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"news_id" integer NOT NULL,
	"generated_by" text NOT NULL,
	"relevance" integer NOT NULL,
	"impact" text NOT NULL,
	"fundamental_impact" text,
	"market_impact" text,
	"horizon" text,
	"thesis_effect" text,
	"evidence_quality" text,
	"why_it_matters" text,
	"monitor_next" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_mappings" (
	"news_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"match_type" text NOT NULL,
	CONSTRAINT "news_mappings_news_id_instrument_id_pk" PRIMARY KEY("news_id","instrument_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"severity" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"delivery" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"instrument_id" integer NOT NULL,
	"provider" text NOT NULL,
	"price_date" date NOT NULL,
	"close" numeric NOT NULL,
	"prev_close" numeric,
	"open" numeric,
	"high" numeric,
	"low" numeric,
	"volume" numeric,
	"currency" text NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data_type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_status" (
	"provider" text PRIMARY KEY NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error" text,
	"data_type" text
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"language" text DEFAULT 'de' NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"monthly_budget_eur" numeric DEFAULT 500 NOT NULL,
	"core_share_pct" numeric DEFAULT 80 NOT NULL,
	"core_instrument_id" integer,
	"min_order_eur" numeric DEFAULT 50 NOT NULL,
	"risk_profile" text DEFAULT 'wachstumsorientiert' NOT NULL,
	"horizon" text DEFAULT 'langfristig plus taktische Chancen' NOT NULL,
	"preferred_sectors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"excluded_sectors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"available_cash_eur" numeric,
	"emergency_reserve_eur" numeric,
	"savings_plans" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"limits" jsonb NOT NULL,
	"hold_back_preference" text DEFAULT 'core_etf' NOT NULL,
	"score_threshold" integer DEFAULT 65 NOT NULL,
	"notification" jsonb NOT NULL,
	"schedule" jsonb NOT NULL,
	"demo_mode" boolean DEFAULT false NOT NULL,
	"data_completeness" text DEFAULT 'partial' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "theses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"summary" text NOT NULL,
	"evidence" text,
	"risks" text,
	"catalysts" text,
	"invalidation" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_review_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "thesis_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"thesis_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"note" text NOT NULL,
	"report_id" integer,
	"author" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"trade_date" date NOT NULL,
	"side" text NOT NULL,
	"quantity" numeric NOT NULL,
	"price" numeric NOT NULL,
	"currency" text NOT NULL,
	"fees_eur" numeric DEFAULT 0 NOT NULL,
	"total_eur" numeric NOT NULL,
	"source" text NOT NULL,
	"import_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "allocation_recommendations" ADD CONSTRAINT "allocation_recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etf_constituents" ADD CONSTRAINT "etf_constituents_etf_instrument_id_instruments_id_fk" FOREIGN KEY ("etf_instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundamentals" ADD CONSTRAINT "fundamentals_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_scores" ADD CONSTRAINT "investment_scores_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "macro_observations" ADD CONSTRAINT "macro_observations_series_id_macro_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."macro_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_assessments" ADD CONSTRAINT "news_assessments_news_id_news_articles_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_mappings" ADD CONSTRAINT "news_mappings_news_id_news_articles_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_mappings" ADD CONSTRAINT "news_mappings_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theses" ADD CONSTRAINT "theses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theses" ADD CONSTRAINT "theses_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thesis_reviews" ADD CONSTRAINT "thesis_reviews_thesis_id_theses_id_fk" FOREIGN KEY ("thesis_id") REFERENCES "public"."theses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_key_uq" ON "calendar_events" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "calendar_starts_idx" ON "calendar_events" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_uq" ON "candidates" USING btree ("user_id","instrument_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_uq" ON "daily_reports" USING btree ("user_id","report_date","kind","version");--> statement-breakpoint
CREATE UNIQUE INDEX "etf_constituents_uq" ON "etf_constituents" USING btree ("etf_instrument_id","constituent_key","as_of");--> statement-breakpoint
CREATE UNIQUE INDEX "fundamentals_uq" ON "fundamentals" USING btree ("instrument_id","provider","as_of");--> statement-breakpoint
CREATE UNIQUE INDEX "fx_uq" ON "fx_rates" USING btree ("base","quote","rate_date","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "holdings_user_instr_uq" ON "holdings" USING btree ("user_id","instrument_id");--> statement-breakpoint
CREATE INDEX "ingestion_log_created_idx" ON "ingestion_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "instruments_key_uq" ON "instruments" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "scores_uq" ON "investment_scores" USING btree ("instrument_id","score_date");--> statement-breakpoint
CREATE UNIQUE INDEX "macro_obs_uq" ON "macro_observations" USING btree ("series_id","obs_date");--> statement-breakpoint
CREATE UNIQUE INDEX "macro_series_uq" ON "macro_series" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "market_quotes_uq" ON "market_quotes" USING btree ("code","provider","quote_date");--> statement-breakpoint
CREATE UNIQUE INDEX "news_url_uq" ON "news_articles" USING btree ("url_hash");--> statement-breakpoint
CREATE INDEX "news_published_idx" ON "news_articles" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "news_assess_uq" ON "news_assessments" USING btree ("news_id","generated_by");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "prices_uq" ON "prices" USING btree ("instrument_id","provider","price_date");--> statement-breakpoint
CREATE INDEX "prices_instr_date_idx" ON "prices" USING btree ("instrument_id","price_date");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_hash_uq" ON "transactions" USING btree ("user_id","import_hash");