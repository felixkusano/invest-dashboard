import Link from "next/link";
import { requireUser } from "@/server/session";
import { computeAnalytics } from "@/server/analytics";
import { Badge, Bars, Delta, Empty, EurDelta, PageHeader, Panel, ValueSourceBadge } from "@/components/ui";
import { SortTable, type Row } from "@/components/SortTable";
import { ActionForm, Field } from "@/components/ActionForm";
import { Collapsible } from "@/components/Shell";
import { addHolding, importHoldingsCsv } from "@/server/actions";
import { fmtDate, fmtEur, fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { themeLabel } from "@/domain/allocation";
import { costBasisConsistency } from "@/domain/portfolio";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const { db, userId } = await requireUser();
  const a = await computeAnalytics(db, userId);
  const S = a.summary;
  const sec = S.positions.filter((p) => p.assetClass !== "crypto");

  const rows: Row[] = S.positions.map((p) => {
    const cc = costBasisConsistency(p.costBasisEur, p.importedValueEur, p.importedPerfPct);
    return {
      id: p.holdingId,
      search: `${p.name} ${p.symbol} ${p.sector ?? ""}`,
      cells: {
        name: { display: <div><Link href={`/portfolio/${p.holdingId}`} className="font-medium">{p.name}</Link><div className="label">{p.symbol} | {({ equity: "Aktie", etf: "ETF", crypto: "Krypto" })[p.assetClass]}</div></div>, sort: p.name },
        qty: { display: <span className="num">{p.quantity != null ? fmtNum(p.quantity, p.quantity % 1 ? 4 : 0) : <Badge tone="warn">fehlt</Badge>}</span>, sort: p.quantity },
        price: { display: p.price ? <div className="num">{fmtMoney(p.price.close, p.price.currency)}<div className="label">{fmtDate(p.price.priceDate)}</div></div> : <span className="text-muted">kein Kurs</span>, sort: p.price?.close ?? null },
        value: { display: <div className="num font-medium">{fmtEur(p.provisionalValueEur)}<div className="mt-0.5"><ValueSourceBadge source={p.valueSource} dataType={p.price?.dataType} /></div></div>, sort: p.provisionalValueEur },
        day: { display: <Delta v={p.dailyChangePct} />, sort: p.dailyChangePct },
        cost: { display: <div className="num">{fmtEur(p.costBasisEur)}{p.costBasisSource === "prior_statement" && <div className="label">frühere Angabe{cc.consistent ? ", geprüft" : ""}</div>}</div>, sort: p.costBasisEur },
        pnl: { display: <EurDelta v={p.unrealizedPnlEur} />, sort: p.unrealizedPnlEur },
        ret: { display: <Delta v={p.totalReturnPct} />, sort: p.totalReturnPct },
        shot: { display: <span className="num text-muted">{fmtPct(p.importedPerfPct)}</span>, sort: p.importedPerfPct },
        weight: { display: <span className="num">{p.assetClass === "crypto" ? "separat" : fmtPct(p.weightPct, 1, false)}</span>, sort: p.weightPct },
      },
    };
  });

  const top = sec.filter((p) => p.weightPct != null).sort((x, y) => y.weightPct! - x.weightPct!);
  const themes = Object.entries(a.themeWeights).filter(([t]) => t !== "crypto").sort((x, y) => y[1] - x[1]);

  return (
    <div className="space-y-6">
      <PageHeader title="Mein Portfolio" lead={`Wertpapierdepot ${fmtEur(S.securities.provisionalValueEur)} (vorläufig), davon ${fmtEur(S.securities.verifiedValueEur)} verifiziert. Krypto ${fmtEur(S.crypto.provisionalValueEur)} separat.`}
        right={<Link href="/portfolio/risk" className="btn btn-quiet">Risikomonitor</Link>} />

      <Panel title="Positionen" note="Marktwert = Stückzahl × Kurs × FX. Fehlt eines davon, steht der Screenshot-Wert als vorläufig. Screenshot-Performance ist unverifiziert und kein Tageswert.">
        <SortTable initialSort="value" filterPlaceholder="Position suchen" rows={rows} columns={[
          { key: "name", label: "Position" }, { key: "qty", label: "Stück", align: "right" }, { key: "price", label: "Kurs", align: "right" },
          { key: "value", label: "Wert EUR", align: "right" }, { key: "day", label: "Letzter Tag", align: "right" }, { key: "cost", label: "Einstand", align: "right" },
          { key: "pnl", label: "Unreal. G/V", align: "right" }, { key: "ret", label: "Seit Kauf", align: "right" }, { key: "shot", label: "Screenshot-Perf.", align: "right" },
          { key: "weight", label: "Gewicht", align: "right" },
        ]} />
        {S.duplicatesDropped.length > 0 && <p className="mt-2 text-[13px] text-neg">Doppelte Positionen ignoriert: {S.duplicatesDropped.join(", ")}</p>}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Größte Positionen" note={`Limit Einzelposition ${a.settings.limits.maxSinglePositionPct} %`}>
          <Bars rows={top.slice(0, 8).map((p) => ({ label: p.name, pct: p.weightPct!, tone: p.assetClass === "equity" && p.weightPct! > a.settings.limits.maxSinglePositionPct ? "neg" : undefined }))} />
        </Panel>
        <Panel title="Themencluster" note={`Direkte Einzeltitel, Limit ${a.settings.limits.maxThemePct} %. ETFs nicht durchgeschaut.`}>
          {themes.length ? <Bars rows={themes.map(([t, w]) => ({ label: themeLabel(t), pct: w, tone: w > a.settings.limits.maxThemePct ? "neg" : undefined }))} max={100} /> : <Empty title="Keine Themen" />}
        </Panel>
        <Panel title="Notierungswährung" note="Währungsrisiko der ETFs liegt im Index (überwiegend USD), nicht in der Notierung.">
          <Bars rows={a.exposures.currency} />
        </Panel>
      </div>

      <Panel title="ETF-Overlap und Durchschau" note={a.overlap.hasConstituents ? `Durchschau deckt ${fmtNum(a.overlap.lookThrough.coveragePct, 0)} % des ETF-Volumens ab.` : "Ohne Holdings-Dateien nur strukturelle Einordnung. Import je ETF auf der Positionsseite."}>
        <ul className="space-y-3">
          {a.overlap.pairs.map((p) => (
            <li key={`${p.a}-${p.b}`}>
              <div className="flex items-center gap-2"><span className="font-medium">{p.a} und {p.b}</span>{p.overlapPct != null ? <Badge tone="sky">Overlap {fmtPct(p.overlapPct, 1, false)}</Badge> : <Badge tone="warn">approximativ</Badge>}</div>
              {p.note && <p className="mt-0.5 max-w-[90ch] text-[13px] text-ink-2">{p.note}</p>}
            </li>
          ))}
        </ul>
        {a.overlap.hasConstituents ? (
          <div className="mt-4 overflow-x-auto">
            <h3 className="mb-2">Effektives Exposure der größten Einzelwerte (direkt plus über ETFs)</h3>
            <table className="data-table"><thead><tr><th>Titel</th><th className="text-right">Direkt</th><th className="text-right">Über ETFs</th><th className="text-right">Gesamt</th><th className="text-right">Anteil Depot</th></tr></thead>
              <tbody>{a.overlap.lookThrough.rows.slice(0, 15).map((r) => <tr key={r.key}><td>{r.name}</td><td className="num text-right">{fmtEur(r.directEur)}</td><td className="num text-right">{fmtEur(r.viaEtfEur)}</td><td className="num text-right font-medium">{fmtEur(r.totalEur)}</td><td className="num text-right">{fmtPct(r.pctOfPortfolio, 1, false)}</td></tr>)}</tbody>
            </table>
          </div>
        ) : null}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Position hinzufügen">
          <ActionForm action={addHolding} submitLabel="Position anlegen">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Symbol"><input name="symbol" required placeholder="z. B. MSFT" /></Field>
              <Field label="Börse"><input name="exchange" required placeholder="NASDAQ, XETRA, …" /></Field>
              <Field label="Name"><input name="name" required /></Field>
              <Field label="ISIN (optional)"><input name="isin" /></Field>
              <Field label="Anlageklasse"><select name="assetClass" defaultValue="equity"><option value="equity">Aktie</option><option value="etf">ETF</option><option value="crypto">Krypto</option></select></Field>
              <Field label="Währung der Notierung"><input name="currency" required defaultValue="EUR" maxLength={3} /></Field>
              <Field label="Stückzahl"><input name="quantity" inputMode="decimal" /></Field>
              <Field label="Einstandswert EUR"><input name="costBasisEur" inputMode="decimal" /></Field>
              <Field label="EODHD-Symbol" hint="z. B. MSFT.US, SAP.XETRA"><input name="eodhd" /></Field>
              <Field label="Finnhub-Symbol" hint="nur US im Free Tier"><input name="finnhub" /></Field>
            </div>
          </ActionForm>
        </Panel>
        <Panel title="CSV-Import" note="Spalten: ISIN oder Symbol, optional Börse, Name, Stück, Einstandswert, Währung, Anlageklasse. Deutsche Zahlenformate und Semikolon werden erkannt. Bestehende Positionen werden aktualisiert, nicht dupliziert.">
          <ActionForm action={importHoldingsCsv} submitLabel="CSV importieren" quiet>
            <input type="file" name="file" accept=".csv,text/csv" required />
          </ActionForm>
          <Collapsible summary="Beispiel">
            <pre className="overflow-x-auto rounded bg-paper p-3 text-xs">{`ISIN;Name;Stück;Einstandswert;Währung\nUS67066G1040;NVIDIA;12;546,00;USD\nIE00BK5BQT80;Vanguard FTSE All-World;3,5;410,00;EUR`}</pre>
          </Collapsible>
        </Panel>
      </div>
    </div>
  );
}
