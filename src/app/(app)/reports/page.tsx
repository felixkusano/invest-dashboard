import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/server/session";
import * as s from "@/db/schema";
import { Badge, Empty, PageHeader, Panel } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { DailyReport } from "@/ai/schemas";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const { db, userId } = await requireUser();
  const reports = await db.select().from(s.dailyReports).where(eq(s.dailyReports.userId, userId)).orderBy(desc(s.dailyReports.reportDate), desc(s.dailyReports.version)).limit(120);
  const runs = await db.select().from(s.pipelineRuns).orderBy(desc(s.pipelineRuns.startedAt)).limit(15);
  return (
    <div className="space-y-6">
      <PageHeader title="Historische Reports" lead="Reports werden nie überschrieben. Mehrere Läufe am selben Tag erzeugen neue Versionen." />
      <Panel title={`${reports.length} Reports`}>
        {reports.length ? (
          <ul className="divide-y divide-line">
            {reports.map((r) => {
              const rep = (r.content as { report?: DailyReport }).report;
              return (
                <li key={r.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2"><Link href={`/reports/${r.id}`} className="font-medium">{fmtDate(r.reportDate)} | Version {r.version}</Link>
                    <Badge tone={r.status === "complete" ? "sky" : "warn"}>{r.status === "complete" ? "vollständig" : "teilweise"}</Badge>
                    <Badge>{r.generator === "rules-v1" ? "regelbasiert" : r.generator}</Badge>
                    {(r.content as { demo?: boolean }).demo && <Badge tone="demo">Demo</Badge>}
                    <span className="label">{fmtDateTime(r.createdAt)} | {r.sources.length} Quellen</span></div>
                  {rep?.executiveSummary[0] && <p className="mt-0.5 max-w-[95ch] text-[13px] text-ink-2">{rep.executiveSummary[0].text}</p>}
                </li>
              );
            })}
          </ul>
        ) : <Empty title="Noch keine Reports" />}
      </Panel>
      <Panel title="Pipeline-Läufe">
        <div className="overflow-x-auto"><table className="data-table">
          <thead><tr><th>Start</th><th>Auslöser</th><th>Status</th><th>Schritte</th></tr></thead>
          <tbody>{runs.map((r) => (
            <tr key={r.id}><td className="num">{fmtDateTime(r.startedAt)}</td><td>{({ cron: "Zeitplan", manual: "manuell", cli: "Kommandozeile" } as Record<string, string>)[r.trigger]}</td>
              <td><Badge tone={r.status === "success" ? "pos" : r.status === "partial" ? "warn" : r.status === "failed" ? "neg" : "neutral"}>{({ success: "erfolgreich", partial: "teilweise", failed: "fehlgeschlagen", running: "läuft", skipped: "übersprungen" } as Record<string, string>)[r.status]}</Badge></td>
              <td className="text-[13px]">{r.steps.map((st) => <div key={st.step}><span className={st.status === "failed" ? "text-neg" : st.status === "skipped" ? "text-muted" : ""}>{st.step}</span>: {st.message}</div>)}</td></tr>
          ))}</tbody></table></div>
      </Panel>
    </div>
  );
}
