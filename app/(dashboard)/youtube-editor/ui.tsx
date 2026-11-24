"use client";

// Small building blocks of the YouTube Editor (buttons, sliders, sections, the drag bar), shared by its panels.

import { useRef } from "react";
import { ChevronDown, Layers, Video, type LucideIcon } from "lucide-react";
import type { EditorSettings, Flip, Shape } from "@/lib/youtube-editor-config";

export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
// monitor backdrop: warm dark squares, like an editor canvas
export const CHECKER: React.CSSProperties = {
  backgroundColor: "#16110e",
  backgroundImage: "conic-gradient(#2a211c 25%, transparent 0 50%, #2a211c 0 75%, transparent 0)",
  backgroundSize: "24px 24px",
};
export const ON = "border-orange-400/60 bg-orange-500/10 font-semibold text-orange-600 dark:text-orange-300";

export function Segmented<T extends string>({ value, onChange, items, disabled }: { value: T; onChange: (v: T) => void; items: { v: T; label: React.ReactNode; title?: string }[]; disabled?: boolean }) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-muted p-0.5">
      {items.map((it) => (
        <button key={it.v} type="button" title={it.title} disabled={disabled} onClick={() => onChange(it.v)} aria-pressed={value === it.v} className={`flex h-8 items-center justify-center gap-1 rounded-md px-1.5 text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-50 ${value === it.v ? "bg-amber-500/20 text-orange-700 shadow-sm ring-1 ring-amber-500/40 dark:text-amber-200" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"}`}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ value, min, max, step = 5, onChange, disabled, label }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; disabled?: boolean; label: string }) {
  return <input type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 w-full cursor-pointer accent-orange-500 disabled:opacity-50" />;
}

/** Settings section: icon + title (+ current value), folds open/closed. */
export function Section({ icon: Icon, tone, title, value, children }: { icon: LucideIcon; tone: string; title: string; value?: string; children: React.ReactNode }) {
  return (
    <details open className="group border-b last:border-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-semibold select-none hover:bg-accent/40">
        <span className={`grid size-6 place-items-center rounded-md ${tone}`}><Icon className="size-3.5" /></span>
        {title}
        {value && <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">{value}</span>}
        <ChevronDown className={`size-4 text-muted-foreground transition-transform group-open:rotate-180 ${value ? "" : "ml-auto"}`} />
      </summary>
      <div className="space-y-2.5 px-4 pb-4">{children}</div>
    </details>
  );
}

export function Row({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-[78px] shrink-0 items-center gap-1 text-xs text-muted-foreground"><Icon className="size-3.5" /> {label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Sketch of the frame (before a real preview frame exists): where each video goes. */
export function LayoutSketch({ cfg }: { cfg: EditorSettings }) {
  const part = "grid h-full w-full place-items-center text-xs font-medium";
  const asli = <span className={`${part} bg-amber-500/20 text-amber-200`}><Video className="mb-0.5 size-5" />Asli</span>;
  const game = <span className={`${part} bg-rose-500/20 text-rose-200`}><Layers className="mb-0.5 size-5" />Overlay</span>;
  if (cfg.layout === "pip") return cfg.pipMain === "original" ? asli : game;
  const track = `${cfg.ratio}fr ${100 - cfg.ratio}fr`;
  return <div className="grid h-full w-full" style={cfg.layout === "side" ? { gridTemplateColumns: track } : { gridTemplateRows: track }}>{asli}{game}</div>;
}

export const SHAPES: { v: Shape; label: string; radius: string }[] = [
  { v: "rect", label: "Kotak", radius: "1px" },
  { v: "round", label: "Bulat", radius: "4px" },
  { v: "circle", label: "Lingkaran", radius: "999px" },
];

export const PANELS_KEY = "trk-yt-editor-panels";
export const PANELS = { left: 320, right: 320 };
export const PANEL_RANGE = [240, 560] as const;

/** Drag bar between two panels: reports the pointer's horizontal movement while held. */
export function Gutter({ onDrag, onDone, onReset }: { onDrag: (dx: number) => void; onDone: () => void; onReset: () => void }) {
  const last = useRef<number | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title="Geser untuk mengubah lebar panel (klik ganda: lebar awal)"
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        last.current = e.clientX;
      }}
      onPointerMove={(e) => {
        if (last.current == null) return;
        onDrag(e.clientX - last.current);
        last.current = e.clientX;
      }}
      onPointerUp={() => {
        last.current = null;
        onDone();
      }}
      onDoubleClick={onReset}
      className="group flex cursor-col-resize touch-none items-center justify-center select-none"
    >
      <span className="h-12 w-1 rounded-full bg-border transition-colors group-hover:bg-orange-400 group-active:bg-orange-500" />
    </div>
  );
}

export const FLIPS: { v: Flip; label: string; title: string }[] = [
  { v: "none", label: "Asli", title: "Tidak dibalik" },
  { v: "h", label: "⇆", title: "Cermin kiri-kanan" },
  { v: "v", label: "⇅", title: "Balik atas-bawah" },
  { v: "hv", label: "⇆⇅", title: "Keduanya" },
];
