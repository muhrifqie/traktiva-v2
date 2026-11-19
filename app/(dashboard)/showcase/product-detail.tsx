"use client";

import { useEffect, useState, useTransition } from "react";
import { Clapperboard, Database, ExternalLink, Loader2, Package, RefreshCw, Sparkles, Star, Store, Truck } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ProductDetail } from "@/lib/db/schema";
import { mediaUrl } from "@/lib/media-url";
import { getShowcaseDetail } from "./actions";

type Loaded = { detail: ProductDetail; detailAt: number; facts: string; commission: string | null };
const num = new Intl.NumberFormat("id-ID");
const when = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/** Full product page of a showcase product: read from TikTok on first open, saved in the database for the AI. */
export function ProductDetailDialog({ product, onClose, onMakeVideo }: {
  product: { id: number; productId: string; title: string; cover: string | null } | null;
  onClose: () => void;
  onMakeVideo: () => void;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [img, setImg] = useState(0);
  const [pending, start] = useTransition();
  const id = product?.id ?? null;

  const load = (refresh: boolean) =>
    id != null &&
    start(async () => {
      try {
        setError(null);
        setData(await getShowcaseDetail(id, refresh));
        if (refresh) toast.success("Detail produk diperbarui");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal mengambil detail");
      }
    });

  useEffect(() => {
    if (id == null) return;
    let live = true;
    start(async () => {
      try {
        const d = await getShowcaseDetail(id);
        if (!live) return;
        setData(d);
        setError(null);
        setImg(0);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Gagal mengambil detail");
      }
    });
    return () => {
      live = false;
    };
  }, [id]);

  const d = data?.detail;
  const photos = d?.images.length ? d.images : product?.cover ? [product.cover] : [];

  return (
    <Dialog open={!!product} onOpenChange={(o) => { if (!o) { onClose(); setData(null); setError(null); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="line-clamp-2 pr-6 text-base leading-snug">{d?.title || product?.title}</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-[11px]">
            <Database className="size-3" />
            {data ? `Tersimpan ${when.format(data.detailAt)} · dipakai AI saat membuat video` : pending ? "Mengambil detail dari TikTok (±15 dtk)..." : "Detail lengkap produk"}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">{error}</p>}

        <div className="grid gap-5 md:grid-cols-[280px_1fr]">
          {/* photos */}
          <div className="space-y-2">
            <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
              {photos[img] ? <img src={mediaUrl(photos[img])} alt="" className="size-full object-cover" /> : <Package className="absolute inset-0 m-auto size-8 text-muted-foreground" />}
              {pending && !d && <Loader2 className="absolute top-2 right-2 size-5 animate-spin text-white drop-shadow" />}
            </div>
            {photos.length > 1 && (
              <div className="grid grid-cols-5 gap-1.5">
                {photos.map((src, i) => (
                  <button key={src} type="button" onClick={() => setImg(i)} className={`aspect-square overflow-hidden rounded-md border-2 ${i === img ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"}`}>
                    <img src={mediaUrl(src)} alt={`Foto ${i + 1}`} className="size-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* facts */}
          <div className="min-w-0 space-y-4">
            {d ? (
              <>
                <div>
                  <p className="flex flex-wrap items-baseline gap-2">
                    <span className="text-xl font-bold">{d.price}</span>
                    {d.originalPrice && <span className="text-xs text-muted-foreground line-through">{d.originalPrice}</span>}
                    {d.discount && <span className="rounded bg-destructive/15 px-1.5 py-px text-[11px] font-medium text-destructive">{d.discount.replace(/^Save up to /i, "Hemat ")}</span>}
                  </p>
                  {data?.commission && <p className="text-xs text-status-ok">Komisi ±{data.commission} per penjualan</p>}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Terjual" value={d.sold != null ? num.format(d.sold) : "—"} />
                  <Stat label="Rating" value={d.rating ? <span className="flex items-center gap-1"><Star className="size-3.5 fill-amber-400 text-amber-400" />{String(d.rating).replace(".", ",")}</span> : "—"} sub={d.reviews ? `${num.format(d.reviews)} ulasan` : undefined} />
                  <Stat label="Stok" value={d.stock != null ? num.format(d.stock) : "—"} />
                </div>
                {d.variants.filter((v) => v.values.length).map((v) => (
                  <div key={v.name} className="space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground">{v.name} ({v.values.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {v.values.slice(0, 14).map((x) => <span key={x} className="rounded-md border bg-background px-1.5 py-0.5 text-[11px]">{x}</span>)}
                      {v.values.length > 14 && <span className="px-1 text-[11px] text-muted-foreground">+{v.values.length - 14}</span>}
                    </div>
                  </div>
                ))}
                <div className="space-y-1 text-xs text-muted-foreground">
                  {d.shop && <p className="flex items-center gap-1.5"><Store className="size-3.5" /> {d.shop.name}{d.shop.rating ? ` · rating toko ${String(d.shop.rating).replace(".", ",")}` : ""}</p>}
                  {d.shipping && <p className="flex items-center gap-1.5"><Truck className="size-3.5" /> {d.shipping}</p>}
                  {d.category && <p className="flex items-center gap-1.5"><Package className="size-3.5" /> {d.category}</p>}
                </div>
              </>
            ) : (
              !error && <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-6 animate-pulse rounded bg-muted" />)}</div>
            )}
          </div>
        </div>

        {d?.description && (
          <details className="rounded-lg border" open>
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium">Deskripsi penjual</summary>
            <p className="max-h-56 overflow-y-auto border-t px-3 py-2 text-xs leading-relaxed whitespace-pre-line text-muted-foreground">{d.description}</p>
          </details>
        )}
        {data?.facts && (
          <details className="rounded-lg border">
            <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs font-medium"><Sparkles className="size-3.5 text-black dark:text-white" /> Bahan untuk AI</summary>
            <p className="border-t px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">{data.facts}</p>
          </details>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" disabled={pending} onClick={() => load(true)} className="mr-auto flex h-9 items-center gap-1.5 rounded-lg border bg-background px-3 text-[13px] font-medium hover:bg-accent disabled:opacity-60">
            <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} /> Ambil ulang
          </button>
          {product && (
            <a href={`https://www.tiktok.com/view/product/${product.productId}`} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-1.5 rounded-lg border bg-background px-3 text-[13px] font-medium hover:bg-accent">
              <ExternalLink className="size-4" /> TikTok
            </a>
          )}
          <button type="button" onClick={onMakeVideo} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">
            <Clapperboard className="size-4" /> Buat video
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg border bg-background px-2.5 py-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <div className="text-sm font-semibold">{value}</div>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
