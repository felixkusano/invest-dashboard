import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, gte } from "drizzle-orm";
import { requireUser } from "@/server/session";
import * as s from "@/db/schema";
import { loadNews, loadPortfolio, priceHistory } from "@/server/data";
import { Badge, Delta, Empty, EurDelta, EventStatusBadge, ImpactBadge, PageHeader, Panel, SourceLink, Stat, ValueSourceBadge } from "@/components/ui";
import { SeriesChart } from "@/components/Charts";
import { ActionForm, ActionButton, Field } from "@/components/ActionForm";
import { deactivateHolding, importConstituentsCsv, updateHolding } from "@/server/actions";
import { ResearchBlock } from "@/components/Research";
import { fmtDate, fmtDateTime, fmtEur, fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { addDays, berlinDate } from "@/lib/time";
import { costBasisConsistency } from "@/domain/portfolio";

export const dynamic = "force-dynamic";

export default async function HoldingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, userId } = await requireUser();
  const p = await loadPortfolio(db, userId);
  const pos = p.summary.positions.find((x) => x.holdingId === Number(id));
  if (!pos) notFound();
  const row = p.rows.find((r) => r.h.id === pos.holdingId)!;
  const { h, i } = row;
  const hist = await priceHistory(db, i.id, p.demo, addDays(berlinDate(), -370));
  const news = await loadNews(db, { instrumentId: i.id, sinceDays: 30, demo: p.demo, limit: 30 });
  const events = await db.select().from(s.calendarEvents).where(and(eq(s.calendarEvents.instrumentId, i.id), gte(s.calendarEvents.startsAt, new Date()))).orderBy(s.calendarEvents.startsAt);
  const cons = i.assetClass === "etf" ? await db.select().from(s.etfConstituents).where(eq(s.etfConstituents.etfInstrumentId, i.id)) : [];
  const cc = costBasisConsistency(h.costBasisEur, h.importedValueEur, h.importedPerfPct);

  return (
    <div className="space-y-6">
      <PageHeader title={i.name} lead={<>{i.symbol} | {i.exchange} | ISIN {i.isin ?? "unbekannt"} {i.isin && !i.isinVerified && <Badge tone="warn">ISIN unbestätigt</Badge>}</>} right={<Link href="/portfolio" className="btn btn-quiet">Zurück zum Portfolio</Link>} />
      {i.notes && <p className="rounded border border-warn/30 bg-warn-soft px-4 py-2 text-[13px] text-warn">{i.notes}</p>}

      <section className="panel grid grid-cols-2 gap-5 p-4 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Kurs" value={pos.price ? fmtMoney(pos.price.close, pos.price.currency) : "–"} sub={pos.price ? `${fmtDate(pos.price.priceDate)} | ${pos.price.provider} | ${pos.price.dataType === "eod" ? "Schlusskurs" : pos.price.dataType}` : "kein Kurs vorhanden"} />
        <Stat label="Wert EUR" value={fmtEur(pos.provisionalValueEur)} sub={<ValueSourceBadge source={pos.valueSource} dataType={pos.price?.dataType} />} />
        <Stat label="Letzter Handelstag" value={<Delta v={pos.dailyChangePct} />} sub={<EurDelta v={pos.dailyChangeEur} />} />
        <Stat label="Einstand" value={fmtEur(pos.costBasisEur)} sub={h.costBasisSource === "prior_statement" ? "aus früherer Angabe" : h.costBasisSource === "user" ? "manuell" : "fehlt"} />
        <Stat label="Seit Kauf" value={<Delta v={pos.totalReturnPct} />} sub={<EurDelta v={pos.unrealizedPnlEur} />} />
        <Stat label="Gewicht im Depot" value={pos.assetClass === "crypto" ? "separat" : fmtPct(pos.weightPct, 1, false)} sub={p.summary.weightBasis === "verified" ? "verifiziert" : "vorläufig"} />
      </section>
      {pos.issues.length > 0 && <p className="label">Datenlage: {pos.issues.join(" | ")}</p>}

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Panel title="Kursverlauf 12 Monate" note={hist.length ? `${hist.length} Handelstage in ${hist[0].currency}` : undefined}>
          {hist.length ? <SeriesChart data={hist.map((x) => ({ date: x.date, value: x.close }))} unit={hist[0].currency} /> : <Empty title="Keine Kurshistorie">Kurs-Provider konfigurieren und aktualisieren.</Empty>}
        </Panel>
        <Panel title="Position bearbeiten" note="Leere Felder bleiben leer und werden als fehlend markiert.">
          <ActionForm action={updateHolding} submitLabel="Speichern">
            <input type="hidden" name="holdingId" value={h.id} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stückzahl"><input name="quantity" inputMode="decimal" defaultValue={h.quantity ?? ""} /></Field>
              <Field label="Einstandswert EUR"><input name="costBasisEur" inputMode="decimal" defaultValue={h.costBasisEur ?? ""} /></Field>
              <Field label="Screenshot-Wert EUR"><input name="importedValueEur" inputMode="decimal" defaultValue={h.importedValueEur ?? ""} /></Field>
              <Field label="Screenshot-Perf. %"><input name="importedPerfPct" inputMode="decimal" defaultValue={h.importedPerfPct ?? ""} /></Field>
              <Field label="Symbol"><input name="symbol" defaultValue={i.symbol} /></Field>
              <Field label="Börse"><input name="exchange" defaultValue={i.exchange} /></Field>
              <Field label="Name"><input name="name" defaultValue={i.name} /></Field>
              <Field label="ISIN"><input name="isin" defaultValue={i.isin ?? ""} /></Field>
              <Field label="EODHD-Symbol"><input name="eodhd" defaultValue={i.providerSymbols.eodhd ?? ""} /></Field>
              <Field label="Finnhub-Symbol"><input name="finnhub" defaultValue={i.providerSymbols.finnhub ?? ""} /></Field>
            </div>
            <label className="mt-3 flex items-center gap-2 text-[13px]"><input type="checkbox" name="isinVerified" defaultChecked={i.isinVerified} /> ISIN und Anteilsklasse im Depot geprüft</label>
            <Field label="Notiz"><textarea name="notes" rows={2} defaultValue={h.notes ?? ""} /></Field>
          </ActionForm>
          {cc.implied != null && <p className="label mt-3">Plausibilisierung: Screenshot impliziert einen Einstand von {fmtEur(cc.implied)}{cc.deviationPct != null ? `, erfasster Einstand weicht um ${fmtPct(cc.deviationPct, 1)} ab` : ""}. Wird nie automatisch übernommen.</p>}
          <div className="mt-3"><ActionButton action={deactivateHolding} fields={{ holdingId: h.id }} label="Position ausblenden" /></div>
        </Panel>
      </div>

      {i.assetClass === "etf" && (
        <Panel title="ETF-Holdings" note={cons.length ? `${cons.length} Konstituenten | Stand ${fmtDate(cons[0].asOf)} | ${cons[0].source}` : "Holdings-CSV des Emittenten importieren (z. B. iShares: Produktseite, Bestände, Download). Ermöglicht echte Overlap- und Durchschau-Analyse."}>
          {cons.length > 0 && (
            <table className="data-table mb-4"><thead><tr><th>Titel</th><th>Sektor</th><th className="text-right">Gewicht</th></tr></thead>
              <tbody>{[...cons].sort((x, y) => y.weightPct - x.weightPct).slice(0, 10).map((c) => <tr key={c.id}><td>{c.constituentName}</td><td>{c.sector ?? "–"}</td><td className="num text-right">{fmtPct(c.weightPct, 2, false)}</td></tr>)}</tbody></table>
          )}
          <ActionForm action={importConstituentsCsv} submitLabel="Holdings importieren" quiet>
            <input type="hidden" name="etfInstrumentId" value={i.id} />
            <input type="file" name="file" accept=".csv,text/csv" required />
          </ActionForm>
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Meldungen (30 Tage)">
          {news.length ? (
            <ul className="divide-y divide-line">{news.map((n) => (
              <li key={n.id} className="py-2">
                <div className="flex flex-wrap items-center gap-1.5">{n.best && <ImpactBadge impact={n.best.impact} />}<span className="label">{n.publisher} | {fmtDateTime(n.publishedAt)}</span>{n.duplicateOf && <Badge>Wiederholung</Badge>}</div>
                <SourceLink href={n.url}>{n.headline}</SourceLink>
              </li>))}</ul>
          ) : <Empty title="Keine Meldungen zugeordnet" />}
        </Panel>
        <Panel title="Termine">
          {events.length ? <ul className="space-y-2">{events.map((e) => <li key={e.id} className="flex flex-wrap items-center gap-2 text-[13px]"><span className="num text-muted">{e.allDay ? fmtDate(e.startsAt) : fmtDateTime(e.startsAt)}</span><span>{e.title}</span><EventStatusBadge status={e.status} />{e.sourceUrl && <SourceLink href={e.sourceUrl}>Quelle</SourceLink>}</li>)}</ul> : <Empty title="Keine Termine erfasst" />}
        </Panel>
      </div>

      {i.assetClass === "equity" && <><h2 className="pt-2">Fundamentalanalyse</h2><ResearchBlock db={db} userId={userId} instrument={i} demo={p.demo} /></>}
      <p className="label">Stückzahl {fmtNum(h.quantity, 4)} | zuletzt geändert {fmtDateTime(h.updatedAt)} | Import {h.importedSource ?? "–"} {h.importedAt ? `am ${fmtDate(h.importedAt)}` : ""}</p>
    </div>
  );
}
