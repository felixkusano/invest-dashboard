import { SetupForm } from "./SetupForm";
import { diagnose } from "@/server/diagnose";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VARS: { name: string; required: boolean; hint: string }[] = [
  { name: "ADMIN_EMAIL", required: true, hint: "deine Login-E-Mail" },
  { name: "ADMIN_PASSWORD_HASH", required: true, hint: "von dieser Seite" },
  { name: "SESSION_SECRET", required: true, hint: "von dieser Seite" },
  { name: "CRON_SECRET", required: true, hint: "von dieser Seite" },
  { name: "DATABASE_URL", required: true, hint: "Supabase Transaction Pooler" },
  { name: "FINNHUB_API_KEY", required: false, hint: "US-Kurse, News, Kennzahlen" },
  { name: "EODHD_API_KEY", required: false, hint: "Europa-Kurse, ETFs, Indizes" },
  { name: "FRED_API_KEY", required: false, hint: "US-Makrodaten" },
];

function VarStatus() {
  return (
    <ul className="mt-2 space-y-1 text-[13px]">
      {VARS.map((v) => {
        const set = !!process.env[v.name];
        return (
          <li key={v.name} className="flex items-center justify-between gap-2">
            <span><code>{v.name}</code> <span className="label">{v.hint}{v.required ? "" : ", optional"}</span></span>
            <span className={set ? "text-pos" : v.required ? "text-neg" : "text-muted"}>{set ? "gesetzt" : "fehlt"}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Einrichtungshilfe und Diagnose. Zeigt nur, ob Variablen gesetzt sind, nie deren Werte.
 * Nach erfolgter Einrichtung ist die Passwort-Erzeugung deaktiviert, die Diagnose bleibt sichtbar.
 */
export default async function Setup() {
  const done = !!process.env.ADMIN_PASSWORD_HASH && !!process.env.SESSION_SECRET && !!process.env.ADMIN_EMAIL;
  const diag = process.env.DATABASE_URL ? await diagnose() : null;
  return (
    <main className="grid min-h-screen place-items-center bg-ink px-4 py-10">
      <div className="w-full max-w-lg rounded-md bg-white p-6">
        <h1 className="text-xl">Einrichtung</h1>
        {done ? (
          <p className="mt-3 text-ink-2">Die Anmeldung ist eingerichtet. Die Passwort-Erzeugung ist deaktiviert. <a href="/login">Zur Anmeldung</a></p>
        ) : (
          <>
            <p className="label mt-1">Erzeugt Passwort-Hash und Secrets für die Umgebungsvariablen in Vercel. Danach in Vercel neu deployen.</p>
            <div className="mt-4"><SetupForm /></div>
          </>
        )}
        <h2 className="mt-6">Status der Variablen</h2>
        <VarStatus />
        {diag && (
          <>
            <h2 className="mt-6">Datenbank-Diagnose</h2>
            <ul className="mt-2 space-y-2 text-[13px]">
              {diag.map((d) => (
                <li key={d.name}>
                  <span className={d.ok ? "font-medium text-pos" : "font-medium text-neg"}>{d.ok ? "OK" : "Fehler"}: {d.name}</span>
                  <div className="text-ink-2 break-words">{d.message}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
