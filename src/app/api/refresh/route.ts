import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getDb } from "@/db/client";
import { ensureSeeded } from "@/db/seed";
import { runPipeline } from "@/pipeline/run";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Manueller Refresh aus der Oberfläche. Führt die vollständige Pipeline serverseitig aus. */
export async function POST(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session || session.email !== process.env.ADMIN_EMAIL) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ error: "Ungültiger Ursprung" }, { status: 403 });
  try {
    const db = await getDb();
    const userId = await ensureSeeded(db, session.email);
    const r = await runPipeline({ db, userId, trigger: "manual" });
    return NextResponse.json(r, { status: r.status === "failed" ? 502 : 200 });
  } catch (e) {
    console.error("refresh failed", e);
    return NextResponse.json({ status: "failed", error: (e as Error).message }, { status: 500 });
  }
}
