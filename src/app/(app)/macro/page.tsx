import { requireUser } from "@/server/session";
import { latestReport, loadMacro, loadMarketQuotes, loadSettings } from "@/server/data";
import { Badge, Delta, Empty, KindBadge, PageHeader, Panel } from "@/components/ui";
import { SortTable, type Row } from "@/components/SortTable";
import { SeriesChart } from "@/components/Charts";
import { fmtDate, fmtNum } from "@/lib/format";
import { addDays } from "@/lib/time";
import { INDEX_QUOTES } from "@/db/seed-data";
import type { DailyReport } from "@/ai/schemas";

export const dynamic = "force-dynamic";

type Pt = { date: string; value: number };
function changeOver(obs: Pt[], days: number): number | null {
  if (obs.length < 2) return null;
  const last = obs[obs.length - 1];
  const target = addDays(last.date, -days);
  const ref = [...obs].reverse().find((o) => o.date <= target);
  return ref && ref.value ? ((last.value - ref.value) / Math.abs(ref.value)) * 100 : null;
}
function diffPts(obs: Pt[], days: number): number | null {
  if (obs.length < 2) return null;
  const last = obs[obs.length - 1];
  const ref = [...obs].reverse().find((o) => o.date <= addDays(last.date, -days));
  return ref ? last.value - ref.value : null;
}

export default async function MacroPage() {
  const { db, userId } = await requireUser();
  const settings = await loadSettings(db, userId);
  const macro = await loadMacro(db);
  const quotes = await loadMarketQuotes(db, settings.demoMode);
  const rep = await latestReport(db, userId);
  const report = (rep?.content as { report?: DailyReport } | undefined)?.report;

  type Ind = { code: string; name: string; unit: string; category: string; provider: string; obs: Pt[]; isRate: boolean };
  const inds: Ind[] = [
    ...INDEX_QUOTES.map((ix) => ({ code: ix.code, name: ix.name, unit: ix.code === "GOLD" ? "USD/oz" : "Punkte", category: ix.code === "GOLD" ? "Rohstoffe" : "Aktienindizes", provider: quotes.get(ix.code)?.[0]?.provider ?? "eodhd", obs: (quotes.get(ix.code) ?? []).map((q) => ({ date: q.quoteDate, value: q.value })), isRate: false })),
    ...macro.map((m) => ({ code: m.code, name: m.name, unit: m.unit, category: m.category, provider: m.provider, obs: m.observations.map((o) => ({ date: o.date, value: o.value })), isRate: m.unit === "%" })),
  ];
  // US-CPI als Vorjahresrate ausweisen statt als Indexniveau
  const cpi = inds.find((x) => x.code === "US_CPI");
  if (cpi && cpi.obs.length > 13) {
    cpi.obs = cpi.obs.slice(12).map((o, k) => ({ date: o.date, value: ((o.value / cpi.obs[k].value) - 1) * 100 }));
    cpi.name = "US-Verbraucherpreise, Veränderung ggü. Vorjahr"; cpi.unit = "%"; cpi.isRate = true;
  }

  const rows: Row[] = inds.map((x) => {
    const l = x.obs[x.obs.length - 1];
    const d1 = x.isRate ? diffPts(x.obs, 1) : changeOver(x.obs, 1);
    const w1 = x.isRate ? diffPts(x.obs, 7) : changeOver(x.obs, 7);
    const fmtCh = (v: number | null) => (x.isRate ? (v == null ? "–" : <span className="num">{v > 0 ? "+" : ""}{fmtNum(v * 100, 0)} Bp.</span>) : <Delta v={v} />);
    return {
      id: x.code, search: `${x.name} ${x.category}`,
      cells: {
        name: { display: <div><div className="font-medium">{x.name}</div><div className="label">{x.category}</div></div>, sort: x.name },
        value: { display: <span className="num font-medium">{l ? `${fmtNum(l.value, x.unit === "Punkte" ? 0 : 2)} ${x.unit === "Punkte" ? "" : x.unit}` : "–"}</span>, sort: l?.value ?? null },
        d1: { display: fmtCh(d1), sort: d1 },
        w1: { display: fmtCh(w1), sort: w1 },
        date: { display: <span className="num">{l ? fmtDate(l.date) : "–"}</span>, sort: l?.date ?? null },
        src: { display: <Badge>{x.provider.toUpperCase()}</Badge>, sort: x.provider },
      },
    };
  });

  const charts = ["SPX", "NDX", "DAX", "UST10Y", "EA_10Y_AAA", "EURUSD", "US_HY_OAS", "BRENT"].map((c) => inds.find((x) => x.code === c)).filter((x): x is Ind => !!x && x.obs.length > 1);

  return (
    <div className="space-y-6">
      <PageHeader title="Makro & Märkte" lead="Offizielle Quellen (FRED, EZB) und Tagesschlusskurse. Nasdaq ist als Nasdaq-100 ausgewiesen. Veränderungen beziehen sich auf den letzten verfügbaren Datenpunkt, nicht auf heute." />
      <Panel title="Indikatoren" note="Zinsen und Spreads in Basispunkten, Indizes und Preise in Prozent. Monatswerte zeigen die Veränderung zum Vorwert im Zeitraum.">
        <SortTable initialSort="name" initialDir="asc" rows={rows} filterPlaceholder="Indikator suchen" columns={[
          { key: "name", label: "Indikator" }, { key: "value", label: "Letzter Wert", align: "right" }, { key: "d1", label: "1 Tag", align: "right" },
          { key: "w1", label: "1 Woche", align: "right" }, { key: "date", label: "Datum", align: "right" }, { key: "src", label: "Quelle" },
        ]} empty="Noch keine Makrodaten. FRED_API_KEY setzen; EZB-Daten laufen ohne Key." />
      </Panel>

      <Panel title="Einordnung" note={rep ? `Aus dem Report vom ${fmtDate(rep.reportDate)} (${rep.generator === "rules-v1" ? "regelbasiert" : rep.generator})` : undefined}>
        {report ? (
          <dl className="grid gap-4 md:grid-cols-2">
            {[["Was hat sich verändert?", report.macro.whatChanged], ["Warum?", report.macro.why], ["Folgen für Aktien", report.macro.equityImplications], ["Am stärksten betroffene Positionen", report.macro.mostExposedHoldings.join(", ") || "–"], ["Termine, die das Bild ändern können", report.macro.upcomingCatalysts]].map(([q, a]) => (
              <div key={q}><dt className="font-medium">{q}</dt><dd className="mt-0.5 max-w-[75ch] text-ink-2">{a}</dd></div>
            ))}
            {report.marketSummary.length > 0 && <div className="md:col-span-2"><dt className="font-medium">Marktlage</dt><dd><ul className="mt-1 space-y-1">{report.marketSummary.map((m, i) => <li key={i}><KindBadge kind={m.kind} /> {m.text}</li>)}</ul></dd></div>}
          </dl>
        ) : <Empty title="Noch keine Einordnung" />}
      </Panel>

      {charts.length ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {charts.map((c) => <Panel key={c.code} title={c.name} note={`${c.provider.toUpperCase()} | Stand ${fmtDate(c.obs[c.obs.length - 1].date)}`}><SeriesChart data={c.obs.slice(-260)} unit={c.unit === "Punkte" ? undefined : c.unit} height={180} /></Panel>)}
        </div>
      ) : null}
    </div>
  );
}
