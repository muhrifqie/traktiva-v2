"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ChevronLeft, ChevronRight, Download, Film, Image as ImageIcon, Maximize2, Minimize2, Minus, Plus, X } from "lucide-react";
import { mediaUrl } from "@/lib/media-url";

export type LightboxItem = { src: string; kind: "image" | "video"; label?: string };

// One viewer for the whole app: open it from anywhere with openLightbox(items, index).
let state: { items: LightboxItem[]; index: number } | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export function openLightbox(items: LightboxItem[], index = 0) {
  if (!items.length) return;
  state = { items, index: Math.max(0, Math.min(index, items.length - 1)) };
  emit();
}
const close = () => ((state = null), emit());
const go = (d: number) => state && ((state = { ...state, index: (state.index + d + state.items.length) % state.items.length }), emit());

const SHORTCUTS: [string, string][] = [["Esc", "tutup"], ["← →", "pindah"], ["+ −", "zoom"], ["0", "reset"], ["F", "besar"], ["Spasi", "putar"], ["M", "suara"], ["D", "unduh"]];
const Kbd = ({ children }: { children: React.ReactNode }) => <kbd className="rounded border bg-muted px-1 font-sans text-[10px] text-foreground/80">{children}</kbd>;

/**
 * In-app media viewer: a centred panel over a blurred page. Zoom (wheel / double-click / +−), pan when zoomed,
 * ←/→ between items, F for a bigger panel, Space play/pause, M mute, D download, Esc close.
 */
export function MediaLightbox() {
  const s = useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => state,
    () => null,
  );
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [big, setBig] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const download = useRef<HTMLAnchorElement>(null);
  const popup = useRef<HTMLDivElement>(null); // focused on open, so no toolbar button shows a focus ring
  const [dragging, setDragging] = useState(false);
  const item = s?.items[s.index];
  const key = item ? `${s!.index}:${item.src}` : "";
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) {
    // new item → reset zoom (state adjusted during render, no effect needed)
    setShownKey(key);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  const z = (next: number) => {
    const v = Math.max(1, Math.min(5, next));
    setZoom(v);
    if (v === 1) setPan({ x: 0, y: 0 });
  };

  useEffect(() => {
    if (!s) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const v = video.current;
      if (k === "escape") close();
      else if (k === "arrowright") go(1);
      else if (k === "arrowleft") go(-1);
      // key or physical code: layouts and numpads report +/− differently
      else if (k === "+" || k === "=" || e.code === "Equal" || e.code === "NumpadAdd") setZoom((x) => Math.min(5, x + 0.5));
      else if (k === "-" || k === "_" || e.code === "Minus" || e.code === "NumpadSubtract") setZoom((x) => (x - 0.5 <= 1 ? (setPan({ x: 0, y: 0 }), 1) : x - 0.5));
      else if (k === "0") z(1);
      else if (k === "f") setBig((v) => !v);
      else if (k === "d") download.current?.click();
      else if (k === " " && v) void (v.paused ? v.play() : v.pause());
      else if (k === "m" && v) v.muted = !v.muted;
      else return;
      e.preventDefault();
    };
    // capture phase: the dialog's focus handling stops arrow keys before they bubble up to window
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [s]);

  const image = item?.kind === "image";
  const size = big ? "h-[94vh] w-[96vw]" : "h-[min(92vh,max(56vh,520px))] w-[min(96vw,max(50vw,560px))]";

  const icon = "grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <DialogPrimitive.Root open={!!s} onOpenChange={(o) => !o && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-background/60 backdrop-blur-md data-open:animate-in data-open:fade-in-0" />
        <DialogPrimitive.Popup
          className={`fixed top-1/2 left-1/2 z-50 flex -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-2xl outline-none transition-[width,height] duration-200 data-open:animate-in data-open:zoom-in-95 data-open:fade-in-0 ${size}`}
          aria-label="Pratinjau media"
          initialFocus={popup}
          ref={popup}
          tabIndex={-1}
        >
          {s && item && (
            <>
              <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-brand-light">{image ? <ImageIcon className="size-3.5" /> : <Film className="size-3.5" />}</span>
                <span className="min-w-0 truncate text-[13px] font-medium">{item.label ?? (image ? "Gambar" : "Video")}</span>
                {s.items.length > 1 && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">{s.index + 1} / {s.items.length}</span>}
                <div className="ml-auto flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                  <button type="button" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40" disabled={zoom <= 1} onClick={() => z(zoom - 0.5)} aria-label="Perkecil (−)" title="Perkecil (−)"><Minus className="size-3.5" /></button>
                  <button type="button" className="h-7 w-12 rounded-md font-mono text-[11px] tabular-nums hover:bg-background" onClick={() => z(1)} title="Ukuran pas (0)">{Math.round(zoom * 100)}%</button>
                  <button type="button" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40" disabled={zoom >= 5} onClick={() => z(zoom + 0.5)} aria-label="Perbesar (+)" title="Perbesar (+)"><Plus className="size-3.5" /></button>
                </div>
                <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
                <a ref={download} href={`${mediaUrl(item.src)}?download`} className={icon} aria-label="Unduh (D)" title="Unduh (D)"><Download className="size-4" /></a>
                <button type="button" onClick={() => setBig((v) => !v)} className={icon} aria-label={big ? "Perkecil panel (F)" : "Perbesar panel (F)"} title={big ? "Perkecil panel (F)" : "Perbesar panel (F)"}>
                  {big ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                </button>
                <DialogPrimitive.Close className={icon} aria-label="Tutup (Esc)" title="Tutup (Esc)"><X className="size-4" /></DialogPrimitive.Close>
              </div>

              <div
                className={`relative min-h-0 flex-1 overflow-hidden bg-muted/40 ${zoom > 1 ? "cursor-grab active:cursor-grabbing" : image ? "cursor-zoom-in" : ""}`}
                style={{ backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)", backgroundSize: "18px 18px" }}
                onWheel={(e) => z(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))}
                onDoubleClick={() => image && z(zoom > 1 ? 1 : 2.5)}
                onPointerDown={(e) => {
                  if (zoom === 1) return;
                  drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
                  setDragging(true);
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => drag.current && setPan({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y })}
                onPointerUp={() => {
                  drag.current = null;
                  setDragging(false);
                }}
              >
                <div className="absolute inset-0 flex items-center justify-center p-5" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: dragging ? "none" : "transform 120ms" }}>
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(item.src)} alt={item.label ?? ""} draggable={false} className="max-h-full max-w-full rounded-xl object-contain shadow-lg ring-1 ring-border select-none" />
                  ) : (
                    <video ref={video} key={item.src} src={mediaUrl(item.src)} controls autoPlay loop className="max-h-full max-w-full rounded-xl bg-black shadow-lg ring-1 ring-border" />
                  )}
                </div>
                {s.items.length > 1 && (
                  <>
                    <button type="button" onClick={() => go(-1)} className="absolute top-1/2 left-3 grid size-9 -translate-y-1/2 place-items-center rounded-full border bg-background/90 text-foreground shadow-sm backdrop-blur hover:bg-accent" aria-label="Sebelumnya (←)"><ChevronLeft className="size-5" /></button>
                    <button type="button" onClick={() => go(1)} className="absolute top-1/2 right-3 grid size-9 -translate-y-1/2 place-items-center rounded-full border bg-background/90 text-foreground shadow-sm backdrop-blur hover:bg-accent" aria-label="Berikutnya (→)"><ChevronRight className="size-5" /></button>
                  </>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-3 border-t px-3 py-2">
                {s.items.length > 1 && (
                  <div className="flex min-w-0 gap-1.5 overflow-x-auto">
                    {s.items.map((it, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => ((state = { ...s, index: i }), emit())}
                        className={`relative shrink-0 overflow-hidden rounded-md bg-muted ring-2 transition ${it.kind === "image" ? "size-10" : "h-10 w-6"} ${i === s.index ? "ring-primary" : "opacity-60 ring-transparent hover:opacity-100"}`}
                        aria-label={it.label ?? `Item ${i + 1}`}
                      >
                        {it.kind === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={mediaUrl(it.src)} alt="" className="size-full object-cover" />
                        ) : (
                          <video src={`${mediaUrl(it.src)}#t=0.5`} muted preload="metadata" className="size-full object-cover" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <p className="ml-auto hidden flex-wrap items-center justify-end gap-x-2.5 gap-y-1 text-[10px] text-muted-foreground md:flex">
                  {SHORTCUTS.filter(([k]) => (image ? !["Spasi", "M"].includes(k) : true)).map(([k, label]) => (
                    <span key={k} className="flex items-center gap-1"><Kbd>{k}</Kbd> {label}</span>
                  ))}
                </p>
              </div>
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
