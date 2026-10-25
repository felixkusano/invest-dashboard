import { desc, eq, and } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as s from "@/db/schema";
import { Badge, Empty, Panel } from "@/components/ui";
import { ActionForm, Field } from "@/components/ActionForm";
import { addThesis, reviewThesis } from "@/server/actions";
import { fmtDate, fmtDateTime, fmtNum, fmtPct } from "@/lib/format";
import { archetypeFor, type Metrics } from "@/domain/scoring";
import { mechanicalScenarios } from "@/domain/scenarios";
import { latestFundamentals, latestScores } from "@/server/data";

const METRIC_ROWS: { key: keyof Metrics; label: string; unit: "%" | "x" | "" ; for?: ("general" | "bank" | "real_estate")[] }[] = [
  { key: "revenueGrowthYoy", label: "Umsatzwachstum YoY", unit: "%" },
  { key: "revenueGrowth3y", label: "Umsatzwachstum 3 J. p. a.", unit: "%" },
  { key: "epsGrowthYoy", label: "EPS-Wachstum YoY", unit: "%" },
  { key: "grossMargin", label: "Bruttomarge", unit: "%", for: ["general"] },
  { key: "operatingMargin", label: "Operative Marge", unit: "%" },
  { key: "netMargin", label: "Nettomarge", unit: "%" },
  { key: "roic", label: "ROIC", unit: "%", for: ["general"] },
  { key: "roe", label: "Eigenkapitalrendite", unit: "%" },
  { key: "peTtm", label: "KGV (TTM)", unit: "x" },
  { key: "forwardPe", label: "KGV (Forward)", unit: "x" },
  { key: "evEbitda", label: "EV/EBITDA", unit: "x", for: ["general"] },
  { key: "evSales", label: "EV/Umsatz", unit: "x", for: ["general"] },
  { key: "pb", label: "Kurs-Buchwert", unit: "x", for: ["bank", "real_estate"] },
  { key: "fcfYield", label: "FCF-Rendite", unit: "%" },
  { key: "debtToEquity", label: "Verschuldung/Eigenkapital", unit: "x" },
  { key: "currentRatio", label: "Current Ratio", unit: "x", for: ["general"] },
  { key: "beta", label: "Beta", unit: "" },
  { key: "priceReturn52w", label: "Kurs 52 Wochen", unit: "%" },
];

const COMP = [["quality", "Fundamentale Qualität", 25], ["growth", "Wachstum", 20], ["valuation", "Bewertung", 25], ["catalysts", "Katalysatoren & Momentum", 15], ["risk", "Risikoprofil", 15]] as const;

export async function ResearchBlock({ db, userId, instrument, demo }: { db: Db; userId: number; instrument: typeof s.instruments.$inferSelect; demo: boolean }) {
  const f = (await latestFundamentals(db, [instrument.id], demo)).get(instrument.id);
  const sc = (await latestScores(db, [instrument.id])).get(instrument.id);
  const arch = archetypeFor(instrument.sector);
  const theses = await db.select().from(s.theses).where(and(eq(s.theses.userId, userId), eq(s.theses.instrumentId, instrument.id))).orderBy(desc(s.theses.createdAt));
  const reviews = theses.length ? await db.select().from(s.thesisReviews).orderBy(desc(s.thesisReviews.createdAt)) : [];
  const m = f?.metrics;
  const scen = m ? mechanicalScenarios(m.epsGrowth3y ?? m.epsGrowthYoy, m.forwardPe ?? m.peTtm) : null;

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Kennzahlen" note={f ? `${f.provider === "demo" ? "DEMO-Daten" : f.provider}, Stand ${fmtDate(f.asOf)} | Kennzahlensatz ${arch === "bank" ? "Bank" : arch === "real_estate" ? "Immobilien" : "Industrie/Tech"}` : undefined}>
        {m ? (
          <table className="data-table">
            <tbody>
              {METRIC_ROWS.filter((r) => !r.for || r.for.includes(arch)).map((r) => {
                const v = m[r.key];
                return <tr key={r.key}><td>{r.label}</td><td className="num text-right">{v == null ? <span className="text-muted">n. v.</span> : r.unit === "%" ? fmtPct(v, 1) : `${fmtNum(v, r.unit === "x" ? 1 : 2)}${r.unit === "x" ? "x" : ""}`}</td></tr>;
              })}
            </tbody>
          </table>
        ) : <Empty title="Keine Fundamentaldaten">Finnhub (US-Titel, Free Tier) oder EODHD Fundamentals konfigurieren. Historische Bewertungsbandbreiten und Analystenrevisionen benötigen einen lizenzierten Datenplan und werden ohne diesen nicht angezeigt.</Empty>}
      </Panel>

      <Panel title="Investment-Score" note={sc ? `Berechnet ${fmtDateTime(sc.scoredAt)} | Datenabdeckung ${(sc.inputs as { coveragePct?: number }).coveragePct ?? "–"} %` : undefined}>
        {sc ? (
          <div>
            <div className="flex items-baseline gap-3"><span className="num text-3xl font-semibold">{sc.total != null ? fmtNum(sc.total, 0) : "–"}</span><span className="label">von 100 | Datenvertrauen {({ high: "hoch", medium: "mittel", low: "gering", insufficient: "unzureichend" } as Record<string, string>)[sc.confidence]}</span>{(sc.inputs as { demo?: boolean }).demo && <Badge tone="demo">Demo</Badge>}</div>
            <ul className="mt-4 space-y-2.5">
              {COMP.map(([k, label, max]) => {
                const v = sc[k] as number | null;
                return (
                  <li key={k}>
                    <div className="flex justify-between text-[13px]"><span className="font-medium">{label}</span><span className="num">{v != null ? `${fmtNum(v, 1)} / ${max}` : `n. v. / ${max}`}</span></div>
                    <div className="mt-1 h-1.5 rounded-sm bg-paper"><div className="h-1.5 rounded-sm bg-sky" style={{ width: `${v != null ? (v / max) * 100 : 0}%` }} /></div>
                    <p className="label mt-0.5">{sc.explanation[k]}</p>
                  </li>
                );
              })}
            </ul>
            <p className="label mt-3">{sc.explanation.method}. Fehlende Komponenten werden nicht mit null Punkten gewertet, der Gesamtscore wird auf die verfügbaren Komponenten skaliert. Risikoprofil: höher = geringeres Risiko.</p>
          </div>
        ) : <Empty title="Noch kein Score">Ein Score entsteht erst, wenn genügend Kennzahlen vorliegen.</Empty>}
      </Panel>

      <Panel title="Mechanische Szenarien (12 Monate)" note="Keine Prognose. Kursänderung = (1 + Gewinnwachstum) × (1 + KGV-Veränderung) − 1. Annahmen siehe Zeile.">
        {scen ? (
          <table className="data-table">
            <thead><tr><th>Szenario</th><th>Annahme</th><th className="text-right">EPS</th><th className="text-right">KGV</th><th className="text-right">Kurs</th></tr></thead>
            <tbody>{scen.map((x) => <tr key={x.name}><td className="font-medium">{x.name}</td><td className="text-[13px]">{x.assumption}</td><td className="num text-right">{fmtPct(x.epsGrowthPct, 0)}</td><td className="num text-right">{fmtPct(x.multipleChangePct, 0)}</td><td className={`num text-right font-medium ${x.priceChangePct >= 0 ? "text-pos" : "text-neg"}`}>{fmtPct(x.priceChangePct, 0)}</td></tr>)}</tbody>
          </table>
        ) : <Empty title="Szenarien nicht berechenbar">Benötigt positives KGV und Gewinnwachstum aus den Fundamentaldaten.</Empty>}
      </Panel>

      <Panel title="Investmentthese" note="Thesen werden nie überschrieben. Überprüfungen werden angehängt.">
        {theses.length ? (
          <ul className="space-y-4">
            {theses.map((t) => (
              <li key={t.id} className="border-l-2 border-sky pl-3">
                <div className="flex flex-wrap items-center gap-2"><Badge tone={t.status === "active" ? "sky" : t.status === "invalidated" ? "neg" : "warn"}>{({ active: "aktiv", review: "prüfen", invalidated: "ungültig", closed: "geschlossen" } as Record<string, string>)[t.status]}</Badge><span className="label">seit {fmtDate(t.createdAt)} | zuletzt geprüft {fmtDate(t.lastReviewAt)}</span></div>
                <p className="mt-1 font-medium">{t.summary}</p>
                <dl className="mt-1 grid gap-1 text-[13px] text-ink-2">
                  {t.evidence && <div><dt className="inline font-medium text-ink">Belege: </dt><dd className="inline">{t.evidence}</dd></div>}
                  {t.catalysts && <div><dt className="inline font-medium text-ink">Katalysatoren: </dt><dd className="inline">{t.catalysts}</dd></div>}
                  {t.risks && <div><dt className="inline font-medium text-ink">Risiken: </dt><dd className="inline">{t.risks}</dd></div>}
                  {t.invalidation && <div><dt className="inline font-medium text-ink">Ungültig, wenn: </dt><dd className="inline">{t.invalidation}</dd></div>}
                </dl>
                {reviews.filter((r) => r.thesisId === t.id).length > 0 && (
                  <ul className="mt-2 space-y-1 text-[13px]">{reviews.filter((r) => r.thesisId === t.id).map((r) => <li key={r.id}><span className="label">{fmtDate(r.createdAt)} | {r.author === "user" ? "manuell" : r.author}:</span> {r.note}</li>)}</ul>
                )}
                <details className="mt-2"><summary className="cursor-pointer text-[13px] text-sky-deep">Überprüfung anhängen</summary>
                  <ActionForm action={reviewThesis} submitLabel="Anhängen" quiet className="mt-2">
                    <input type="hidden" name="thesisId" value={t.id} />
                    <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                      <select name="status" defaultValue={t.status}><option value="active">aktiv</option><option value="review">prüfen</option><option value="invalidated">ungültig</option><option value="closed">geschlossen</option></select>
                      <input name="note" required placeholder="Was hat sich geändert?" />
                    </div>
                  </ActionForm>
                </details>
              </li>
            ))}
          </ul>
        ) : <p className="label">Noch keine These hinterlegt.</p>}
        <details className="mt-4"><summary className="cursor-pointer text-[13px] font-medium text-sky-deep">Neue These erfassen</summary>
          <ActionForm action={addThesis} submitLabel="These speichern" className="mt-2 space-y-2">
            <input type="hidden" name="instrumentId" value={instrument.id} />
            <Field label="These (Kernaussage)"><textarea name="summary" required rows={2} /></Field>
            <Field label="Belege"><textarea name="evidence" rows={2} /></Field>
            <Field label="Katalysatoren 3 bis 12 Monate"><textarea name="catalysts" rows={2} /></Field>
            <Field label="Hauptrisiken"><textarea name="risks" rows={2} /></Field>
            <Field label="These ungültig, wenn"><textarea name="invalidation" rows={2} /></Field>
          </ActionForm>
        </details>
      </Panel>
    </div>
  );
}
