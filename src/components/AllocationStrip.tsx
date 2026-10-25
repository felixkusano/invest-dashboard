import clsx from "clsx";
import type { AllocLine } from "@/domain/allocation";
import { fmtEur } from "@/lib/format";

const TONE: Record<AllocLine["kind"], string> = {
  savings_plan: "bg-ink-2", core_etf: "bg-ink", opportunity: "bg-sky", small_cap: "bg-sky-deep", cash: "bg-line",
};

/** Zeigt exakt, wohin das Monatsbudget fließt. Breite proportional zum Betrag. */
export function AllocationStrip({ lines, total, large }: { lines: AllocLine[]; total: number; large?: boolean }) {
  return (
    <div>
      <div className={clsx("flex w-full overflow-hidden rounded", large ? "h-10" : "h-6")} role="img" aria-label={lines.map((l) => `${l.label} ${l.amountEur} Euro`).join(", ")}>
        {lines.map((l) => (
          <div key={l.priority} className={clsx("flex items-center justify-center text-[12px] font-medium", TONE[l.kind], l.kind === "cash" ? "text-ink" : "text-white")} style={{ width: `${(l.amountEur / Math.max(total, 1)) * 100}%` }} title={`${l.label}: ${fmtEur(l.amountEur, { decimals: 0 })}`}>
            {l.amountEur / Math.max(total, 1) > 0.12 && fmtEur(l.amountEur, { decimals: 0 })}
          </div>
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {lines.map((l) => (
          <li key={l.priority} className="flex items-baseline gap-2 text-[13px]">
            <span className={clsx("mt-1 h-2.5 w-2.5 shrink-0 rounded-sm", TONE[l.kind])} />
            <span className="min-w-0 flex-1 truncate">{l.label}</span>
            <span className="num font-medium">{fmtEur(l.amountEur, { decimals: 0 })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
