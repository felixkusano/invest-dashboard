import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { Nav, RefreshButton } from "@/components/Shell";
import { requireUser } from "@/server/session";
import * as s from "@/db/schema";
import { dashboardStatus, STATUS_LABEL } from "@/domain/freshness";
import { fmtDateTime } from "@/lib/format";
import { lastSuccessfulRun, loadSettings } from "@/server/data";
import clsx from "clsx";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { db, userId, email } = await requireUser();
  const settings = await loadSettings(db, userId);
  const [run] = await db.select().from(s.pipelineRuns).where(ne(s.pipelineRuns.status, "skipped")).orderBy(desc(s.pipelineRuns.startedAt)).limit(1);
  const ok = await lastSuccessfulRun(db);
  const status = dashboardStatus(run ? { status: run.status as "success", finishedAt: run.finishedAt, startedAt: run.startedAt } : null, ok?.finishedAt ?? null, new Date());
  const unread = (await db.select({ id: s.notifications.id }).from(s.notifications).where(and(eq(s.notifications.userId, userId), isNull(s.notifications.readAt)))).length;
  const dot = { current: "bg-pos", partial: "bg-warn", stale: "bg-warn", failed: "bg-neg", never: "bg-muted" }[status];
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[224px_1fr]">
      <aside className="bg-ink py-3 lg:sticky lg:top-0 lg:h-screen lg:py-5">
        <div className="mb-3 hidden px-6 lg:block">
          <div className="text-[15px] font-semibold text-white">Investment Desk</div>
          <div className="text-xs text-white/55">{email}</div>
        </div>
        <Nav />
        <form method="post" action="/api/auth/logout" className="mt-6 hidden px-6 lg:block"><button className="text-xs text-white/55 hover:text-white">Abmelden</button></form>
      </aside>
      <div className="min-w-0">
        {settings.demoMode && (
          <div role="alert" className="bg-neg px-4 py-2 text-center text-[13px] font-medium text-white">
            Demo-Modus aktiv: Kurse und Kennzahlen sind künstlich erzeugt und keine Marktdaten. Abschalten unter Einstellungen.
          </div>
        )}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 py-2.5 lg:px-8">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            <span className="inline-flex items-center gap-2 font-medium"><span className={clsx("h-2 w-2 rounded-full", dot)} />{STATUS_LABEL[status]}</span>
            <span className="text-muted">Letzte erfolgreiche Aktualisierung: {fmtDateTime(ok?.finishedAt ?? null)}</span>
            {unread > 0 && <a href="/settings#benachrichtigungen" className="text-sky-deep">{unread} neue Hinweise</a>}
          </div>
          <RefreshButton />
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
