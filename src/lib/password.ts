import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

/** Format: scrypt:<N>:<salt b64>:<hash b64> (ohne "$", da .env-Loader "$" als Variable expandieren). */
export function hashPassword(pw: string, N = 16384): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 32, { N, r: 8, p: 1 });
  return `scrypt:${N}:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const parts = stored.trim().split(stored.includes(":") ? ":" : "$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const salt = Buffer.from(parts[2], "base64");
  const expected = Buffer.from(parts[3], "base64");
  const got = scryptSync(pw, salt, expected.length, { N, r: 8, p: 1 });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Prüft gegen ADMIN_PASSWORD_HASH; ADMIN_PASSWORD (Klartext) ist nur außerhalb der Produktion erlaubt. */
export function checkAdminPassword(pw: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ADMIN_PASSWORD_HASH) return verifyPassword(pw, env.ADMIN_PASSWORD_HASH);
  if (env.ADMIN_PASSWORD && env.NODE_ENV !== "production") {
    const a = Buffer.from(pw), b = Buffer.from(env.ADMIN_PASSWORD);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  return false;
}
