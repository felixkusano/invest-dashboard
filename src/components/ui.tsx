import clsx from "clsx";
import type { ReactNode } from "react";
import { fmtEur, fmtPct, signClass } from "@/lib/format";
import { KIND_LABEL } from "@/ai/schemas";

export function Panel({ title, action, children, className, note }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; note?: ReactNode }) {
  return (
    <section className={clsx("panel", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            {title && <h2>{title}</h2>}
            {note && <p className="label mt-0.5">{note}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, lead, right }: { title: string; lead?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="max-w-3xl">
        <h1>{title}</h1>
        {lead && <p className="mt-1 text-ink-2">{lead}</p>}
      </div>
      {right}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "pos" | "neg" | null }) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className={clsx("num mt-0.5 text-xl font-semibold", tone === "pos" && "text-pos", tone === "neg" && "text-neg")}>{value}</div>
      {sub && <div className="label mt-0.5">{sub}</div>}
    </div>
  );
}

type Tone = "neutral" | "sky" | "pos" | "neg" | "warn" | "demo";
export function Badge({ children, tone = "neutral", title }: { children: ReactNode; tone?: Tone; title?: string }) {
  return (
    <span title={title} className={clsx("inline-flex items-center whitespace-nowrap rounded px-1.5 py-px text-[11.5px] font-medium",
      tone === "neutral" && "bg-paper text-ink-2 ring-1 ring-line",
      tone === "sky" && "bg-sky-soft text-sky-deep",
      tone === "pos" && "bg-pos-soft text-pos",
      tone === "neg" && "bg-neg-soft text-neg",
      tone === "warn" && "bg-warn-soft text-warn",
      tone === "demo" && "bg-neg text-white")}>{children}</span>
  );
}

export function Delta({ v, decimals = 2 }: { v: number | null | undefined; decimals?: number }) {
  return <span className={clsx("num", signClass(v))}>{fmtPct(v, decimals)}</span>;
}

export function EurDelta({ v }: { v: number | null | undefined }) {
  return <span className={clsx("num", signClass(v))}>{v != null && v > 0 ? "+" : ""}{fmtEur(v)}</span>;
}

export function ValueSourceBadge({ source, dataType }: { source: "market" | "imported" | "missing"; dataType?: string | null }) {
  if (source === "market") {
    if (dataType === "demo") return <Badge tone="demo">Demo</Badge>;
    return <Badge tone="sky" title="Stückzahl × Kurs × FX">{dataType === "realtime" ? "Echtzeit" : dataType === "delayed" ? "verzögert" : "Schlusskurs"}</Badge>;
  }
  if (source === "imported") return <Badge tone="warn" title="Wert aus Screenshot, nicht verifiziert">Screenshot</Badge>;
  return <Badge tone="neg">kein Wert</Badge>;
}

export function KindBadge({ kind }: { kind: keyof typeof KIND_LABEL }) {
  const tone: Tone = kind === "fact" ? "sky" : kind === "forecast" ? "warn" : "neutral";
  return <Badge tone={tone}>{KIND_LABEL[kind]}</Badge>;
}

export function ImpactBadge({ impact }: { impact: string | null | undefined }) {
  const m: Record<string, [string, Tone]> = { positive: ["positiv", "pos"], negative: ["negativ", "neg"], mixed: ["gemischt", "warn"], unclear: ["unklar", "neutral"] };
  const [l, t] = m[impact ?? "unclear"] ?? m.unclear;
  return <Badge tone={t}>{l}</Badge>;
}

export function EventStatusBadge({ status }: { status: string }) {
  if (status === "confirmed") return <Badge tone="sky">bestätigt</Badge>;
  if (status === "estimated") return <Badge tone="warn">geschätzt</Badge>;
  return <Badge tone="warn">unbestätigt</Badge>;
}

export function Severity({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={`Schweregrad ${n} von 5`}>
      <span className="flex gap-0.5">{[1, 2, 3, 4, 5].map((i) => <span key={i} className={clsx("h-2.5 w-1.5 rounded-[1px]", i <= n ? (n >= 4 ? "bg-neg" : n >= 3 ? "bg-warn" : "bg-sky") : "bg-line")} />)}</span>
      <span className="num text-xs text-muted">{n}/5</span>
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded border border-dashed border-line bg-paper px-4 py-6 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-xl text-ink-2">{children}</div>}
    </div>
  );
}

/** Horizontale Balken für Expositionen (absteigend sortiert übergeben). */
export function Bars({ rows, max }: { rows: { label: string; pct: number; valueEur?: number; tone?: "sky" | "warn" | "neg" }[]; max?: number }) {
  const m = max ?? Math.max(...rows.map((r) => r.pct), 1);
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(7rem,11rem)_1fr_auto] items-center gap-2 text-[13px]">
          <span className="truncate" title={r.label}>{r.label}</span>
          <span className="h-2 rounded-sm bg-paper"><span className={clsx("block h-2 rounded-sm", r.tone === "warn" ? "bg-warn" : r.tone === "neg" ? "bg-neg" : "bg-sky")} style={{ width: `${Math.min(100, (r.pct / m) * 100)}%` }} /></span>
          <span className="num w-16 text-right">{fmtPct(r.pct, 1, false)}</span>
        </li>
      ))}
    </ul>
  );
}

export function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>;
}
