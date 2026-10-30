import { sql } from "drizzle-orm";
import { getDb, parseDatabaseUrl } from "@/db/client";
import { ensureSeeded } from "@/db/seed";

export type DiagStep = { name: string; ok: boolean; message: string };

/** Entfernt Zugangsdaten aus Fehlermeldungen, bevor sie angezeigt werden. */
export function sanitizeError(msg: string): string {
  return msg
    .replace(/postgres(ql)?:\/\/[^\s"']+/gi, "postgresql://***")
    .replace(/password[^\s]*\s*=?\s*\S+/gi, "password=***")
    .slice(0, 400);
}

function explain(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("password authentication failed") || m.includes("sasl")) return "Das Datenbank-Passwort in DATABASE_URL ist falsch. Passwort in Supabase zurücksetzen und in die Adresse einsetzen.";
  if (m.includes("tenant or user not found")) return "Benutzername oder Region in DATABASE_URL passen nicht. Adresse in Supabase unter Connect, Transaction pooler neu kopieren.";
  if (m.includes("enotfound") || m.includes("getaddrinfo")) return "Der Servername in DATABASE_URL existiert nicht. Adresse neu aus Supabase kopieren.";
  if (m.includes("timeout") || m.includes("etimedout") || m.includes("econnrefused")) return "Die Datenbank antwortet nicht. Prüfen, ob das Supabase-Projekt pausiert ist (im Supabase-Dashboard auf Restore klicken).";
  if (m.includes("invalid url") || m.includes("url")) return "DATABASE_URL ist keine gültige Adresse. Häufige Ursache: Sonderzeichen im Passwort.";
  return "Unbekannter Fehler. Bitte die Meldung an Claude schicken.";
}

/** Prüft Konfiguration, Datenbankverbindung, Migrationen und Startportfolio der Reihe nach. */
export async function diagnose(): Promise<DiagStep[]> {
  const steps: DiagStep[] = [];
  const url = process.env.DATABASE_URL;
  if (!url) return [{ name: "DATABASE_URL", ok: false, message: "Nicht gesetzt." }];
  const p = parseDatabaseUrl(url);
  steps.push({ name: "Adresse der Datenbank", ok: p.problems.length === 0, message: p.problems.join(" ") || "Format in Ordnung." });
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    steps.push({ name: "Verbindung und Tabellen", ok: true, message: "Datenbank erreichbar, Tabellen angelegt." });
    const email = process.env.ADMIN_EMAIL;
    if (email) {
      try {
        await ensureSeeded(db, email);
        steps.push({ name: "Startportfolio", ok: true, message: "Angelegt." });
      } catch (e) {
        const msg = sanitizeError((e as Error).message + ((e as { cause?: Error }).cause ? ` | ${(e as { cause: Error }).cause.message}` : ""));
        steps.push({ name: "Startportfolio", ok: false, message: msg });
      }
    }
  } catch (e) {
    const raw = (e as Error).message + ((e as { cause?: Error }).cause ? ` | ${(e as { cause: Error }).cause.message}` : "");
    steps.push({ name: "Verbindung und Tabellen", ok: false, message: `${explain(raw)} Technische Meldung: ${sanitizeError(raw)}` });
  }
  return steps;
}
