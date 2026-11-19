"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Megaphone, Play, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { openLightbox } from "@/components/media-lightbox";
import { SaveProductButton } from "@/components/save-product-button";
import type { KaloTopProduct, KaloTopVideo } from "@/lib/kalodata";
import { kaloTopProducts, kaloTopVideos, kaloVideoUrl, type KaloHit } from "./actions";
import { intentProps } from "./detail-cache";
import { EmptyBox, ListBox, LoadMore, pillBtn, ProductRow, RefreshButton } from "./riset-ui";

export type TopsMode = "produk" | "video";
type Rows = { mode: "produk"; rows: KaloTopProduct[] } | { mode: "video"; rows: KaloTopVideo[] };
type State = Rows & { at: number; cached: boolean; key: string; page: number; more: boolean };

const kaloProductImg = (id: string) => `https://img.kalocdn.com/tiktok.product/${id}/cover.png`;
const kaloVideoImg = (id: string) => `https://img.kalocdn.com/tiktok.video/${id}/cover.png`;
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Gagal");
const PAGE = 20;
const MAX_PAGE = 10;

/** TikTok Shop rankings of one market (top products / top videos); the next 20 load when the list end scrolls into view. */
export function MarketTops({ mode, country, savedKeys, onDetail }: { mode: TopsMode; country: string; savedKeys: string[]; onDetail: (h: KaloHit) => void }) {
  const [data, setData] = useState<State | null>(null);
  const [pending, start] = useTransition();
  const [opening, setOpening] = useState<string | null>(null);
  const key = `${mode}:${country}`;
  const latest = useRef(data);
  useEffect(() => {
    latest.current = data;
  });

  /** page 1 replaces the list; later pages append (duplicates across pages are dropped). */
  const load = (refresh = false, page = 1) =>
    start(async () => {
      try {
        const keep = page > 1 && latest.current?.key === key ? latest.current : null;
        const r = mode === "produk" ? await kaloTopProducts(country, page, refresh) : await kaloTopVideos(country, page, refresh);
        const old = (keep?.rows ?? []) as { id: string }[];
        const rows = [...old, ...(r.rows as { id: string }[]).filter((x) => !old.some((y) => y.id === x.id))];
        setData({ mode, rows, at: r.at, cached: r.cached, key, page, more: r.rows.length >= PAGE && page < MAX_PAGE } as State);
      } catch (e) {
        toast.error(errMsg(e));
      }
    });
  useEffect(() => {
    const t = setTimeout(() => load(false), 0);
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
  const noun = mode === "produk" ? "produk" : "video";
  return (
    <div className="space-y-3">
      <RefreshButton onRefresh={() => load(true)} pending={pending} />

      {!shown ? (
        <EmptyBox>{pending ? <><Loader2 className="size-4 animate-spin" /> Mengambil ranking...</> : "Belum ada data."}</EmptyBox>
      ) : shown.mode === "produk" ? (
        <ListBox>
          {shown.rows.map((r, i) => (
            <ProductRow
              key={r.id}
              rank={i + 1}
              image={kaloProductImg(r.id)}
              title={r.product_title}
              onOpen={() => onDetail({ id: r.id, name: r.product_title, gmv30: 0 })}
              intent={intentProps(r.id, country)}
              actions={
                <>
                  <button type="button" onClick={() => onDetail({ id: r.id, name: r.product_title, gmv30: 0 })} className={pillBtn}><TrendingUp className="size-3.5" /> Detail</button>
                  <SaveProductButton
                    compact
                    saved={savedKeys.includes(`${r.id}:${country}`)}
                    product={{ productId: r.id, country, source: "kalodata", title: r.product_title, image: kaloProductImg(r.id), price: r.unit_price, metrics: { revenue: r.revenue, sale: String(r.sale) } }}
                  />
                </>
              }
            >
              Omzet <b className="text-foreground">{r.revenue}</b> · {compact.format(r.sale)} terjual · harga {r.unit_price}
              {r.commission_rate && r.commission_rate !== "-" ? ` · komisi ${r.commission_rate}` : ""}
            </ProductRow>
          ))}
        </ListBox>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {shown.rows.map((v, i) => (
            <button key={v.id} type="button" onClick={() => play(v)} className="group overflow-hidden rounded-xl border bg-card text-left" title={v.description}>
              <div className="relative aspect-[9/16] bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={kaloVideoImg(v.id)} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
                <span className="absolute inset-0 grid place-items-center bg-black/0 group-hover:bg-black/30">
                  {opening === v.id ? <Loader2 className="size-7 animate-spin text-white" /> : <Play className="size-7 text-white opacity-0 group-hover:opacity-100" />}
                </span>
                <div className="absolute top-1.5 left-1.5 flex gap-1">
                  <span className="rounded bg-black/70 px-1 text-[10px] font-semibold text-white tabular-nums">#{i + 1}</span>
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
      )}
      {shown && <LoadMore onReach={() => shown.more && !pending && load(false, shown.page + 1)} busy={pending} done={!shown.more} label={noun} />}
    </div>
  );
}
