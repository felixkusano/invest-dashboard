import { z } from "zod";

/** Aussagetyp: Pflichtfeld, damit Fakten, Markterwartungen, Einschätzungen und Prognosen getrennt bleiben. */
export const Kind = z.enum(["fact", "expectation", "judgment", "forecast"]);
export const KIND_LABEL: Record<z.infer<typeof Kind>, string> = { fact: "Fakt", expectation: "Markterwartung", judgment: "Einschätzung", forecast: "Prognose (unsicher)" };

const Statement = z.object({
  text: z.string().min(1).max(600),
  kind: Kind,
  sourceNewsIds: z.array(z.number().int()).max(6).default([]),
});

export const NewsAssessment = z.object({
  newsId: z.number().int(),
  summary: z.string().max(400),
  relevance: z.number().int().min(0).max(100),
  impact: z.enum(["positive", "negative", "mixed", "unclear"]),
  fundamentalImpact: z.string().max(300),
  marketImpact: z.string().max(300),
  horizon: z.enum(["Tage", "Wochen", "Monate", "Jahre", "unklar"]),
  thesisEffect: z.enum(["temporary", "potentially_thesis_changing", "unclear"]),
  evidenceQuality: z.enum(["high", "medium", "low"]),
  whyItMatters: z.string().max(300),
  monitorNext: z.string().max(300),
});

export const DailyReportSchema = z.object({
  executiveSummary: z.array(Statement).min(1).max(6),
  marketSummary: z.array(Statement).max(6),
  portfolioImplications: z.array(Statement).max(6),
  newsAssessments: z.array(NewsAssessment).max(40),
  macro: z.object({
    whatChanged: z.string().max(700),
    why: z.string().max(700),
    equityImplications: z.string().max(700),
    mostExposedHoldings: z.array(z.string()).max(8),
    upcomingCatalysts: z.string().max(700),
  }),
  topRisks: z.array(z.object({ title: z.string().max(120), explanation: z.string().max(500), affected: z.array(z.string()).max(8), kind: Kind })).max(3),
  opportunities: z.array(z.object({ symbol: z.string(), comment: z.string().max(500), kind: Kind })).max(5),
  thesisChanges: z.array(z.object({ symbol: z.string(), change: z.string().max(400), status: z.enum(["active", "review", "invalidated"]) })).max(12),
  uncertainties: z.array(z.string().max(300)).max(8),
});
export type DailyReport = z.infer<typeof DailyReportSchema>;

export const reportJsonSchema = () => z.toJSONSchema(DailyReportSchema, { target: "draft-7" });
