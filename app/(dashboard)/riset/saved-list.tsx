"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Clapperboard, ExternalLink, ImageIcon, Loader2, Search, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CountryBadge } from "@/components/country-select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePersistentState } from "@/lib/use-persistent-state";
import { kaloToShowcase } from "../kalodata/actions";
import { createProjectFromSaved, unsaveProduct } from "./actions";

type Saved = {
  id: number;
  productId: string;
  country: string;
  source: string;
  title: string;
  image: string | null;
  price: string | null;
  shopName: string | null;
  metrics: Record<string, string | number | null>;
  created: string;
};
type Concept = { id: string; title: string; bestFor: string };

const SOURCE: Record<string, string> = { tiktok: "TikTok", kalodata: "TikTok · KaloData", shopee: "Shopee · KaloData", manual: "Manual" };
const LABEL: Record<string, string> = { gmv30: "Omzet 30h", revenue: "Omzet", creators: "Kreator", rating: "Rating", commission: "Komisi", index: "Indeks", sale: "Terjual" };

function Img({ src }: { src: string | null }) {
  const [ok, setOk] = useState(true);
  return src && ok ? (
    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setOk(false)} className="size-full object-cover" />
  ) : (
    <div className="grid size-full place-items-center"><ImageIcon className="size-5 text-muted-foreground" /></div>
  );
}

/** "Produk tersimpan": the shortlist from research, ready to turn into videos or showcase items. */
export function SavedList({ items, concepts }: { items: Saved[]; concepts: Concept[] }) {
  const router = useRouter();
  const [q, setQ] = usePersistentState("riset:saved-q", "");
  const [making, setMaking] = useState<Saved | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
        toast.error(e instanceof Error ? e.message : "Gagal");
      } finally {
        setBusy(null);
      }
    });
  };

  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-12 text-center">
        <Bookmark className="size-7 text-muted-foreground" />
        <p className="text-sm font-medium">Belum ada produk tersimpan</p>
        <p className="max-w-sm text-xs text-muted-foreground">Klik Simpan di hasil Ranking TikTok atau KaloData. Produk yang tersimpan bisa langsung dibuatkan video atau dimasukkan ke etalase.</p>
      </div>
    );
  }

  const k = q.trim().toLowerCase();
  const shown = k ? items.filter((p) => `${p.title} ${p.shopName ?? ""}`.toLowerCase().includes(k)) : items;

  return (
    <div className="space-y-3">
      <label className="flex h-9 max-w-sm items-center gap-2 rounded-lg border bg-card px-3 text-xs focus-within:border-ring">
        <Search className="size-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari produk tersimpan..." className="min-w-0 flex-1 bg-transparent outline-none" />
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {shown.map((p) => (
          <article key={p.id} className="flex flex-col overflow-hidden rounded-xl border bg-card">
            <div className="relative aspect-square bg-muted">
              <Img src={p.image} />
              <span className="absolute top-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 backdrop-blur"><CountryBadge code={p.country} className="text-white" /></span>
              <span className="absolute top-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{SOURCE[p.source] ?? p.source}</span>
            </div>
            <div className="flex flex-1 flex-col gap-1 p-2.5">
              <p className="line-clamp-2 text-xs leading-snug font-medium" title={p.title}>{p.title}</p>
              <p className="truncate text-[11px] text-muted-foreground">{p.shopName ?? "—"}{p.price ? ` · ${p.price}` : ""}</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(p.metrics)
                  .filter(([, v]) => v != null && v !== "")
                  .slice(0, 3)
                  .map(([key, v]) => (
                    <span key={key} className="rounded bg-muted px-1.5 py-px text-[10px]"><span className="text-muted-foreground">{LABEL[key] ?? key}</span> {String(v)}</span>
                  ))}
              </div>
              <div className="mt-auto flex gap-1 pt-1.5">
                <button type="button" onClick={() => setMaking(p)} title="Buat video dari produk ini" className="flex h-7 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md bg-primary text-[11px] font-medium text-primary-foreground hover:bg-primary/90">
                  <Clapperboard className="size-3.5" /> Video
                </button>
                <button
                  type="button"
                  title="Tambah ke etalase TikTok"
                  disabled={busy === `e${p.id}`}
                  onClick={() => run(`e${p.id}`, async () => { const r = await kaloToShowcase(p.productId); if (r.ok) toast.success(`Masuk etalase @${r.account}`); else toast.error(r.message); })}
                  className="grid size-7 place-items-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
                >
                  {busy === `e${p.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Store className="size-3.5" />}
                </button>
                <a href={`https://www.tiktok.com/view/product/${p.productId}`} target="_blank" rel="noreferrer" title="Buka di TikTok" className="grid size-7 place-items-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground"><ExternalLink className="size-3.5" /></a>
                <button type="button" title="Hapus dari tersimpan" disabled={busy === `d${p.id}`} onClick={() => run(`d${p.id}`, () => unsaveProduct(p.productId, p.country))} className="grid size-7 place-items-center rounded-md border text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-60">
                  {busy === `d${p.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <Dialog open={!!making} onOpenChange={(o) => !o && !pending && setMaking(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Buat video untuk produk ini</DialogTitle>
            <DialogDescription className="line-clamp-2">{making?.title}</DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Nama, harga, dan foto produk langsung terisi. Pilih konsep videonya:</p>
          <div className="grid max-h-[50vh] gap-1.5 overflow-y-auto">
            {concepts.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={pending}
                onClick={() => making && run(`v${c.id}`, () => createProjectFromSaved(making.id, c.id))}
                className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-left transition-colors hover:border-ring/40 hover:bg-accent disabled:opacity-60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">{c.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{c.bestFor}</span>
                </span>
                {busy === `v${c.id}` && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
