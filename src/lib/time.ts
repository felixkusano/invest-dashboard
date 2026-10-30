/**
 * Zeitzonen- und Börsenkalender-Hilfen. Alle Zeitpläne beziehen sich auf Europe/Berlin (inkl. Sommerzeit).
 * Feiertagslisten 2026/2027 sind statisch gepflegt und dienen nur der Kennzeichnung "Börse geschlossen".
 * Maßgeblich für Kurse bleibt immer das Datum des letzten gelieferten Handelstags vom Provider.
 */
export const TZ = "Europe/Berlin";

export function berlinParts(d: Date = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    weekday: p.weekday as string, // Mon..Sun
  };
}

/** Kalenderdatum in Berlin als YYYY-MM-DD. */
export function berlinDate(d: Date = new Date()): string {
  return berlinParts(d).date;
}

/** UTC-Offset Berlins in Minuten zu einem Zeitpunkt (60 im Winter, 120 im Sommer). */
export function berlinOffsetMinutes(d: Date): number {
  const p = berlinParts(d);
  const asUtc = Date.UTC(Number(p.date.slice(0, 4)), Number(p.date.slice(5, 7)) - 1, Number(p.date.slice(8, 10)), p.hour, p.minute);
  return Math.round((asUtc - Math.floor(d.getTime() / 60000) * 60000) / 60000);
}

/** Wandelt eine Berliner Ortszeit (YYYY-MM-DD, HH:MM) in einen UTC-Zeitpunkt um. */
export function berlinToUtc(date: string, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h, m));
  const off = berlinOffsetMinutes(guess);
  const res = new Date(guess.getTime() - off * 60000);
  // Korrektur an DST-Grenzen
  const off2 = berlinOffsetMinutes(res);
  return off2 === off ? res : new Date(guess.getTime() - off2 * 60000);
}

/**
 * Cron-Gate: GitHub Actions und Vercel Cron laufen in UTC und starten unter Last oft 30 bis 60 Minuten verspätet.
 * Deshalb gilt ein großzügiges Fenster (60 Minuten vor bis 3 Stunden nach dem Ziel in Berliner Zeit).
 * Doppelte Läufe verhindert shouldRunDaily über den letzten erfolgreichen Lauf des Tages.
 */
export function isWithinBerlinWindow(now: Date, target: string, beforeMinutes = 60, afterMinutes = 180): boolean {
  const p = berlinParts(now);
  const [h, m] = target.split(":").map(Number);
  const diff = p.hour * 60 + p.minute - (h * 60 + m);
  return diff >= -beforeMinutes && diff <= afterMinutes;
}

/** Läuft der tägliche Job jetzt? Nur im Fenster und nur, wenn heute (Berlin) seit Fensterbeginn noch kein erfolgreicher Lauf stattfand. */
export function shouldRunDaily(now: Date, target: string, lastSuccessAt: Date | null): { run: boolean; reason: string } {
  if (!isWithinBerlinWindow(now, target)) return { run: false, reason: `Außerhalb des Berliner Zeitfensters um ${target}` };
  if (lastSuccessAt && berlinDate(lastSuccessAt) === berlinDate(now)) {
    const [h, m] = target.split(":").map(Number);
    const lp = berlinParts(lastSuccessAt);
    if (lp.hour * 60 + lp.minute >= h * 60 + m - 60) return { run: false, reason: "Heute bereits erfolgreich aktualisiert" };
  }
  return { run: true, reason: "ok" };
}

export type Exchange = "XETRA" | "NASDAQ" | "NYSE" | "OSLO" | "CRYPTO" | "OTHER";

const HOLIDAYS: Record<string, string[]> = {
  // Quelle: veröffentlichte Handelskalender der Börsen (manuell gepflegt, jährlich prüfen)
  XETRA: ["2026-01-01", "2026-04-03", "2026-04-06", "2026-05-01", "2026-12-24", "2026-12-25", "2026-12-31",
    "2027-01-01", "2027-03-26", "2027-03-29", "2027-12-24", "2027-12-31"],
  US: ["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
    "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24"],
  OSLO: ["2026-01-01", "2026-04-02", "2026-04-03", "2026-04-06", "2026-05-01", "2026-05-14", "2026-05-25", "2026-12-24", "2026-12-25", "2026-12-31",
    "2027-01-01", "2027-03-25", "2027-03-26", "2027-03-29", "2027-05-06", "2027-05-17", "2027-12-24", "2027-12-31"],
};

function holidayKey(ex: Exchange): string | null {
  if (ex === "NASDAQ" || ex === "NYSE") return "US";
  if (ex === "XETRA" || ex === "OSLO") return ex;
  return null;
}

function weekdayOf(dateIso: string): number {
  return new Date(dateIso + "T12:00:00Z").getUTCDay(); // 0 = So
}

export function isTradingDay(ex: Exchange, dateIso: string): boolean {
  if (ex === "CRYPTO") return true;
  const wd = weekdayOf(dateIso);
  if (wd === 0 || wd === 6) return false;
  const k = holidayKey(ex);
  return !(k && HOLIDAYS[k].includes(dateIso));
}

export function addDays(dateIso: string, n: number): string {
  const d = new Date(dateIso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Letzter Handelstag mit abgeschlossenem Schlusskurs, aus Sicht eines Berliner Zeitpunkts (vereinfachtes Schlussfenster). */
export function lastCompletedTradingDay(ex: Exchange, now: Date = new Date()): string {
  const p = berlinParts(now);
  const closeHourBerlin = ex === "NASDAQ" || ex === "NYSE" ? 22 : 18; // US-Schluss ca. 22:00 Berlin
  let d = p.date;
  if (!(isTradingDay(ex, d) && p.hour >= closeHourBerlin)) d = addDays(d, -1);
  for (let i = 0; i < 10 && !isTradingDay(ex, d); i++) d = addDays(d, -1);
  return d;
}

export function isMarketOpen(ex: Exchange, now: Date = new Date()): boolean {
  const p = berlinParts(now);
  if (!isTradingDay(ex, p.date)) return false;
  const mins = p.hour * 60 + p.minute;
  if (ex === "XETRA") return mins >= 9 * 60 && mins < 17 * 60 + 30;
  if (ex === "OSLO") return mins >= 9 * 60 && mins < 16 * 60 + 20;
  if (ex === "NASDAQ" || ex === "NYSE") return mins >= 15 * 60 + 30 && mins < 22 * 60; // vereinfachend, US-DST-Verschiebungen im März/Nov nicht abgebildet
  return ex === "CRYPTO";
}

export function toExchange(s: string): Exchange {
  const u = s.toUpperCase();
  if (u.includes("XETRA") || u === "XETR" || u === "DE") return "XETRA";
  if (u.includes("NASDAQ")) return "NASDAQ";
  if (u.includes("NYSE")) return "NYSE";
  if (u.includes("OSLO") || u === "OL") return "OSLO";
  if (u.includes("CRYPTO")) return "CRYPTO";
  return "OTHER";
}
