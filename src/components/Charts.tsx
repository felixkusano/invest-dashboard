"use client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const nf = (d: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: d, minimumFractionDigits: d });
const df = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });

/** Zeitreihe (Kurs oder Makroindikator). Daten aufsteigend nach Datum. */
export function SeriesChart({ data, unit, decimals = 2, height = 220 }: { data: { date: string; value: number }[]; unit?: string; decimals?: number; height?: number }) {
  if (data.length < 2) return <p className="label">Zu wenige Datenpunkte für einen Verlauf.</p>;
  const up = data[data.length - 1].value >= data[0].value;
  const color = up ? "#18804f" : "#c0392b";
  const id = `g${Math.round(data[0].value * 1000)}${data.length}`;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.14} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e8eef6" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d) => df.format(new Date(d + "T12:00:00Z"))} tick={{ fontSize: 11, fill: "#6b7f99" }} minTickGap={40} axisLine={false} tickLine={false} />
          <YAxis domain={["auto", "auto"]} tickFormatter={(v) => nf(decimals > 2 ? 2 : decimals).format(v)} tick={{ fontSize: 11, fill: "#6b7f99" }} width={58} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={(v) => [`${nf(decimals).format(Number(v))}${unit ? ` ${unit}` : ""}`, "Wert"]}
            labelFormatter={(d) => df.format(new Date(String(d) + "T12:00:00Z"))}
            contentStyle={{ fontSize: 12, borderRadius: 4, borderColor: "#d9e4f0" }}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.6} fill={`url(#${id})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
