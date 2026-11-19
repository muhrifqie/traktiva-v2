"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, Loader2, RefreshCw, Search } from "lucide-react";
import { CountryBadge } from "@/components/country-select";

// Shared building blocks so every Riset view (TikTok tabs, Shopee) looks and behaves the same:
// one toolbar row (tabs · market · search on the right), one meta line, one product row, auto "load more".

/** Tabs left, extra controls (market) next to them, search box pinned right. */
export function RisetToolbar<T extends string>({
  tabs, active, onTab, children, search,
}: {
  tabs: { id: T; label: string; badge?: number | null }[];
  active: T;
  onTab: (t: T) => void;
  children?: React.ReactNode;
  search?: { value: string; onChange: (v: string) => void; onSubmit?: () => void; placeholder: string; busy?: boolean };
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => onTab(t.id)} className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium ${active === t.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
            {t.badge ? <span className="rounded-full bg-muted-foreground/15 px-1.5 text-[10px] tabular-nums">{t.badge}</span> : null}
          </button>
        ))}
      </div>
      {children}
      {search && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            search.onSubmit?.();
          }}
          className="ml-auto flex h-9 w-full items-center gap-2 rounded-lg border bg-card px-3 text-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 sm:w-80"
        >
          {search.busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <Search className="size-4 text-muted-foreground" />}
          <input value={search.value} onChange={(e) => search.onChange(e.target.value)} placeholder={search.placeholder} className="min-w-0 flex-1 bg-transparent outline-none" />
          {search.onSubmit && <kbd className="hidden rounded border px-1 text-[10px] text-muted-foreground sm:block">Enter</kbd>}
        </form>
      )}
    </div>
  );
}

/** "🇮🇩 ID · 40 produk … · cache 18 Nov 20.58" + refresh, the same line above every list. */
export function ListMeta({ country, children, onRefresh, pending }: { country?: string; children: React.ReactNode; onRefresh?: () => void; pending?: boolean }) {
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {country && <CountryBadge code={country} />}
      <span>{children}</span>
      {onRefresh && (
        <button type="button" onClick={onRefresh} disabled={pending} title="Ambil ulang dari KaloData" className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border bg-card px-2.5 font-medium text-foreground hover:bg-accent disabled:opacity-60">
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Muat ulang
        </button>
      )}
    </div>
  );
}

/** One ranked product: rank · picture · title + stats · actions. */
export function ProductRow({
  rank, image, title, onOpen, children, actions, intent,
}: { rank: number; image: string; title: string; onOpen?: () => void; children: React.ReactNode; actions: React.ReactNode; intent?: React.HTMLAttributes<HTMLDivElement> }) {
  return (
    <div className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0" {...intent}>
      <span className="w-7 shrink-0 text-center text-xs font-semibold text-muted-foreground tabular-nums">{rank}</span>
      <button type="button" onClick={onOpen} disabled={!onOpen} className="shrink-0" aria-label="Lihat detail">
        <RowImg src={image} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium" title={title}>{title}</p>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{children}</div>
      </div>
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
  if (!ok) return <div className="grid size-11 place-items-center rounded-lg border bg-muted"><ImageIcon className="size-4 text-muted-foreground" /></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setOk(false)} className="size-11 rounded-lg border bg-muted object-cover" />;
}

export const iconBtn = "grid size-7 place-items-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground";
export const pillBtn = "flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium hover:bg-accent";
