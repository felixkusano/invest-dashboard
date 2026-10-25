import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { requireUser } from "@/server/session";
import * as s from "@/db/schema";
import { previousReport } from "@/server/data";
import { Badge, ImpactBadge, KindBadge, PageHeader, Panel, Severity, SourceLink } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtEur } from "@/lib/format";
import type { DailyReport } from "@/ai/schemas";
import type { AllocResult } from "@/domain/allocation";
import type { RiskFlag } from "@/domain/risk";

export const dynamic = "force-dynamic";
type Content = { report: DailyReport; warnings: string[]; failedSteps: string[]; marketStatus: string; demo: boolean; allocation: AllocResult; risks: RiskFlag[] };

export default async function ReportDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, userId } = await requireUser();
  const [r] = await db.select().from(s.dailyReports).where(and(eq(s.dailyReports.id, Number(id)), eq(s.dailyReports.userId, userId)));
  if (!r) notFound();
  const c = r.content as unknown as Content;
  const prev = await previousReport(db, userId, r.id);
  const pc = prev?.content as unknown as Content | undefined;
  const newsIds = c.report.newsAssessments.map((n) => n.newsId);
  const newsRows = newsIds.length ? await db.select().from(s.newsArticles).where(inArray(s.newsArticles.id, newsIds.concat(c.report.executiveSummary.flatMap((x) => x.sourceNewsIds)))) : [];
  const newsById = new Map(newsRows.map((n) => [n.id, n]));
  const reviewTheses = await db.select({ t: s.theses, sym: s.instruments.symbol }).from(s.theses).innerJoin(s.instruments, eq(s.theses.instrumentId, s.instruments.id)).where(and(eq(s.theses.userId, userId), eq(s.theses.status, "review")));

  const riskNow = new Set((c.risks ?? []).map((x) => x.title));
  const riskPrev = new Set((pc?.risks ?? []).map((x) => x.title));
  const allocStr = (a?: AllocResult) => (a?.lines ?? []).map((l) => `${l.label} ${fmtEur(l.amountEur, { decimals: 0 })}`).join(" | ");
  const prevNews = new Set((pc?.report.newsAssessments ?? []).map((n) => n.newsId));

  return (
    <div className="space-y-6">
      <PageHeader title={`Report ${fmtDate(r.reportDate)} | Version ${r.version}`} lead={<>{fmtDateTime(r.createdAt)} | {r.generator === "rules-v1" ? "regelbasiert, ohne KI" : `Modell ${r.generator}`} | {c.marketStatus} {c.demo && <Badge tone="demo">Demo-Daten</Badge>}</>} right={<Link href="/reports" className="btn btn-quiet">Alle Reports</Link>} />
      {(c.failedSteps?.length || c.warnings?.length) ? <p className="rounded bg-warn-soft px-4 py-2 text-[13px] text-warn">{c.failedSteps?.length ? `Fehlgeschlagene Schritte: ${c.failedSteps.join(", ")}. ` : ""}{c.warnings?.join(" | ")}</p> : null}

      <Panel title="Veränderungen gegenüber dem Vorbericht" note={prev ? `Vergleich mit ${fmtDate(prev.reportDate)} Version ${prev.version}` : "Kein früherer Report gespeichert, daher kein Vergleich."}>
        {prev && pc ? (
          <dl className="grid gap-4 md:grid-cols-2 text-[13px]">
            <div><dt className="font-medium">Neue Risiken</dt><dd>{[...riskNow].filter((x) => !riskPrev.has(x)).join(" | ") || "keine"}</dd></div>
            <div><dt className="font-medium">Entfallene Risiken</dt><dd>{[...riskPrev].filter((x) => !riskNow.has(x)).join(" | ") || "keine"}</dd></div>
            <div><dt className="font-medium">Allokation vorher</dt><dd>{allocStr(pc.allocation) || "–"}</dd></div>
            <div><dt className="font-medium">Allokation jetzt</dt><dd>{allocStr(c.allocation) || "–"}</dd></div>
            <div><dt className="font-medium">Neu bewertete Meldungen</dt><dd>{newsIds.filter((x) => !prevNews.has(x)).length} von {newsIds.length}</dd></div>
            <div><dt className="font-medium">Thesen mit Prüfbedarf</dt><dd>{reviewTheses.map((t) => t.sym).join(", ") || "keine"}</dd></div>
            <div className="md:col-span-2"><dt className="font-medium">Kernaussagen Vorbericht</dt><dd><ul className="mt-1 list-disc pl-5 text-ink-2">{pc.report.executiveSummary.map((x, i) => <li key={i}>{x.text}</li>)}</ul></dd></div>
          </dl>
        ) : null}
      </Panel>

      <Panel title="Kernaussagen">
        <ul className="space-y-2">{c.report.executiveSummary.concat(c.report.portfolioImplications).map((x, i) => <li key={i} className="max-w-[90ch]"><KindBadge kind={x.kind} /> {x.text} {x.sourceNewsIds.map((n) => newsById.get(n) && <SourceLink key={n} href={newsById.get(n)!.url}>[{newsById.get(n)!.publisher}]</SourceLink>)}</li>)}</ul>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Risiken laut Report">
          <ul className="space-y-2">{(c.risks ?? []).slice(0, 6).map((x) => <li key={x.code}><div className="flex justify-between gap-2"><span className="font-medium">{x.title}</span><Severity n={x.severity} /></div><p className="text-[13px] text-ink-2">{x.evidence}</p></li>)}</ul>
        </Panel>
        <Panel title="Chancen und Thesenänderungen">
          <ul className="space-y-2 text-[13px]">
            {c.report.opportunities.map((o, i) => <li key={i}><KindBadge kind={o.kind} /> <span className="font-medium">{o.symbol}</span>: {o.comment}</li>)}
            {c.report.thesisChanges.map((t, i) => <li key={`t${i}`}><Badge tone="warn">{t.status}</Badge> <span className="font-medium">{t.symbol}</span>: {t.change}</li>)}
            {!c.report.opportunities.length && !c.report.thesisChanges.length && <li className="text-muted">Keine Einträge.</li>}
          </ul>
        </Panel>
      </div>

      <Panel title="Bewertete Meldungen">
        <ul className="divide-y divide-line">{c.report.newsAssessments.map((n) => { const a = newsById.get(n.newsId); return (
          <li key={n.newsId} className="py-2"><div className="flex flex-wrap items-center gap-1.5"><span className="num text-sm font-semibold">{n.relevance}</span><ImpactBadge impact={n.impact} /><span className="label">{a?.publisher}</span></div>
            {a ? <SourceLink href={a.url}>{a.headline}</SourceLink> : <span className="text-muted">Meldung nicht mehr verfügbar</span>}<p className="text-[13px] text-ink-2">{n.whyItMatters}</p></li>); })}</ul>
      </Panel>

      {c.report.uncertainties.length > 0 && <Panel title="Unsicherheiten"><ul className="list-disc pl-5 text-[13px]">{c.report.uncertainties.map((u, i) => <li key={i}>{u}</li>)}</ul></Panel>}
      <Panel title="Datenstände"><dl className="grid gap-2 text-[13px] sm:grid-cols-2 lg:grid-cols-3">{Object.entries(r.inputTimestamps).map(([k, v]) => <div key={k}><dt className="label">{k}</dt><dd className="num">{v ?? "–"}</dd></div>)}</dl></Panel>
    </div>
  );
}
