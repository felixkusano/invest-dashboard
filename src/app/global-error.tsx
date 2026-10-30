"use client";
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="de">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1rem", maxWidth: 560, margin: "0 auto", color: "#0e2240" }}>
        <h1>Die Seite konnte nicht geladen werden</h1>
        <p>Meist liegt das an der Datenbank-Verbindung oder einer fehlenden Einstellung in Vercel.</p>
        <p><a href="/setup">Diagnose öffnen</a></p>
        {error.digest && <p style={{ color: "#6b7f99" }}>Fehlercode {error.digest}</p>}
      </body>
    </html>
  );
}
