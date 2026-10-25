import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/server/session";
import * as s from "@/db/schema";
import { loadHoldingRows, loadSettings, providerStatuses } from "@/server/data";
import { providerCatalog } from "@/providers/registry";
import { dbMode } from "@/db/client";
import { Badge, PageHeader, Panel, SourceLink } from "@/components/ui";
import { ActionForm, Field } from "@/components/ActionForm";
import { markNotificationsRead, updateSettings } from "@/server/actions";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { db, userId } = await requireUser();
  const st = await loadSettings(db, userId);
  const holdings = await loadHoldingRows(db, userId);
  const status = new Map((await providerStatuses(db)).map((p) => [p.provider, p]));
  const catalog = providerCatalog();
  const notes = await db.select().from(s.notifications).where(eq(s.notifications.userId, userId)).orderBy(desc(s.notifications.createdAt)).limit(30);
  const logs = await db.select().from(s.ingestionLog).orderBy(desc(s.ingestionLog.createdAt)).limit(25);
  const etfs = holdings.filter((h) => h.i.assetClass === "etf");
  const plans = st.savingsPlans.map((p) => `${p.instrumentId}; ${p.amountEur}; ${p.dayOfMonth}`).join("\n");

  return (
    <div className="space-y-6">
      <PageHeader title="Einstellungen & Datenquellen" lead={`Datenbank: ${dbMode() === "postgres" ? "PostgreSQL (DATABASE_URL)" : "lokale PGlite-Datei (nur Entwicklung)"} | Zeitplan ${st.schedule.refresh} Datenabruf, ${st.schedule.briefing} Briefing, ${st.schedule.available} verfügbar (Europe/Berlin)`} />

      <Panel title="Datenquellen" note="Schlüssel werden ausschließlich serverseitig als Umgebungsvariablen gelesen und nie an den Browser übertragen.">
        <div className="overflow-x-auto"><table className="data-table">
          <thead><tr><th>Quelle</th><th>Rolle</th><th>Status</th><th>Datentyp</th><th>Abdeckung | Limits</th><th>Letzter Erfolg | Fehler</th></tr></thead>
          <tbody>{catalog.map((c) => { const ps = status.get(c.name); return (
            <tr key={c.name}>
              <td><SourceLink href={c.docsUrl}>{c.label}</SourceLink>{c.envVar && <div className="label">{c.envVar}</div>}</td>
              <td className="max-w-xs text-[13px]">{c.role}</td>
              <td>{c.configured ? <Badge tone="sky">konfiguriert</Badge> : <Badge tone="warn">kein Key</Badge>}</td>
              <td className="text-[13px]">{c.dataType}</td>
              <td className="max-w-xs text-[13px]">{c.coverage}<div className="label">{c.limits}</div></td>
              <td className="text-[13px]">{fmtDateTime(ps?.lastSuccessAt ?? null)}{ps?.lastError && <div className="text-neg">{fmtDateTime(ps.lastErrorAt)}: {ps.lastError.slice(0, 160)}</div>}</td>
            </tr>); })}</tbody>
        </table></div>
      </Panel>

      <ActionForm action={updateSettings} submitLabel="Einstellungen speichern" className="space-y-6">
        <Panel title="Budget und Allokation">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Monatsbudget EUR"><input name="monthlyBudgetEur" inputMode="decimal" defaultValue={st.monthlyBudgetEur} required /></Field>
            <Field label="Kernanteil %" hint="Ausgangshypothese 80 %"><input name="coreSharePct" inputMode="decimal" defaultValue={st.coreSharePct} required /></Field>
            <Field label="Mindestorder EUR" hint="kleinere Chancenbeträge gehen in den Kern"><input name="minOrderEur" inputMode="decimal" defaultValue={st.minOrderEur} /></Field>
            <Field label="Kern-ETF"><select name="coreInstrumentId" defaultValue={st.coreInstrumentId ?? ""}><option value="">nicht festgelegt</option>{etfs.map((e) => <option key={e.i.id} value={e.i.id}>{e.i.name}</option>)}</select></Field>
            <Field label="Wenn keine Chance qualifiziert"><select name="holdBackPreference" defaultValue={st.holdBackPreference}><option value="core_etf">in den Kern-ETF</option><option value="cash">als Liquidität halten</option></select></Field>
            <Field label="Score-Schwelle Einzeltitel"><input name="scoreThreshold" type="number" min={0} max={100} defaultValue={st.scoreThreshold} /></Field>
            <Field label="Verfügbare Liquidität EUR" hint="leer = unbekannt"><input name="availableCashEur" inputMode="decimal" defaultValue={st.availableCashEur ?? ""} /></Field>
            <Field label="Notreserve EUR (außerhalb Depot)" hint="leer = unbekannt"><input name="emergencyReserveEur" inputMode="decimal" defaultValue={st.emergencyReserveEur ?? ""} /></Field>
          </div>
          <div className="mt-3">
            <Field label="Bestehende Sparpläne" hint={`Eine Zeile je Plan: Instrument-ID; Betrag; Ausführungstag. IDs: ${etfs.map((e) => `${e.i.symbol} = ${e.i.id}`).join(", ")}. Sparpläne werden vom Monatsbudget abgezogen.`}><textarea name="savingsPlans" rows={3} defaultValue={plans} placeholder="leer = keine Sparpläne" /></Field>
          </div>
        </Panel>

        <Panel title="Risikoprofil und Limits">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Risikoprofil"><input name="riskProfile" defaultValue={st.riskProfile} /></Field>
            <Field label="Anlagehorizont"><input name="horizon" defaultValue={st.horizon} /></Field>
            <Field label="Bevorzugte Sektoren" hint="kommagetrennt"><input name="preferredSectors" defaultValue={st.preferredSectors.join(", ")} /></Field>
            <Field label="Ausgeschlossene Sektoren" hint="kommagetrennt, wie in der Sektorspalte"><input name="excludedSectors" defaultValue={st.excludedSectors.join(", ")} /></Field>
            <Field label="Max. Einzelposition %"><input name="maxSinglePositionPct" inputMode="decimal" defaultValue={st.limits.maxSinglePositionPct} /></Field>
            <Field label="Max. Themencluster %"><input name="maxThemePct" inputMode="decimal" defaultValue={st.limits.maxThemePct} /></Field>
            <Field label="Max. Top 3 %"><input name="maxTop3Pct" inputMode="decimal" defaultValue={st.limits.maxTop3Pct} /></Field>
            <Field label="Max. USD-Einzeltitel %"><input name="maxUsdPct" inputMode="decimal" defaultValue={st.limits.maxUsdPct} /></Field>
            <Field label="Small-Cap-Zielquote %"><input name="smallCapTargetPct" inputMode="decimal" defaultValue={st.limits.smallCapTargetPct ?? 10} /></Field>
          </div>
        </Panel>

        <Panel title="Benachrichtigungen" note="In-App immer aktiv. E-Mail über Resend (RESEND_API_KEY, NOTIFY_FROM_EMAIL), Webhook z. B. für ntfy oder Slack.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="notifEnabled" defaultChecked={st.notification.enabled} /> Externe Zustellung aktiv</label>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="notifyFailedUpdates" defaultChecked={st.notification.notifyFailedUpdates} /> Bei fehlgeschlagenen Updates</label>
            <Field label="E-Mail"><input name="notifEmail" type="email" defaultValue={st.notification.email ?? ""} /></Field>
            <Field label="Webhook-URL (https)"><input name="notifWebhook" defaultValue={st.notification.webhookUrl ?? ""} /></Field>
            <Field label="Min. News-Relevanz"><input name="minNewsRelevance" type="number" min={0} max={100} defaultValue={st.notification.minNewsRelevance} /></Field>
            <Field label="Min. Risiko-Schweregrad"><input name="minRiskSeverity" type="number" min={1} max={5} defaultValue={st.notification.minRiskSeverity} /></Field>
            <Field label="Min. Kandidaten-Score"><input name="minCandidateScore" type="number" min={0} max={100} defaultValue={st.notification.minCandidateScore} /></Field>
          </div>
        </Panel>

        <Panel title="Demo-Modus" note="Nur zum Ausprobieren ohne API-Keys. Demo-Werte sind künstlich, rot markiert und werden nie mit echten Daten vermischt.">
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="demoMode" defaultChecked={st.demoMode} /> Demo-Modus aktivieren</label>
        </Panel>
      </ActionForm>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Benachrichtigungen" action={notes.some((n) => !n.readAt) ? <form action={markNotificationsRead}><button className="btn btn-quiet px-2 py-1 text-xs">Alle als gelesen markieren</button></form> : undefined}>
          <span id="benachrichtigungen" />
          {notes.length ? <ul className="max-h-96 space-y-2 overflow-y-auto text-[13px]">{notes.map((n) => <li key={n.id} className={n.readAt ? "text-muted" : ""}><span className="label">{fmtDateTime(n.createdAt)}</span> <span className="font-medium">{n.title}</span><div className="text-ink-2">{n.body.slice(0, 240)}</div>{Object.keys(n.delivery).length > 0 && <div className="label">Zustellung: {Object.entries(n.delivery).map(([k, v]) => `${k} ${v}`).join(" | ")}</div>}</li>)}</ul> : <p className="label">Keine Benachrichtigungen.</p>}
        </Panel>
        <Panel title="Ingestion-Protokoll (letzte Einträge)">
          {logs.length ? <ul className="max-h-96 space-y-1 overflow-y-auto text-[12.5px]">{logs.map((l) => <li key={l.id}><span className="label">{fmtDateTime(l.createdAt)}</span> <Badge tone={l.level === "error" ? "neg" : l.level === "warn" ? "warn" : "neutral"}>{l.step}</Badge> {l.provider && <span className="label">{l.provider}</span>} {l.message.slice(0, 220)}</li>)}</ul> : <p className="label">Keine Einträge.</p>}
        </Panel>
      </div>
    </div>
  );
}
