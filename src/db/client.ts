import path from "node:path";
import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { MIGRATIONS } from "./migrations.generated";

/**
 * Datenbankzugriff.
 *  - DATABASE_URL gesetzt  -> PostgreSQL (z. B. Supabase) über postgres-js.
 *  - nicht gesetzt         -> lokale PGlite-Datenbank unter ./data/pglite (nur Entwicklung/Einzelrechner).
 * Migrationen sind in den Code eingebettet (migrations.generated.ts), damit sie auf Serverless-Plattformen
 * ohne Dateizugriff funktionieren. Bereits angewendete Migrationen werden übersprungen.
 */
export type Db = PostgresJsDatabase<typeof schema>;

type Holder = { db?: Db; ready?: Promise<Db> };
const g = globalThis as unknown as { __investDb?: Holder };
g.__investDb ??= {};

export function dbMode(): "postgres" | "pglite" {
  return process.env.DATABASE_URL ? "postgres" : "pglite";
}

type Migratable = { dialect: { migrate: (m: unknown, session: unknown, cfg: unknown) => Promise<void> }; session: unknown };

export async function applyMigrations(db: unknown): Promise<void> {
  const d = db as Migratable;
  await d.dialect.migrate(MIGRATIONS, d.session, { migrationsFolder: "embedded" });
}

/** Normalisiert die Verbindungsadresse und erkennt typische Eingabefehler. */
export function parseDatabaseUrl(raw: string): { url: string; problems: string[] } {
  const problems: string[] = [];
  const url = raw.trim().replace(/^["']|["']$/g, "");
  if (url.includes("[YOUR-PASSWORD]") || url.includes("[YOUR_PASSWORD]")) problems.push("In DATABASE_URL steht noch der Platzhalter [YOUR-PASSWORD] statt des Datenbank-Passworts.");
  if (!/^postgres(ql)?:\/\//.test(url)) problems.push("DATABASE_URL muss mit postgresql:// beginnen.");
  try {
    const u = new URL(url);
    if (u.port === "5432" && u.hostname.includes("pooler.supabase.com")) problems.push("Port 5432 (Session Pooler). Empfohlen ist der Transaction Pooler mit Port 6543.");
    if (u.hostname.startsWith("db.") && u.hostname.endsWith(".supabase.co")) problems.push("Direkte Verbindung (db.….supabase.co) funktioniert auf Vercel meist nicht (nur IPv6). Bitte die Transaction-Pooler-Adresse verwenden.");
  } catch {
    problems.push("DATABASE_URL ist keine gültige Adresse. Enthält das Passwort Sonderzeichen wie @, #, / oder ?, bitte ein Passwort nur aus Buchstaben und Zahlen setzen.");
  }
  return { url, problems };
}

async function create(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    const postgres = (await import("postgres")).default;
    const { url } = parseDatabaseUrl(process.env.DATABASE_URL);
    const local = /@(localhost|127\.0\.0\.1)/.test(url);
    const client = postgres(url, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      prepare: false, // kompatibel mit Supabase Transaction Pooler
      idle_timeout: 20,
      connect_timeout: 15,
      ssl: local || /sslmode=/.test(url) ? undefined : "require",
      onnotice: () => {},
    });
    const db = drizzlePg(client, { schema });
    if (process.env.AUTO_MIGRATE !== "false") {
      try {
        await applyMigrations(db);
      } catch (e) {
        // Paralleler Kaltstart kann dieselbe Migration gleichzeitig versuchen; ein zweiter Versuch sieht den fertigen Stand.
        await new Promise((r) => setTimeout(r, 1500));
        await applyMigrations(db).catch(() => { throw e; });
      }
    }
    return db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dir = process.env.PGLITE_DIR === "memory" ? undefined : (process.env.PGLITE_DIR ?? path.join(process.cwd(), "data", "pglite"));
  const client = dir ? new PGlite(dir) : new PGlite();
  const db = drizzle(client, { schema });
  await applyMigrations(db);
  return db as unknown as Db;
}

export async function getDb(): Promise<Db> {
  const h = g.__investDb!;
  if (h.db) return h.db;
  h.ready ??= create().then((db) => (h.db = db)).catch((e) => { h.ready = undefined; throw e; });
  return h.ready;
}

/** Nur für Tests: frische In-Memory-Datenbank. */
export async function createTestDb(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const db = drizzle(new PGlite(), { schema });
  await applyMigrations(db);
  return db as unknown as Db;
}

export { schema };
