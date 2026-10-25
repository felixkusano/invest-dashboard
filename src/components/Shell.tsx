"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import clsx from "clsx";

export const NAV = [
  { href: "/", label: "Übersicht" },
  { href: "/portfolio", label: "Mein Portfolio" },
  { href: "/news", label: "News Intelligence" },
  { href: "/macro", label: "Makro & Märkte" },
  { href: "/opportunities", label: "Investmentchancen" },
  { href: "/allocation", label: "Kapitalallokation" },
  { href: "/calendar", label: "Kalender" },
  { href: "/reports", label: "Historische Reports" },
  { href: "/settings", label: "Einstellungen & Daten" },
];

export function Nav() {
  const path = usePathname();
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  return (
    <nav aria-label="Hauptnavigation" className="flex gap-1 overflow-x-auto px-2 lg:flex-col lg:overflow-visible lg:px-3">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}
          className={clsx("whitespace-nowrap rounded px-3 py-1.5 text-[13.5px] text-white/75 hover:bg-white/10 hover:text-white hover:no-underline",
            active(n.href) && "bg-white/12 font-medium text-white shadow-[inset_3px_0_0_var(--color-sky)]")}>
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

export function RefreshButton() {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; msg: string | null; ok: boolean | null }>({ busy: false, msg: null, ok: null });
  async function run() {
    setState({ busy: true, msg: "Aktualisierung läuft. Das kann einige Minuten dauern.", ok: null });
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (j.status === "skipped") setState({ busy: false, ok: null, msg: "Es läuft bereits eine Aktualisierung." });
      else if (res.ok) {
        const failed = (j.steps ?? []).filter((s: { status: string }) => s.status === "failed").map((s: { step: string }) => s.step);
        setState({ busy: false, ok: failed.length === 0, msg: failed.length ? `Teilweise aktualisiert. Fehlgeschlagen: ${failed.join(", ")}` : "Aktualisiert." });
      } else setState({ busy: false, ok: false, msg: `Aktualisierung fehlgeschlagen: ${j.error ?? (j.steps ?? []).filter((s: { status: string }) => s.status === "failed").map((s: { step: string; message: string }) => `${s.step}: ${s.message}`).join(" | ") ?? res.status}` });
      router.refresh();
    } catch (e) {
      setState({ busy: false, ok: false, msg: `Aktualisierung fehlgeschlagen: ${(e as Error).message}` });
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn btn-quiet" onClick={run} disabled={state.busy}>{state.busy ? "Aktualisiere …" : "Jetzt aktualisieren"}</button>
      {state.msg && <span role="status" className={clsx("text-xs", state.ok === false ? "text-neg" : state.ok ? "text-pos" : "text-muted")}>{state.msg}</span>}
    </div>
  );
}

export function FormMessage({ state }: { state: { ok: boolean; message: string; details?: string[] } | null }) {
  if (!state) return null;
  return (
    <div role="status" className={clsx("mt-2 rounded px-3 py-2 text-[13px]", state.ok ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg")}>
      {state.message}
      {state.details?.length ? <ul className="mt-1 list-disc pl-5 text-ink-2">{state.details.slice(0, 12).map((d, i) => <li key={i}>{d}</li>)}</ul> : null}
    </div>
  );
}

export function Collapsible({ summary, children, defaultOpen = false }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="cursor-pointer select-none text-[13px] font-medium text-sky-deep">{summary}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
