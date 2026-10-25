/** Legt Nutzer, Einstellungen und Startportfolio an (idempotent). */
import { getDb } from "../src/db/client";
import { ensureSeeded } from "../src/db/seed";
async function main() {
  const email = process.env.ADMIN_EMAIL;
  if (!email) throw new Error("ADMIN_EMAIL fehlt");
  const db = await getDb();
  const id = await ensureSeeded(db, email);
  console.log(`Startportfolio für ${email} angelegt bzw. vorhanden (userId ${id}).`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
