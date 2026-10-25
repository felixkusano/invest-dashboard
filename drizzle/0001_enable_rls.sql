-- Supabase: Zugriff über PostgREST (anon/authenticated) sperren. Die App greift serverseitig mit dem DB-Owner zu, der RLS umgeht.
ALTER TABLE "allocation_recommendations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "calendar_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "candidates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "daily_reports" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "etf_constituents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fundamentals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fx_rates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "holdings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ingestion_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "instruments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "investment_scores" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "macro_observations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "macro_series" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "market_quotes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "news_articles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "news_assessments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "news_mappings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pipeline_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "provider_status" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "theses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "thesis_reviews" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
