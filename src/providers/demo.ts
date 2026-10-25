/**
 * Demo-Provider. Erzeugt deterministische, erkennbar künstliche Werte, damit die Oberfläche ohne API-Keys
 * erprobt werden kann. Jede Zeile trägt dataType "demo" bzw. provider "demo" und wird in der UI rot markiert.
 * Demo-Daten werden beim Ausschalten des Demo-Modus nicht mehr angezeigt.
 */
import { createHash } from "node:crypto";
import type { Metrics } from "@/domain/scoring";
import type { DailyBar, FundamentalsProvider, ProviderInstrument, QuoteProvider, QuoteResult } from "./types";
import { addDays, isTradingDay, toExchange } from "@/lib/time";

function seed(s: string) { return parseInt(createHash("md5").update(s).digest("hex").slice(0, 8), 16) / 0xffffffff; }

export class DemoProvider implements QuoteProvider, FundamentalsProvider {
  readonly name = "demo";
  readonly dataType = "demo" as const;
  supports() { return true; }

  async getDaily(i: ProviderInstrument, fromDate: string): Promise<QuoteResult> {
    const ex = toExchange(i.exchange);
    const today = new Date().toISOString().slice(0, 10);
    const bars: DailyBar[] = [];
    let px = 20 + seed(i.symbol) * 300;
    for (let d = fromDate; d <= today; d = addDays(d, 1)) {
      if (!isTradingDay(ex, d)) continue;
      px *= 1 + (seed(i.symbol + d) - 0.5) * 0.04;
      bars.push({ date: d, open: px, high: px * 1.01, low: px * 0.99, close: Math.round(px * 100) / 100, volume: null });
    }
    return { instrumentId: i.id, provider: this.name, currency: i.currency, dataType: "demo", asOf: new Date(), bars };
  }

  async metrics(i: ProviderInstrument): Promise<Metrics> {
    const r = (k: string, lo: number, hi: number) => Math.round((lo + seed(i.symbol + k) * (hi - lo)) * 10) / 10;
    return {
      grossMargin: r("gm", 20, 75), operatingMargin: r("om", -5, 40), roic: r("roic", 0, 30), roe: r("roe", 0, 30),
      revenueGrowthYoy: r("rg", -10, 50), revenueGrowth3y: r("rg3", -5, 35), epsGrowthYoy: r("eg", -20, 60),
      peTtm: r("pe", 8, 70), evEbitda: r("ev", 6, 45), fcfYield: r("fcf", -1, 6), debtToEquity: r("de", 0, 2),
      currentRatio: r("cr", 0.8, 3), priceReturn52w: r("p52", -40, 80), relStrength52w: r("rs", -30, 40), beta: r("b", 0.6, 2.2),
    };
  }
}

/** Nur im Demo-Modus und nur, wenn EZB und Frankfurter nicht erreichbar sind. Gekennzeichnet als provider "demo". */
export class DemoFxProvider {
  readonly name = "demo";
  async latest(currencies: string[]) {
    const base: Record<string, number> = { USD: 1.1, NOK: 11.6, GBP: 0.86, CHF: 0.94 };
    const rates = Object.fromEntries(currencies.filter((c) => base[c]).map((c) => [c, base[c]]));
    return { date: new Date().toISOString().slice(0, 10), rates, provider: "demo" };
  }
}
