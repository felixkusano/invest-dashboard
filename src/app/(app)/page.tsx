import Link from "next/link";
import { requireUser } from "@/server/session";
import { computeAnalytics } from "@/server/analytics";
import { latestReport, loadNews } from "@/server/data";
import { Bars, Badge, Delta, Empty, EurDelta, EventStatusBadge, ImpactBadge, KindBadge, Panel, Severity, SourceLink, Stat } from "@/components/ui";
import { AllocationStrip } from "@/components/AllocationStrip";
import { fmtDate, fmtDateTime, fmtEur, fmtNum, fmtPct } from "@/lib/format";
import type { DailyReport } from "@/ai/schemas";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const { db, userId } = await requireUser();
  const a = await computeAnalytics(db, userId);
  const rep = await latestReport(db, userId);
  const report = (rep?.content as { report?: DailyReport } | undefined)?.report;
  const news = (await loadNews(db, { sinceDays: 3, demo: a.demo, limit: 150 })).filter((n) => !n.duplicateOf && n.best).sort((x, y) => (y.best!.relevance) - (x.best!.relevance)).slice(0, 5);
  const S = a.summary;
  const sec = S.securities;
  const lastPriceDate = S.positions.map((p) => p.price?.priceDate).filter(Boolean).sort().pop();
  const topCands = a.allocCandidates.filter((c) => !c.isHolding && c.total != null).sort((x, y) => y.total! - x.total!).slice(0, 3);
  const settings = a.settings;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1>Briefing {fmtDate(rep?.reportDate ?? a.today)}</h1>
            {rep && <span className="label">Erstellt {fmtDateTime(rep.createdAt)} | {rep.generator === "rules-v1" ? "regelbasiert, ohne KI" : `Modell ${rep.generator}`} | Version {rep.version}</span>}
          </div>
          {report ? (
            <ul className="mt-4 space-y-3">
              {report.executiveSummary.map((st, i) => (
                <li key={i} className="max-w-[78ch] text-[15px] leading-relaxed">
                  <KindBadge kind={st.kind} /> <span className="ml-1">{st.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4"><Empty title="Noch kein Briefing vorhanden">Die erste Aktualisierung startet automatisch um {settings.schedule.refresh} Uhr oder über „Jetzt aktualisieren“. Bis dahin zeigt das Dashboard die importierten Screenshot-Werte als unverifiziert.</Empty></div>
          )}
          {(rep?.content as { warnings?: string[] } | undefined)?.warnings?.length ? (
            <p className="label mt-3">Hinweise zur Erstellung: {(rep!.content as { warnings: string[] }).warnings.join(" | ")}</p>
          ) : null}
        </section>

        <Panel title={`Nächste ${fmtEur(settings.monthlyBudgetEur, { decimals: 0 })}`} note={`Monatsbudget | ${fmtEur(settings.monthlyBudgetEur * 12, { decimals: 0 })} p. a.`} action={<Link href="/allocation" className="text-[13px]">Begründung</Link>}>
          <AllocationStrip lines={a.allocation.lines} total={a.allocation.totalEur} large />
          {a.allocation.warnings.length > 0 && <p className="label mt-3">{a.allocation.warnings[0]}</p>}
        </Panel>
      </div>

      <section className="panel grid grid-cols-2 gap-x-6 gap-y-5 p-4 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Depotwert verifiziert" value={fmtEur(sec.verifiedValueEur)} sub={`${sec.verifiedCount} von ${sec.verifiedCount + sec.importedCount + sec.missingCount} Positionen`} />
        <Stat label="Depotwert vorläufig" value={fmtEur(sec.provisionalValueEur)} sub={sec.importedCount ? `${sec.importedCount} aus Screenshot, ${sec.missingCount} ohne Wert` : "vollständig verifiziert"} />
        <Stat label={`Veränderung letzter Handelstag${lastPriceDate ? ` (${fmtDate(lastPriceDate)})` : ""}`} value={sec.dailyChangeEur != null ? <EurDelta v={sec.dailyChangeEur} /> : "–"} sub={sec.dailyChangePct != null ? <Delta v={sec.dailyChangePct} /> : "nur mit Stückzahlen und Kursen aller verifizierten Positionen"} />
        <Stat label="Performance seit Kauf" value={sec.totalReturnPct != null ? <Delta v={sec.totalReturnPct} /> : "–"} sub={sec.costBasisEur != null ? `Einstand ${fmtEur(sec.costBasisEur, { decimals: 0 })}` : "Einstand nicht für alle verifizierten Positionen bekannt"} />
        <Stat label="Krypto (separat)" value={fmtEur(S.crypto.provisionalValueEur)} sub={S.crypto.verifiedCount ? "verifiziert" : "Screenshot, unverifiziert"} />
        <Stat label="Gesamt erfasst" value={fmtEur(S.combinedProvisionalEur)} sub="Depot plus Krypto, vorläufig" />
      </section>

      {S.missing.length > 0 && (
        <p className="rounded border border-warn/30 bg-warn-soft px-4 py-2.5 text-[13px] text-warn">
          Vorläufiger Gesamtwert. Ohne verifizierten Marktwert: {S.missing.map((m) => m.symbol).join(", ")}. Stückzahlen unter <Link href="/portfolio">Mein Portfolio</Link> ergänzen und Kurs-Provider unter <Link href="/settings">Einstellungen</Link> konfigurieren.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Anlageklassen"><Bars rows={a.exposures.assetClass} /></Panel>
        <Panel title="Sektoren" note="Wertpapierdepot ohne Krypto, ETFs ohne Durchschau"><Bars rows={a.exposures.sector.slice(0, 8)} /></Panel>
        <Panel title="Regionen" note="ETFs als „Global“ geführt"><Bars rows={a.exposures.region} /></Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Relevanteste Meldungen" action={<Link href="/news" className="text-[13px]">Alle News</Link>}>
          {news.length ? (
            <ul className="divide-y divide-line">
              {news.map((n) => (
                <li key={n.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="num text-xs font-semibold text-ink-2">{n.best!.relevance}</span><ImpactBadge impact={n.best!.impact} />
                    {n.symbols.map((s) => <Badge key={s}>{s}</Badge>)}
                    <span className="label">{n.publisher} | {fmtDateTime(n.publishedAt)}</span>
                  </div>
                  <SourceLink href={n.url}>{n.headline}</SourceLink>
                </li>
              ))}
            </ul>
          ) : <Empty title="Keine aktuellen Meldungen">News erscheinen nach der ersten Aktualisierung mit konfiguriertem News-Provider.</Empty>}
        </Panel>
        <Panel title="Nächste 7 Tage" action={<Link href="/calendar" className="text-[13px]">Kalender</Link>}>
          {a.events.length ? (
            <ul className="space-y-2">
              {a.events.slice(0, 7).map(({ e, symbol }) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="num w-40 shrink-0 text-muted">{e.allDay ? fmtDate(e.startsAt) : fmtDateTime(e.startsAt)}</span>
                  <span className="font-medium">{e.title}</span>{symbol && <Badge>{symbol}</Badge>}<EventStatusBadge status={e.status} />
                </li>
              ))}
            </ul>
          ) : <Empty title="Keine Termine in den nächsten 7 Tagen erfasst" />}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Top-Risiken" action={<Link href="/portfolio/risk" className="text-[13px]">Risikomonitor</Link>}>
          <ul className="space-y-3">
            {a.risks.slice(0, 3).map((r) => (
              <li key={r.code}>
                <div className="flex items-center justify-between gap-3"><span className="font-medium">{r.title}</span><Severity n={r.severity} /></div>
                <p className="mt-0.5 text-[13px] text-ink-2">{r.evidence}</p>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Top-Chancen" action={<Link href="/opportunities" className="text-[13px]">Scanner</Link>}>
          {topCands.length ? (
            <ul className="space-y-2.5">
              {topCands.map((c) => (
                <li key={c.instrumentId} className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0"><Link href={`/research/${c.instrumentId}`} className="font-medium">{c.name}</Link> <span className="label">{c.symbol}</span><p className="text-[13px] text-ink-2">{c.thesis}</p></div>
                  <div className="text-right"><div className="num text-lg font-semibold">{fmtNum(c.total, 0)}</div><div className="label">Vertrauen {c.confidence === "high" ? "hoch" : c.confidence === "medium" ? "mittel" : "gering"}</div></div>
                </li>
              ))}
            </ul>
          ) : <Empty title="Noch keine bewerteten Kandidaten">Scores entstehen erst mit Fundamentaldaten (FINNHUB_API_KEY oder EODHD Fundamentals). Ohne Daten wird kein Score vergeben.</Empty>}
        </Panel>
      </div>

      <p className="label">Kursdaten: {a.demo ? "Demo" : (S.positions.find((p) => p.price)?.price?.provider ?? "keine")} | FX: {a.fx.provider ?? "keine"} {a.fx.date ? `vom ${fmtDate(a.fx.date)}` : ""} | Gewichte {S.weightBasis === "verified" ? "auf verifizierter Basis" : "vorläufig (inkl. Screenshot-Werte)"} | Krypto {fmtPct(S.combinedProvisionalEur ? (S.crypto.provisionalValueEur / S.combinedProvisionalEur) * 100 : null, 1, false)} des erfassten Vermögens</p>
    </div>
  );
}
