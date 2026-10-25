import { NextResponse } from "next/server";
import { getDb, dbMode } from "@/db/client";
import { lastRuns, lastSuccessfulRun } from "@/server/data";
import { dashboardStatus } from "@/domain/freshness";

export const dynamic = "force-dynamic";

/** Öffentlicher Health-Check ohne personenbezogene Daten (für Uptime-Monitoring). */
export async function GET() {
  try {
    const db = await getDb();
    const [run] = await lastRuns(db, 1);
    const ok = await lastSuccessfulRun(db);
    const status = dashboardStatus(run ? { status: run.status as "success", finishedAt: run.finishedAt, startedAt: run.startedAt } : null, ok?.finishedAt ?? null, new Date());
    return NextResponse.json({ db: dbMode(), status, lastRun: run?.finishedAt ?? null, lastSuccess: ok?.finishedAt ?? null });
  } catch (e) {
    return NextResponse.json({ status: "error", error: (e as Error).message }, { status: 500 });
  }
}
