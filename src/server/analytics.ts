/** Fasst Portfolio, Risiken, Scores, Overlap und Allokation zu einem Analysebild zusammen (UI und Pipeline). */
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as s from "@/db/schema";
import { loadPortfolio, latestFundamentals, latestScores, loadEvents } from "./data";
import { themeExposure, exposureBy } from "@/domain/portfolio";
import { computeRisks } from "@/domain/risk";
import { allocate, themeLabel, type AllocCandidate } from "@/domain/allocation";
import { lookThrough, structuralOverlapNote, weightOverlapPct, type Constituent } from "@/domain/overlap";
import { berlinDate } from "@/lib/time";

const COMPONENT_LABEL: Record<string, string> = { quality: "Qualität", growth: "Wachstum", valuation: "Bewertung", catalysts: "Katalysatoren", risk: "Risikoprofil" };
const COMPONENT_MAX: Record<string, number> = { quality: 25, growth: 20, valuation: 25, catalysts: 15, risk: 15 };

export function strongestWeakest(sc: Record<string, number | null>) {
  const rel = Object.entries(COMPONENT_MAX).map(([k, max]) => [k, sc[k] == null ? null : sc[k]! / max] as const).filter((x) => x[1] != null) as [string, number][];
  rel.sort((a, b) => b[1] - a[1]);
  return { strongest: rel.slice(0, 2).map((x) => COMPONENT_LABEL[x[0]]), weakest: rel.length ? COMPONENT_LABEL[rel[rel.length - 1][0]] : null };
}

export async function computeAnalytics(db: Db, userId: number, now = new Date()) {
  const p = await loadPortfolio(db, userId);
  const { summary, settings } = p;
  const sec = summary.positions.filter((x) => x.assetClass !== "crypto");
  const themeWeights = themeExposure(sec);

  const holdingIds = p.rows.map((r) => r.i.id);
  const candRows = await db.select({ c: s.candidates, i: s.instruments }).from(s.candidates)
    .innerJoin(s.instruments, eq(s.candidates.instrumentId, s.instruments.id))
    .where(and(eq(s.candidates.userId, userId), ne(s.candidates.status, "dismissed")));
  const allIds = [...new Set([...holdingIds, ...candRows.map((c) => c.i.id)])];
  const funds = await latestFundamentals(db, allIds, p.demo);
  const scores = await latestScores(db, allIds);
  const events = await loadEvents(db, now, new Date(now.getTime() + 7 * 86400e3));

  const fundamentalsBySymbol = Object.fromEntries(p.rows.map((r) => [r.i.symbol, funds.get(r.i.id)?.metrics]));
  const globalEtfs = sec.filter((x) => x.assetClass === "etf" && (x.sector ?? "").includes("Large/Mid"));
  const risks = computeRisks({
    positions: sec, cryptoValueEur: summary.crypto.provisionalValueEur, limits: settings.limits, themeWeights,
    fundamentals: fundamentalsBySymbol,
    upcomingEvents: events.map((e) => ({ title: e.e.title, symbol: e.symbol, daysAhead: Math.max(0, Math.ceil((e.e.startsAt.getTime() - now.getTime()) / 86400e3)), importance: e.e.importance })),
    globalEtfCount: globalEtfs.length,
  });

  // Kandidaten für die Allokation: bestehende Einzeltitel + Scanner-Universum
  const weightOf = (id: number) => sec.find((x) => x.instrumentId === id)?.weightPct ?? 0;
  const theses = await db.select().from(s.theses).where(and(eq(s.theses.userId, userId), eq(s.theses.status, "active"))).orderBy(desc(s.theses.createdAt));
  const mkCand = (i: s_Instrument, isHolding: boolean): AllocCandidate => {
    const sc = scores.get(i.id);
    const sw = sc ? strongestWeakest(sc as unknown as Record<string, number | null>) : null;
    const th = theses.find((t) => t.instrumentId === i.id);
    return {
      instrumentId: i.id, symbol: i.symbol, name: i.name, isHolding, total: sc?.total ?? null,
      confidence: (sc?.confidence as AllocCandidate["confidence"]) ?? "insufficient", themes: i.themes, sector: i.sector,
      currentWeightPct: weightOf(i.id),
      thesis: th?.summary ?? (sw ? `Stärken: ${sw.strongest.join(", ")}.` : ""),
      mainRisk: sw?.weakest ? `Schwächste Komponente: ${sw.weakest}${i.themes.length ? ` | Cluster: ${i.themes.map(themeLabel).join(", ")}` : ""}` : "Datenlage unzureichend",
    };
  };
  type s_Instrument = typeof s.instruments.$inferSelect;
  const allocCandidates: AllocCandidate[] = [
    ...p.rows.filter((r) => r.i.assetClass === "equity").map((r) => mkCand(r.i, true)),
    ...candRows.filter((c) => !holdingIds.includes(c.i.id)).map((c) => mkCand(c.i, false)),
  ];

  const coreRow = sec.find((x) => x.instrumentId === settings.coreInstrumentId);
  const coreInstr = settings.coreInstrumentId ? (await db.select().from(s.instruments).where(eq(s.instruments.id, settings.coreInstrumentId)))[0] : undefined;
  const smallCap = sec.find((x) => x.assetClass === "etf" && (x.sector ?? "").includes("Small"));
  const instrNames = new Map((await db.select({ id: s.instruments.id, symbol: s.instruments.symbol }).from(s.instruments)).map((r) => [r.id, r.symbol]));

  const allocation = allocate({
    budgetEur: settings.monthlyBudgetEur, coreSharePct: settings.coreSharePct, minOrderEur: settings.minOrderEur,
    holdBackPreference: settings.holdBackPreference as "core_etf" | "cash", scoreThreshold: settings.scoreThreshold,
    portfolioValueEur: summary.securities.provisionalValueEur,
    coreEtf: coreInstr ? { instrumentId: coreInstr.id, symbol: coreInstr.symbol, name: coreInstr.name, weightPct: coreRow?.weightPct ?? 0 } : null,
    otherGlobalEtfs: globalEtfs.filter((e) => e.instrumentId !== settings.coreInstrumentId).map((e) => ({ instrumentId: e.instrumentId, symbol: e.symbol, name: e.name, weightPct: e.weightPct ?? 0 })),
    smallCapEtf: smallCap ? { instrumentId: smallCap.instrumentId, symbol: smallCap.symbol, name: smallCap.name, weightPct: smallCap.weightPct ?? 0 } : null,
    smallCapTargetPct: settings.limits.smallCapTargetPct ?? 10,
    limits: settings.limits, themeWeights, excludedSectors: settings.excludedSectors,
    candidates: allocCandidates,
    savingsPlans: settings.savingsPlans.map((sp) => ({ ...sp, symbol: instrNames.get(sp.instrumentId) ?? `#${sp.instrumentId}` })),
    emergencyReserveKnown: settings.emergencyReserveEur != null,
    dataCompleteness: summary.completeness,
  });

  // ETF-Overlap und Durchschau
  const etfHeld = sec.filter((x) => x.assetClass === "etf");
  const cons = etfHeld.length ? await db.select().from(s.etfConstituents).where(inArray(s.etfConstituents.etfInstrumentId, etfHeld.map((e) => e.instrumentId))) : [];
  const consBy = new Map<number, Constituent[]>();
  for (const c of cons) {
    const arr = consBy.get(c.etfInstrumentId) ?? [];
    arr.push({ key: c.constituentKey, name: c.constituentName, weightPct: c.weightPct, sector: c.sector, country: c.country });
    consBy.set(c.etfInstrumentId, arr);
  }
  const pairs: { a: string; b: string; overlapPct: number | null; note: string | null }[] = [];
  for (let i = 0; i < etfHeld.length; i++) for (let j = i + 1; j < etfHeld.length; j++) {
    const A = etfHeld[i], B = etfHeld[j];
    const ca = consBy.get(A.instrumentId), cb = consBy.get(B.instrumentId);
    pairs.push({ a: A.symbol, b: B.symbol, overlapPct: ca && cb ? weightOverlapPct(ca, cb) : null, note: structuralOverlapNote(A.name, B.name) });
  }
  const isinOf = new Map(p.rows.map((r) => [r.i.id, r.i.isin ?? r.i.symbol]));
  const lt = lookThrough({
    directPositions: sec.filter((x) => x.assetClass === "equity" && x.provisionalValueEur != null).map((x) => ({ key: isinOf.get(x.instrumentId)!, name: x.name, valueEur: x.provisionalValueEur! })),
    etfs: etfHeld.map((e) => ({ name: e.name, valueEur: e.provisionalValueEur ?? 0, constituents: consBy.get(e.instrumentId) ?? null })),
  }, summary.securities.provisionalValueEur);

  return {
    ...p, themeWeights, risks, allocation, scores, funds, events, candRows, allocCandidates,
    exposures: {
      assetClass: exposureBy(summary.positions, (x) => ({ equity: "Einzelaktien", etf: "ETFs", crypto: "Krypto" })[x.assetClass]),
      sector: exposureBy(sec, (x) => x.sector),
      region: exposureBy(sec, (x) => x.region),
      currency: exposureBy(sec, (x) => x.currency),
    },
    overlap: { pairs, lookThrough: lt, hasConstituents: cons.length > 0 },
    today: berlinDate(now),
  };
}
export type Analytics = Awaited<ReturnType<typeof computeAnalytics>>;
