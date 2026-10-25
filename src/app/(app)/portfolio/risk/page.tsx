import Link from "next/link";
import { requireUser } from "@/server/session";
import { computeAnalytics } from "@/server/analytics";
import { Badge, Empty, PageHeader, Panel, Severity } from "@/components/ui";

export const dynamic = "force-dynamic";

const CAT: Record<string, string> = { concentration: "Konzentration", overlap: "Überschneidung", theme: "Gleicher Werttreiber", valuation: "Bewertung", fundamentals: "Fundamentaldaten", leverage: "Verschuldung", dilution: "Verwässerung", event: "Ereignis", currency: "Währung", rates: "Zinsen", data: "Datenlage" };

export default async function RiskPage() {
  const { db, userId } = await requireUser();
  const a = await computeAnalytics(db, userId);
  return (
    <div className="space-y-6">
      <PageHeader title="Risikomonitor" lead="Sortiert nach Schweregrad. Jede Warnung nennt ihre Evidenz und die Art der Handlungsrelevanz. Ein Kursrückgang allein ist kein Verkaufsgrund." right={<Link href="/portfolio" className="btn btn-quiet">Zum Portfolio</Link>} />
      <Panel title={`${a.risks.length} Hinweise`} note={`Limits: Einzelposition ${a.settings.limits.maxSinglePositionPct} % | Cluster ${a.settings.limits.maxThemePct} % | Top 3 ${a.settings.limits.maxTop3Pct} % | USD ${a.settings.limits.maxUsdPct} % (änderbar in den Einstellungen)`}>
        {a.risks.length ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Schwere</th><th>Risiko</th><th>Evidenz</th><th>Einordnung</th><th>Konsequenz</th></tr></thead>
              <tbody>{a.risks.map((r) => (
                <tr key={r.code}>
                  <td><Severity n={r.severity} /></td>
                  <td><div className="font-medium">{r.title}</div><div className="mt-0.5 flex flex-wrap gap-1"><Badge>{CAT[r.category]}</Badge>{r.affected.map((x) => <Badge key={x} tone="sky">{x}</Badge>)}</div></td>
                  <td className="max-w-md text-[13px]">{r.evidence}</td>
                  <td><Badge tone={r.actionType === "Datenlücke" ? "warn" : r.actionType === "Temporäre Volatilität" || r.actionType === "Beobachten" ? "neutral" : "neg"}>{r.actionType}</Badge></td>
                  <td className="max-w-sm text-[13px] text-ink-2">{r.suggestion}</td>
                </tr>))}</tbody>
            </table>
          </div>
        ) : <Empty title="Keine Risikohinweise" />}
      </Panel>
      <p className="label">Bewertungs-, Verschuldungs- und Fundamentalwarnungen erscheinen nur, wenn Fundamentaldaten vorliegen. Fehlen sie, wird kein Risiko unterstellt, sondern die Datenlücke ausgewiesen.</p>
    </div>
  );
}
