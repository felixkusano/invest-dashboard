"use client";
import { useActionState, type ReactNode } from "react";
import { FormMessage } from "./Shell";

type State = { ok: boolean; message: string; details?: string[] } | null;

/** Formular mit Server Action, Ladezustand und Ergebnismeldung. */
export function ActionForm({ action, children, submitLabel, className, quiet, encType }: {
  action: (s: State, fd: FormData) => Promise<State>; children: ReactNode; submitLabel: string; className?: string; quiet?: boolean; encType?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className} encType={encType}>
      {children}
      <div className="mt-3 flex items-center gap-2">
        <button type="submit" className={quiet ? "btn btn-quiet" : "btn"} disabled={pending}>{pending ? "Speichere …" : submitLabel}</button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

/** Kompakter Ein-Klick-Button (z. B. Watchlist, Verwerfen). */
export function ActionButton({ action, fields, label, quiet = true }: { action: (s: State, fd: FormData) => Promise<State>; fields: Record<string, string | number>; label: string; quiet?: boolean }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="inline">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button type="submit" className={quiet ? "btn btn-quiet px-2 py-1 text-xs" : "btn px-2 py-1 text-xs"} disabled={pending}>{pending ? "…" : label}</button>
      {state && !state.ok && <span className="ml-2 text-xs text-neg">{state.message}</span>}
    </form>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label block">{label}</span>
      <span className="mt-0.5 block [&>input]:w-full [&>select]:w-full [&>textarea]:w-full">{children}</span>
      {hint && <span className="label mt-0.5 block">{hint}</span>}
    </label>
  );
}
