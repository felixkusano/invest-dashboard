/** Pipeline manuell von der Kommandozeile ausführen: npm run pipeline */
import { getDb } from "../src/db/client";
import { ensureSeeded } from "../src/db/seed";
import { runPipeline } from "../src/pipeline/run";
async function main() {
  const email = process.env.ADMIN_EMAIL;
  if (!email) throw new Error("ADMIN_EMAIL fehlt");
  const db = await getDb();
  const userId = await ensureSeeded(db, email);
  const r = await runPipeline({ db, userId, trigger: "cli" });
  for (const s of r.steps) console.log(`${s.status.padEnd(7)} ${s.step.padEnd(14)} ${s.message}`);
  console.log(`Status: ${r.status} | Report-ID: ${r.reportId ?? "keiner"}`);
  process.exit(r.status === "failed" ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
