import { NextResponse, type NextRequest } from "next/server";
import { createSession, SESSION_COOKIE, sessionCookieOptions, loginRateLimited, recordLoginFailure, clearLoginFailures } from "@/lib/auth";
import { checkAdminPassword } from "@/lib/password";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const fd = await req.formData();
  const next = String(fd.get("next") ?? "/");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const back = (err: string) => NextResponse.redirect(new URL(`/login?error=${err}&next=${encodeURIComponent(safeNext)}`, req.url), 303);
  if (loginRateLimited(ip)) return back("rate");
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
  if (!adminEmail || !process.env.SESSION_SECRET) return back("config");
  if (email !== adminEmail || !checkAdminPassword(password)) { recordLoginFailure(ip); return back("invalid"); }
  clearLoginFailures(ip);
  const res = NextResponse.redirect(new URL(safeNext, req.url), 303);
  res.cookies.set(SESSION_COOKIE, await createSession(process.env.ADMIN_EMAIL!), sessionCookieOptions);
  return res;
}
