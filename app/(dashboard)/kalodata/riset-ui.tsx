"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageIcon, Loader2, RefreshCw, Search } from "lucide-react";

// Shared building blocks so every Riset view (TikTok tabs, Shopee) looks and behaves the same:
// one toolbar row (search · market on the left, tabs · refresh on the right), one product row, auto "load more".

/**
 * Where the active list's "Muat ulang" button appears (the right end of the toolbar). Each list owns its own
 * reload, so it portals its RefreshButton here. Views hold the element in state and provide it around the toolbar + lists.
 */
export const RefreshSlot = createContext<HTMLElement | null>(null);

/** Search box + extra controls (market) on the left, tabs + the active list's refresh button on the right. */
export function RisetToolbar<T extends string>({
  tabs, active, onTab, children, search, refreshSlot,
}: {
  tabs: { id: T; label: string; badge?: number | null }[];
  active: T;
  onTab: (t: T) => void;
  children?: React.ReactNode;
  search?: { value: string; onChange: (v: string) => void; onSubmit?: () => void; placeholder: string; busy?: boolean };
  refreshSlot?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {search && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            search.onSubmit?.();
          }}
          className="flex h-9 w-full items-center gap-2 rounded-lg border bg-card px-3 text-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 sm:w-80"
        >
          {search.busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <Search className="size-4 text-muted-foreground" />}
          <input value={search.value} onChange={(e) => search.onChange(e.target.value)} placeholder={search.placeholder} className="min-w-0 flex-1 bg-transparent outline-none" />
          {search.onSubmit && <kbd className="hidden rounded border px-1 text-[10px] text-muted-foreground sm:block">Enter</kbd>}
        </form>
      )}
      {children}
      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => onTab(t.id)} className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium ${active === t.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {t.label}
              {t.badge ? <span className="rounded-full bg-muted-foreground/15 px-1.5 text-[10px] tabular-nums">{t.badge}</span> : null}
            </button>
          ))}
        </div>
        {refreshSlot && <div ref={refreshSlot} className="contents" />}
      </div>
    </div>
  );
}

/** The active list's "Muat ulang" button, shown at the right end of the toolbar (see RefreshSlot). */
export function RefreshButton({ onRefresh, pending }: { onRefresh?: () => void; pending?: boolean }) {
  const slot = useContext(RefreshSlot);
  if (!onRefresh || !slot) return null;
  return createPortal(
    <button type="button" onClick={onRefresh} disabled={pending} title="Ambil ulang dari KaloData" className="flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-xs font-medium hover:bg-accent disabled:opacity-60">
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Muat ulang
    </button>,
    slot,
  );
}

/** One ranked product: rank · picture · title + stats · actions. */
export function ProductRow({
  rank, image, title, onOpen, children, actions, intent,
}: { rank: number; image: string; title: string; onOpen?: () => void; children: React.ReactNode; actions: React.ReactNode; intent?: React.HTMLAttributes<HTMLDivElement> }) {
  return (
    <div className={`group flex items-center gap-3 border-b px-3 py-2 last:border-b-0 ${onOpen ? "hover:bg-accent/50" : ""}`} {...intent}>
      <span className="w-7 shrink-0 text-center text-xs font-semibold text-muted-foreground tabular-nums">{rank}</span>
      {/* Picture + title + stats form one button so a click anywhere on the product opens its detail. */}
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        title={onOpen ? `Lihat detail: ${title}` : title}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:cursor-pointer disabled:cursor-default"
      >
        <span className="shrink-0"><RowImg src={image} /></span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-xs font-medium ${onOpen ? "group-hover:text-primary" : ""}`}>{title}</span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{children}</span>
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1">{actions}</div>
    </div>
  );
}

export const ListBox = ({ children, dim }: { children: React.ReactNode; dim?: boolean }) => (
  <div className={`overflow-hidden rounded-xl border bg-card transition-opacity ${dim ? "opacity-60" : ""}`}>{children}</div>
);

export const EmptyBox = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-40 items-center justify-center gap-2 rounded-xl border bg-card text-xs text-muted-foreground">{children}</div>
);

/** Calls onReach when the bottom of the list scrolls into view (infinite scroll). */
export function LoadMore({ onReach, busy, done, label }: { onReach: () => void; busy: boolean; done: boolean; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onReach);
  useEffect(() => {
    cb.current = onReach;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || done || busy) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && cb.current(), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [done, busy]);
  return (
    <div ref={ref} className="flex h-10 items-center justify-center text-[11px] text-muted-foreground">
      {busy ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" /> Memuat {label}...</> : done ? `Sudah semua ${label}.` : ""}
    </div>
  );
}

function RowImg({ src }: { src: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <span className="grid size-11 place-items-center rounded-lg border bg-muted"><ImageIcon className="size-4 text-muted-foreground" /></span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setOk(false)} className="size-11 rounded-lg border bg-muted object-cover" />;
}

export const iconBtn = "grid size-7 place-items-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground";
export const pillBtn = "flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium hover:bg-accent";
