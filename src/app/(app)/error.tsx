"use client";
/** Fehlerseite innerhalb des Dashboards. Verweist auf die Diagnose statt einer leeren Meldung. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-16">
      <h1>Die Seite konnte nicht geladen werden</h1>
      <p className="mt-2 text-ink-2">Meist liegt das an der Datenbank-Verbindung oder einer fehlenden Einstellung in Vercel. Die Diagnose zeigt die genaue Ursache.</p>
      <div className="mt-4 flex gap-2">
        <a className="btn" href="/setup">Diagnose öffnen</a>
        <button className="btn btn-quiet" onClick={() => reset()}>Erneut versuchen</button>
      </div>
      {error.digest && <p className="label mt-4">Fehlercode {error.digest}</p>}
    </div>
  );
}
