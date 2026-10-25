export const dynamic = "force-dynamic";

const ERR: Record<string, string> = {
  invalid: "E-Mail oder Passwort falsch.",
  rate: "Zu viele Fehlversuche. Bitte 15 Minuten warten.",
  config: "Server nicht konfiguriert: ADMIN_EMAIL, SESSION_SECRET und ADMIN_PASSWORD_HASH setzen.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-ink px-4">
      <form method="post" action="/api/auth/login" className="w-full max-w-sm rounded-md bg-white p-6">
        <h1 className="text-xl">Investment Desk</h1>
        <p className="label mt-1">Privates Dashboard. Anmeldung erforderlich.</p>
        <input type="hidden" name="next" value={sp.next ?? "/"} />
        <label className="mt-5 block"><span className="label">E-Mail</span><input name="email" type="email" autoComplete="username" required className="mt-0.5 w-full" /></label>
        <label className="mt-3 block"><span className="label">Passwort</span><input name="password" type="password" autoComplete="current-password" required className="mt-0.5 w-full" /></label>
        {sp.error && <p role="alert" className="mt-3 rounded bg-neg-soft px-3 py-2 text-[13px] text-neg">{ERR[sp.error] ?? "Anmeldung fehlgeschlagen."}{sp.error === "config" && <> <a href="/setup" className="underline">Zur Einrichtung</a></>}</p>}
        <button className="btn mt-5 w-full justify-center" type="submit">Anmelden</button>
      </form>
    </main>
  );
}
