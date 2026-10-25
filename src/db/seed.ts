import { eq } from "drizzle-orm";
import type { Db } from "./client";
import * as s from "./schema";
import {
  PORTFOLIO_INSTRUMENTS, SCREENSHOT_HOLDINGS, DEFAULT_UNIVERSE, MACRO_SERIES, SEED_EVENTS,
  DEFAULT_LIMITS, DEFAULT_NOTIFICATION, DEFAULT_SCHEDULE, SCREENSHOT_DATE, type SeedInstrument,
} from "./seed-data";

async function upsertInstrument(db: Db, i: SeedInstrument): Promise<number> {
  await db.insert(s.instruments).values({ ...i, notes: i.notes ?? null }).onConflictDoNothing();
  const [row] = await db.select({ id: s.instruments.id }).from(s.instruments).where(eq(s.instruments.key, i.key));
  return row.id;
}

/** Idempotent: legt Nutzer, Einstellungen, Startportfolio, Scanner-Universum, Makroreihen und verifizierte Termine an. */
const inflight = new Map<string, Promise<number>>();

export function ensureSeeded(db: Db, email: string): Promise<number> {
  // Parallele Requests (Layout und Seite) teilen sich denselben Seed-Vorgang.
  const key = email;
  let p = inflight.get(key);
  if (!p) {
    p = seedOnce(db, email).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

async function seedOnce(db: Db, email: string): Promise<number> {
  const found = await db.select().from(s.users).where(eq(s.users.email, email));
  if (found[0]) return found[0].id;

  const [created] = await db.insert(s.users).values({ email }).onConflictDoNothing().returning();
  if (!created) return (await db.select().from(s.users).where(eq(s.users.email, email)))[0].id;
  const user = created;
  const ids = new Map<string, number>();
  for (const i of PORTFOLIO_INSTRUMENTS) ids.set(i.key, await upsertInstrument(db, i));

  for (const h of SCREENSHOT_HOLDINGS) {
    const instrumentId = ids.get(h.key)!;
    await db.insert(s.holdings).values({
      userId: user.id, instrumentId, quantity: null,
      costBasisEur: h.costBasis ?? null,
      costBasisSource: h.costBasis != null ? "prior_statement" : null,
      importedValueEur: h.value, importedPerfPct: h.perf,
      importedAt: new Date(SCREENSHOT_DATE + "T12:00:00Z"), importedSource: "Screenshot (unverifiziert)",
      dataQuality: "unverified", notes: h.costNote ?? null,
    }).onConflictDoNothing();
  }

  await db.insert(s.settings).values({
    userId: user.id,
    monthlyBudgetEur: 500, coreSharePct: 80, minOrderEur: 50,
    coreInstrumentId: ids.get("IE00BK5BQT80") ?? null, // FTSE All-World als Kern: breiter als MSCI World (inkl. Schwellenländer)
    limits: DEFAULT_LIMITS, notification: DEFAULT_NOTIFICATION, schedule: DEFAULT_SCHEDULE,
    preferredSectors: ["Halbleiter", "Technologie", "Software", "Industrie", "Versorger"],
    excludedSectors: [], savingsPlans: [], availableCashEur: null, emergencyReserveEur: null,
  }).onConflictDoNothing();

  for (const i of DEFAULT_UNIVERSE) {
    const id = await upsertInstrument(db, i);
    await db.insert(s.candidates).values({ userId: user.id, instrumentId: id, status: "universe", source: "default_universe" }).onConflictDoNothing();
  }

  for (const m of MACRO_SERIES) await db.insert(s.macroSeries).values(m).onConflictDoNothing();

  for (const e of SEED_EVENTS) {
    const sym = e.symbol ? PORTFOLIO_INSTRUMENTS.find((p) => p.symbol === e.symbol) : null;
    await db.insert(s.calendarEvents).values({
      eventKey: e.eventKey, eventType: e.eventType, title: e.title, startsAt: new Date(e.startsAt), allDay: e.allDay,
      instrumentId: sym ? ids.get(sym.key) ?? null : null, region: e.region, importance: e.importance, consensus: e.consensus,
      status: e.status, source: e.source, sourceUrl: e.sourceUrl,
    }).onConflictDoNothing();
  }
  return user.id;
}
