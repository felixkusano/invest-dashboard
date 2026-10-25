/**
 * Offizielle Makroquellen:
 *  - FRED (St. Louis Fed): kostenloser API-Key, 120 Requests/Minute.
 *  - EZB Data Portal (data-api.ecb.europa.eu): ohne Key, SDMX-CSV.
 *  - Wechselkurse: EZB-Referenzkurse (ohne Key), Fallback Frankfurter (spiegelt EZB-Referenzkurse).
 */
import { getJson, getText, ProviderError } from "@/lib/http";
import type { FxProvider, FxSnapshot, MacroProvider, Observation } from "./types";

export class FredProvider implements MacroProvider {
  readonly name = "fred";
  constructor(private key: string, private fetchImpl?: typeof fetch) {}
  async series(ref: string, start: string): Promise<Observation[]> {
    const q = new URLSearchParams({ series_id: ref, api_key: this.key, file_type: "json", observation_start: start });
    const d = await getJson<{ observations?: { date: string; value: string }[] }>(`https://api.stlouisfed.org/fred/series/observations?${q}`, { provider: this.name, fetchImpl: this.fetchImpl, minIntervalMs: 550 });
    return parseFred(d.observations ?? []);
  }
}

export function parseFred(obs: { date: string; value: string }[]): Observation[] {
  // FRED kennzeichnet fehlende Werte mit "." – diese werden verworfen, nicht als 0 gespeichert.
  return obs.filter((o) => o.value !== "." && o.value !== "" && Number.isFinite(Number(o.value))).map((o) => ({ date: o.date, value: Number(o.value) }));
}

/** Minimaler CSV-Parser für SDMX-CSV (Felder ohne eingebettete Zeilenumbrüche). */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const split = (l: string) => {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === "," && !q) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out;
  };
  const head = split(lines[0]);
  return lines.slice(1).map((l) => { const v = split(l); return Object.fromEntries(head.map((h, i) => [h, v[i] ?? ""])); });
}

export function periodToDate(p: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
  if (/^\d{4}-\d{2}$/.test(p)) return `${p}-01`;
  const q = p.match(/^(\d{4})-Q([1-4])$/);
  if (q) return `${q[1]}-${String((Number(q[2]) - 1) * 3 + 1).padStart(2, "0")}-01`;
  return null;
}

export class EcbProvider implements MacroProvider, FxProvider {
  readonly name = "ecb";
  constructor(private fetchImpl?: typeof fetch) {}
  private async csv(flowKey: string, params: Record<string, string>) {
    const [flow, key] = flowKey.split("/");
    const q = new URLSearchParams({ format: "csvdata", ...params });
    const text = await getText(`https://data-api.ecb.europa.eu/service/data/${flow}/${key}?${q}`, { provider: this.name, fetchImpl: this.fetchImpl, headers: { Accept: "text/csv" } });
    return parseCsv(text);
  }
  async series(ref: string, start: string): Promise<Observation[]> {
    const rows = await this.csv(ref, { startPeriod: start.slice(0, 7) });
    return rows
      .map((r) => ({ date: periodToDate(r.TIME_PERIOD), value: Number(r.OBS_VALUE) }))
      .filter((o): o is Observation => !!o.date && r_ok(o.value));
  }
  async latest(currencies: string[]): Promise<FxSnapshot> {
    const cur = currencies.filter((c) => c !== "EUR");
    if (!cur.length) return { date: new Date().toISOString().slice(0, 10), rates: {}, provider: this.name };
    const rows = await this.csv(`EXR/D.${cur.join("+")}.EUR.SP00.A`, { lastNObservations: "1" });
    const rates: Record<string, number> = {};
    let date = "";
    for (const r of rows) {
      const v = Number(r.OBS_VALUE);
      if (r.CURRENCY && r_ok(v)) { rates[r.CURRENCY] = v; if (r.TIME_PERIOD > date) date = r.TIME_PERIOD; }
    }
    if (!Object.keys(rates).length) throw new ProviderError(this.name, "Keine FX-Kurse erhalten");
    return { date, rates, provider: this.name };
  }
}
const r_ok = (v: number) => Number.isFinite(v);

export class FrankfurterProvider implements FxProvider {
  readonly name = "frankfurter";
  constructor(private fetchImpl?: typeof fetch) {}
  async latest(currencies: string[]): Promise<FxSnapshot> {
    const to = currencies.filter((c) => c !== "EUR").join(",");
    const d = await getJson<{ date: string; rates: Record<string, number> }>(`https://api.frankfurter.app/latest?from=EUR&to=${to}`, { provider: this.name, fetchImpl: this.fetchImpl });
    return { date: d.date, rates: d.rates ?? {}, provider: this.name };
  }
}
