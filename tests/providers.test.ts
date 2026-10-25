import { describe, expect, it } from "vitest";
import { fetchWithRetry, ProviderError, redact } from "@/lib/http";
import { EodhdProvider, mapEodhdFundamentals, parseEodBars } from "@/providers/eodhd";
import { FinnhubProvider, mapFinnhubMetrics } from "@/providers/finnhub";
import { EcbProvider, FredProvider, parseCsv, parseFred, periodToDate } from "@/providers/macro";
import { parseRss } from "@/providers/rss";
import { buildProviders } from "@/providers/registry";

const json = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", ...headers } });
const inst = { id: 1, symbol: "VNA", exchange: "XETRA", currency: "EUR", assetClass: "equity", providerSymbols: { eodhd: "VNA.XETRA", finnhub: "VNA.DE" } };

describe("HTTP-Client", () => {
  it("wiederholt nach 429 und liefert dann das Ergebnis", async () => {
    let n = 0;
    const f = (async () => (++n === 1 ? json({}, 429, { "retry-after": "0" }) : json({ ok: true }))) as typeof fetch;
    const r = await fetchWithRetry("https://x.test/a?api_token=SECRET", { provider: "t", fetchImpl: f });
    expect(await r.json()).toEqual({ ok: true });
    expect(n).toBe(2);
  });
  it("gibt nach Ausschöpfen der Retries einen Providerfehler ohne Schlüssel aus", async () => {
    const f = (async () => json({}, 503)) as typeof fetch;
    await expect(fetchWithRetry("https://x.test/a?api_token=SECRET", { provider: "t", fetchImpl: f, retries: 1 })).rejects.toThrow(ProviderError);
    await expect(fetchWithRetry("https://x.test/a?api_token=SECRET", { provider: "t", fetchImpl: f, retries: 0 })).rejects.not.toThrow(/SECRET/);
  });
  it("wiederholt 4xx nicht", async () => {
    let n = 0;
    const f = (async () => { n++; return json({}, 403); }) as typeof fetch;
    await expect(fetchWithRetry("https://x.test", { provider: "t", fetchImpl: f })).rejects.toThrow(/403/);
    expect(n).toBe(1);
  });
  it("bricht bei Timeout ab", async () => {
    const f = ((_: string, init?: RequestInit) => new Promise((_r, rej) => init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))))) as typeof fetch;
    await expect(fetchWithRetry("https://x.test", { provider: "t", fetchImpl: f, timeoutMs: 30, retries: 0 })).rejects.toThrow(/Timeout/);
  });
  it("schwärzt Schlüssel in URLs", () => expect(redact("https://a.b/c?api_token=abc&x=1&apikey=zz")).toBe("https://a.b/c?api_token=***&x=1&apikey=***"));
});

describe("EODHD", () => {
  it("parst Tagesbalken, sortiert, entfernt Dubletten und ungültige Werte", () => {
    const bars = parseEodBars([
      { date: "2026-10-23", open: 1, high: 1, low: 1, close: 22.4, volume: 1 },
      { date: "2026-10-22", open: 1, high: 1, low: 1, close: 22.1, volume: 1 },
      { date: "2026-10-22", open: 1, high: 1, low: 1, close: 22.1, volume: 1 },
      { date: "bad", open: 1, high: 1, low: 1, close: 1, volume: 1 },
      { date: "2026-10-21", open: 1, high: 1, low: 1, close: 0, volume: 1 },
    ], "XETRA");
    expect(bars.map((b) => b.date)).toEqual(["2026-10-22", "2026-10-23"]);
  });
  it("normalisiert Pence auf Pfund", () => expect(parseEodBars([{ date: "2026-10-23", open: 100, high: 100, low: 100, close: 250, volume: 0 }], "LSE")[0].close).toBe(2.5));
  it("liefert Schlusskurse als EOD mit Herkunft", async () => {
    const f = (async (u: string) => { expect(u).toContain("/eod/VNA.XETRA"); return json([{ date: "2026-10-22", open: 1, high: 1, low: 1, close: 22.1, volume: 1 }, { date: "2026-10-23", open: 1, high: 1, low: 1, close: 22.4, volume: 1 }]); }) as typeof fetch;
    const q = await new EodhdProvider("k", f).getDaily(inst, "2026-10-01");
    expect(q!.dataType).toBe("eod");
    expect(q!.currency).toBe("EUR");
    expect(q!.bars.at(-1)!.close).toBe(22.4);
  });
  it("mappt Fundamentaldaten in Prozent", () => {
    const m = mapEodhdFundamentals({ Highlights: { OperatingMarginTTM: 0.31, QuarterlyRevenueGrowthYOY: 0.12, RevenueTTM: 100, GrossProfitTTM: 60 }, Valuation: { ForwardPE: 25 } })!;
    expect(m.operatingMargin).toBeCloseTo(31);
    expect(m.revenueGrowthYoy).toBeCloseTo(12);
    expect(m.grossMargin).toBeCloseTo(60);
    expect(m.roic).toBeNull();
  });
});

describe("Finnhub", () => {
  it("unterstützt im Free Tier nur US-Titel", () => {
    const p = new FinnhubProvider("k");
    expect(p.supports(inst)).toBe(false);
    expect(p.supports({ ...inst, exchange: "NASDAQ", providerSymbols: { finnhub: "NVDA" } })).toBe(true);
  });
  it("verwirft Null-Quotes für unbekannte Symbole", async () => {
    const f = (async () => json({ c: 0, pc: 0, t: 0 })) as typeof fetch;
    expect(await new FinnhubProvider("k", f).getDaily({ ...inst, exchange: "NYSE", providerSymbols: { finnhub: "XXX" } })).toBeNull();
  });
  it("mappt Kennzahlen inkl. FCF-Rendite aus P/FCF", () => {
    const m = mapFinnhubMetrics({ grossMarginTTM: 75, pfcfShareTTM: 40, "totalDebt/totalEquityQuarterly": 0.3, peTTM: 50 });
    expect(m.grossMargin).toBe(75);
    expect(m.fcfYield).toBeCloseTo(2.5);
    expect(m.debtToEquity).toBe(0.3);
    expect(m.forwardPe).toBeNull();
  });
});

describe("Makroquellen", () => {
  it("FRED: fehlende Werte ('.') werden verworfen, nicht als 0 gespeichert", () => {
    expect(parseFred([{ date: "2026-10-22", value: "4.1" }, { date: "2026-10-23", value: "." }])).toEqual([{ date: "2026-10-22", value: 4.1 }]);
  });
  it("FRED-Provider übergibt Serie und Start", async () => {
    const f = (async (u: string) => { expect(u).toContain("series_id=DGS10"); return json({ observations: [{ date: "2026-10-23", value: "4.05" }] }); }) as typeof fetch;
    expect(await new FredProvider("k", f).series("DGS10", "2026-01-01")).toEqual([{ date: "2026-10-23", value: 4.05 }]);
  });
  it("EZB: SDMX-CSV und Perioden", async () => {
    expect(periodToDate("2026-09")).toBe("2026-09-01");
    expect(periodToDate("2026-Q3")).toBe("2026-07-01");
    expect(parseCsv('A,B\n"x,y",2')).toEqual([{ A: "x,y", B: "2" }]);
    const csv = "KEY,CURRENCY,TIME_PERIOD,OBS_VALUE\nEXR.D.USD,USD,2026-10-23,1.0812\nEXR.D.NOK,NOK,2026-10-23,11.62\n";
    const f = (async () => new Response(csv, { status: 200 })) as typeof fetch;
    const fx = await new EcbProvider(f).latest(["USD", "NOK"]);
    expect(fx.rates).toEqual({ USD: 1.0812, NOK: 11.62 });
    expect(fx.date).toBe("2026-10-23");
  });
});

describe("RSS", () => {
  it("liest Titel, Link und Datum aus Notenbank-Feeds", () => {
    const xml = `<rss><channel><item><title><![CDATA[Monetary policy decisions]]></title><link>https://www.ecb.europa.eu/press/pr/x.html</link><pubDate>Thu, 29 Oct 2026 13:15:00 GMT</pubDate><description>The Governing Council decided &amp; …</description></item><item><title>kaputt</title></item></channel></rss>`;
    const a = parseRss(xml, "EZB", "central_bank");
    expect(a).toHaveLength(1);
    expect(a[0].headline).toBe("Monetary policy decisions");
    expect(a[0].publishedAt.toISOString()).toBe("2026-10-29T13:15:00.000Z");
  });
});

describe("Provider-Registry", () => {
  it("ohne Keys keine Kursquelle, aber offizielle Quellen ohne Key", () => {
    const p = buildProviders({ demo: false, env: {} as NodeJS.ProcessEnv });
    expect(p.quotes).toHaveLength(0);
    expect(Object.keys(p.macro)).toEqual(["ecb"]);
    expect(p.news.map((n) => n.name)).toEqual(["rss"]);
  });
  it("Demo-Modus verwendet ausschließlich den Demo-Kursprovider", () => {
    const p = buildProviders({ demo: true, env: { EODHD_API_KEY: "x" } as unknown as NodeJS.ProcessEnv });
    expect(p.quotes.map((q) => q.name)).toEqual(["demo"]);
    expect(p.quotes[0].dataType).toBe("demo");
  });
});
