"use server";
import { randomBytes } from "node:crypto";
import { hashPassword } from "@/lib/password";

export type SetupState = { ok: boolean; message: string; values?: { ADMIN_PASSWORD_HASH: string; SESSION_SECRET: string; CRON_SECRET: string } } | null;

/** Erzeugt Passwort-Hash und Secrets. Nur verfügbar, solange noch kein ADMIN_PASSWORD_HASH konfiguriert ist. */
export async function generateSecrets(_: SetupState, fd: FormData): Promise<SetupState> {
  if (process.env.ADMIN_PASSWORD_HASH) return { ok: false, message: "Bereits eingerichtet. Die Einrichtungsseite ist deaktiviert." };
  const pw = String(fd.get("password") ?? "");
  const pw2 = String(fd.get("password2") ?? "");
  if (pw.length < 12) return { ok: false, message: "Das Passwort braucht mindestens 12 Zeichen." };
  if (pw !== pw2) return { ok: false, message: "Die Passwörter stimmen nicht überein." };
  return {
    ok: true,
    message: "Werte erzeugt. Jetzt in Vercel eintragen.",
    values: {
      ADMIN_PASSWORD_HASH: hashPassword(pw),
      SESSION_SECRET: randomBytes(48).toString("base64url"),
      CRON_SECRET: randomBytes(24).toString("hex"),
    },
  };
}
