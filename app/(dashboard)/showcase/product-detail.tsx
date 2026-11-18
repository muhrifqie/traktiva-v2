"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, CircleAlert, Clapperboard, Copy, ExternalLink, Link2, Loader2, Maximize2, Package } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { openLightbox } from "@/components/media-lightbox";
import { mediaUrl } from "@/lib/media-url";
import { kaloDetail, type KaloDetail } from "@/app/(dashboard)/kalodata/actions";
import { InfoChips, KaloInsights } from "@/app/(dashboard)/kalodata/kalo-studio";

// Showcase product detail: full photo gallery (Kalodata's product gallery, else the cached showcase cover),
// the showcase facts (price, commission, stock…) and Kalodata performance (sales, trend, videos, creators).

export type DetailProduct = {
  id: number;
  productId: string;
  title: string;
  price: string;
  originalPrice: string | null;
  commission: string | null;
  stock: number | null;
  inStock: boolean;
  hidden: boolean;
  shopName: string | null;
  cover: string | null;
  labels: string[];
};

const productUrl = (pid: string) => `https://www.tiktok.com/view/product/${pid}`;
const num = new Intl.NumberFormat("id-ID");
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Gagal memuat");

export function ShowcaseDetail({ product, onClose, onMakeVideo }: { product: DetailProduct | null; onClose: () => void; onMakeVideo: (p: DetailProduct) => void }) {
  const [state, setState] = useState<{ pid: string; data?: KaloDetail; error?: string } | null>(null);
  const [photo, setPhoto] = useState(0);

  // Kalodata detail is cached 24 h per product on the server, so reopening is instant
  useEffect(() => {
    if (!product) return;
    let alive = true;
    setTimeout(() => alive && setPhoto(0), 0);
    kaloDetail(product.productId, "ID").then(
      (data) => alive && setState({ pid: product.productId, data }),
      (e) => alive && setState({ pid: product.productId, error: errMsg(e) }),
    );
    return () => {
      alive = false;
    };
  }, [product]);

  const current = product && state?.pid === product.productId ? state : null;
  const data = current?.data;
  const gallery = product ? (data?.images?.length ? data.images : product.cover ? [product.cover] : []) : [];
  const idx = Math.min(photo, Math.max(0, gallery.length - 1));
  const go = (d: number) => gallery.length && setPhoto((i) => (i + d + gallery.length) % gallery.length);
  const zoom = () => openLightbox(gallery.map((src, i) => ({ src, kind: "image" as const, label: `${product?.title ?? ""} · foto ${i + 1}/${gallery.length}` })), idx);
  const copy = (text: string, msg: string) => {
    void navigator.clipboard.writeText(text);
    toast.success(msg);
  };

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] gap-4 overflow-y-auto sm:max-w-4xl">
        {product && (
          <>
            <div className="grid gap-5 md:grid-cols-[minmax(0,340px)_1fr]">
              {/* gallery */}
              <div className="space-y-2">
                <div className="group relative aspect-square overflow-hidden rounded-xl border bg-muted">
                  {gallery.length ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local media or product CDN
                    <img key={gallery[idx]} src={mediaUrl(gallery[idx])} alt={product.title} referrerPolicy="no-referrer" onClick={zoom} className="size-full cursor-zoom-in object-cover" />
                  ) : (
                    <Package className="absolute inset-0 m-auto size-8 text-muted-foreground" />
                  )}
                  {gallery.length > 1 && (
                    <>
                      <button type="button" aria-label="Foto sebelumnya" onClick={() => go(-1)} className="absolute top-1/2 left-2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/75">
                        <ChevronLeft className="size-4" />
                      </button>
                      <button type="button" aria-label="Foto berikutnya" onClick={() => go(1)} className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/75">
                        <ChevronRight className="size-4" />
                      </button>
                    </>
                  )}
                  <span className="pointer-events-none absolute right-2 bottom-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                    <Maximize2 className="size-3" /> {gallery.length ? `${idx + 1}/${gallery.length}` : "—"}
                  </span>
                  {!data && !current?.error && gallery.length <= 1 && (
                    <span className="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white"><Loader2 className="size-3 animate-spin" /> Memuat galeri...</span>
                  )}
                </div>
                {gallery.length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {gallery.map((src, i) => (
                      <button key={src} type="button" onClick={() => setPhoto(i)} aria-label={`Foto ${i + 1}`} className={`size-14 shrink-0 overflow-hidden rounded-lg border-2 ${i === idx ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- product CDN */}
                        <img src={mediaUrl(src)} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* facts */}
              <div className="min-w-0 space-y-3 pr-4">
                <DialogHeader className="gap-1 text-left">
                  <DialogTitle className="text-[16px] leading-snug">{product.title}</DialogTitle>
                  <DialogDescription className="text-xs">{product.shopName ?? "Toko tidak diketahui"}</DialogDescription>
                </DialogHeader>

                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-2xl font-semibold">{product.price}</span>
                  {product.originalPrice && product.originalPrice !== product.price && <span className="text-sm text-muted-foreground line-through">{product.originalPrice}</span>}
                  {product.labels.map((l) => (
                    <span key={l} className="rounded bg-destructive/90 px-1.5 py-px text-[11px] font-medium text-white">{l}</span>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    ["Komisi", product.commission ?? "—", "text-[#4ade80]"],
                    ["Stok", product.stock != null ? num.format(product.stock) : "—", product.inStock ? "" : "text-destructive"],
                    ["Status", product.hidden ? "Disembunyikan" : product.inStock ? "Tampil" : "Stok habis", ""],
                  ].map(([k, v, cls]) => (
                    <div key={k} className="rounded-lg border bg-background p-2">
                      <p className="text-[11px] text-muted-foreground">{k}</p>
                      <p className={`text-sm font-semibold ${cls}`}>{v}</p>
                    </div>
                  ))}
                </div>

                {data?.info && <InfoChips info={data.info} />}

                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  PID <span className="font-mono text-foreground">{product.productId}</span>
                  <button type="button" onClick={() => copy(product.productId, "PID disalin")} aria-label="Salin PID" className="grid size-5 place-items-center rounded hover:bg-accent"><Copy className="size-3" /></button>
                </p>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => onMakeVideo(product)}
                    className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <Clapperboard className="size-4" /> Buat video
                  </button>
                  <a href={productUrl(product.productId)} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium hover:bg-accent">
                    <ExternalLink className="size-4" /> Buka di TikTok
                  </a>
                  <button type="button" onClick={() => copy(productUrl(product.productId), "Link produk disalin")} className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium hover:bg-accent">
                    <Link2 className="size-4" /> Salin link
                  </button>
                </div>
              </div>
            </div>

            {/* performance */}
            <div className="border-t pt-4">
              <p className="mb-3 text-xs font-semibold">
                Performa 30 hari <span className="font-normal text-muted-foreground">{data ? `· KaloData ${data.range.startDate} – ${data.range.endDate}` : ""}</span>
              </p>
              {current?.error ? (
                <p className="flex items-center gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                  <CircleAlert className="size-4 shrink-0" /> Data performa tidak tersedia: {current.error}
                </p>
              ) : !data ? (
                <div className="grid place-items-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <KaloInsights data={data} country="ID" />
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
