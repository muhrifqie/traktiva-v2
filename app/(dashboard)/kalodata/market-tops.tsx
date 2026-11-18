"use client";

import { useEffect, useState, useTransition } from "react";
import { ExternalLink, ImageIcon, Loader2, Megaphone, Play, RefreshCw, Search, Star, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { CountryBadge } from "@/components/country-select";
import { openLightbox } from "@/components/media-lightbox";
import { SaveProductButton } from "@/components/save-product-button";
import type { KaloShopeeProduct, KaloTopProduct, KaloTopVideo } from "@/lib/kalodata";
import { kaloShopeeTops, kaloTopProducts, kaloTopVideos, kaloVideoUrl, type KaloHit } from "./actions";

export type TopsMode = "produk" | "video" | "shopee";
type Data = { mode: "produk"; rows: KaloTopProduct[] } | { mode: "video"; rows: KaloTopVideo[] } | { mode: "shopee"; rows: KaloShopeeProduct[] };

const kaloProductImg = (id: string) => `https://img.kalocdn.com/tiktok.product/${id}/cover.png`;
const kaloVideoImg = (id: string) => `https://img.kalocdn.com/tiktok.video/${id}/cover.png`;
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const time = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Gagal");

/** Market rankings without a keyword: top TikTok Shop products, top selling videos, Shopee best sellers. */
export function MarketTops({ mode, country, savedKeys, onDetail }: { mode: TopsMode; country: string; savedKeys: string[]; onDetail: (h: KaloHit) => void }) {
  const [data, setData] = useState<(Data & { at: number; cached: boolean; key: string }) | null>(null);
  const [keyword, setKeyword] = useState("");
  const [pending, start] = useTransition();
  const [opening, setOpening] = useState<string | null>(null);
  const key = `${mode}:${country}`;

  const load = (refresh = false, kw = keyword) =>
    start(async () => {
      try {
        if (mode === "produk") {
          const r = await kaloTopProducts(country, refresh);
          setData({ mode, rows: r.rows, at: r.at, cached: r.cached, key });
        } else if (mode === "video") {
          const r = await kaloTopVideos(country, refresh);
          setData({ mode, rows: r.rows, at: r.at, cached: r.cached, key });
        } else {
          const r = await kaloShopeeTops(country, kw, refresh);
          setData({ mode, rows: r.rows, at: r.at, cached: r.cached, key });
        }
      } catch (e) {
        toast.error(errMsg(e));
      }
    });
  useEffect(() => {
    const t = setTimeout(() => load(false, ""), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the market or list changes
  }, [key]);

  const play = async (v: KaloTopVideo) => {
    setOpening(v.id);
    try {
      const url = await kaloVideoUrl(v.id, country);
      openLightbox([{ src: url, kind: "video", label: v.description?.slice(0, 80) || "Video terlaris" }]);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setOpening(null);
    }
  };

  const shown = data?.key === key ? data : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <CountryBadge code={country} />
        <span>
          {mode === "produk" ? "10 produk TikTok Shop terlaris" : mode === "video" ? "10 video jualan terlaris (semua produk)" : "Produk Shopee terlaris minggu lalu"} · 30 hari terakhir
          {shown && <> · {shown.cached ? "cache" : "baru"} {time.format(shown.at)}</>}
        </span>
        {mode === "shopee" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              load(false, keyword);
            }}
            className="flex h-8 items-center gap-2 rounded-lg border bg-card px-2.5"
          >
            <Search className="size-3.5" />
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Kata kunci (opsional)" className="w-40 bg-transparent text-foreground outline-none" />
          </form>
        )}
        <button type="button" onClick={() => load(true)} disabled={pending} className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border bg-card px-2.5 font-medium text-foreground hover:bg-accent disabled:opacity-60">
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Muat ulang
        </button>
      </div>

      {!shown ? (
        <div className="flex h-40 items-center justify-center rounded-xl border bg-card text-xs text-muted-foreground">
          {pending ? <><Loader2 className="mr-2 size-4 animate-spin" /> Mengambil ranking...</> : "Belum ada data."}
        </div>
      ) : shown.mode === "produk" ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          {shown.rows.map((r, i) => (
            <div key={r.id} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
              <span className="w-6 shrink-0 text-center text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
              <Img src={kaloProductImg(r.id)} className="size-11 rounded-lg border" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium" title={r.product_title}>{r.product_title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Omzet <b className="text-foreground">{r.revenue}</b> · {compact.format(r.sale)} terjual · harga {r.unit_price}
                  {r.commission_rate && r.commission_rate !== "-" ? ` · komisi ${r.commission_rate}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => onDetail({ id: r.id, name: r.product_title, gmv30: 0 })} className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium hover:bg-accent"><TrendingUp className="size-3.5" /> Detail</button>
              <SaveProductButton
                compact
                saved={savedKeys.includes(`${r.id}:${country}`)}
                product={{ productId: r.id, country, source: "kalodata", title: r.product_title, image: kaloProductImg(r.id), price: r.unit_price, metrics: { revenue: r.revenue, sale: String(r.sale) } }}
              />
            </div>
          ))}
        </div>
      ) : shown.mode === "video" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {shown.rows.map((v) => (
            <button key={v.id} type="button" onClick={() => play(v)} className="group overflow-hidden rounded-lg border bg-card text-left" title={v.description}>
              <div className="relative aspect-[9/16] bg-muted">
                <Img src={kaloVideoImg(v.id)} className="size-full" />
                <span className="absolute inset-0 grid place-items-center bg-black/0 group-hover:bg-black/30">
                  {opening === v.id ? <Loader2 className="size-7 animate-spin text-white" /> : <Play className="size-7 text-white opacity-0 group-hover:opacity-100" />}
                </span>
                <div className="absolute top-1.5 left-1.5 flex gap-1">
                  {v.ad === 1 && <span className="flex items-center gap-0.5 rounded bg-black/70 px-1 text-[10px] text-white"><Megaphone className="size-2.5" /> Iklan</span>}
                  {v.ai_video === 1 && <span className="rounded bg-violet-600/90 px-1 text-[10px] text-white">AI</span>}
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-1.5 pt-6 text-[11px] leading-tight text-white">
                  <b>{v.revenue}</b>
                  <br />
                  {compact.format(v.sale)} terjual · {v.duration}
                </div>
              </div>
              <p className="line-clamp-2 p-1.5 text-[10px] text-muted-foreground">{v.description || "Tanpa deskripsi"}</p>
            </button>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          {shown.rows.map((r, i) => (
            <div key={r.pid} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
              <span className="w-6 shrink-0 text-center text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
              <Img src={r.imageUrl} className="size-11 rounded-lg border" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium" title={r.productName}>{r.productName}</p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {r.price} · terjual minggu ini <b className="text-foreground">{r.unitsSold ?? "-"}</b> · total {r.historicalSold} · <Star className="inline size-3 fill-amber-400 text-amber-400" /> {r.rating} · {r.shopName}
                </p>
                {r.cateNames?.length > 0 && <p className="truncate text-[10px] text-muted-foreground">{r.cateNames.join(" › ")}</p>}
              </div>
              <a href={r.productUrl} target="_blank" rel="noreferrer" title="Buka di Shopee" className="grid size-7 place-items-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground"><ExternalLink className="size-3.5" /></a>
            </div>
          ))}
          {shown.rows.length === 0 && <p className="p-8 text-center text-xs text-muted-foreground">Tidak ada hasil.</p>}
        </div>
      )}
    </div>
  );
}

function Img({ src, className }: { src: string; className: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <div className={`grid shrink-0 place-items-center bg-muted ${className}`}><ImageIcon className="size-4 text-muted-foreground" /></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setOk(false)} className={`shrink-0 bg-muted object-cover ${className}`} />;
}
