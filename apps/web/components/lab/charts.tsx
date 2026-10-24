"use client";
import { useEffect, useRef, useState } from "react";

/* Chart tokens: validated against the #141032 surface (dark mode only; the app is dark). */
export const VIZ = {
  surface: "#141032",
  grid: "#2a2456",
  textPrimary: "#f1edff",
  textSecondary: "#b8b0dc",
  textMuted: "#8a82b3",
  series: "#7c5ce6",
  guardian: { inferno: "#e8432a", aqua: "#1f95d6", terra: "#4f9e2c", zephyr: "#9a78e0" } as Record<string, string>,
  /** Fixed-order categorical slots for generated worlds (validated on this surface). */
  categorical: ["#3987e5", "#d95926", "#199e70", "#c98500"],
};

/** Colour follows the character (its slot in the pack), never its rank. */
export const characterColor = (id: string, index: number) => VIZ.guardian[id] ?? VIZ.categorical[index % 4];

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(480);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

interface Tip {
  x: number;
  y: number;
  value: string;
  label: string;
  extra?: string;
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-white/15 bg-[#0d0a24]/95 px-3 py-2 text-xs shadow-xl"
      style={{ left: tip.x, top: tip.y - 8 }}>
      <div className="text-sm font-semibold text-ink">{tip.value}</div>
      <div className="text-muted">{tip.label}</div>
      {tip.extra && <div className="mt-0.5 text-muted">{tip.extra}</div>}
    </div>
  );
}

export function ChartCard({ title, subtitle, children, table }: {
  title: string; subtitle?: string; children: React.ReactNode; table: { head: string[]; rows: (string | number)[][] };
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className="rounded-2xl border border-white/10 p-4 sm:p-5" style={{ background: VIZ.surface }}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        <button onClick={() => setShowTable((s) => !s)} className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[11px] text-muted hover:text-ink"
          aria-pressed={showTable}>
          {showTable ? "Chart" : "Table"}
        </button>
      </header>
      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead><tr className="text-muted">{table.head.map((h) => <th key={h} className="py-1 pr-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-white/5 text-ink">{r.map((c, j) => <td key={j} className="py-1.5 pr-3 tabular-nums">{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : children}
    </section>
  );
}

export interface BarRow {
  key: string;
  label: string;
  value: number;
  color: string;
  prev?: number;
  extra?: string;
}

/** Horizontal bars from one baseline, with an optional reference line (e.g. fair share). */
export function BarRows({ rows, max, reference, referenceLabel, format }: {
  rows: BarRow[]; max: number; reference?: number; referenceLabel?: string; format: (v: number) => string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const labelW = Math.min(110, w * 0.3);
  const valueW = 52;
  const plotW = Math.max(40, w - labelW - valueW);
  const band = 34;
  const bar = 18;
  const top = referenceLabel ? 16 : 0;
  const h = top + rows.length * band + 22;
  const X = (v: number) => labelW + (Math.min(v, max) / max) * plotW;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);

  return (
    <div ref={ref} className="relative">
      <svg width={w} height={h} role="img" aria-label="Bar chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={X(t)} x2={X(t)} y1={top} y2={h - 18} stroke={VIZ.grid} strokeWidth={1} />
            <text x={X(t)} y={h - 4} textAnchor="middle" fontSize={10} fill={VIZ.textMuted}>{format(t)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = top + i * band + (band - bar) / 2;
          const x1 = X(r.value);
          const width = Math.max(0, x1 - labelW);
          const radius = Math.min(4, width / 2);
          return (
            <g key={r.key} tabIndex={0} className="outline-none"
              onPointerMove={(e) => {
                const box = ref.current!.getBoundingClientRect();
                setTip({ x: e.clientX - box.left, y: e.clientY - box.top, value: format(r.value), label: r.label, extra: r.extra });
              }}
              onPointerLeave={() => setTip(null)}
              onFocus={() => setTip({ x: x1, y, value: format(r.value), label: r.label, extra: r.extra })}
              onBlur={() => setTip(null)}>
              <rect x={0} y={top + i * band} width={w} height={band} fill="transparent" />
              <text x={labelW - 10} y={y + bar / 2 + 4} textAnchor="end" fontSize={12} fill={VIZ.textSecondary}>{r.label}</text>
              {/* Square at the baseline, 4px rounded at the data end. */}
              <path d={`M${labelW},${y} H${x1 - radius} Q${x1},${y} ${x1},${y + radius} V${y + bar - radius} Q${x1},${y + bar} ${x1 - radius},${y + bar} H${labelW} Z`}
                fill={r.color} opacity={tip && tip.label !== r.label ? 0.55 : 1} />
              {r.prev !== undefined && (
                <line x1={X(r.prev)} x2={X(r.prev)} y1={y - 3} y2={y + bar + 3} stroke={VIZ.textPrimary} strokeWidth={2} strokeLinecap="round" opacity={0.7}>
                  <title>Previous run: {format(r.prev)}</title>
                </line>
              )}
              <text x={Math.max(x1, r.prev !== undefined ? X(r.prev) : 0) + 8} y={y + bar / 2 + 4} fontSize={12} fontWeight={600} fill={VIZ.textPrimary} className="tabular-nums">{format(r.value)}</text>
            </g>
          );
        })}
        {reference !== undefined && (
          <g>
            <line x1={X(reference)} x2={X(reference)} y1={top - 2} y2={h - 18} stroke={VIZ.textSecondary} strokeWidth={1.5} />
            {referenceLabel && <text x={X(reference)} y={10} textAnchor="middle" fontSize={10} fill={VIZ.textSecondary}>{referenceLabel}</text>}
          </g>
        )}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Columns over integer bins (distribution of a count). */
export function Histogram({ values, unit, color = VIZ.series, maxBins = 24 }: {
  values: number[]; unit: string; color?: string; maxBins?: number;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  if (!values.length) return <div ref={ref} className="h-40" />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const size = Math.max(1, Math.ceil((hi - lo + 1) / maxBins));
  const bins: { from: number; to: number; n: number }[] = [];
  for (let b = lo; b <= hi; b += size) bins.push({ from: b, to: b + size - 1, n: 0 });
  for (const v of values) bins[Math.floor((v - lo) / size)].n++;
  const top = Math.max(...bins.map((b) => b.n));
  const h = 170;
  const padL = 34;
  const padB = 22;
  const plotH = h - padB - 8;
  const slot = (w - padL) / bins.length;
  const colW = Math.min(24, slot - 2);
  const Y = (n: number) => 8 + plotH - (n / top) * plotH;
  const yTicks = [0, Math.round(top / 2), top];
  const label = (b: { from: number; to: number }) => (b.from === b.to ? `${b.from}` : `${b.from}–${b.to}`);
  const every = Math.ceil(bins.length / Math.max(2, Math.floor((w - padL) / 44)));

  return (
    <div ref={ref} className="relative">
      <svg width={w} height={h} role="img" aria-label={`Distribution of ${unit}`}>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w} y1={Y(t)} y2={Y(t)} stroke={VIZ.grid} strokeWidth={1} />
            <text x={padL - 6} y={Y(t) + 3} textAnchor="end" fontSize={10} fill={VIZ.textMuted}>{t}</text>
          </g>
        ))}
        {bins.map((b, i) => {
          const x = padL + i * slot + (slot - colW) / 2;
          const y = Y(b.n);
          const hh = 8 + plotH - y;
          const r = Math.min(4, hh / 2, colW / 2);
          const pct = ((b.n / values.length) * 100).toFixed(1);
          return (
            <g key={i} tabIndex={0} className="outline-none"
              onPointerMove={(e) => {
                const box = ref.current!.getBoundingClientRect();
                setTip({ x: e.clientX - box.left, y: e.clientY - box.top, value: `${b.n} games (${pct}%)`, label: `${label(b)} ${unit}` });
              }}
              onPointerLeave={() => setTip(null)}
              onFocus={() => setTip({ x: x + colW / 2, y, value: `${b.n} games (${pct}%)`, label: `${label(b)} ${unit}` })}
              onBlur={() => setTip(null)}>
              <rect x={padL + i * slot} y={0} width={slot} height={h - padB} fill="transparent" />
              {b.n > 0 && (
                <path d={`M${x},${8 + plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + colW - r} Q${x + colW},${y} ${x + colW},${y + r} V${8 + plotH} Z`}
                  fill={color} opacity={tip && tip.label !== `${label(b)} ${unit}` ? 0.55 : 1} />
              )}
              {i % every === 0 && <text x={x + colW / 2} y={h - 6} textAnchor="middle" fontSize={10} fill={VIZ.textMuted}>{label(b)}</text>}
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

export function StatTile({ label, value, delta, good }: { label: string; value: string; delta?: number; good?: "up" | "down" | "none" }) {
  const showDelta = delta !== undefined && Math.abs(delta) >= 0.05;
  const positive = (delta ?? 0) > 0;
  const better = good === "none" ? null : good === "up" ? positive : !positive;
  return (
    <div className="rounded-2xl border border-white/10 p-4" style={{ background: VIZ.surface }}>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</div>
      {showDelta && (
        <div className={`mt-0.5 text-xs tabular-nums ${better === null ? "text-muted" : better ? "text-emerald-300" : "text-rose-300"}`}>
          {positive ? "▲" : "▼"} {Math.abs(delta!).toFixed(1)} vs previous run
        </div>
      )}
    </div>
  );
}
