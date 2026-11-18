"use client";

import { useEffect, useState, useTransition } from "react";
import { CircleAlert, ExternalLink, ImageIcon, Loader2, RefreshCw, Star } from "lucide-react";
import { toast } from "sonner";
import { CountryBadge, CountrySelect } from "@/components/country-select";
import { SaveProductButton } from "@/components/save-product-button";
import { SHOPEE_MARKETS } from "@/lib/countries";
import type { KaloShopeeProduct } from "@/lib/kalodata";
import { kaloShopeeTops } from "./actions";

export type ShopeeTab = "produk" | "tersimpan";

const time = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Gagal");

/**
 * Shopee research (KaloData): last week's best sellers per market.
 * ponytail: KaloData trial accounts always get the same 10-row preview (category, keyword, period, sort and page 2
 * are ignored server-side), so the UI offers market only; kaloShopeeTops already accepts the filters for paid plans.
 */
export function ShopeeStudio({
  hasSession, initialTab = "produk", saved, savedCount = 0, savedKeys,
}: { hasSession: boolean; initialTab?: ShopeeTab; saved: React.ReactNode; savedCount?: number; savedKeys: string[] }) {
  const [tab, setTabState] = useState<ShopeeTab>(initialTab);
  const setTab = (t: ShopeeTab) => {
    setTabState(t);
    const u = new URL(window.location.href);
    u.searchParams.set("tab", t);
    window.history.replaceState(null, "", u);
  };
  const [country, setCountry] = useState<string>("ID");
  const [data, setData] = useState<{ rows: KaloShopeeProduct[]; at: number; cached: boolean } | null>(null);
  const [pending, start] = useTransition();

  const load = (cc = country, refresh = false) =>
    start(async () => {
      try {
        const r = await kaloShopeeTops(cc, {}, refresh);
        setData({ rows: r.rows, at: r.at, cached: r.cached });
      } catch (e) {
        toast.error(errMsg(e));
      }
    });
  useEffect(() => {
    if (!hasSession || tab !== "produk") return;
    const t = setTimeout(() => load(country), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on market / tab change only
  }, [country, tab, hasSession]);

  return (
    <div className="flex-1 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {([["produk", "Top produk"], ["tersimpan", `Tersimpan${savedCount ? ` (${savedCount})` : ""}`]] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`h-8 rounded-md px-3 text-xs font-medium ${tab === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "tersimpan" ? (
        saved
      ) : !hasSession ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-xs text-muted-foreground">Hubungkan KaloData dulu lewat tombol Kelola sesi di kanan atas.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <CountrySelect value={country} onChange={(c) => setCountry(c)} label="Pasar Shopee" options={SHOPEE_MARKETS.map((code) => ({ code }))} />
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CountryBadge code={country} /> Produk Shopee terlaris minggu lalu
              {data && <> · {data.cached ? "cache" : "baru"} {time.format(data.at)}</>}
            </span>
            <button type="button" onClick={() => load(country, true)} disabled={pending} className="ml-auto flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-xs font-medium hover:bg-accent disabled:opacity-60">
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Muat ulang
            </button>
          </div>
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-muted-foreground">
            <CircleAlert className="mt-px size-3.5 shrink-0 text-amber-500" />
            Akun trial KaloData hanya dapat 10 produk Shopee teratas; filter kategori, kata kunci, periode, dan halaman berikutnya baru jalan di paket berbayar. Data Shopee hanya ada untuk Indonesia, Thailand, dan Vietnam.
          </p>

          {!data ? (
            <div className="flex h-40 items-center justify-center rounded-xl border bg-card text-xs text-muted-foreground">
              {pending ? <><Loader2 className="mr-2 size-4 animate-spin" /> Mengambil produk Shopee...</> : "Belum ada data."}
            </div>
          ) : (
            <div className={`overflow-hidden rounded-xl border bg-card ${pending ? "opacity-60" : ""}`}>
              {data.rows.map((r, i) => (
                <div key={r.pid} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
                  <span className="w-6 shrink-0 text-center text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                  <Img src={r.imageUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium" title={r.productName}>{r.productName}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {r.price} · terjual periode ini <b className="text-foreground">{r.unitsSold ?? "-"}</b> · omzet <b className="text-foreground">{r.revenue}</b> · total {r.historicalSold} ·{" "}
                      <Star className="inline size-3 fill-amber-400 text-amber-400" /> {r.rating} · {r.shopName}
                    </p>
                    {r.cateNames?.length > 0 && <p className="truncate text-[10px] text-muted-foreground">{r.cateNames.join(" › ")}</p>}
                  </div>
                  <SaveProductButton
                    compact
                    saved={savedKeys.includes(`${r.pid}:${country}`)}
                    product={{ productId: r.pid, country, source: "shopee", title: r.productName, image: r.imageUrl, price: r.price, shopName: r.shopName, metrics: { sale: r.unitsSold ?? null, revenue: r.revenue, rating: r.rating } }}
                  />
                  <a href={r.productUrl} target="_blank" rel="noreferrer" title="Buka di Shopee" className="grid size-7 place-items-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground"><ExternalLink className="size-3.5" /></a>
                </div>
              ))}
              {data.rows.length === 0 && <p className="p-8 text-center text-xs text-muted-foreground">Tidak ada hasil.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Img({ src }: { src: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <div className="grid size-11 shrink-0 place-items-center rounded-lg border bg-muted"><ImageIcon className="size-4 text-muted-foreground" /></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setOk(false)} className="size-11 shrink-0 rounded-lg border bg-muted object-cover" />;
}
