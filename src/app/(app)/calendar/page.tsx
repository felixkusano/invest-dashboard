import { requireUser } from "@/server/session";
import { loadEvents, loadHoldingRows } from "@/server/data";
import { Badge, Empty, EventStatusBadge, PageHeader, Panel, SourceLink } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { addDays, berlinDate, berlinParts } from "@/lib/time";

export const dynamic = "force-dynamic";

const TYPE: Record<string, string> = { earnings: "Ergebnisse", central_bank: "Notenbank", inflation: "Inflation", employment: "Arbeitsmarkt", indicator: "Konjunktur", corporate: "Unternehmen", regulatory: "Regulierung", dividend: "Dividende" };
const IMPACT: Record<string, { up: string; down: string }> = {
  central_bank: { up: "Lockerer als erwartet: Rückenwind für zinssensitive Titel und Wachstumswerte.", down: "Restriktiver als erwartet: Druck auf Bewertungen, Immobilien und lange Duration." },
  inflation: { up: "Niedriger als erwartet: Zinssenkungserwartungen steigen.", down: "Höher als erwartet: steigende Renditen belasten zinssensitive Positionen." },
  earnings: { up: "Umsatz, Marge oder Ausblick über Erwartung.", down: "Ausblick unter Erwartung; bei hoher Bewertung überproportionale Kursreaktion möglich." },
};

export default async function CalendarPage() {
  const { db, userId } = await requireUser();
  const now = new Date();
  const events = await loadEvents(db, new Date(now.getTime() - 6 * 3600e3), new Date(now.getTime() + 7 * 86400e3));
  const holdings = new Set((await loadHoldingRows(db, userId)).map((r) => r.i.id));
  const today = berlinDate(now);
  const days = Array.from({ length: 8 }, (_, k) => addDays(today, k));
  const timeOf = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(d);

  return (
    <div className="space-y-6">
      <PageHeader title="Kalender" lead="Die nächsten sieben Tage. Uhrzeiten in Berliner Zeit. Bestätigt heißt: Primärquelle (Notenbank, Unternehmen, Statistikamt). Geschätzt oder unbestätigt heißt: Provider- oder Sekundärangabe." />
      {events.length === 0 && <Empty title="Keine Termine im Zeitraum">Earnings-Termine kommen über Finnhub (FINNHUB_API_KEY). Verifizierte Notenbank- und Statistiktermine sind vorbelegt.</Empty>}
      <div className="space-y-4">
        {days.map((d) => {
          const evs = events.filter((x) => berlinDate(x.e.startsAt) === d);
          if (!evs.length) return null;
          const wd = new Intl.DateTimeFormat("de-DE", { weekday: "long", timeZone: "Europe/Berlin" }).format(new Date(d + "T12:00:00Z"));
          return (
            <Panel key={d} title={`${wd}, ${fmtDate(d)}`}>
              <ul className="divide-y divide-line">
                {evs.map(({ e, symbol }) => (
                  <li key={e.id} className="grid gap-2 py-2.5 md:grid-cols-[5rem_1fr_18rem]">
                    <span className="num text-muted">{e.allDay ? "ganztägig" : timeOf(e.startsAt)}</span>
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5"><span className="font-medium">{e.title}</span><Badge>{TYPE[e.eventType] ?? e.eventType}</Badge>{symbol && <Badge tone={e.instrumentId && holdings.has(e.instrumentId) ? "sky" : "neutral"}>{symbol}{e.instrumentId && holdings.has(e.instrumentId) ? " im Depot" : ""}</Badge>}<EventStatusBadge status={e.status} />{e.importance >= 3 && <Badge tone="warn">hohe Bedeutung</Badge>}</div>
                      {e.consensus ? <p className="mt-0.5 text-[13px]">Konsens: {e.consensus}</p> : <p className="label mt-0.5">Keine lizenzierte Konsensschätzung verfügbar.</p>}
                      {IMPACT[e.eventType] && <p className="mt-0.5 text-[13px] text-ink-2"><span className="text-pos">Positive Überraschung:</span> {IMPACT[e.eventType].up} <span className="text-neg">Negative Überraschung:</span> {IMPACT[e.eventType].down}</p>}
                    </div>
                    <span className="text-[13px]">{e.sourceUrl ? <SourceLink href={e.sourceUrl}>{e.source}</SourceLink> : e.source}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          );
        })}
      </div>
      <p className="label">Stand {berlinParts(now).date}. Zinsszenarien beschreiben die übliche Richtung der Reaktion und sind keine Prognose.</p>
    </div>
  );
}
