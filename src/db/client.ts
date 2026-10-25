import path from "node:path";
import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

/**
 * Datenbankzugriff.
 *  - DATABASE_URL gesetzt  -> PostgreSQL (z. B. Supabase) über postgres-js.
 *  - nicht gesetzt         -> lokale PGlite-Datenbank unter ./data/pglite (nur Entwicklung/Einzelrechner).
 * Beide Treiber sprechen dasselbe Postgres-SQL; die API ist identisch.
 */
export type Db = PostgresJsDatabase<typeof schema>;

type Holder = { db?: Db; ready?: Promise<Db> };
const g = globalThis as unknown as { __investDb?: Holder };
g.__investDb ??= {};

export function dbMode(): "postgres" | "pglite" {
  return process.env.DATABASE_URL ? "postgres" : "pglite";
}

async function create(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    const postgres = (await import("postgres")).default;
    const client = postgres(process.env.DATABASE_URL, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      prepare: false, // kompatibel mit Supabase Transaction Pooler
      idle_timeout: 20,
    });
    return drizzlePg(client, { schema });
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR === "memory" ? undefined : (process.env.PGLITE_DIR ?? path.join(process.cwd(), "data", "pglite"));
  const client = dir ? new PGlite(dir) : new PGlite();
  const db = drizzle(client, { schema });
  // Lokal migrieren wir automatisch, damit `npm run dev` ohne weitere Schritte läuft.
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db as unknown as Db;
}

export async function getDb(): Promise<Db> {
  const h = g.__investDb!;
  if (h.db) return h.db;
  h.ready ??= create().then((db) => (h.db = db));
  return h.ready;
}

/** Nur für Tests: frische In-Memory-Datenbank. */
export async function createTestDb(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db as unknown as Db;
}

export { schema };
