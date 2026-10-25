"use client";
/**
 * Sortier- und filterbare Tabelle. Zellen kommen vorformatiert vom Server (display) plus Sortierwert (sort),
 * damit keine Formatierungslogik im Client dupliziert wird. Fehlende Werte sortieren immer ans Ende.
 */
import { useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";

export type Cell = { display: ReactNode; sort?: number | string | null; className?: string };
export type Column = { key: string; label: string; align?: "left" | "right"; width?: string };
export type Row = { id: string | number; cells: Record<string, Cell>; href?: string; search?: string };

export function SortTable({ columns, rows, initialSort, initialDir = "desc", filterPlaceholder, empty }: {
  columns: Column[]; rows: Row[]; initialSort?: string; initialDir?: "asc" | "desc"; filterPlaceholder?: string; empty?: ReactNode;
}) {
  const [sort, setSort] = useState(initialSort ?? columns[0].key);
  const [dir, setDir] = useState<"asc" | "desc">(initialDir);
  const [q, setQ] = useState("");
  const data = useMemo(() => {
    const f = q.trim().toLowerCase();
    const filtered = f ? rows.filter((r) => (r.search ?? "").toLowerCase().includes(f)) : rows;
    return [...filtered].sort((a, b) => {
      const x = a.cells[sort]?.sort, y = b.cells[sort]?.sort;
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "de");
      return dir === "asc" ? c : -c;
    });
  }, [rows, sort, dir, q]);
  return (
    <div>
      {filterPlaceholder && (
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={filterPlaceholder} aria-label={filterPlaceholder} className="mb-3 w-full max-w-xs" />
      )}
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={{ width: c.width }} className={clsx(c.align === "right" && "text-right")} aria-sort={sort === c.key ? (dir === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={() => { if (sort === c.key) setDir(dir === "asc" ? "desc" : "asc"); else { setSort(c.key); setDir("desc"); } }}>
                    {c.label}<span aria-hidden className="text-[10px]">{sort === c.key ? (dir === "asc" ? "▲" : "▼") : ""}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                {columns.map((c) => {
                  const cell = r.cells[c.key];
                  return <td key={c.key} className={clsx(c.align === "right" && "text-right", cell?.className)}>{cell?.display ?? "–"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!data.length && <div className="py-6 text-center text-muted">{empty ?? "Keine Einträge."}</div>}
      </div>
    </div>
  );
}
