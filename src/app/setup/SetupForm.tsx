"use client";
import { useActionState, useState } from "react";
import { generateSecrets, type SetupState } from "./actions";

function CopyRow({ name, value }: { name: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <code className="text-[13px] font-semibold">{name}</code>
        <button type="button" className="btn btn-quiet px-2 py-1 text-xs" onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); }}>{copied ? "Kopiert" : "Kopieren"}</button>
      </div>
      <code className="mt-1 block break-all text-xs text-ink-2">{value}</code>
    </div>
  );
}

export function SetupForm() {
  const [state, action, pending] = useActionState<SetupState, FormData>(generateSecrets, null);
  if (state?.ok && state.values) {
    return (
      <div className="space-y-3">
        <p className="rounded bg-pos-soft px-3 py-2 text-[13px] text-pos">{state.message} Die Werte werden nirgends gespeichert. Seite erst schließen, wenn alle drei in Vercel eingetragen sind.</p>
        {Object.entries(state.values).map(([k, v]) => <CopyRow key={k} name={k} value={v} />)}
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <label className="block"><span className="label">Passwort für das Dashboard (mindestens 12 Zeichen)</span><input name="password" type="password" autoComplete="new-password" required minLength={12} className="mt-0.5 w-full" /></label>
      <label className="block"><span className="label">Passwort wiederholen</span><input name="password2" type="password" autoComplete="new-password" required minLength={12} className="mt-0.5 w-full" /></label>
      {state && !state.ok && <p role="alert" className="rounded bg-neg-soft px-3 py-2 text-[13px] text-neg">{state.message}</p>}
      <button className="btn w-full justify-center" disabled={pending}>{pending ? "Erzeuge …" : "Werte erzeugen"}</button>
    </form>
  );
}
