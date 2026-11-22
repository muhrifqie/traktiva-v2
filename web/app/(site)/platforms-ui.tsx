import { PLATFORM_STATUS, PLATFORMS, type Platform } from "@/lib/platforms";

export function PlatformIcon({ p, className = "size-5" }: { p: Platform; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden style={{ fill: p.color || "currentColor" }}>
      <path d={p.path} />
    </svg>
  );
}

export function StatusPill({ p }: { p: Platform }) {
  const s = PLATFORM_STATUS[p.status];
  return <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}

/** Positions on a circle (percent of the box), starting at the top and going clockwise. */
const around = (n: number, r: number, start = -90) =>
  Array.from({ length: n }, (_, i) => {
    const a = ((start + (360 / n) * i) * Math.PI) / 180;
    return { left: `${50 + r * Math.cos(a)}%`, top: `${50 + r * Math.sin(a)}%` };
  });

/**
 * Hero art: the Traktiva logo in the middle, the platforms floating on two orbits (live ones on the inner ring).
 * No box around it; rings and dots are drawn with borders only.
 */
export function PlatformOrbit() {
  const shown = PLATFORMS.slice(0, 8);
  const inner = shown.filter((p) => p.status !== "rencana");
  const outer = shown.filter((p) => p.status === "rencana");
  const place = [...inner.map((p, i) => ({ p, pos: around(inner.length, 24, -60)[i] })), ...outer.map((p, i) => ({ p, pos: around(outer.length, 44, -110)[i] }))];
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[30rem]" aria-label={`Platform: ${shown.map((p) => p.name).join(", ")}`} role="img">
      {/* orbits */}
      <div className="absolute inset-[6%] rounded-full border border-dashed border-foreground/10" />
      <div className="absolute inset-[26%] rounded-full border border-foreground/10" />
      <div className="absolute inset-[40%] rounded-full bg-leaf/15 blur-2xl" />
      {/* centre */}
      <div className="absolute top-1/2 left-1/2 grid size-20 -translate-1/2 place-items-center rounded-2xl border bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="size-11" />
      </div>
      {/* platforms */}
      {place.map(({ p, pos }, i) => (
        <div key={p.id} className="site-float absolute -translate-1/2" style={{ ...pos, animationDelay: `${i * 0.6}s` }}>
          <div className={`relative grid place-items-center rounded-xl border bg-card ${p.status === "rencana" ? "size-11 opacity-80" : "size-14"}`}>
            <PlatformIcon p={p} className={p.status === "rencana" ? "size-5" : "size-7"} />
            {p.status !== "rencana" && (
              <span className={`absolute -bottom-2.5 left-1/2 -translate-x-1/2 rounded-full border bg-background px-1.5 text-[0.5625rem] font-semibold whitespace-nowrap ${p.status === "aktif" ? "text-status-ok" : "text-amber-600 dark:text-amber-300"}`}>
                {PLATFORM_STATUS[p.status].label}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Landing section: live + coming platforms as cards, the planned ones as a row of chips. */
export function PlatformGrid() {
  const now = PLATFORMS.filter((p) => p.status !== "rencana");
  const later = PLATFORMS.filter((p) => p.status === "rencana");
  return (
    <div className="grid gap-4">
      <ul className="grid gap-3 md:grid-cols-2">
        {now.map((p) => (
          <li key={p.id} className="flex items-center gap-4 rounded-xl border bg-card p-5">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-muted"><PlatformIcon p={p} className="size-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold">{p.name}</span>
              <span className="block text-sm text-muted-foreground">{p.note}</span>
            </span>
            <StatusPill p={p} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-4">
        <span className="mr-1 text-sm font-medium text-muted-foreground">Direncanakan:</span>
        {later.map((p) => (
          <span key={p.id} className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm" title={p.note}>
            <PlatformIcon p={p} className="size-4" /> {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}
