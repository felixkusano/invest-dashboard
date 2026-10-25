import { describe, expect, it } from "vitest";
import { allocate, type AllocCandidate, type AllocInput } from "@/domain/allocation";

const cand = (o: Partial<AllocCandidate>): AllocCandidate => ({ instrumentId: 100, symbol: "CAND", name: "Kandidat", isHolding: false, total: 80, confidence: "high", themes: [], sector: "Software", currentWeightPct: 0, mainRisk: "r", thesis: "t", ...o });
const input = (o: Partial<AllocInput> = {}): AllocInput => ({
  budgetEur: 500, coreSharePct: 80, minOrderEur: 50, holdBackPreference: "core_etf", scoreThreshold: 65, portfolioValueEur: 8000,
  coreEtf: { instrumentId: 1, symbol: "VWCE", name: "FTSE All-World", weightPct: 5 }, otherGlobalEtfs: [], smallCapEtf: { instrumentId: 2, symbol: "IUSN", name: "Small Cap", weightPct: 10.5 },
  smallCapTargetPct: 10, limits: { maxSinglePositionPct: 15, maxThemePct: 35 }, themeWeights: {}, excludedSectors: [], candidates: [], savingsPlans: [],
  emergencyReserveKnown: false, dataCompleteness: "partial", ...o,
});

describe("Kapitalallokation", () => {
  it("verteilt 400/100 bei qualifiziertem Kandidaten und summiert exakt auf das Budget", () => {
    const r = allocate(input({ candidates: [cand({})] }));
    expect(r.totalEur).toBe(500);
    expect(r.lines.find((l) => l.kind === "core_etf")!.amountEur).toBe(400);
    expect(r.lines.find((l) => l.kind === "opportunity")!.amountEur).toBe(100);
  });
  it("erzwingt keinen Aktienkauf: ohne Kandidat geht alles in den Kern-ETF", () => {
    const r = allocate(input({ candidates: [cand({ total: 50 })] }));
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].kind).toBe("core_etf");
    expect(r.lines[0].amountEur).toBe(500);
    expect(r.excluded[0].reason).toContain("unter Schwelle");
  });
  it("weist bewusst gehaltene Liquidität explizit aus", () => {
    const r = allocate(input({ holdBackPreference: "cash" }));
    expect(r.heldBackEur).toBe(100);
    expect(r.totalEur).toBe(500);
  });
  it("lenkt in Small Caps, wenn die Quote unter Ziel liegt und kein Titel qualifiziert", () => {
    const r = allocate(input({ smallCapEtf: { instrumentId: 2, symbol: "IUSN", name: "Small Cap", weightPct: 4 } }));
    expect(r.lines.find((l) => l.kind === "small_cap")!.amountEur).toBe(100);
  });
  it("sperrt Kandidaten aus überschrittenem Themencluster", () => {
    const r = allocate(input({ themeWeights: { ai_infrastructure: 52 }, candidates: [cand({ themes: ["ai_infrastructure"] })] }));
    expect(r.lines.some((l) => l.kind === "opportunity")).toBe(false);
    expect(r.excluded[0].reason).toContain("KI-Infrastruktur");
  });
  it("lehnt Kandidaten mit geringem Datenvertrauen oder ohne Score ab", () => {
    const r = allocate(input({ candidates: [cand({ confidence: "low" }), cand({ instrumentId: 101, symbol: "N", total: null, confidence: "insufficient" })] }));
    expect(r.lines.some((l) => l.kind === "opportunity")).toBe(false);
    expect(r.excluded).toHaveLength(2);
  });
  it("zieht bestehende Sparpläne vom Budget ab", () => {
    const r = allocate(input({ savingsPlans: [{ instrumentId: 1, symbol: "VWCE", amountEur: 300 }] }));
    expect(r.lines[0].kind).toBe("savings_plan");
    expect(r.totalEur).toBe(500);
    expect(r.lines.find((l) => l.kind === "core_etf")!.amountEur).toBe(200);
  });
  it("schlägt Beträge unter Mindestorder dem Kern zu", () => {
    const r = allocate(input({ budgetEur: 200, candidates: [cand({})] }));
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].amountEur).toBe(200);
  });
  it("Summe stimmt für beliebige Budgets und Quoten", () => {
    for (let b = 0; b <= 2000; b += 37) for (const c of [0, 33, 80, 100]) {
      const r = allocate(input({ budgetEur: b, coreSharePct: c, candidates: [cand({})] }));
      expect(r.totalEur, `${b}/${c}`).toBe(b);
    }
  });
  it("warnt bei parallelen globalen ETFs", () => {
    const r = allocate(input({ otherGlobalEtfs: [{ instrumentId: 3, symbol: "EUNL", name: "MSCI World", weightPct: 7 }] }));
    expect(r.warnings.join()).toContain("EUNL");
  });
});
