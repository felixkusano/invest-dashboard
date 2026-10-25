import Link from "next/link";
import { requireUser } from "@/server/session";
import { loadNews, loadSettings } from "@/server/data";
import { Badge, Empty, ImpactBadge, PageHeader, Panel, SourceLink } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import clsx from "clsx";

export const dynamic = "force-dynamic";

const CAT: Record<string, string> = { company: "Unternehmen", sector: "Sektor", macro: "Makro", central_bank: "Notenbank", earnings: "Ergebnisse", regulatory: "Regulierung", geopolitical: "Geopolitik", commentary: "Kommentar/Spekulation" };
const IMPACTS = [["", "Alle"], ["positive", "Positiv"], ["negative", "Negativ"], ["mixed", "Gemischt"], ["unclear", "Unklar"]];
const EV: Record<string, string> = { high: "hoch", medium: "mittel", low: "gering" };
const TE: Record<string, string> = { temporary: "eher temporär", potentially_thesis_changing: "kann These verändern", unclear: "unklar" };

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ impact?: string; cat?: string; scope?: string; q?: string }> }) {
  const sp = await searchParams;
  const { db, userId } = await requireUser();
  const settings = await loadSettings(db, userId);
  let items = await loadNews(db, { sinceDays: 7, demo: settings.demoMode, limit: 300 });
  const total = items.length;
  if (sp.scope !== "all") items = items.filter((n) => n.symbols.length || ["central_bank", "macro", "earnings"].includes(n.category));
  if (sp.impact) items = items.filter((n) => n.best?.impact === sp.impact);
  if (sp.cat) items = items.filter((n) => n.category === sp.cat);
  if (sp.q) items = items.filter((n) => `${n.headline} ${n.summary ?? ""} ${n.symbols.join(" ")}`.toLowerCase().includes(sp.q!.toLowerCase()));
  items.sort((a, b) => (b.duplicateOf ? -1 : 0) - (a.duplicateOf ? -1 : 0) || (b.best?.relevance ?? 0) - (a.best?.relevance ?? 0) || b.publishedAt.getTime() - a.publishedAt.getTime());
  const link = (k: string, v: string) => { const q = new URLSearchParams({ ...(sp as Record<string, string>), [k]: v }); if (!v) q.delete(k); return `/news?${q}`; };

  return (
    <div className="space-y-6">
      <PageHeader title="News Intelligence" lead="Portfoliobezogene Meldungen der letzten 7 Tage, sortiert nach Relevanz. KI-Einschätzungen sind analytische Urteile, keine gemessenen Marktfakten." />
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        {IMPACTS.map(([v, l]) => <Link key={v} href={link("impact", v)} className={clsx("rounded px-2.5 py-1 ring-1 ring-line hover:no-underline", (sp.impact ?? "") === v ? "bg-ink text-white" : "bg-white text-ink")}>{l}</Link>)}
        <span className="mx-2 h-4 w-px bg-line" />
        <Link href={link("scope", sp.scope === "all" ? "" : "all")} className="rounded bg-white px-2.5 py-1 ring-1 ring-line">{sp.scope === "all" ? "Nur portfoliorelevant" : `Alle ${total} anzeigen`}</Link>
        <form className="ml-auto" action="/news">{Object.entries(sp).filter(([k]) => k !== "q").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}<input type="search" name="q" defaultValue={sp.q} placeholder="Suchen" aria-label="News durchsuchen" /></form>
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs">{Object.entries(CAT).map(([k, l]) => <Link key={k} href={link("cat", sp.cat === k ? "" : k)} className={clsx("rounded px-2 py-0.5 hover:no-underline", sp.cat === k ? "bg-sky text-white" : "bg-sky-soft text-sky-deep")}>{l}</Link>)}</div>

      <Panel title={`${items.length} Meldungen`}>
        {items.length ? (
          <ul className="divide-y divide-line">
            {items.map((n) => {
              const b = n.best;
              return (
                <li key={n.id} className={clsx("py-3 first:pt-0", n.duplicateOf && "opacity-60")}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="num w-8 text-sm font-semibold" title="Relevanz 0 bis 100">{b?.relevance ?? "–"}</span>
                    <ImpactBadge impact={b?.impact} />
                    <Badge>{CAT[n.category] ?? n.category}</Badge>
                    {n.symbols.map((s) => <Badge key={s} tone="sky">{s}</Badge>)}
                    {n.duplicateOf && <Badge>Wiederholung ohne neue Information</Badge>}
                    <Badge tone={n.ai ? "neutral" : "warn"} title={n.ai ? `Einschätzung durch ${n.ai.generatedBy}` : "Heuristik aus Quelle, Kategorie, Betroffenheit und Signalwörtern"}>{n.ai ? "KI-Einschätzung" : "Heuristik"}</Badge>
                  </div>
                  <div className="mt-1 max-w-[95ch]">
                    <SourceLink href={n.url}><span className="font-medium">{n.headline}</span></SourceLink>
                    <div className="label">{n.publisher} | veröffentlicht {fmtDateTime(n.publishedAt)} | abgerufen {fmtDateTime(n.retrievedAt)} | Quelle {n.provider}</div>
                    {n.summary && <p className="mt-1 text-[13px] text-ink-2">{n.summary}</p>}
                    {n.ai && (
                      <dl className="mt-2 grid gap-x-6 gap-y-1 text-[13px] md:grid-cols-2">
                        <div><dt className="label">Warum relevant</dt><dd>{n.ai.whyItMatters}</dd></div>
                        <div><dt className="label">Als Nächstes beobachten</dt><dd>{n.ai.monitorNext}</dd></div>
                        <div><dt className="label">Fundamentale Wirkung</dt><dd>{n.ai.fundamentalImpact}</dd></div>
                        <div><dt className="label">Kurzfristige Marktwirkung</dt><dd>{n.ai.marketImpact}</dd></div>
                        <div><dt className="label">Horizont | These</dt><dd>{n.ai.horizon} | {TE[n.ai.thesisEffect ?? "unclear"]}</dd></div>
                        <div><dt className="label">Evidenzqualität</dt><dd>{EV[n.ai.evidenceQuality ?? "low"]}</dd></div>
                      </dl>
                    )}
                    {!n.ai && b && <p className="label mt-1">Evidenzqualität der Quelle: {EV[b.evidenceQuality ?? "low"]}. Fundamentale Einordnung erst mit KI-Analyse.</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <Empty title="Keine Meldungen für diese Auswahl">News-Provider: Finnhub (Unternehmensnews, Free Tier für US-Titel) sowie EZB- und Fed-Pressemitteilungen ohne Key.</Empty>}
      </Panel>
    </div>
  );
}
