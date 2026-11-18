"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3, CircleAlert, Download, ImageIcon, Play, Copy, ExternalLink, KeyRound, Loader2, Plus, RefreshCw, Search, Sparkles, Store, Trash2, TrendingUp, UserPlus, Users, Video,
} from "lucide-react";
import { toast } from "sonner";
import { CountryBadge, CountrySelect } from "@/components/country-select";
import { SaveProductButton } from "@/components/save-product-button";
import { usePersistentState } from "@/lib/use-persistent-state";
import { countryOf, SHOPEE_MARKETS } from "@/lib/countries";
import { MarketTops, type TopsMode } from "./market-tops";
import type { KaloProductInfo } from "@/lib/kalodata";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  addKaloSession, checkKaloSessions, deleteKaloSession, createVideoFromKalo, kaloDetail, kaloToShowcase, kaloVideoUrl, searchKalo, signupKaloSession, type KaloDetail, type KaloHit,
} from "./actions";

const money = (code: string) => new Intl.NumberFormat("id-ID", { style: "currency", currency: countryOf(code)?.currency ?? "IDR", notation: "compact", maximumFractionDigits: 1 });
const productUrl = (id: string) => `https://www.tiktok.com/view/product/${id}`;
const kaloProductImg = (id: string) => `https://img.kalocdn.com/tiktok.product/${id}/cover.png`;
const kaloVideoImg = (id: string) => `https://img.kalocdn.com/tiktok.video/${id}/cover.png`;
const compactNum = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Gagal");

// ---------------------------------------------------------------- research

export function KaloStudio({
  hasSession, lastKeywords, lastCountry = "ID", autoSearch = false, initialResults = null, initialDetailId = null, savedKeys = [],
}: {
  hasSession: boolean;
  lastKeywords: string[];
  lastCountry?: string;
  autoSearch?: boolean;
  initialResults?: KaloHit[] | null; // last search, restored from the DB
  initialDetailId?: string | null; // ?produk=<id> keeps the open detail across refresh
  savedKeys?: string[];
}) {
  const [country, setCountry] = useState(lastCountry);
  const [q, setQ] = useState(lastKeywords.join(", "));
  const [results, setResults] = useState<KaloHit[] | null>(initialResults);
  const [meta, setMeta] = useState<{ cached: boolean; keywords: string[]; country: string } | null>(
    initialResults ? { cached: true, keywords: lastKeywords, country: lastCountry } : null,
  );
  const [filter, setFilter] = usePersistentState("riset:kalo-filter", "");
  const [mode, setMode] = usePersistentState<"cari" | TopsMode>("riset:kalo-mode", "cari");
  const [detail, setDetailState] = useState<KaloHit | null>(() => (initialDetailId ? initialResults?.find((r) => r.id === initialDetailId) ?? null : null));
  // the open product lives in the URL (?produk=), so a refresh reopens it
  const setDetail = (h: KaloHit | null) => {
    setDetailState(h);
    const u = new URL(window.location.href);
    if (h) u.searchParams.set("produk", h.id);
    else u.searchParams.delete("produk");
    window.history.replaceState(null, "", u);
  };
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState<string | null>(null);

  const search = (text = q, cc = country) =>
    start(async () => {
      try {
        const r = await searchKalo(text, cc);
        setResults(r.results);
        setMeta({ cached: r.cached, keywords: r.keywords, country: r.country });
      } catch (e) {
        toast.error(errMsg(e));
      }
    });
  // arriving from Riset Pasar with ?q= runs the search right away
  useEffect(() => {
    if (!autoSearch || !hasSession) return;
    const t = setTimeout(() => search(lastKeywords.join(", ")), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on arrival
  }, []);
  const toShowcase = (h: KaloHit) => {
    setAdding(h.id);
    start(async () => {
      try {
        const r = await kaloToShowcase(h.id);
        if (r.ok) toast.success(`Masuk etalase @${r.account}`);
        else toast.error(r.message);
      } catch (e) {
        toast.error(errMsg(e));
      } finally {
        setAdding(null);
      }
    });
  };

  if (!hasSession) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center">
        <BarChart3 className="size-7 text-muted-foreground" />
        <p className="text-sm font-medium">Hubungkan KaloData dulu</p>
        <p className="max-w-md text-xs text-muted-foreground">KaloData memberi data penjualan produk TikTok Shop (GMV, tren harian, video & kreator terlaris). Tambahkan sesi lewat tombol Kelola sesi di kanan atas, bisa tempel cookie atau buat akun trial otomatis.</p>
      </div>
    );
  }

  const k = filter.trim().toLowerCase();
  const shown = (results ?? []).filter((r) => !k || r.name.toLowerCase().includes(k));
  const top = results?.[0]?.gmv30 ?? 1;

  const shopeeCountry = (SHOPEE_MARKETS as readonly string[]).includes(country) ? country : "ID";
  const modes: [typeof mode, string][] = [["cari", "Cari kata kunci"], ["produk", "Top produk"], ["video", "Video terlaris"], ["shopee", "Shopee"]];
  return (
    <div className="flex-1 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {modes.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setMode(id)} className={`h-8 rounded-md px-3 text-xs font-medium ${mode === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
        {mode !== "cari" && (
          <CountrySelect
            value={mode === "shopee" ? shopeeCountry : country}
            onChange={setCountry}
            label={mode === "shopee" ? "Pasar Shopee" : "Pasar TikTok Shop"}
            options={mode === "shopee" ? SHOPEE_MARKETS.map((code) => ({ code })) : undefined}
          />
        )}
      </div>
      {mode !== "cari" ? (
        <MarketTops mode={mode} country={mode === "shopee" ? shopeeCountry : country} savedKeys={savedKeys} onDetail={setDetail} />
      ) : (
      <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
        className="flex flex-wrap gap-2"
      >
        <CountrySelect value={country} onChange={(c) => { setCountry(c); if (q.trim()) search(q, c); }} disabled={pending} label="Pasar KaloData" />
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card px-3 text-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
          <Search className="size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kata kunci produk, pisahkan koma. Contoh: kaos polos, kaos oversize, singlet pria" className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <button type="submit" disabled={pending || !q.trim()} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          {pending && !adding ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Riset
        </button>
      </form>
      <p className="text-xs text-muted-foreground">
        Pencarian nama memakai jalur hemat kuota KaloData (estimasi GMV 30 hari). Klik <b>Detail</b> untuk tren harian, video & kreator terlaris (memakai kuota detail harian, hasil disimpan 24 jam).
      </p>

      {results && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">{meta && <CountryBadge code={meta.country} />}<b className="text-foreground">{results.length}</b> produk dari {meta?.keywords.length} kata kunci{meta?.cached ? " · dari cache" : ""}</span>
            <label className="ml-auto flex h-8 w-full items-center gap-2 rounded-lg border bg-card px-2.5 sm:w-60">
              <Search className="size-3.5" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Saring hasil..." className="min-w-0 flex-1 bg-transparent text-foreground outline-none" />
            </label>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card">
            {shown.slice(0, 200).map((r, i) => (
              <div key={r.id} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
                <span className="w-6 shrink-0 text-center text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                <button type="button" onClick={() => setDetail(r)} className="shrink-0" aria-label="Lihat detail">
                  <KaloImg src={kaloProductImg(r.id)} className="size-11 rounded-lg border" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium" title={r.name}>{r.name}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1 w-32 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-[#f2994a]" style={{ width: `${Math.max(2, (r.gmv30 / top) * 100)}%` }} />
                    </div>
                    <span className="text-[11px] text-muted-foreground">GMV 30 hari <b className="text-foreground">{money(meta?.country ?? country).format(r.gmv30)}</b></span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => setDetail(r)} className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium hover:bg-accent"><TrendingUp className="size-3.5" /> Detail</button>
                  <SaveProductButton
                    compact
                    saved={savedKeys.includes(`${r.id}:${meta?.country ?? country}`)}
                    product={{ productId: r.id, country: meta?.country ?? country, source: "kalodata", title: r.name, image: kaloProductImg(r.id), metrics: { gmv30: money(meta?.country ?? country).format(r.gmv30) } }}
                  />
                  <button type="button" disabled={adding === r.id} onClick={() => toShowcase(r)} title="Tambah ke etalase TikTok" className="flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                    {adding === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <Store className="size-3.5" />} Etalase
                  </button>
                  <a href={productUrl(r.id)} target="_blank" rel="noreferrer" title="Buka di TikTok" className="grid size-7 place-items-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground"><ExternalLink className="size-3.5" /></a>
                  <button type="button" title="Salin ID produk" onClick={() => { void navigator.clipboard.writeText(r.id); toast.success("ID produk disalin"); }} className="grid size-7 place-items-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground"><Copy className="size-3.5" /></button>
                </div>
              </div>
            ))}
            {shown.length === 0 && <p className="p-8 text-center text-xs text-muted-foreground">Tidak ada hasil.</p>}
          </div>
        </div>
      )}

      </>
      )}

      <DetailDialog hit={detail} country={meta?.country ?? country} savedKeys={savedKeys} onClose={() => setDetail(null)} />
    </div>
  );
}

function Sparkline({ points, labels }: { points: number[]; labels?: string[] }) {
  if (points.length < 2) return null;
  const max = Math.max(...points, 1);
  const d = points.map((v, i) => `${(i / (points.length - 1)) * 100},${30 - (v / max) * 28}`).join(" ");
  return (
    <div>
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-20 w-full">
        <polyline points={`0,30 ${d} 100,30`} fill="rgb(242 153 74 / 0.15)" stroke="none" />
        <polyline points={d} fill="none" stroke="#f2994a" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
      {labels && (
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      )}
    </div>
  );
}

/** Kalodata image CDN (no auth, cached 7 days). Hidden quietly when a picture doesn't exist. */
function KaloImg({ src, className, alt = "" }: { src: string; className: string; alt?: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <div className={`grid place-items-center bg-muted ${className}`}><ImageIcon className="size-4 text-muted-foreground" /></div>;
  return <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setOk(false)} className={`bg-muted object-cover ${className}`} />;
}

/** TikTok's own fallback URL for a video when the author handle is unknown (what m.tiktok.com/v/<id> redirects to). */
const tiktokVideoUrl = (id: string) => `https://www.tiktok.com/@/video/${id}`;
const photos = (id: string, d?: { images: string[] } | null) => (d?.images?.length ? d.images : [kaloProductImg(id)]);

/** "Rp158.90k" → 158900 (only for comparing prices; b/m/k suffixes). */
const kaloNum = (v?: string | null) => {
  const m = String(v ?? "").replace(/[^\d.,bmk]/gi, "").match(/([\d.,]+)\s*([bmk])?/i);
  if (!m) return 0;
  return parseFloat(m[1].replace(/,/g, "")) * ({ b: 1e9, m: 1e6, k: 1e3 }[m[2]?.toLowerCase() as "b" | "m" | "k"] ?? 1);
};

function InfoChips({ info }: { info: KaloProductInfo }) {
  const price = info.min_real_price && info.max_real_price && info.min_real_price !== info.max_real_price ? `${info.min_real_price} – ${info.max_real_price}` : info.min_real_price;
  const chips = [
    info.brand_name && { k: "Brand", v: info.brand_name },
    info.name && { k: "Toko", v: `${info.name}${info.seller_type === "BRAND" ? " · resmi" : ""}` },
    info.product_rating != null && { k: "Rating", v: `★ ${info.product_rating}${info.product_review_count ? ` · ${compactNum.format(info.product_review_count)} ulasan` : ""}` },
    info.commission_rate && { k: "Komisi", v: info.commission_rate },
    price && { k: "Harga", v: `${price}${info.min_original_price && kaloNum(info.min_original_price) > kaloNum(info.min_real_price) ? ` (dari ${info.min_original_price})` : ""}` },
    info.shipping_fee && /^Rp0([.,]0+)?$/.test(info.shipping_fee) && { k: "Ongkir", v: "Gratis" },
  ].filter(Boolean) as { k: string; v: string }[];
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c.k} className="rounded-md border bg-background px-1.5 py-0.5 text-[11px]"><span className="text-muted-foreground">{c.k}:</span> <b className="font-medium">{c.v}</b></span>
      ))}
    </div>
  );
}

const initials = (s: string) => s.replace(/^@/, "").slice(0, 2).toUpperCase();

function DetailDialog({ hit, country, savedKeys, onClose }: { hit: KaloHit | null; country: string; savedKeys: string[]; onClose: () => void }) {
  const [state, setState] = useState<{ id: string; data?: KaloDetail & { cached: boolean }; error?: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [photo, setPhoto] = useState(0);
  const [making, startMaking] = useTransition();
  const makeVideo = () =>
    hit &&
    startMaking(async () => {
      try {
        await createVideoFromKalo(hit.id, country); // redirects to the Studio
      } catch (e) {
        if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
        toast.error(errMsg(e));
      }
    });
  const [playing, setPlaying] = useState<{ id: string; url?: string; error?: string } | null>(null);

  // fetch when a product is opened (in an effect, never during render)
  useEffect(() => {
    if (!hit) return;
    let alive = true;
    setTimeout(() => alive && (setPhoto(0), setPlaying(null)), 0);
    kaloDetail(hit.id, country).then(
      (data) => alive && setState({ id: hit.id, data }),
      (e) => alive && setState({ id: hit.id, error: errMsg(e) }),
    );
    return () => {
      alive = false;
    };
  }, [hit, country]);

  const current = state && hit && state.id === hit.id ? state : null;
  const play = (videoId: string) => {
    setPlaying({ id: videoId });
    kaloVideoUrl(videoId, country).then(
      (url) => setPlaying((p) => (p?.id === videoId ? { id: videoId, url } : p)),
      (e) => setPlaying((p) => (p?.id === videoId ? { id: videoId, error: errMsg(e) } : p)),
    );
  };
  const data = current?.data;
  const t = data?.total;
  const toShowcase = async () => {
    if (!hit) return;
    setAdding(true);
    try {
      const r = await kaloToShowcase(hit.id);
      if (r.ok) toast.success(`Masuk etalase @${r.account}`);
      else toast.error(r.message);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={!!hit} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-3 sm:max-w-3xl">
        {hit && (
          <div className="flex gap-4 pr-6">
            <div className="w-32 shrink-0 space-y-1.5">
              <KaloImg key={photos(hit.id, data)[photo] ?? "c"} src={photos(hit.id, data)[photo] ?? kaloProductImg(hit.id)} alt={hit.name} className="aspect-square w-32 rounded-xl border" />
              {photos(hit.id, data).length > 1 && (
                <div className="flex gap-1 overflow-x-auto pb-0.5">
                  {photos(hit.id, data).slice(0, 8).map((src, i) => (
                    <button key={src} type="button" onClick={() => setPhoto(i)} className={`shrink-0 overflow-hidden rounded-md border-2 ${i === photo ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"}`}>
                      <KaloImg src={src} className="size-7" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <DialogHeader className="gap-1 text-left">
                <DialogTitle className="line-clamp-2 text-[15px] leading-snug">{hit.name}</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-x-2 text-xs">
                  <CountryBadge code={country} />
                  {data ? `${data.range.startDate} – ${data.range.endDate}${data.cached ? " · dari cache" : ""}` : current?.error ? "Gagal memuat" : "Mengambil data KaloData..."}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={!data || making}
                  onClick={makeVideo}
                  title="Racik proyek video otomatis: foto, harga, gaya dari video terlaris, dan naskah"
                  className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {making ? <><Loader2 className="size-3.5 animate-spin" /> Meracik bahan...</> : <><Sparkles className="size-3.5" /> Buatkan videonya</>}
                </button>
                <button type="button" disabled={adding} onClick={toShowcase} className="flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium hover:bg-accent disabled:opacity-60">
                  {adding ? <Loader2 className="size-3.5 animate-spin" /> : <Store className="size-3.5" />} Etalase
                </button>
                <a href={productUrl(hit.id)} target="_blank" rel="noreferrer" className="flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium hover:bg-accent"><ExternalLink className="size-3.5" /> Buka di TikTok</a>
                <button type="button" onClick={() => { void navigator.clipboard.writeText(hit.id); toast.success("ID produk disalin"); }} className="flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium hover:bg-accent"><Copy className="size-3.5" /> Salin ID</button>
                <SaveProductButton
                  key={`${hit.id}:${data ? 1 : 0}`}
                  saved={savedKeys.includes(`${hit.id}:${country}`)}
                  product={{
                    productId: hit.id, country, source: "kalodata", title: hit.name, image: photos(hit.id, data)[0], price: data?.info?.min_real_price ?? data?.total.unit_price ?? null, shopName: data?.info?.name ?? null,
                    metrics: { revenue: data?.total.revenue ?? money(country).format(hit.gmv30), sale: data?.total.sale ?? null, creators: data?.total.related_creator_count ?? null, rating: data?.info?.product_rating ?? null, commission: data?.info?.commission_rate ?? null },
                  }}
                />
              </div>
              {data?.info && <InfoChips info={data.info} />}
            </div>
          </div>
        )}

        {current?.error ? (
          <p className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive"><CircleAlert className="size-4 shrink-0" />{current.error}</p>
        ) : !data ? (
          <div className="grid place-items-center py-14"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="max-h-[58vh] space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Omzet 30 hari", t?.revenue, true],
                ["Terjual", t?.sale, true],
                ["Harga rata-rata", t?.unit_price],
                ["Kreator", t?.related_creator_count],
                ["Dari video", t?.video_revenue],
                ["Dari LIVE", t?.live_revenue],
                ["Dari etalase/mall", t?.shopping_mall_revenue],
                ["Omzet kemarin", t?.day_revenue as string | undefined],
              ].map(([label, value, strong]) => (
                <div key={String(label)} className="rounded-lg border bg-background p-2.5">
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                  <p className={`font-semibold ${strong ? "text-base" : "text-sm"}`}>{String(value ?? "—")}</p>
                </div>
              ))}
            </div>

            {data.history.length > 1 && (
              <div className="rounded-lg border bg-background p-3">
                <p className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground"><TrendingUp className="size-3.5" /> Tren omzet harian</p>
                <Sparkline points={data.history.map((h) => h.revenue)} labels={data.history.map((h) => h.partition_day.slice(5))} />
              </div>
            )}

            {data.videos.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><Video className="size-3.5" /> Video terlaris</p>
                {playing && (
                  <div className="mb-2 flex gap-3 rounded-lg border bg-background p-2">
                    <div className="grid aspect-[9/16] w-40 shrink-0 place-items-center overflow-hidden rounded-md bg-black">
                      {playing.url ? (
                        <video key={playing.url} src={playing.url} controls autoPlay className="size-full object-contain" />
                      ) : playing.error ? (
                        <p className="p-2 text-center text-[11px] text-destructive">{playing.error}</p>
                      ) : (
                        <Loader2 className="size-5 animate-spin text-white/70" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2 text-xs">
                      <p className="line-clamp-4 text-muted-foreground">{data.videos.find((v) => v.id === playing.id)?.description || "Tanpa deskripsi"}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <a href={tiktokVideoUrl(playing.id)} target="_blank" rel="noreferrer" className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium hover:bg-accent"><ExternalLink className="size-3.5" /> Buka di TikTok</a>
                        {playing.url && <a href={playing.url} download={`video-${playing.id}.mp4`} target="_blank" rel="noreferrer" className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium hover:bg-accent"><Download className="size-3.5" /> Unduh MP4</a>}
                        <button type="button" onClick={() => setPlaying(null)} className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-accent">Tutup</button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Data KaloData tidak menyertakan akun pembuat video; link memakai ID video (TikTok mengarahkan ke video aslinya).</p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {data.videos.map((v) => (
                    <button key={v.id} type="button" onClick={() => play(v.id)} className={`group overflow-hidden rounded-lg border bg-background text-left ${playing?.id === v.id ? "ring-2 ring-primary" : ""}`} title={v.description}>
                      <div className="relative aspect-[9/14]">
                        <KaloImg src={kaloVideoImg(v.id)} className="size-full transition-transform duration-300 group-hover:scale-105" />
                        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 pt-5 text-[10px] leading-tight text-white">
                          <b>{v.revenue}</b><br />{v.views} views · {v.sale} terjual
                        </span>
                        <span className="absolute top-1 left-1 grid size-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"><Play className="size-3" /></span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {data.creators.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><Users className="size-3.5" /> Kreator terlaris</p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {data.creators.map((c) => (
                    <a key={c.id} href={`https://www.tiktok.com/@${c.handle}`} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-lg border bg-background px-2.5 py-2 text-[11px] hover:bg-accent">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#ff3b6b]/15 text-[10px] font-bold text-[#ff3b6b]">{initials(c.handle || c.nickname)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">@{c.handle}</span>
                        <span className="block truncate text-muted-foreground">{compactNum.format(c.followers)} pengikut · {c.sale} terjual</span>
                      </span>
                      <b className="shrink-0">{c.revenue}</b>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- sessions

type SessionView = { id: number; label: string; masked: string; email: string | null; source: string; status: string; lastError: string | null; created: string };

const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: "Aktif", cls: "bg-status-ok/10 text-status-ok" },
  quota: { label: "Kuota habis hari ini", cls: "bg-status-progress/10 text-status-progress" },
  dead: { label: "Mati", cls: "bg-destructive/10 text-destructive" },
};

export function SessionsButton({ sessions, active }: { sessions: SessionView[]; active: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cookie, setCookie] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState<Record<number, string>>({});
  // confirmations stay inside this dialog (no modal on top of a modal)
  const [confirm, setConfirm] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3.5 text-[13px] font-medium hover:bg-accent">
        <KeyRound className="size-4" /> Kelola sesi
        <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-status-ok/15 text-status-ok" : "bg-muted text-muted-foreground"}`}>{active} aktif</span>
      </button>
      <Dialog open={open} onOpenChange={(o) => { if (!busy) { setOpen(o); setConfirm(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sesi KaloData</DialogTitle>
            <DialogDescription>Kuota KaloData dihitung per akun per hari. Beberapa sesi otomatis dipakai bergantian saat satu habis.</DialogDescription>
          </DialogHeader>

          <div className="max-h-[40vh] space-y-1.5 overflow-y-auto">
            {sessions.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Belum ada sesi.</p>}
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg border bg-background p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-xs font-medium">
                    {s.label}
                    <span className={`rounded-full px-1.5 py-px text-[10px] ${STATUS[s.status]?.cls}`}>{STATUS[s.status]?.label}</span>
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {s.email ?? (s.source === "signup" ? "akun trial" : "cookie manual")} · {s.masked} · {s.created}
                    {info[s.id] ? ` · ${info[s.id]}` : s.lastError ? ` · ${s.lastError}` : ""}
                  </p>
                </div>
                {confirm === `del${s.id}` ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => setConfirm(null)} className="h-7 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-accent">Batal</button>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => run(`del${s.id}`, async () => { await deleteKaloSession(s.id); setConfirm(null); toast.success("Sesi dihapus"); })}
                      className="flex h-7 items-center gap-1 rounded-md bg-destructive px-2 text-[11px] font-medium text-white hover:bg-destructive/90 disabled:opacity-60"
                    >
                      {busy === `del${s.id}` && <Loader2 className="size-3 animate-spin" />} Hapus
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-label="Hapus sesi"
                    disabled={!!busy}
                    onClick={() => setConfirm(`del${s.id}`)}
                    className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input value={cookie} onChange={(e) => setCookie(e.target.value)} placeholder="Tempel cookie SESSION dari kalodata.com" className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 font-mono text-xs outline-none focus:border-ring" />
            <button
              type="button"
              disabled={!!busy || cookie.trim().length < 16}
              onClick={() =>
                run("add", async () => {
                  const m = await addKaloSession(cookie);
                  setCookie("");
                  toast.success(`Sesi ditambahkan · paket ${m.level}, sisa ${m.daysLeft} hari`);
                })
              }
              className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {busy === "add" ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Tambah
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => setConfirm(confirm === "signup" ? null : "signup")}
              className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium disabled:opacity-60 ${confirm === "signup" ? "border-primary/50 bg-primary/10" : "bg-background hover:bg-accent"}`}
            >
              {busy === "signup" ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />} {busy === "signup" ? "Membuat akun..." : "Buat akun trial"}
            </button>
            <button
              type="button"
              disabled={!!busy || !sessions.length}
              onClick={() =>
                run("check", async () => {
                  const r = await checkKaloSessions();
                  setInfo(Object.fromEntries(r.map((x) => [x.id, x.error ? "gagal dicek" : `${x.level}, sisa ${x.daysLeft} hari`])));
                })
              }
              className="flex h-8 items-center gap-1.5 rounded-lg border bg-background px-3 text-xs font-medium hover:bg-accent disabled:opacity-60"
            >
              {busy === "check" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Cek status paket
            </button>
          </div>
          {confirm === "signup" && (
            <div className="space-y-2.5 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs leading-relaxed">
                <b>Buat akun trial KaloData otomatis?</b> Traktiva mendaftar akun baru memakai email sementara WaroengMail lalu menyimpan sesinya (±5–60 detik).
                <span className="text-muted-foreground"> Terlalu banyak akun dari satu jaringan bisa ditandai KaloData.</span>
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" disabled={busy === "signup"} onClick={() => setConfirm(null)} className="h-8 rounded-lg border bg-background px-3 text-xs font-medium hover:bg-accent disabled:opacity-60">Batal</button>
                <button
                  type="button"
                  disabled={busy === "signup"}
                  onClick={() => run("signup", async () => { const r = await signupKaloSession(); setConfirm(null); toast.success(`Akun trial aktif: ${r.email} · paket ${r.level}, sisa ${r.days} hari`); })}
                  className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {busy === "signup" ? <><Loader2 className="size-3.5 animate-spin" /> Membuat...</> : "Ya, buat akun"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
