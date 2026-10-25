/**
 * CSV-Import für Depotbestände (generisch und gängige Broker-Exporte) sowie ETF-Holdings-Dateien der Emittenten.
 * Sicherheit: Größenlimit, keine Formelausführung, strikte Zahlenvalidierung, Zeilenfehler werden gemeldet statt geraten.
 */
import Papa from "papaparse";

export const MAX_CSV_BYTES = 2_000_000;

/** Deutsche und englische Zahlenformate: "1.234,56", "1,234.56", "1234.56", "12,5 %". */
export function parseNumber(raw: unknown): number | null {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/[€$%\s]|EUR|USD/gi, "");
  if (!s || s === "-" || s === "–") return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("−");
  s = s.replace(/[()−]/g, "");
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? (neg ? -v : v) : null;
}

const ALIASES: Record<string, string[]> = {
  isin: ["isin", "wkn/isin", "isin/wkn"],
  symbol: ["symbol", "ticker", "kürzel", "tickersymbol"],
  exchange: ["exchange", "börse", "boerse", "handelsplatz", "market"],
  name: ["name", "bezeichnung", "wertpapier", "titel", "instrument", "security"],
  quantity: ["quantity", "stück", "stueck", "anzahl", "menge", "shares", "units", "bestand"],
  costBasisEur: ["cost basis", "cost_basis_eur", "costbasis", "einstandswert", "einstand", "kaufwert", "investiert", "anschaffungswert", "buy value"],
  currency: ["currency", "währung", "waehrung", "ccy"],
  assetClass: ["asset class", "asset_class", "anlageklasse", "typ", "type"],
};

function mapHeader(h: string): string | null {
  const k = h.trim().toLowerCase().replace(/\s+\(.*\)$/, "");
  for (const [field, al] of Object.entries(ALIASES)) if (al.includes(k)) return field;
  return null;
}

export type HoldingCsvRow = { line: number; isin: string | null; symbol: string | null; exchange: string | null; name: string | null; quantity: number | null; costBasisEur: number | null; currency: string | null; assetClass: "equity" | "etf" | "crypto" | null };

export function parseHoldingsCsv(text: string): { rows: HoldingCsvRow[]; errors: string[] } {
  if (text.length > MAX_CSV_BYTES) return { rows: [], errors: ["Datei zu groß (max. 2 MB)."] };
  const delimiter = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: true, delimiter });
  const errors: string[] = parsed.errors.slice(0, 10).map((e) => `Zeile ${(e.row ?? 0) + 2}: ${e.message}`);
  const fields = parsed.meta.fields ?? [];
  const map = new Map<string, string>();
  for (const f of fields) { const m = mapHeader(f); if (m && !map.has(m)) map.set(m, f); }
  if (!map.has("isin") && !map.has("symbol")) return { rows: [], errors: ["Spalte ISIN oder Symbol/Ticker fehlt."] };
  const rows: HoldingCsvRow[] = [];
  parsed.data.forEach((r, idx) => {
    const get = (k: string) => { const col = map.get(k); return col ? String(r[col] ?? "").trim() : ""; };
    const isin = get("isin").toUpperCase() || null;
    if (isin && !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) { errors.push(`Zeile ${idx + 2}: ungültige ISIN "${isin}"`); return; }
    const symbol = get("symbol").toUpperCase().replace(/[^A-Z0-9.\-:]/g, "") || null;
    if (!isin && !symbol) { errors.push(`Zeile ${idx + 2}: weder ISIN noch Symbol`); return; }
    const qRaw = get("quantity"), cRaw = get("costBasisEur");
    const quantity = parseNumber(qRaw), costBasisEur = parseNumber(cRaw);
    if (qRaw && quantity == null) { errors.push(`Zeile ${idx + 2}: Stückzahl "${qRaw}" nicht lesbar`); return; }
    if (cRaw && costBasisEur == null) { errors.push(`Zeile ${idx + 2}: Einstandswert "${cRaw}" nicht lesbar`); return; }
    if (quantity != null && quantity < 0) { errors.push(`Zeile ${idx + 2}: negative Stückzahl`); return; }
    const ac = get("assetClass").toLowerCase();
    rows.push({
      line: idx + 2, isin, symbol, exchange: get("exchange").toUpperCase() || null,
      name: sanitizeText(get("name")) || null, quantity, costBasisEur, currency: get("currency").toUpperCase().slice(0, 3) || null,
      assetClass: ac.includes("etf") || ac.includes("fonds") ? "etf" : ac.includes("krypto") || ac.includes("crypto") ? "crypto" : ac ? "equity" : null,
    });
  });
  // Doppelte Zeilen derselben ISIN/Symbol zusammenführen (Summe), damit keine Position doppelt entsteht
  const merged = new Map<string, HoldingCsvRow>();
  for (const r of rows) {
    const k = r.isin ?? `${r.symbol}:${r.exchange ?? ""}`;
    const m = merged.get(k);
    if (!m) merged.set(k, { ...r });
    else {
      m.quantity = m.quantity != null || r.quantity != null ? (m.quantity ?? 0) + (r.quantity ?? 0) : null;
      m.costBasisEur = m.costBasisEur != null || r.costBasisEur != null ? (m.costBasisEur ?? 0) + (r.costBasisEur ?? 0) : null;
      errors.push(`Zeile ${r.line}: Duplikat von ${k}, zusammengeführt`);
    }
  }
  return { rows: [...merged.values()], errors };
}

/** Entfernt führende Formelzeichen (CSV-Injection beim späteren Export in Tabellenkalkulationen). */
export function sanitizeText(s: string): string {
  return s.replace(/^[=+\-@\t\r]+/, "").slice(0, 200);
}

export type ConstituentRow = { key: string; name: string; weightPct: number; sector: string | null; country: string | null };

/** ETF-Holdings-Dateien (z. B. iShares "Holdings"-CSV): sucht die Kopfzeile mit Gewichtungsspalte. */
export function parseConstituentsCsv(text: string): { rows: ConstituentRow[]; errors: string[] } {
  if (text.length > MAX_CSV_BYTES * 3) return { rows: [], errors: ["Datei zu groß (max. 6 MB)."] };
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const hIdx = lines.findIndex((l) => /(weight|gewichtung)/i.test(l) && /(name|emittent|issuer|ticker)/i.test(l));
  if (hIdx < 0) return { rows: [], errors: ["Keine Kopfzeile mit Gewichtung gefunden."] };
  const body = lines.slice(hIdx).join("\n");
  const delimiter = (lines[hIdx].match(/;/g)?.length ?? 0) > (lines[hIdx].match(/,/g)?.length ?? 0) ? ";" : ",";
  const parsed = Papa.parse<Record<string, string>>(body, { header: true, skipEmptyLines: true, delimiter });
  const f = parsed.meta.fields ?? [];
  const col = (re: RegExp) => f.find((x) => re.test(x));
  const cW = col(/weight|gewichtung/i), cN = col(/^name$|emittent|issuer name|^name /i) ?? col(/name/i), cT = col(/ticker|emittententicker/i), cI = col(/isin/i), cS = col(/sector|sektor/i), cC = col(/location|standort|country|land/i);
  const errors: string[] = [];
  const rows: ConstituentRow[] = [];
  for (const r of parsed.data) {
    const w = parseNumber(r[cW!]);
    const key = (cI && r[cI]?.trim()) || (cT && r[cT]?.trim()) || "";
    if (w == null || !key || w <= 0) continue;
    rows.push({ key: key.toUpperCase(), name: sanitizeText(r[cN!] ?? key), weightPct: w, sector: cS ? r[cS] ?? null : null, country: cC ? r[cC] ?? null : null });
  }
  const sum = rows.reduce((s, r) => s + r.weightPct, 0);
  if (rows.length && (sum < 80 || sum > 105)) errors.push(`Summe der Gewichte ${sum.toFixed(1)} % ist unplausibel (Erwartung 95 bis 101 %).`);
  if (!rows.length) errors.push("Keine Positionen erkannt.");
  return { rows, errors };
}
