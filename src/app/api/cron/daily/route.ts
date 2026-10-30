import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/db/client";
import { ensureSeeded } from "@/db/seed";
import { runPipeline } from "@/pipeline/run";
import { shouldRunDaily } from "@/lib/time";
import { lastSuccessfulRun, loadSettings } from "@/server/data";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Wird zweimal täglich in UTC aufgerufen (04:30 und 05:30 UTC, Starts oft verspätet). Der erste Aufruf im
 * Berliner Zeitfenster um das Ziel (Standard 06:30) startet die Pipeline, weitere Aufrufe am selben Tag werden übersprungen.
 * Authentifizierung: Authorization: Bearer <CRON_SECRET> (Vercel Cron setzt den Header automatisch).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || auth.length !== expected.length || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const email = process.env.ADMIN_EMAIL;
  if (!email) return NextResponse.json({ error: "ADMIN_EMAIL fehlt" }, { status: 500 });
  const db = await getDb();
  const userId = await ensureSeeded(db, email);
  const settings = await loadSettings(db, userId);
  const force = req.nextUrl.searchParams.get("force") === "1";
  if (!force) {
    const last = await lastSuccessfulRun(db);
    const gate = shouldRunDaily(new Date(), settings.schedule.refresh, last?.finishedAt ?? null);
    if (!gate.run) return NextResponse.json({ status: "skipped", reason: gate.reason });
  }
  const r = await runPipeline({ db, userId, trigger: "cron" });
  return NextResponse.json(r, { status: r.status === "failed" ? 502 : 200 });
}
