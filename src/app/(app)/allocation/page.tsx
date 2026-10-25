import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/server/session";
import { computeAnalytics } from "@/server/analytics";
import * as s from "@/db/schema";
import { Badge, PageHeader, Panel } from "@/components/ui";
import { AllocationStrip } from "@/components/AllocationStrip";
import { fmtDateTime, fmtEur, fmtPct } from "@/lib/format";
import { themeLabel } from "@/domain/allocation";

export const dynamic = "force-dynamic";

export default async function AllocationPage() {
  const { db, userId } = await requireUser();
  const a = await computeAnalytics(db, userId);
  const r = a.allocation;
  const hist = await db.select().from(s.allocationRecommendations).where(eq(s.allocationRecommendations.userId, userId)).orderBy(desc(s.allocationRecommendations.createdAt)).limit(12);
  const st = a.settings;
  const verdictTone = (v: string) => (v === "empfohlen" ? "pos" : v === "möglich" ? "sky" : v === "keine Daten" ? "warn" : "neutral") as "pos" | "sky" | "warn" | "neutral";

  return (
    <div className="space-y-6">
      <PageHeader title="Kapitalallokation" lead={`Verwendung der nächsten ${fmtEur(st.monthlyBudgetEur, { decimals: 0 })}. Ausgangshypothese ${st.coreSharePct} % Kern-ETF, Rest nur bei qualifizierter Chance. Kein Zwangskauf, keine Renditeprognose.`} right={<Link href="/settings" className="btn btn-quiet">Budget und Regeln ändern</Link>} />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Panel title="Empfehlung" note={`Summe ${fmtEur(r.totalEur, { decimals: 0 })}${r.heldBackEur ? `, davon ${fmtEur(r.heldBackEur, { decimals: 0 })} bewusst nicht investiert` : ""}`}>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Priorität</th><th>Investment</th><th className="text-right">Betrag</th><th>Begründung</th><th>Hauptrisiko</th></tr></thead>
              <tbody>
                {r.lines.map((l) => (
                  <tr key={l.priority}>
                    <td className="num">{l.priority}</td>
                    <td className="font-medium">{l.instrumentId ? <Link href={`/research/${l.instrumentId}`}>{l.label}</Link> : l.label}</td>
                    <td className="num text-right font-semibold">{fmtEur(l.amountEur, { decimals: 0 })}</td>
                    <td className="max-w-md text-[13px]">{l.reason}</td>
                    <td className="max-w-xs text-[13px] text-ink-2">{l.mainRisk}</td>
                  </tr>
                ))}
                <tr><td /><td className="font-medium">Summe</td><td className="num text-right font-semibold">{fmtEur(r.totalEur, { decimals: 0 })}</td><td colSpan={2} className="text-[13px] text-muted">{r.totalEur === Math.round(st.monthlyBudgetEur) ? "Entspricht dem Monatsbudget." : "Abweichung zum Budget, bitte prüfen."}</td></tr>
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Aufteilung"><AllocationStrip lines={r.lines} total={r.totalEur} large /></Panel>
      </div>

      <Panel title="Vergleich der Verwendungsoptionen" note="Bewertet gegen Score, Datenvertrauen, Konzentration und Overlap.">
        <ul className="divide-y divide-line">
          {r.options.map((o) => (
            <li key={o.option} className="grid gap-1 py-2.5 sm:grid-cols-[16rem_8rem_1fr] sm:items-baseline">
              <span className="font-medium">{o.label}</span>
              <span><Badge tone={verdictTone(o.verdict)}>{o.verdict}</Badge></span>
              <span className="text-[13px] text-ink-2">{o.rationale}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Hinweise und Annahmen">
          <ul className="list-disc space-y-1.5 pl-5 text-[13px]">
            {r.warnings.map((w, i) => <li key={`w${i}`} className="text-warn">{w}</li>)}
            {r.assumptions.map((w, i) => <li key={`a${i}`}>{w}</li>)}
            <li>Verfügbare Liquidität: {st.availableCashEur != null ? fmtEur(st.availableCashEur) : "unbekannt"} | Notreserve: {st.emergencyReserveEur != null ? fmtEur(st.emergencyReserveEur) : "unbekannt"}</li>
            <li>Themenquoten aktuell: {Object.entries(a.themeWeights).filter(([t]) => t !== "crypto").sort((x, y) => y[1] - x[1]).slice(0, 4).map(([t, w]) => `${themeLabel(t)} ${fmtPct(w, 1, false)}`).join(" | ")}</li>
          </ul>
        </Panel>
        <Panel title="Für Einzeltitel nicht qualifiziert" note="Gründe aus Score-Schwelle, Datenvertrauen und Konzentrationslimits">
          {r.excluded.length ? (
            <ul className="max-h-72 space-y-1 overflow-y-auto text-[13px]">{r.excluded.map((e) => <li key={e.symbol}><span className="font-medium">{e.symbol}</span>: {e.reason}</li>)}</ul>
          ) : <p className="label">Keine Ausschlüsse.</p>}
        </Panel>
      </div>

      <Panel title="Verlauf der Empfehlungen" note="Unverändert gespeichert, je Pipeline-Lauf ein Eintrag.">
        {hist.length ? (
          <table className="data-table"><thead><tr><th>Erstellt</th><th>Monat</th><th className="text-right">Budget</th><th>Aufteilung</th></tr></thead>
            <tbody>{hist.map((h) => <tr key={h.id}><td className="num">{fmtDateTime(h.createdAt)}</td><td>{h.month}</td><td className="num text-right">{fmtEur(h.budgetEur, { decimals: 0 })}</td><td className="text-[13px]">{((h.result as { lines?: { label: string; amountEur: number }[] }).lines ?? []).map((l) => `${l.label} ${fmtEur(l.amountEur, { decimals: 0 })}`).join(" | ")}</td></tr>)}</tbody></table>
        ) : <p className="label">Noch keine gespeicherten Empfehlungen. Die erste entsteht mit der nächsten Aktualisierung.</p>}
      </Panel>
    </div>
  );
}
