/** Deutsche Formatierung. Fehlende Werte werden nie als 0 dargestellt, sondern als "–". */
export const MISSING = "–";

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur0 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function fmtEur(v: number | null | undefined, opts?: { decimals?: 0 | 2 }): string {
  if (v == null || !Number.isFinite(v)) return MISSING;
  return opts?.decimals === 0 ? eur0.format(v) : eur.format(v);
}

export function fmtMoney(v: number | null | undefined, currency: string): string {
  if (v == null || !Number.isFinite(v)) return MISSING;
  return new Intl.NumberFormat("de-DE", { style: "currency", currency, maximumFractionDigits: v < 10 ? 3 : 2 }).format(v);
}

export function fmtNum(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return MISSING;
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
}

/** Prozent mit Vorzeichen, z. B. "+3,26 %". Eingabe in Prozentpunkten. */
export function fmtPct(v: number | null | undefined, decimals = 2, signed = true): string {
  if (v == null || !Number.isFinite(v)) return MISSING;
  const s = new Intl.NumberFormat("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Math.abs(v));
  const sign = !signed ? (v < 0 ? "−" : "") : v > 0 ? "+" : v < 0 ? "−" : "±";
  return `${sign}${s} %`;
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return MISSING;
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short" }).format(date) + " Uhr";
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return MISSING;
  const date = typeof d === "string" ? new Date(d.length === 10 ? d + "T12:00:00Z" : d) : d;
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium" }).format(date);
}

export function signClass(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return "text-muted";
  return v > 0 ? "text-pos" : "text-neg";
}
