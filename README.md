# Investment Desk

Persönliches Investment-Intelligence-Dashboard: Portfolio, News, Makro, Scanner, Kapitalallokation, Kalender und tägliche Reports. Next.js 15, TypeScript, Tailwind, Drizzle ORM, PostgreSQL (Supabase) bzw. PGlite lokal.

## Schnellstart lokal

```bash
npm install
cp .env.example .env.local
npm run hash-password -- "ein langes Passwort"   # Ausgabe in ADMIN_PASSWORD_HASH eintragen
openssl rand -base64 48                          # Ausgabe in SESSION_SECRET eintragen
npm run dev                                      # http://localhost:3000
```

Ohne `DATABASE_URL` legt die App eine lokale PGlite-Datenbank unter `./data/pglite` an, führt die Migrationen aus und importiert beim ersten Login das Startportfolio. Ohne API-Keys laufen nur die keyfreien Quellen (EZB, Frankfurter, EZB- und Fed-RSS). Der Demo-Modus (Einstellungen) erzeugt künstliche, rot markierte Werte zum Ausprobieren.

## Architektur

```
src/
  app/                 Seiten (Server Components) und API-Routen
    (app)/             Übersicht, Portfolio, Risiko, News, Makro, Chancen, Allokation, Kalender, Reports, Einstellungen, Research
    api/refresh        manueller Refresh (Session)
    api/cron/daily     Zeitplan-Endpunkt (CRON_SECRET, Berlin-Zeitfenster)
    api/health         Health-Check ohne personenbezogene Daten
  domain/              reine, getestete Logik: Bewertung, FX, Overlap, Scoring, Allokation, Risiko, News, CSV, Szenarien
  providers/           austauschbare Datenquellen hinter Interfaces (EODHD, Finnhub, FRED, EZB, Frankfurter, RSS, Demo)
  pipeline/run.ts      tägliche Pipeline, Schritt für Schritt isoliert
  ai/                  Claude-Analyse mit JSON-Schema, Validierung, regelbasierter Fallback
  server/              Lesemodelle, Analytik, Server Actions, Benachrichtigungen, Session
  db/                  Schema, Client, Seed-Daten
drizzle/               SQL-Migrationen (inkl. Row Level Security für Supabase)
tests/                 Vitest (Unit- und Integrationstests gegen PGlite)
```

Trennung: UI liest nur Lesemodelle, Provider liefern Rohdaten mit Herkunft und Zeitstempel, die Domain-Logik rechnet, die KI kommentiert. KI-Aussagen tragen einen Aussagetyp (Fakt, Markterwartung, Einschätzung, Prognose) und werden gegen die Eingangsdaten geprüft.

## Datenquellen (Stand Oktober 2026 geprüft)

| Quelle | Rolle | Key | Hinweis |
|---|---|---|---|
| EODHD | Kurse primär, Indizes DAX/Euro Stoxx 50/Gold, optional Fundamentaldaten und News | `EODHD_API_KEY` | Einziger geprüfter Anbieter, der US, XETRA, Oslo und UCITS-ETFs in einem Personal-Plan abdeckt (EOD All-World, ca. 20 USD/Monat). Datentyp Tagesschluss. Sandbox: 20 Calls/Tag, reicht nicht für das ganze Universum. |
| Finnhub | US-Kurse (Fallback, Echtzeit), Unternehmensnews, Kennzahlen, Earnings-Kalender | `FINNHUB_API_KEY` | Free Tier nur US-Titel. Vonovia, Infineon, Nel und die ETFs brauchen EODHD. |
| FRED | US-Inflation, Arbeitsmarkt, BIP, Renditen, HY-Spread, VIX, Brent, Henry Hub, S&P 500, Nasdaq-100 | `FRED_API_KEY` (kostenlos) | |
| EZB Data Portal | HICP Euroraum, Einlagesatz, AAA-Rendite 10J, Referenzwechselkurse | keiner | |
| Frankfurter | FX-Fallback (EZB-Referenzkurse) | keiner | |
| EZB/Fed RSS | offizielle Notenbank-Meldungen | keiner | |
| Anthropic | KI-Briefing und News-Einordnung | `ANTHROPIC_API_KEY` | ohne Key regelbasierter Report |

Twelve Data (Free nur US) und Financial Modeling Prep (internationale Börsen erst im Ultimate-Plan) wurden geprüft und verworfen. Kurse werden nie als Echtzeit ausgewiesen, wenn sie Tagesschlusskurse sind.

## Kostenloser Betrieb

Mit `EODHD_PLAN=free` (Standard) laufen US-Titel über Finnhub Free und nur europäische Titel, ETFs und Indizes über den kostenlosen EODHD-Key. Ein Tagesbudget (Standard 18 von 20 Calls) wird eingehalten, bereits heute geladene Kurse werden bei weiteren Refreshes nicht erneut abgerufen. Einschränkungen: für US-Titel kein Kursverlauf (Finnhub Free liefert nur die aktuelle Quote), Fundamentaldaten und Scores nur für US-Titel, kein KI-Briefing ohne Anthropic-Key (regelbasierter Report).

## Produktion (Vercel + Supabase)

1. Supabase-Projekt anlegen, Connection String des Transaction Poolers (Port 6543) als `DATABASE_URL` verwenden.
2. Repository in Vercel importieren und `DATABASE_URL`, `ADMIN_EMAIL` sowie die Provider-Keys setzen. Deploy.
3. `https://<deine-app>.vercel.app/setup` öffnen, Passwort wählen und die erzeugten Werte `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `CRON_SECRET` in Vercel eintragen. Danach neu deployen. Die Seite deaktiviert sich, sobald die Anmeldung eingerichtet ist.
4. Anmelden. Migrationen laufen beim ersten Datenbankzugriff automatisch, das Startportfolio wird angelegt. Erstlauf über „Jetzt aktualisieren“.

## Täglicher Zeitplan

Ziel: 06:30 Datenabruf, Briefing im selben Lauf, Verfügbarkeit vor 07:00 (Europe/Berlin). Da Scheduler in UTC laufen, gibt es zwei Aufrufe (04:30 und 05:30 UTC); `/api/cron/daily` führt nur den aus, der in Berlin 06:30 entspricht. Damit ist die Sommerzeit korrekt abgebildet.

- **Vercel Pro**: `vercel.json` enthält beide Cron-Einträge, Vercel sendet `Authorization: Bearer <CRON_SECRET>` automatisch.
- **Vercel Hobby**: Cron-Ausführung ist dort nur auf die Stunde genau garantiert. Stattdessen `.github/workflows/daily-refresh.yml` nutzen, Secrets `APP_URL` und `CRON_SECRET` im Repository anlegen. GitHub startet geplante Jobs unter Last teils mit einigen Minuten Verzögerung.
- Einzelne Pipeline-Läufe dauern je nach Universum und Rate-Limits 1 bis 5 Minuten (`maxDuration` 300 s).

## Tests

```bash
npm test        # 82 Tests
npm run typecheck
npm run build
```

Abgedeckt: Marktwert, FX, Tagesrendite, Performance seit Kauf, Gewichte, Duplikate, fehlende Kurse nie als 0, ETF-Overlap und Durchschau, Allokationssumme für beliebige Budgets, Cluster-Limits, Sparpläne, Scoring ohne Daten, Szenarien, Berlin-Zeitfenster inkl. Zeitumstellung, Handelstage, Datenstatus, News-Dubletten, CSV-Import, Provider-Parser, Retry/Timeout, KI-Validierung, Auth, Datenisolation, Pipeline mit Fehlerfall (letzter Report bleibt erhalten), Lock gegen Doppelausführung, Trennung von Demo- und Echtdaten.

## Bekannte Grenzen

- Analystenschätzungen, Revisionen und historische Bewertungsbandbreiten benötigen lizenzierte Daten und werden ohne diese nicht angezeigt.
- ETF-Overlap ist ohne importierte Holdings-Dateien nur qualitativ.
- Themencluster beruhen auf der Einzeltitel-Zuordnung; ETF-Durchschau fließt erst mit Holdings-Import ein.
- Feiertagskalender 2026/2027 ist statisch gepflegt.
- Benachrichtigungen per E-Mail erfordern Resend; Webhooks funktionieren ohne weitere Konfiguration.
