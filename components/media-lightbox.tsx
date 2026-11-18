"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ChevronLeft, ChevronRight, Download, Maximize2, Minus, Plus, X } from "lucide-react";
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

/** In-app media viewer: zoom (wheel / double-click / buttons), pan when zoomed, ←/→ between items, download. */
export function MediaLightbox() {
  const s = useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => state,
    () => null,
  );
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
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

  useEffect(() => {
    if (!s) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(5, z + 0.5));
      else if (e.key === "-") setZoom((z) => Math.max(1, z - 0.5));
      else if (e.key === "0") {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s]);

  const image = item?.kind === "image";
  const z = (next: number) => {
    const v = Math.max(1, Math.min(5, next));
    setZoom(v);
    if (v === 1) setPan({ x: 0, y: 0 });
  };

  return (
    <DialogPrimitive.Root open={!!s} onOpenChange={(o) => !o && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/[0.97] backdrop-blur-sm data-open:animate-in data-open:fade-in-0" />
        <DialogPrimitive.Popup className="fixed inset-0 z-50 flex flex-col text-white outline-none" aria-label="Pratinjau media">
          {s && item && (
            <>
              <div className="flex h-12 shrink-0 items-center gap-2 px-3 text-xs">
                <span className="font-mono tabular-nums text-white/60">{s.index + 1}/{s.items.length}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                {image && (
                  <div className="flex items-center gap-0.5 rounded-lg bg-white/10 p-0.5">
                    <button type="button" className="grid size-7 place-items-center rounded-md hover:bg-white/15" onClick={() => z(zoom - 0.5)} aria-label="Perkecil"><Minus className="size-3.5" /></button>
                    <button type="button" className="h-7 w-12 rounded-md font-mono tabular-nums hover:bg-white/15" onClick={() => z(1)} title="Ukuran pas (0)">{Math.round(zoom * 100)}%</button>
                    <button type="button" className="grid size-7 place-items-center rounded-md hover:bg-white/15" onClick={() => z(zoom + 0.5)} aria-label="Perbesar"><Plus className="size-3.5" /></button>
                  </div>
                )}
                <a href={`${mediaUrl(item.src)}?download`} className="grid size-8 place-items-center rounded-lg hover:bg-white/15" aria-label="Unduh"><Download className="size-4" /></a>
                <button type="button" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => {})} className="grid size-8 place-items-center rounded-lg hover:bg-white/15" aria-label="Layar penuh"><Maximize2 className="size-4" /></button>
                <DialogPrimitive.Close className="grid size-8 place-items-center rounded-lg hover:bg-white/15" aria-label="Tutup"><X className="size-4" /></DialogPrimitive.Close>
              </div>

              <div
                className={`relative min-h-0 flex-1 overflow-hidden ${image ? (zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in") : ""}`}
                onWheel={(e) => image && z(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))}
                onDoubleClick={() => image && z(zoom > 1 ? 1 : 2.5)}
                onPointerDown={(e) => {
                  if (!image || zoom === 1) return;
                  drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
                  setDragging(true);
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => drag.current && setPan({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y })}
                onPointerUp={() => {
                  drag.current = null;
                  setDragging(false);
                }}
                onClick={(e) => e.target === e.currentTarget && zoom === 1 && close()}
              >
                {/* flex (not grid) so the box has a definite height: media then fits it instead of overflowing and getting cropped */}
                <div
                  className={`pointer-events-none absolute inset-0 flex items-center justify-center ${image ? "p-4" : "px-16 py-3"}`}
                  style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: dragging ? "none" : "transform 120ms" }}
                >
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(item.src)} alt={item.label ?? ""} draggable={false} className="pointer-events-auto max-h-full max-w-full select-none object-contain shadow-2xl" />
                  ) : (
                    // full height, width from the video's own ratio (9:16 stays 9:16), controls always inside the frame
                    <video key={item.src} src={mediaUrl(item.src)} controls autoPlay loop playsInline className="pointer-events-auto h-full max-h-full w-auto max-w-full rounded-lg bg-black object-contain shadow-2xl" />
                  )}
                </div>
                {s.items.length > 1 && (
                  <>
                    <button type="button" onClick={() => go(-1)} className="absolute top-1/2 left-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Sebelumnya"><ChevronLeft className="size-5" /></button>
                    <button type="button" onClick={() => go(1)} className="absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Berikutnya"><ChevronRight className="size-5" /></button>
                  </>
                )}
              </div>

              {s.items.length > 1 && (
                <div className="flex shrink-0 justify-center gap-1.5 overflow-x-auto p-3">
                  {s.items.map((it, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => ((state = { ...s, index: i }), emit())}
                      className={`relative h-16 w-9 shrink-0 overflow-hidden rounded-md ring-2 ${i === s.index ? "ring-white" : "opacity-50 ring-transparent hover:opacity-90"}`}
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
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
