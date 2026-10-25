/**
 * Startkonfiguration aus dem Build-Prompt und den Screenshot-Beobachtungen.
 * Alle Screenshot-Werte sind als "unverifiziert" markiert und werden nie als aktuelle Kurse verwendet.
 * ETF-Zuordnungen (ISIN/Anteilsklasse) sind plausibelste Kandidaten und als unbestätigt gekennzeichnet.
 */
export type SeedInstrument = {
  key: string; symbol: string; exchange: string; isin: string | null; isinVerified: boolean; name: string;
  assetClass: "equity" | "etf" | "crypto"; currency: string; sector: string | null; country: string | null; region: string | null;
  themes: string[]; providerSymbols: Record<string, string>; aliases: string[]; notes?: string;
};

export const PORTFOLIO_INSTRUMENTS: SeedInstrument[] = [
  { key: "US67066G1040", symbol: "NVDA", exchange: "NASDAQ", isin: "US67066G1040", isinVerified: true, name: "NVIDIA", assetClass: "equity", currency: "USD", sector: "Halbleiter", country: "USA", region: "Nordamerika", themes: ["ai_infrastructure", "semiconductors", "mega_cap_tech"], providerSymbols: { eodhd: "NVDA.US", finnhub: "NVDA" }, aliases: ["Nvidia", "NVIDIA", "Jensen Huang"] },
  { key: "DE000A1ML7J1", symbol: "VNA", exchange: "XETRA", isin: "DE000A1ML7J1", isinVerified: true, name: "Vonovia", assetClass: "equity", currency: "EUR", sector: "Immobilien", country: "Deutschland", region: "Europa", themes: ["real_estate", "rate_sensitive"], providerSymbols: { eodhd: "VNA.XETRA", finnhub: "VNA.DE" }, aliases: ["Vonovia"] },
  { key: "US92840M1027", symbol: "VST", exchange: "NYSE", isin: "US92840M1027", isinVerified: true, name: "Vistra", assetClass: "equity", currency: "USD", sector: "Versorger", country: "USA", region: "Nordamerika", themes: ["power_infrastructure", "ai_infrastructure"], providerSymbols: { eodhd: "VST.US", finnhub: "VST" }, aliases: ["Vistra"] },
  { key: "US0079031078", symbol: "AMD", exchange: "NASDAQ", isin: "US0079031078", isinVerified: true, name: "Advanced Micro Devices", assetClass: "equity", currency: "USD", sector: "Halbleiter", country: "USA", region: "Nordamerika", themes: ["ai_infrastructure", "semiconductors"], providerSymbols: { eodhd: "AMD.US", finnhub: "AMD" }, aliases: ["AMD", "Advanced Micro Devices", "Lisa Su"] },
  { key: "DE0006231004", symbol: "IFX", exchange: "XETRA", isin: "DE0006231004", isinVerified: true, name: "Infineon Technologies", assetClass: "equity", currency: "EUR", sector: "Halbleiter", country: "Deutschland", region: "Europa", themes: ["semiconductors"], providerSymbols: { eodhd: "IFX.XETRA", finnhub: "IFX.DE" }, aliases: ["Infineon"] },
  { key: "US0378331005", symbol: "AAPL", exchange: "NASDAQ", isin: "US0378331005", isinVerified: true, name: "Apple", assetClass: "equity", currency: "USD", sector: "Technologie", country: "USA", region: "Nordamerika", themes: ["mega_cap_tech", "consumer_tech"], providerSymbols: { eodhd: "AAPL.US", finnhub: "AAPL" }, aliases: ["Apple", "iPhone", "Tim Cook"] },
  { key: "US46625H1005", symbol: "JPM", exchange: "NYSE", isin: "US46625H1005", isinVerified: true, name: "JPMorgan Chase", assetClass: "equity", currency: "USD", sector: "Banken", country: "USA", region: "Nordamerika", themes: ["financials"], providerSymbols: { eodhd: "JPM.US", finnhub: "JPM" }, aliases: ["JPMorgan", "JP Morgan", "Jamie Dimon"] },
  { key: "NO0010081235", symbol: "NEL", exchange: "OSLO", isin: "NO0010081235", isinVerified: true, name: "Nel ASA", assetClass: "equity", currency: "NOK", sector: "Industrie", country: "Norwegen", region: "Europa", themes: ["hydrogen", "unprofitable_growth"], providerSymbols: { eodhd: "NEL.OL", finnhub: "NEL.OL" }, aliases: ["Nel ASA", "Nel Hydrogen"] },
  { key: "IE00B4L5Y983", symbol: "EUNL", exchange: "XETRA", isin: "IE00B4L5Y983", isinVerified: false, name: "iShares Core MSCI World UCITS ETF USD (Acc)", assetClass: "etf", currency: "EUR", sector: "Global Large/Mid Cap", country: "Global (Industrieländer)", region: "Global", themes: [], providerSymbols: { eodhd: "EUNL.XETRA" }, aliases: ["MSCI World"], notes: "Screenshot zeigt 'Core MSCI World USD (Acc)'. Plausibelste Zuordnung iShares IE00B4L5Y983, bitte im Depot bestätigen." },
  { key: "IE00BK5BQT80", symbol: "VWCE", exchange: "XETRA", isin: "IE00BK5BQT80", isinVerified: false, name: "Vanguard FTSE All-World UCITS ETF USD Accumulating", assetClass: "etf", currency: "EUR", sector: "Global Large/Mid Cap", country: "Global (inkl. Schwellenländer)", region: "Global", themes: [], providerSymbols: { eodhd: "VWCE.XETRA" }, aliases: ["FTSE All-World"], notes: "Screenshot zeigt 'FTSE All-World USD (Acc)'. Alternativen mit ähnlichem Namen existieren (z. B. Invesco). Bitte ISIN bestätigen." },
  { key: "IE00BF4RFH31", symbol: "IUSN", exchange: "XETRA", isin: "IE00BF4RFH31", isinVerified: false, name: "iShares MSCI World Small Cap UCITS ETF USD (Acc)", assetClass: "etf", currency: "EUR", sector: "Global Small Cap", country: "Global (Industrieländer)", region: "Global", themes: [], providerSymbols: { eodhd: "IUSN.XETRA" }, aliases: ["MSCI World Small Cap"], notes: "Alternative mit ähnlichem Namen: SPDR IE00BCBJG560. Bitte ISIN bestätigen." },
  { key: "WALLET:CRYPTO", symbol: "KRYPTO", exchange: "CRYPTO", isin: null, isinVerified: false, name: "Krypto-Wallet (Zusammensetzung unbestätigt)", assetClass: "crypto", currency: "EUR", sector: "Krypto", country: null, region: "Global", themes: ["crypto"], providerSymbols: {}, aliases: [], notes: "Separate Anlageklasse. Für Live-Bewertung Bestand je Coin erfassen (z. B. BTC) und Provider-Symbol BTC-EUR.CC hinterlegen." },
];

/** Screenshot-Beobachtungen. Einstand: nur dort, wo frühere Angaben mit der Screenshot-Performance übereinstimmen (±3 %). */
export const SCREENSHOT_HOLDINGS: { key: string; value: number | null; perf: number | null; costBasis?: number; costNote?: string }[] = [
  { key: "US67066G1040", value: 2357.35, perf: 331.62, costBasis: 546, costNote: "Frühere Angabe 546 €, konsistent mit Screenshot (implizit 546,16 €)" },
  { key: "DE000A1ML7J1", value: 1593.29, perf: -29.01, costBasis: 2249, costNote: "Frühere Angabe 2.249 €, konsistent (implizit 2.244,39 €)" },
  { key: "US92840M1027", value: 1079.34, perf: -3.81, costBasis: 1119, costNote: "Frühere Angabe 1.119 €, konsistent (implizit 1.122,10 €)" },
  { key: "IE00BF4RFH31", value: 840.23, perf: 3.73, costNote: "Frühere Angabe 700 € weicht von implizit 810,02 € ab (vermutlich Sparplankäufe). Nicht übernommen." },
  { key: "IE00B4L5Y983", value: 644.48, perf: 3.26, costNote: "Frühere Angabe 314 € weicht von implizit 624,13 € ab. Nicht übernommen." },
  { key: "US0079031078", value: 585.78, perf: 16.94, costBasis: 496, costNote: "Frühere Angabe 496 €, Abweichung 1 % zu implizit 500,92 €" },
  { key: "DE0006231004", value: 444.76, perf: -16.31, costNote: "Kein Einstand bekannt (implizit 531,43 €)." },
  { key: "IE00BK5BQT80", value: 413.07, perf: 0.75, costNote: "Frühere Angabe 200 € weicht von implizit 410,00 € ab. Nicht übernommen." },
  { key: "US46625H1005", value: 187.69, perf: 30.33, costBasis: 144, costNote: "Frühere Angabe 144 €, konsistent (implizit 144,01 €)" },
  { key: "NO0010081235", value: 1.91, perf: -86.15, costNote: "Kein Einstand bekannt (implizit 13,79 €)." },
  { key: "US0378331005", value: null, perf: null, costNote: "Wert und Performance im Screenshot verdeckt." },
  { key: "WALLET:CRYPTO", value: 4178.89, perf: 17.58, costNote: "Frühere Angabe 2.800 € weicht von implizit 3.554,08 € ab. Nicht übernommen." },
];

export const SCREENSHOT_DATE = "2026-10-25"; // Importzeitpunkt; tatsächliches Aufnahmedatum der Screenshots unbekannt

/** Startuniversum des Scanners. Bewusst gemischt aus Large Caps, Mid/Small Caps und europäischen Titeln; in den Einstellungen änderbar. */
export const DEFAULT_UNIVERSE: SeedInstrument[] = [
  u("AVGO", "NASDAQ", "Broadcom", "USD", "Halbleiter", ["ai_infrastructure", "semiconductors"], "AVGO.US", "AVGO", ["Broadcom"]),
  u("TSM", "NYSE", "Taiwan Semiconductor (ADR)", "USD", "Halbleiter", ["ai_infrastructure", "semiconductors"], "TSM.US", "TSM", ["TSMC", "Taiwan Semiconductor"]),
  u("MU", "NASDAQ", "Micron Technology", "USD", "Halbleiter", ["ai_infrastructure", "semiconductors"], "MU.US", "MU", ["Micron"]),
  u("ANET", "NYSE", "Arista Networks", "USD", "Technologie", ["ai_infrastructure"], "ANET.US", "ANET", ["Arista"]),
  u("VRT", "NYSE", "Vertiv", "USD", "Industrie", ["ai_infrastructure", "power_infrastructure"], "VRT.US", "VRT", ["Vertiv"]),
  u("ETN", "NYSE", "Eaton", "USD", "Industrie", ["power_infrastructure"], "ETN.US", "ETN", ["Eaton"]),
  u("PWR", "NYSE", "Quanta Services", "USD", "Industrie", ["power_infrastructure"], "PWR.US", "PWR", ["Quanta Services"]),
  u("CEG", "NASDAQ", "Constellation Energy", "USD", "Versorger", ["power_infrastructure"], "CEG.US", "CEG", ["Constellation Energy"]),
  u("GEV", "NYSE", "GE Vernova", "USD", "Industrie", ["power_infrastructure"], "GEV.US", "GEV", ["GE Vernova"]),
  u("CRWD", "NASDAQ", "CrowdStrike", "USD", "Software", ["cybersecurity"], "CRWD.US", "CRWD", ["CrowdStrike"]),
  u("PANW", "NASDAQ", "Palo Alto Networks", "USD", "Software", ["cybersecurity"], "PANW.US", "PANW", ["Palo Alto Networks"]),
  u("NOW", "NYSE", "ServiceNow", "USD", "Software", ["software"], "NOW.US", "NOW", ["ServiceNow"]),
  u("ISRG", "NASDAQ", "Intuitive Surgical", "USD", "Gesundheit", ["healthtech", "robotics"], "ISRG.US", "ISRG", ["Intuitive Surgical"]),
  u("ROK", "NYSE", "Rockwell Automation", "USD", "Industrie", ["robotics"], "ROK.US", "ROK", ["Rockwell Automation"]),
  u("POWL", "NASDAQ", "Powell Industries", "USD", "Industrie", ["power_infrastructure", "small_cap"], "POWL.US", "POWL", ["Powell Industries"]),
  u("IESC", "NASDAQ", "IES Holdings", "USD", "Industrie", ["power_infrastructure", "small_cap"], "IESC.US", "IESC", ["IES Holdings"]),
  u("ONTO", "NYSE", "Onto Innovation", "USD", "Halbleiter", ["semiconductors", "small_cap"], "ONTO.US", "ONTO", ["Onto Innovation"]),
  u("NVT", "NYSE", "nVent Electric", "USD", "Industrie", ["power_infrastructure"], "NVT.US", "NVT", ["nVent"]),
  u("ASML", "EURONEXT", "ASML Holding", "EUR", "Halbleiter", ["semiconductors"], "ASML.AS", "ASML", ["ASML"]),
  u("SU", "EURONEXT", "Schneider Electric", "EUR", "Industrie", ["power_infrastructure"], "SU.PA", "SBGSY", ["Schneider Electric"]),
  u("PRY", "BORSA ITALIANA", "Prysmian", "EUR", "Industrie", ["power_infrastructure"], "PRY.MI", "PRYMY", ["Prysmian"]),
  u("ENR", "XETRA", "Siemens Energy", "EUR", "Industrie", ["power_infrastructure"], "ENR.XETRA", "SMNEY", ["Siemens Energy"]),
  u("BESI", "EURONEXT", "BE Semiconductor Industries", "EUR", "Halbleiter", ["semiconductors"], "BESI.AS", "BESIY", ["BE Semiconductor", "Besi"]),
  u("SAP", "XETRA", "SAP", "EUR", "Software", ["software"], "SAP.XETRA", "SAP", ["SAP"]),
  u("SMHN", "XETRA", "SUSS MicroTec", "EUR", "Halbleiter", ["semiconductors", "small_cap"], "SMHN.XETRA", "SMHN.DE", ["SUSS MicroTec", "Süss MicroTec"]),
];

function u(symbol: string, exchange: string, name: string, currency: string, sector: string, themes: string[], eod: string, fh: string, aliases: string[]): SeedInstrument {
  const country = currency === "USD" ? "USA" : "Europa";
  return { key: `${symbol}:${exchange}`, symbol, exchange, isin: null, isinVerified: false, name, assetClass: "equity", currency, sector, country, region: currency === "USD" ? "Nordamerika" : "Europa", themes, providerSymbols: { eodhd: eod, finnhub: fh }, aliases };
}

export const MACRO_SERIES = [
  { code: "US_CPI", name: "US-Verbraucherpreise (Index)", provider: "fred", providerRef: "CPIAUCSL", unit: "Index", frequency: "monatlich", category: "Inflation" },
  { code: "US_UNRATE", name: "US-Arbeitslosenquote", provider: "fred", providerRef: "UNRATE", unit: "%", frequency: "monatlich", category: "Arbeitsmarkt" },
  { code: "US_PAYEMS", name: "US-Beschäftigte außerhalb der Landwirtschaft", provider: "fred", providerRef: "PAYEMS", unit: "Tsd.", frequency: "monatlich", category: "Arbeitsmarkt" },
  { code: "US_GDP", name: "US-BIP real, annualisiert q/q", provider: "fred", providerRef: "A191RL1Q225SBEA", unit: "%", frequency: "quartalsweise", category: "Wachstum" },
  { code: "US_FFR_UP", name: "Fed Funds Zielband (Obergrenze)", provider: "fred", providerRef: "DFEDTARU", unit: "%", frequency: "täglich", category: "Zinsen" },
  { code: "UST2Y", name: "US-Staatsanleihen 2J", provider: "fred", providerRef: "DGS2", unit: "%", frequency: "täglich", category: "Zinsen" },
  { code: "UST10Y", name: "US-Staatsanleihen 10J", provider: "fred", providerRef: "DGS10", unit: "%", frequency: "täglich", category: "Zinsen" },
  { code: "US_HY_OAS", name: "US High-Yield-Spread (ICE BofA OAS)", provider: "fred", providerRef: "BAMLH0A0HYM2", unit: "%", frequency: "täglich", category: "Kredit" },
  { code: "VIX", name: "CBOE Volatilitätsindex (VIX)", provider: "fred", providerRef: "VIXCLS", unit: "Punkte", frequency: "täglich", category: "Volatilität" },
  { code: "BRENT", name: "Brent Rohöl", provider: "fred", providerRef: "DCOILBRENTEU", unit: "USD/bbl", frequency: "täglich", category: "Rohstoffe" },
  { code: "HENRYHUB", name: "Erdgas Henry Hub", provider: "fred", providerRef: "DHHNGSP", unit: "USD/MMBtu", frequency: "täglich", category: "Rohstoffe" },
  { code: "SPX", name: "S&P 500", provider: "fred", providerRef: "SP500", unit: "Punkte", frequency: "täglich", category: "Aktienindizes" },
  { code: "NDX", name: "Nasdaq-100", provider: "fred", providerRef: "NASDAQ100", unit: "Punkte", frequency: "täglich", category: "Aktienindizes" },
  { code: "EA_HICP", name: "Euroraum HICP, Veränderung ggü. Vorjahr", provider: "ecb", providerRef: "ICP/M.U2.N.000000.4.ANR", unit: "%", frequency: "monatlich", category: "Inflation" },
  { code: "ECB_DFR", name: "EZB Einlagesatz", provider: "ecb", providerRef: "FM/D.U2.EUR.4F.KR.DFR.LEV", unit: "%", frequency: "täglich", category: "Zinsen" },
  { code: "EA_10Y_AAA", name: "Euroraum AAA-Rendite 10J", provider: "ecb", providerRef: "YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y", unit: "%", frequency: "täglich", category: "Zinsen" },
  { code: "EURUSD", name: "EUR/USD (EZB-Referenzkurs)", provider: "ecb", providerRef: "EXR/D.USD.EUR.SP00.A", unit: "USD", frequency: "täglich", category: "Währungen" },
];

/** Indizes ohne frei verfügbare offizielle Quelle laufen über den Kurs-Provider. */
export const INDEX_QUOTES = [
  { code: "DAX", name: "DAX", eodhd: "GDAXI.INDX" },
  { code: "SX5E", name: "Euro Stoxx 50", eodhd: "STOXX50E.INDX" },
  { code: "GOLD", name: "Gold (USD/oz)", eodhd: "XAUUSD.FOREX" },
];

/** Verifizierte Termine (Stand 25.10.2026). Weitere Termine kommen automatisch über den Kalender-Provider. */
export const SEED_EVENTS = [
  { eventKey: "fomc-2026-10-28", eventType: "central_bank", title: "FOMC Zinsentscheid", startsAt: "2026-10-28T18:00:00Z", allDay: false, symbol: null, region: "USA", importance: 3, status: "confirmed", source: "Federal Reserve", sourceUrl: "https://www.federalreserve.gov/newsevents/2026-october.htm", consensus: null },
  { eventKey: "ecb-2026-10-29", eventType: "central_bank", title: "EZB Zinsentscheid", startsAt: "2026-10-29T13:15:00Z", allDay: false, symbol: null, region: "Euroraum", importance: 3, status: "unverified", source: "Sekundärquelle (Admirals), auf EZB-Kalender bestätigen", sourceUrl: "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html", consensus: null },
  { eventKey: "aapl-q4fy26", eventType: "earnings", title: "Apple Q4 GJ2026 Ergebnisse", startsAt: "2026-11-02T22:00:00Z", allDay: false, symbol: "AAPL", region: "USA", importance: 3, status: "unverified", source: "Unternehmensankündigung, berichtet von MacTrast", sourceUrl: "https://www.mactrast.com/2026/10/apple-to-announce-fiscal-q4-2026-earnings-on-november-2/", consensus: null },
  { eventKey: "amd-q3-2026", eventType: "earnings", title: "AMD Q3 2026 Ergebnisse (nach US-Börsenschluss)", startsAt: "2026-11-03T22:00:00Z", allDay: false, symbol: "AMD", region: "USA", importance: 3, status: "confirmed", source: "AMD Investor Relations", sourceUrl: "https://ir.amd.com/news-events/press-releases/detail/1300/amd-to-report-fiscal-third-quarter-2026-financial-results", consensus: null },
  { eventKey: "ea-hicp-flash-2026-10", eventType: "inflation", title: "Euroraum HICP Schnellschätzung Oktober", startsAt: "2026-11-04T10:00:00Z", allDay: true, symbol: null, region: "Euroraum", importance: 3, status: "confirmed", source: "Eurostat (Release 16.10.2026)", sourceUrl: "https://ec.europa.eu/eurostat/news/release-calendar", consensus: null },
  { eventKey: "ecb-2026-12-17", eventType: "central_bank", title: "EZB Zinsentscheid (mit Projektionen)", startsAt: "2026-12-17T13:15:00Z", allDay: false, symbol: null, region: "Euroraum", importance: 3, status: "unverified", source: "Sekundärquelle (Admirals), auf EZB-Kalender bestätigen", sourceUrl: "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html", consensus: null },
];

export const DEFAULT_LIMITS = { maxSinglePositionPct: 15, maxThemePct: 35, maxTop3Pct: 50, maxUsdPct: 60, smallCapTargetPct: 10 };
export const DEFAULT_NOTIFICATION = { enabled: false, email: null, webhookUrl: null, minNewsRelevance: 75, minRiskSeverity: 4, minCandidateScore: 75, notifyFailedUpdates: true };
export const DEFAULT_SCHEDULE = { refresh: "06:30", briefing: "06:45", available: "07:00" };
