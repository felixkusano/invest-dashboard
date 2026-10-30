/**
 * Bettet die SQL-Migrationen als TypeScript-Modul ein, damit sie auf Vercel ohne Dateizugriff verfügbar sind.
 * Aufruf: npm run db:embed (läuft automatisch vor jedem Build). Format identisch zu drizzles readMigrationFiles.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const dir = path.join(process.cwd(), "drizzle");
const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta", "_journal.json"), "utf8"));
const migrations = journal.entries.map((e: { tag: string; when: number; breakpoints: boolean }) => {
  const query = fs.readFileSync(path.join(dir, `${e.tag}.sql`), "utf8");
  return { tag: e.tag, sql: query.split("--> statement-breakpoint"), bps: e.breakpoints, folderMillis: e.when, hash: crypto.createHash("sha256").update(query).digest("hex") };
});
const out = `// Automatisch erzeugt von scripts/embed-migrations.ts. Nicht von Hand bearbeiten.\nexport const MIGRATIONS: { tag: string; sql: string[]; bps: boolean; folderMillis: number; hash: string }[] = ${JSON.stringify(migrations, null, 1)};\n`;
fs.writeFileSync(path.join(process.cwd(), "src", "db", "migrations.generated.ts"), out);
console.log(`${migrations.length} Migrationen eingebettet.`);
