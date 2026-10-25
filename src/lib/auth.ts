/**
 * Authentifizierung für ein privates Ein-Personen-Dashboard.
 *  - Passwort als scrypt-Hash in ADMIN_PASSWORD_HASH (Erzeugung: npm run hash-password).
 *  - Session als signiertes JWT (HS256) im httpOnly-Cookie, 14 Tage gültig.
 *  - Login-Versuche pro IP begrenzt.
 * Dieses Modul ist edge-kompatibel bis auf verifyPassword (nur Node-Runtime).
 */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "invest_session";
const SESSION_DAYS = 14;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET fehlt oder ist kürzer als 32 Zeichen.");
  return new TextEncoder().encode(s);
}

export async function createSession(email: string): Promise<string> {
  return new SignJWT({ sub: email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .setAudience("invest-dashboard")
    .sign(secret());
}

export async function verifySession(token: string | undefined | null): Promise<{ email: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: "invest-dashboard", algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? { email: payload.sub } : null;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 86400,
};

const attempts = new Map<string, { n: number; until: number }>();
export function loginRateLimited(ip: string, now = Date.now()): boolean {
  const a = attempts.get(ip);
  return !!a && a.n >= 5 && a.until > now;
}
export function recordLoginFailure(ip: string, now = Date.now()) {
  const a = attempts.get(ip);
  if (!a || a.until < now) attempts.set(ip, { n: 1, until: now + 15 * 60e3 });
  else a.n++;
}
export function clearLoginFailures(ip: string) { attempts.delete(ip); }
