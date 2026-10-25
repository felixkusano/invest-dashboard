import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

const PUBLIC = [/^\/login$/, /^\/api\/auth\//, /^\/api\/cron\//, /^\/api\/health$/];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"] };
