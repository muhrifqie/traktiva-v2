"use client";

import { useState } from "react";

const dayFmt = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
const shortFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
const num = new Intl.NumberFormat("id-ID");

/** One series per chart: daily counts as thin bars (4px rounded tops, 2px gaps, baseline-anchored), hover tooltip. */
export function DailyBars({ data, color, unit, label, period = "14 hari" }: { data: { day: number; n: number }[]; color: string; unit: string; label: string; period?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.n));
  const total = data.reduce((n, d) => n + d.n, 0);
  const h = hover != null ? data[hover] : null;
  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{h ? `${dayFmt.format(h.day * 1000)}: ${h.n} ${unit}` : `${total} ${unit} · ${period}`}</span>
      </figcaption>
      <div
        className="relative flex h-24 items-end gap-[2px] border-b border-border"
        role="img"
        aria-label={`${label}: ${data.map((d) => `${shortFmt.format(d.day * 1000)} ${d.n}`).join(", ")}`}
        onMouseLeave={() => setHover(null)}
      >
        {data.map((d, i) => (
          // the hit target is the full column, larger than the bar itself
          <div key={d.day} className="flex h-full min-w-0 flex-1 cursor-default items-end" onMouseEnter={() => setHover(i)}>
            <div
              className="w-full rounded-t-[4px] transition-opacity"
              style={{
                height: d.n ? `${Math.max(6, (d.n / max) * 100)}%` : "2px",
                background: d.n ? color : "var(--border)",
                opacity: hover == null || hover === i ? 1 : 0.45,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{shortFmt.format(data[0].day * 1000)}</span>
        <span>Hari ini</span>
      </div>
    </figure>
  );
}

/** Followers over time (one account = one line, 2px), nearest-point tooltip on hover. */
export function FollowerLine({ points, color }: { points: { at: number; followers: number }[]; color: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <p className="text-[11px] text-muted-foreground">Grafik muncul setelah 2× sinkron profil.</p>;
  const W = 240;
  const H = 48;
  const min = Math.min(...points.map((p) => p.followers));
  const max = Math.max(...points.map((p) => p.followers));
  const span = Math.max(1, max - min);
  const xy = points.map((p, i) => [(i / (points.length - 1)) * W, H - 4 - ((p.followers - min) / span) * (H - 8)] as const);
  const h = hover != null ? points[hover] : null;
  return (
    <div className="min-w-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-12 w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Pengikut dari ${num.format(points[0].followers)} ke ${num.format(points.at(-1)!.followers)}`}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.round(((e.clientX - r.left) / r.width) * (points.length - 1)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <polyline points={xy.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {hover != null && (
          <>
            <line x1={xy[hover][0]} x2={xy[hover][0]} y1="0" y2={H} stroke="var(--muted-foreground)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="2 2" />
            <circle cx={xy[hover][0]} cy={xy[hover][1]} r="4" fill={color} stroke="var(--card)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
        {h ? `${shortFmt.format(h.at * 1000)}: ${num.format(h.followers)} pengikut` : `${shortFmt.format(points[0].at * 1000)} → sekarang`}
      </p>
    </div>
  );
}
