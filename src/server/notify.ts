/**
 * Benachrichtigungen. Kanäle: In-App (immer, in der DB), Webhook (z. B. ntfy, Slack, Telegram-Bridge),
 * E-Mail über Resend (RESEND_API_KEY + NOTIFY_FROM_EMAIL). Dedupe über dedupeKey verhindert Wiederholungen.
 */
import type { Db } from "@/db/client";
import * as s from "@/db/schema";
import { fetchWithRetry } from "@/lib/http";

export type NotificationDraft = { kind: string; severity: number; title: string; body: string; dedupeKey: string };

export async function dispatch(db: Db, userId: number, prefs: s.NotificationPrefs, drafts: NotificationDraft[], env: NodeJS.ProcessEnv = process.env, fetchImpl?: typeof fetch) {
  const sent: string[] = [];
  for (const d of drafts) {
    const [row] = await db.insert(s.notifications).values({ userId, ...d }).onConflictDoNothing().returning({ id: s.notifications.id });
    if (!row) continue; // bereits benachrichtigt
    sent.push(d.title);
    if (!prefs.enabled) continue;
    const delivery: Record<string, string> = {};
    if (prefs.webhookUrl) {
      try {
        await fetchWithRetry(prefs.webhookUrl, { provider: "webhook", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: d.title, message: d.body, severity: d.severity, kind: d.kind }), retries: 1, fetchImpl });
        delivery.webhook = "ok";
      } catch (e) { delivery.webhook = `Fehler: ${(e as Error).message}`; }
    }
    if (prefs.email && env.RESEND_API_KEY && env.NOTIFY_FROM_EMAIL) {
      try {
        await fetchWithRetry("https://api.resend.com/emails", {
          provider: "resend", method: "POST", retries: 1, fetchImpl,
          headers: { "content-type": "application/json", authorization: `Bearer ${env.RESEND_API_KEY}` },
          body: JSON.stringify({ from: env.NOTIFY_FROM_EMAIL, to: prefs.email, subject: `[Invest] ${d.title}`, text: d.body }),
        });
        delivery.email = "ok";
      } catch (e) { delivery.email = `Fehler: ${(e as Error).message}`; }
    } else if (prefs.email) delivery.email = "nicht konfiguriert (RESEND_API_KEY/NOTIFY_FROM_EMAIL fehlen)";
    if (Object.keys(delivery).length) {
      const { eq } = await import("drizzle-orm");
      await db.update(s.notifications).set({ delivery }).where(eq(s.notifications.id, row.id));
    }
  }
  return sent;
}
