import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/db/client";
import { ensureSeeded } from "@/db/seed";
import { runPipeline } from "@/pipeline/run";
import { isWithinBerlinWindow } from "@/lib/time";
import { loadSettings } from "@/server/data";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Wird zweimal täglich in UTC aufgerufen (04:30 und 05:30 UTC). Nur der Aufruf, der in Berlin
 * dem Zielfenster (Standard 06:30) entspricht, startet die Pipeline. So bleibt die Sommerzeit korrekt.
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
  if (!force && !isWithinBerlinWindow(new Date(), settings.schedule.refresh)) {
    return NextResponse.json({ status: "skipped", reason: `Außerhalb des Berliner Zielfensters ${settings.schedule.refresh}` });
  }
  const r = await runPipeline({ db, userId, trigger: "cron" });
  return NextResponse.json(r, { status: r.status === "failed" ? 502 : 200 });
}
