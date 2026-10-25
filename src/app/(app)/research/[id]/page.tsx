import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/server/session";
import * as s from "@/db/schema";
import { loadNews, loadSettings, latestPrices, priceHistory } from "@/server/data";
import { Badge, Empty, ImpactBadge, PageHeader, Panel, SourceLink, Stat } from "@/components/ui";
import { SeriesChart } from "@/components/Charts";
import { ResearchBlock } from "@/components/Research";
import { fmtDate, fmtDateTime, fmtMoney, fmtNum } from "@/lib/format";
import { addDays, berlinDate } from "@/lib/time";
import { themeLabel } from "@/domain/allocation";
import { latestFundamentals } from "@/server/data";

export const dynamic = "force-dynamic";

export default async function ResearchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, userId } = await requireUser();
  const [i] = await db.select().from(s.instruments).where(eq(s.instruments.id, Number(id)));
  if (!i) notFound();
  const [holding] = await db.select().from(s.holdings).where(and(eq(s.holdings.userId, userId), eq(s.holdings.instrumentId, i.id), eq(s.holdings.active, true)));
  const settings = await loadSettings(db, userId);
  const price = (await latestPrices(db, [i.id], settings.demoMode)).get(i.id);
  const hist = await priceHistory(db, i.id, settings.demoMode, addDays(berlinDate(), -370));
  const news = await loadNews(db, { instrumentId: i.id, sinceDays: 30, demo: settings.demoMode, limit: 20 });
  const f = (await latestFundamentals(db, [i.id], settings.demoMode)).get(i.id);

  return (
    <div className="space-y-6">
      <PageHeader title={i.name} lead={<>{i.symbol} | {i.exchange} | {i.sector ?? "Sektor unbekannt"} {i.themes.map((t) => <Badge key={t}>{themeLabel(t)}</Badge>)}</>}
        right={holding ? <Link className="btn btn-quiet" href={`/portfolio/${holding.id}`}>Zur Depotposition</Link> : <Link className="btn btn-quiet" href="/opportunities">Zum Scanner</Link>} />
      <section className="panel grid grid-cols-2 gap-5 p-4 md:grid-cols-4">
        <Stat label="Kurs" value={price ? fmtMoney(price.close, price.currency) : "–"} sub={price ? `${fmtDate(price.priceDate)} | ${price.provider}` : "kein Kurs"} />
        <Stat label="Marktkapitalisierung" value={f?.metrics.marketCapUsdM != null ? `${fmtNum(f.metrics.marketCapUsdM / 1000, 1)} Mrd. USD` : "–"} sub={f ? `${f.provider}, ${fmtDate(f.asOf)}` : "keine Daten"} />
        <Stat label="Im Depot" value={holding ? "ja" : "nein"} />
        <Stat label="Primärquellen" value={<span className="text-[13px] font-normal">{i.currency === "USD" ? <SourceLink href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=${encodeURIComponent(i.symbol)}&type=10-&dateb=&owner=include&count=40`}>SEC-Filings (10-K/10-Q)</SourceLink> : "Geschäftsberichte über die Investor-Relations-Seite"}</span>} />
      </section>
      <Panel title="Kursverlauf 12 Monate">{hist.length ? <SeriesChart data={hist.map((x) => ({ date: x.date, value: x.close }))} unit={hist[0].currency} /> : <Empty title="Keine Kurshistorie" />}</Panel>
      <ResearchBlock db={db} userId={userId} instrument={i} demo={settings.demoMode} />
      <Panel title="Meldungen (30 Tage)">
        {news.length ? <ul className="divide-y divide-line">{news.map((n) => <li key={n.id} className="py-2"><div className="flex items-center gap-1.5">{n.best && <ImpactBadge impact={n.best.impact} />}<span className="label">{n.publisher} | {fmtDateTime(n.publishedAt)}</span></div><SourceLink href={n.url}>{n.headline}</SourceLink></li>)}</ul> : <Empty title="Keine Meldungen" />}
      </Panel>
    </div>
  );
}
