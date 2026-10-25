"use server";
/**
 * Server Actions (POST, CSRF-geschützt durch Next.js Origin-Prüfung). Jede Aktion prüft die Session
 * und validiert Eingaben mit zod. Alle Schreibzugriffe sind auf die userId beschränkt.
 */
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import { requireUser } from "./session";
import { parseConstituentsCsv, parseHoldingsCsv, parseNumber, sanitizeText, MAX_CSV_BYTES } from "@/domain/csv";
import { berlinDate } from "@/lib/time";

export type ActionState = { ok: boolean; message: string; details?: string[] } | null;

const optNum = z.preprocess((v) => (v === "" || v == null ? null : parseNumber(v)), z.number().finite().nullable());
const txt = (max: number) => z.preprocess((v) => (typeof v === "string" ? sanitizeText(v.trim()) : v), z.string().max(max));
const done = (message: string, details?: string[]): ActionState => { revalidatePath("/", "layout"); return { ok: true, message, details }; };
const fail = (message: string, details?: string[]): ActionState => ({ ok: false, message, details });

const HoldingEdit = z.object({
  holdingId: z.coerce.number().int().positive(),
  quantity: optNum, costBasisEur: optNum, importedValueEur: optNum, importedPerfPct: optNum,
  notes: txt(1000).optional(),
  symbol: txt(20).optional(), exchange: txt(30).optional(), isin: z.string().trim().toUpperCase().regex(/^([A-Z]{2}[A-Z0-9]{9}\d)?$/, "ISIN ungültig").optional(),
  name: txt(200).optional(), eodhd: txt(40).optional(), finnhub: txt(40).optional(), isinVerified: z.string().optional(),
});

export async function updateHolding(_: ActionState, fd: FormData): Promise<ActionState> {
  const { db, userId } = await requireUser();
  const p = HoldingEdit.safeParse(Object.fromEntries(fd));
  if (!p.success) return fail("Eingaben ungültig", p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  const d = p.data;
  if (d.quantity != null && d.quantity < 0) return fail("Stückzahl darf nicht negativ sein.");
  if (d.costBasisEur != null && d.costBasisEur < 0) return fail("Einstandswert darf nicht negativ sein.");
  const [h] = await db.select().from(s.holdings).where(and(eq(s.holdings.id, d.holdingId), eq(s.holdings.userId, userId)));
  if (!h) return fail("Position nicht gefunden.");
  const quality = d.quantity != null && d.costBasisEur != null ? "verified" : d.quantity != null ? "partial" : "unverified";
  await db.update(s.holdings).set({
    quantity: d.quantity, costBasisEur: d.costBasisEur, costBasisSource: d.costBasisEur != null ? (d.costBasisEur === h.costBasisEur ? h.costBasisSource : "user") : null,
    importedValueEur: d.importedValueEur, importedPerfPct: d.importedPerfPct, notes: d.notes ?? h.notes, dataQuality: quality, updatedAt: new Date(),
  }).where(eq(s.holdings.id, h.id));
  const [i] = await db.select().from(s.instruments).where(eq(s.instruments.id, h.instrumentId));
  const ps = { ...i.providerSymbols };
  if (d.eodhd !== undefined) { if (d.eodhd) ps.eodhd = d.eodhd; else delete ps.eodhd; }
  if (d.finnhub !== undefined) { if (d.finnhub) ps.finnhub = d.finnhub; else delete ps.finnhub; }
  await db.update(s.instruments).set({
    symbol: d.symbol || i.symbol, exchange: d.exchange || i.exchange, name: d.name || i.name,
    isin: d.isin === undefined ? i.isin : d.isin || null, isinVerified: d.isinVerified === "on", providerSymbols: ps,
  }).where(eq(s.instruments.id, i.id));
  return done(`${d.symbol || i.symbol} gespeichert.`);
}

const NewHolding = z.object({
  symbol: txt(20).pipe(z.string().min(1)), exchange: txt(30).pipe(z.string().min(1)), name: txt(200).pipe(z.string().min(1)),
  isin: z.string().trim().toUpperCase().regex(/^([A-Z]{2}[A-Z0-9]{9}\d)?$/, "ISIN ungültig").optional(),
  assetClass: z.enum(["equity", "etf", "crypto"]), currency: z.string().trim().toUpperCase().length(3),
  sector: txt(60).optional(), region: txt(60).optional(), quantity: optNum, costBasisEur: optNum, eodhd: txt(40).optional(), finnhub: txt(40).optional(),
});

export async function addHolding(_: ActionState, fd: FormData): Promise<ActionState> {
  const { db, userId } = await requireUser();
  const p = NewHolding.safeParse(Object.fromEntries(fd));
  if (!p.success) return fail("Eingaben ungültig", p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  const d = p.data;
  const key = d.isin || `${d.symbol.toUpperCase()}:${d.exchange.toUpperCase()}`;
  let [i] = await db.select().from(s.instruments).where(eq(s.instruments.key, key));
  if (!i) {
    [i] = await db.insert(s.instruments).values({
      key, symbol: d.symbol.toUpperCase(), exchange: d.exchange.toUpperCase(), isin: d.isin || null, name: d.name, assetClass: d.assetClass, currency: d.currency,
      sector: d.sector || null, region: d.region || null, aliases: [d.name], providerSymbols: { ...(d.eodhd ? { eodhd: d.eodhd } : {}), ...(d.finnhub ? { finnhub: d.finnhub } : {}) },
    }).returning();
  }
  const existing = await db.select().from(s.holdings).where(and(eq(s.holdings.userId, userId), eq(s.holdings.instrumentId, i.id)));
  if (existing[0]) {
    await db.update(s.holdings).set({ active: true, quantity: d.quantity ?? existing[0].quantity, costBasisEur: d.costBasisEur ?? existing[0].costBasisEur, updatedAt: new Date() }).where(eq(s.holdings.id, existing[0].id));
    return done(`${i.symbol} existierte bereits und wurde aktualisiert (keine Doppelposition).`);
  }
  await db.insert(s.holdings).values({ userId, instrumentId: i.id, quantity: d.quantity, costBasisEur: d.costBasisEur, costBasisSource: d.costBasisEur != null ? "user" : null, dataQuality: d.quantity != null && d.costBasisEur != null ? "verified" : "partial" });
  return done(`${i.symbol} angelegt.`);
}

export async function deactivateHolding(_: ActionState, fd: FormData): Promise<ActionState> {
  const { db, userId } = await requireUser();
  const id = Number(fd.get("holdingId"));
  await db.update(s.holdings).set({ active: false, updatedAt: new Date() }).where(and(eq(s.holdings.id, id), eq(s.holdings.userId, userId)));
  return done("Position ausgeblendet (Historie bleibt erhalten).");
}

async function readFile(fd: FormData, maxBytes = MAX_CSV_BYTES): Promise<string | ActionState> {
  const f = fd.get("file");
  if (!(f instanceof File) || f.size === 0) return fail("Keine Datei ausgewählt.");
  if (f.size > maxBytes) return fail(`Datei zu groß (max. ${(maxBytes / 1e6).toFixed(0)} MB).`);
  if (!/\.(csv|txt)$/i.test(f.name) && !/csv|text/.test(f.type)) return fail("Nur CSV-Dateien erlaubt.");
  return await f.text();
}

export async function importHoldingsCsv(_: ActionState, fd: FormData): Promise<ActionState> {
  const { db, userId } = await requireUser();
  const text = await readFile(fd);
  if (typeof text !== "string") return text;
  const { rows, errors } = parseHoldingsCsv(text);
  if (!rows.length) return fail("Keine gültigen Zeilen importiert.", errors);
  let created = 0, updated = 0;
  const skipped: string[] = [];
  for (const r of rows) {
    let [i] = r.isin ? await db.select().from(s.instruments).where(eq(s.instruments.isin, r.isin)) : [];
    if (!i && r.symbol) [i] = await db.select().from(s.instruments).where(r.exchange ? and(eq(s.instruments.symbol, r.symbol), eq(s.instruments.exchange, r.exchange)) : eq(s.instruments.symbol, r.symbol));
    if (!i) {
      if (!r.currency || !r.name) { skipped.push(`Zeile ${r.line}: neues Instrument benötigt Name und Währung`); continue; }
      [i] = await db.insert(s.instruments).values({ key: r.isin ?? `${r.symbol}:${r.exchange ?? "UNBEKANNT"}`, symbol: r.symbol ?? r.isin!, exchange: r.exchange ?? "UNBEKANNT", isin: r.isin, name: r.name, assetClass: r.assetClass ?? "equity", currency: r.currency, aliases: [r.name] }).onConflictDoNothing().returning();
      if (!i) { skipped.push(`Zeile ${r.line}: Instrument-Konflikt`); continue; }
    }
    const [h] = await db.select().from(s.holdings).where(and(eq(s.holdings.userId, userId), eq(s.holdings.instrumentId, i.id)));
    const vals = { quantity: r.quantity ?? h?.quantity ?? null, costBasisEur: r.costBasisEur ?? h?.costBasisEur ?? null, active: true, updatedAt: new Date() };
    if (h) { await db.update(s.holdings).set({ ...vals, costBasisSource: r.costBasisEur != null ? "user" : h.costBasisSource, dataQuality: vals.quantity != null && vals.costBasisEur != null ? "verified" : "partial" }).where(eq(s.holdings.id, h.id)); updated++; }
    else { await db.insert(s.holdings).values({ userId, instrumentId: i.id, ...vals, costBasisSource: r.costBasisEur != null ? "user" : null, dataQuality: "partial", importedSource: "CSV-Import" }); created++; }
  }
  return done(`${updated} aktualisiert, ${created} neu angelegt.`, [...errors, ...skipped]);
}

export async function importConstituentsCsv(_: ActionState, fd: FormData): Promise<ActionState> {
  const { db, userId } = await requireUser();
  const etfId = Number(fd.get("etfInstrumentId"));
  const [h] = await db.select().from(s.holdings).where(and(eq(s.holdings.userId, userId), eq(s.holdings.instrumentId, etfId)));
  if (!h) return fail("ETF nicht im Depot.");
  const text = await readFile(fd, MAX_CSV_BYTES * 3);
  if (typeof text !== "string") return text;
  const { rows, errors } = parseConstituentsCsv(text);
  if (!rows.length) return fail("Keine Positionen erkannt.", errors);
  const asOf = berlinDate();
  const file = fd.get("file") as File;
  await db.delete(s.etfConstituents).where(and(eq(s.etfConstituents.etfInstrumentId, etfId), eq(s.etfConstituents.asOf, asOf)));
  for (let k = 0; k < rows.length; k += 500) {
    await db.insert(s.etfConstituents).values(rows.slice(k, k + 500).map((r) => ({ etfInstrumentId: etfId, constituentKey: r.key, constituentName: r.name, weightPct: r.weightPct, sector: r.sector, country: r.country, asOf, source: `Import ${file.name}` }))).onConflictDoNothing();
  }
  return done(`${rows.length} Konstituenten importiert.`, errors);
}

const SettingsForm = z.object({
  monthlyBudgetEur: optNum, coreSharePct: optNum, minOrderEur: optNum, coreInstrumentId: z.coerce.number().int().optional(),
  riskProfile: txt(80), horizon: txt(160), preferredSectors: txt(500), excludedSectors: txt(500),
  availableCashEur: optNum, emergencyReserveEur: optNum, holdBackPreference: z.enum(["core_etf", "cash"]), scoreThreshold: z.coerce.number().int().min(0).max(100),
  maxSinglePositionPct: optNum, maxThemePct: optNum, maxTop3Pct: optNum, maxUsdPct: optNum, smallCapTargetPct: optNum,
  notifEnabled: z.string().optional(), notifEmail: z.string().trim().max(200).optional(), notifWebhook: z.string().trim().max(500).optional(),
  minNewsRelevance: z.coerce.number().int().min(0).max(100), minRiskSeverity: z.coerce.number().int().min(1).max(5), minCandidateScore: z.coerce.number().int().min(0).max(100), notifyFailedUpdates: z.string().optional(),
  demoMode: z.string().optional(),
  savingsPlans: txt(1000).optional(),
});

export async function updateSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const { db, userId } = await requireUser();
  const p = SettingsForm.safeParse(Object.fromEntries(fd));
  if (!p.success) return fail("Eingaben ungültig", p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  const d = p.data;
  if (d.monthlyBudgetEur == null || d.monthlyBudgetEur < 0 || d.monthlyBudgetEur > 1e6) return fail("Monatsbudget ungültig.");
  if (d.coreSharePct == null || d.coreSharePct < 0 || d.coreSharePct > 100) return fail("Kernanteil muss zwischen 0 und 100 % liegen.");
  if (d.notifWebhook && !/^https:\/\//.test(d.notifWebhook)) return fail("Webhook muss mit https:// beginnen.");
  if (d.notifEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.notifEmail)) return fail("E-Mail-Adresse ungültig.");
  const plans: { instrumentId: number; amountEur: number; dayOfMonth: number }[] = [];
  for (const line of (d.savingsPlans ?? "").split(/\n/).map((x) => x.trim()).filter(Boolean)) {
    const [idS, amtS, dayS] = line.split(/[;,|]/).map((x) => x.trim());
    const instrumentId = Number(idS), amountEur = parseNumber(amtS), dayOfMonth = Number(dayS ?? 1);
    if (!Number.isInteger(instrumentId) || amountEur == null || amountEur <= 0 || !(dayOfMonth >= 1 && dayOfMonth <= 28)) return fail(`Sparplan-Zeile ungültig: "${line}" (Format: Instrument-ID; Betrag; Tag)`);
    plans.push({ instrumentId, amountEur, dayOfMonth });
  }
  const list = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
  const lim = (v: number | null, fb: number) => (v != null && v > 0 && v <= 100 ? v : fb);
  const [cur] = await db.select().from(s.settings).where(eq(s.settings.userId, userId));
  await db.update(s.settings).set({
    monthlyBudgetEur: d.monthlyBudgetEur, coreSharePct: d.coreSharePct, minOrderEur: d.minOrderEur ?? 0, coreInstrumentId: d.coreInstrumentId || null,
    riskProfile: d.riskProfile, horizon: d.horizon, preferredSectors: list(d.preferredSectors), excludedSectors: list(d.excludedSectors),
    availableCashEur: d.availableCashEur, emergencyReserveEur: d.emergencyReserveEur, holdBackPreference: d.holdBackPreference, scoreThreshold: d.scoreThreshold,
    limits: { maxSinglePositionPct: lim(d.maxSinglePositionPct, 15), maxThemePct: lim(d.maxThemePct, 35), maxTop3Pct: lim(d.maxTop3Pct, 50), maxUsdPct: lim(d.maxUsdPct, 60), smallCapTargetPct: lim(d.smallCapTargetPct, 10) },
    notification: { enabled: d.notifEnabled === "on", email: d.notifEmail || null, webhookUrl: d.notifWebhook || null, minNewsRelevance: d.minNewsRelevance, minRiskSeverity: d.minRiskSeverity, minCandidateScore: d.minCandidateScore, notifyFailedUpdates: d.notifyFailedUpdates === "on" },
    savingsPlans: plans, demoMode: d.demoMode === "on", updatedAt: new Date(),
    dataCompleteness: cur.dataCompleteness,
  }).where(eq(s.settings.userId, userId));
  return done("Einstellungen gespeichert.");
}

export async function setCandidateStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const { db, userId } = await requireUser();
  const id = Number(fd.get("candidateId"));
  const status = z.enum(["universe", "watchlist", "dismissed"]).safeParse(fd.get("status"));
  if (!status.success) return fail("Status ungültig.");
  await db.update(s.candidates).set({ status: status.data }).where(and(eq(s.candidates.id, id), eq(s.candidates.userId, userId)));
  return done(status.data === "watchlist" ? "Auf Watchlist gesetzt." : status.data === "dismissed" ? "Verworfen." : "Zurück ins Universum.");
}

const NewCandidate = z.object({
  symbol: txt(20).pipe(z.string().min(1)), exchange: txt(30).pipe(z.string().min(1)), name: txt(200).pipe(z.string().min(1)),
  currency: z.string().trim().toUpperCase().length(3), sector: txt(60).optional(), eodhd: txt(40).optional(), finnhub: txt(40).optional(), note: txt(500).optional(),
});
export async function addCandidate(_: ActionState, fd: FormData): Promise<ActionState> {
  const { db, userId } = await requireUser();
  const p = NewCandidate.safeParse(Object.fromEntries(fd));
  if (!p.success) return fail("Eingaben ungültig", p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  const d = p.data;
  const key = `${d.symbol.toUpperCase()}:${d.exchange.toUpperCase()}`;
  let [i] = await db.select().from(s.instruments).where(eq(s.instruments.key, key));
  if (!i) [i] = await db.insert(s.instruments).values({ key, symbol: d.symbol.toUpperCase(), exchange: d.exchange.toUpperCase(), name: d.name, assetClass: "equity", currency: d.currency, sector: d.sector || null, region: d.currency === "USD" ? "Nordamerika" : "Europa", aliases: [d.name], providerSymbols: { ...(d.eodhd ? { eodhd: d.eodhd } : {}), ...(d.finnhub ? { finnhub: d.finnhub } : {}) } }).returning();
  await db.insert(s.candidates).values({ userId, instrumentId: i.id, status: "watchlist", source: "manual", note: d.note || null })
    .onConflictDoUpdate({ target: [s.candidates.userId, s.candidates.instrumentId], set: { status: "watchlist", note: d.note || null } });
  return done(`${i.symbol} zur Watchlist hinzugefügt. Kennzahlen folgen mit der nächsten Aktualisierung.`);
}

const ThesisForm = z.object({ instrumentId: z.coerce.number().int(), summary: txt(1000).pipe(z.string().min(5)), evidence: txt(2000).optional(), risks: txt(2000).optional(), catalysts: txt(2000).optional(), invalidation: txt(2000).optional() });
export async function addThesis(_: ActionState, fd: FormData): Promise<ActionState> {
  const { db, userId } = await requireUser();
  const p = ThesisForm.safeParse(Object.fromEntries(fd));
  if (!p.success) return fail("Eingaben ungültig", p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  await db.insert(s.theses).values({ userId, ...p.data, status: "active", lastReviewAt: new Date() });
  return done("These gespeichert.");
}

export async function reviewThesis(_: ActionState, fd: FormData): Promise<ActionState> {
  const { db, userId } = await requireUser();
  const id = Number(fd.get("thesisId"));
  const status = z.enum(["active", "review", "invalidated", "closed"]).safeParse(fd.get("status"));
  const note = sanitizeText(String(fd.get("note") ?? "")).trim();
  if (!status.success || note.length < 3) return fail("Status und Notiz erforderlich.");
  const [t] = await db.select().from(s.theses).where(and(eq(s.theses.id, id), eq(s.theses.userId, userId)));
  if (!t) return fail("These nicht gefunden.");
  await db.insert(s.thesisReviews).values({ thesisId: id, status: status.data, note, author: "user" });
  await db.update(s.theses).set({ status: status.data, lastReviewAt: new Date() }).where(eq(s.theses.id, id));
  return done("Überprüfung angehängt (ursprüngliche These bleibt unverändert).");
}

export async function markNotificationsRead(): Promise<void> {
  const { db, userId } = await requireUser();
  await db.update(s.notifications).set({ readAt: new Date() }).where(eq(s.notifications.userId, userId));
  revalidatePath("/", "layout");
}
