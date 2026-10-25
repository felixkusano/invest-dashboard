import Link from "next/link";
import { requireUser } from "@/server/session";
import { computeAnalytics } from "@/server/analytics";
import { latestPrices } from "@/server/data";
import { Badge, Empty, PageHeader, Panel } from "@/components/ui";
import { SortTable, type Row } from "@/components/SortTable";
import { ActionButton, ActionForm, Field } from "@/components/ActionForm";
import { addCandidate, setCandidateStatus } from "@/server/actions";
import { fmtDate, fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { themeLabel } from "@/domain/allocation";
import { strongestWeakest } from "@/server/analytics";
import { mechanicalScenarios } from "@/domain/scenarios";

export const dynamic = "force-dynamic";

const CONF: Record<string, [string, "sky" | "neutral" | "warn" | "neg"]> = { high: ["hoch", "sky"], medium: ["mittel", "neutral"], low: ["gering", "warn"], insufficient: ["unzureichend", "neg"] };

export default async function Opportunities() {
  const { db, userId } = await requireUser();
  const a = await computeAnalytics(db, userId);
  const ids = a.candRows.map((c) => c.i.id);
  const prices = await latestPrices(db, ids, a.demo);
  const excluded = new Map(a.allocation.excluded.map((e) => [e.symbol, e.reason]));

  const scored = a.candRows.map((c) => ({ c, sc: a.scores.get(c.i.id), f: a.funds.get(c.i.id), price: prices.get(c.i.id) }));
  const ranked = scored.filter((x) => x.sc?.total != null && x.sc.confidence !== "insufficient").sort((x, y) => y.sc!.total! - x.sc!.total!);
  const top5 = ranked.slice(0, 5);

  const rows: Row[] = scored.map(({ c, sc, f, price }) => ({
    id: c.c.id, search: `${c.i.name} ${c.i.symbol} ${c.i.sector ?? ""} ${c.i.themes.join(" ")}`,
    cells: {
      name: { display: <div><Link href={`/research/${c.i.id}`} className="font-medium">{c.i.name}</Link><div className="label">{c.i.symbol} | {c.i.exchange}{c.c.status === "watchlist" ? " | Watchlist" : ""}</div></div>, sort: c.i.name },
      sector: { display: <span className="text-[13px]">{c.i.sector ?? "–"}</span>, sort: c.i.sector },
      total: { display: <span className="num font-semibold">{sc?.total != null ? fmtNum(sc.total, 0) : "–"}</span>, sort: sc?.total ?? null },
      q: { display: <span className="num">{fmtNum(sc?.quality, 0)}</span>, sort: sc?.quality ?? null },
      g: { display: <span className="num">{fmtNum(sc?.growth, 0)}</span>, sort: sc?.growth ?? null },
      v: { display: <span className="num">{fmtNum(sc?.valuation, 0)}</span>, sort: sc?.valuation ?? null },
      k: { display: <span className="num">{fmtNum(sc?.catalysts, 0)}</span>, sort: sc?.catalysts ?? null },
      r: { display: <span className="num">{fmtNum(sc?.risk, 0)}</span>, sort: sc?.risk ?? null },
      conf: { display: sc ? <Badge tone={CONF[sc.confidence][1]}>{CONF[sc.confidence][0]}</Badge> : <Badge tone="neg">keine Daten</Badge>, sort: sc ? ["insufficient", "low", "medium", "high"].indexOf(sc.confidence) : -1 },
      pe: { display: <span className="num">{f?.metrics.forwardPe ?? f?.metrics.peTtm ? fmtNum(f?.metrics.forwardPe ?? f?.metrics.peTtm, 1) : "–"}</span>, sort: f?.metrics.forwardPe ?? f?.metrics.peTtm ?? null },
      price: { display: <span className="num">{price ? fmtMoney(price.close, price.currency) : "–"}</span>, sort: price?.close ?? null },
      act: { display: <div className="flex gap-1">{c.c.status !== "watchlist" && <ActionButton action={setCandidateStatus} fields={{ candidateId: c.c.id, status: "watchlist" }} label="Merken" />}<ActionButton action={setCandidateStatus} fields={{ candidateId: c.c.id, status: "dismissed" }} label="Verwerfen" /></div> },
    },
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Investmentchancen" lead={`Scanner über ${a.candRows.length} Titel außerhalb des Depots. 100-Punkte-Score: Qualität 25 | Wachstum 20 | Bewertung 25 | Katalysatoren 15 | Risiko 15. Kein Score ohne Daten.`} />

      {top5.length ? (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {top5.map(({ c, sc, f, price }, idx) => {
            const sw = strongestWeakest(sc as unknown as Record<string, number | null>);
            const m = f?.metrics ?? {};
            const scen = mechanicalScenarios(m.epsGrowth3y ?? m.epsGrowthYoy, m.forwardPe ?? m.peTtm);
            const earnings = a.events.find((e) => e.e.instrumentId === c.i.id);
            const ex = excluded.get(c.i.symbol);
            return (
              <section key={c.i.id} className="panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><span className="label">Rang {idx + 1}</span><h2><Link href={`/research/${c.i.id}`}>{c.i.name}</Link></h2><div className="label">{c.i.symbol} | {c.i.exchange} | {price ? `${fmtMoney(price.close, price.currency)} am ${fmtDate(price.priceDate)}` : "kein Kurs"}</div></div>
                  <div className="text-right"><div className="num text-3xl font-semibold leading-none">{fmtNum(sc!.total, 0)}</div><Badge tone={CONF[sc!.confidence][1]}>Vertrauen {CONF[sc!.confidence][0]}</Badge></div>
                </div>
                <dl className="mt-3 space-y-1.5 text-[13px]">
                  <div><dt className="inline font-medium">These: </dt><dd className="inline">Stärken bei {sw.strongest.join(" und ")}. {c.i.themes.length ? `Exposure zu ${c.i.themes.map(themeLabel).join(", ")}.` : ""}</dd></div>
                  <div><dt className="inline font-medium">Bewertung: </dt><dd className="inline num">KGV {fmtNum(m.forwardPe ?? m.peTtm, 1)} | EV/EBITDA {fmtNum(m.evEbitda, 1)} | FCF-Rendite {fmtPct(m.fcfYield, 1)} | Marktkap. {m.marketCapUsdM ? `${fmtNum(m.marketCapUsdM / 1000, 1)} Mrd. USD` : "–"}</dd></div>
                  <div><dt className="inline font-medium">Katalysator: </dt><dd className="inline">{earnings ? `${earnings.e.title} am ${fmtDate(earnings.e.startsAt)}` : "Kein Termin in den nächsten 7 Tagen erfasst"}</dd></div>
                  <div><dt className="inline font-medium">Abwärtsrisiko: </dt><dd className="inline">{scen ? `Mechanisches Bear-Szenario ${fmtPct(scen[2].priceChangePct, 0)} (${scen[2].assumption})` : "nicht berechenbar"}. Schwächste Komponente: {sw.weakest ?? "–"}.</dd></div>
                  <div><dt className="inline font-medium">Horizont: </dt><dd className="inline">{(sc!.catalysts ?? 0) / 15 > 0.6 ? "3 bis 12 Monate, katalysatorgetrieben" : "mehrjährig"}</dd></div>
                  <div><dt className="inline font-medium">These ungültig, wenn: </dt><dd className="inline">Umsatzwachstum unter 0 % fällt oder die operative Marge um mehr als 5 Prozentpunkte sinkt (Score-Annahme).</dd></div>
                  {ex && <div className="text-warn"><dt className="inline font-medium">Für Allokation gesperrt: </dt><dd className="inline">{ex}</dd></div>}
                </dl>
                <p className="label mt-3">Kennzahlen {f?.provider === "demo" ? "DEMO" : f?.provider} vom {fmtDate(f?.asOf)}. Primärquellen auf der Researchseite.</p>
              </section>
            );
          })}
        </div>
      ) : <Empty title="Keine bewerteten Kandidaten">Für Scores werden Fundamentaldaten benötigt: FINNHUB_API_KEY (US-Titel kostenlos) oder EODHD_FUNDAMENTALS=true mit passendem Plan. Europäische Titel im Universum werden mit Finnhub Free nicht bewertet.</Empty>}

      <Panel title="Universum und Watchlist" note="Sortierbar. Verworfene Titel werden nicht mehr aktualisiert.">
        <SortTable initialSort="total" rows={rows} filterPlaceholder="Titel, Sektor oder Thema" columns={[
          { key: "name", label: "Titel" }, { key: "sector", label: "Sektor" }, { key: "total", label: "Score", align: "right" },
          { key: "q", label: "Qual.", align: "right" }, { key: "g", label: "Wachst.", align: "right" }, { key: "v", label: "Bew.", align: "right" },
          { key: "k", label: "Kat.", align: "right" }, { key: "r", label: "Risiko", align: "right" }, { key: "conf", label: "Vertrauen" },
          { key: "pe", label: "KGV", align: "right" }, { key: "price", label: "Kurs", align: "right" }, { key: "act", label: "" },
        ]} />
      </Panel>

      <Panel title="Titel manuell hinzufügen">
        <ActionForm action={addCandidate} submitLabel="Zur Watchlist">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Symbol"><input name="symbol" required /></Field>
            <Field label="Börse"><input name="exchange" required placeholder="NASDAQ, XETRA, …" /></Field>
            <Field label="Name"><input name="name" required /></Field>
            <Field label="Währung"><input name="currency" required defaultValue="USD" maxLength={3} /></Field>
            <Field label="Sektor"><input name="sector" /></Field>
            <Field label="EODHD-Symbol"><input name="eodhd" placeholder="z. B. MSFT.US" /></Field>
            <Field label="Finnhub-Symbol"><input name="finnhub" placeholder="z. B. MSFT" /></Field>
            <Field label="Notiz"><input name="note" /></Field>
          </div>
        </ActionForm>
      </Panel>
    </div>
  );
}
