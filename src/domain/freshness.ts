/** Datenstatus für die Statusanzeige: Aktuell | Teilweise aktualisiert | Veraltet | Aktualisierung fehlgeschlagen. */
export type DashboardStatus = "current" | "partial" | "stale" | "failed" | "never";

export type RunInfo = { status: "running" | "success" | "partial" | "failed" | "skipped"; finishedAt: Date | null; startedAt: Date };

export function dashboardStatus(lastRun: RunInfo | null, lastSuccessAt: Date | null, now: Date, maxAgeHours = 26): DashboardStatus {
  if (!lastRun && !lastSuccessAt) return "never";
  if (lastRun?.status === "failed") return "failed";
  const ref = lastSuccessAt ?? lastRun?.finishedAt ?? null;
  if (!ref || (now.getTime() - ref.getTime()) / 3600e3 > maxAgeHours) return "stale";
  if (lastRun?.status === "partial") return "partial";
  return "current";
}

export const STATUS_LABEL: Record<DashboardStatus, string> = {
  current: "Aktuell",
  partial: "Teilweise aktualisiert",
  stale: "Veraltete Daten",
  failed: "Aktualisierung fehlgeschlagen",
  never: "Noch keine Aktualisierung",
};

/** Kursalter relativ zum erwarteten letzten Handelstag. */
export function priceFreshness(priceDate: string | null, expectedTradingDay: string): "fresh" | "lagging" | "missing" {
  if (!priceDate) return "missing";
  return priceDate >= expectedTradingDay ? "fresh" : "lagging";
}
