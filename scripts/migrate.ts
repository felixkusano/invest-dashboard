/** Migrationen gegen DATABASE_URL (Postgres/Supabase) oder die lokale PGlite-Datei ausführen. */
import path from "node:path";
async function main() {
  if (process.env.DATABASE_URL) {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
    await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    await client.end();
    console.log("Migrationen auf PostgreSQL angewendet.");
  } else {
    const { getDb } = await import("../src/db/client");
    await getDb();
    console.log("Migrationen auf lokaler PGlite-Datenbank angewendet (./data/pglite).");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
