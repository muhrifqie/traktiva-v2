"use client";

import { useEffect, useState, useTransition } from "react";
import { CircleAlert, ExternalLink, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { CountrySelect } from "@/components/country-select";
import { SaveProductButton } from "@/components/save-product-button";
import { SHOPEE_MARKETS } from "@/lib/countries";
import type { KaloShopeeProduct } from "@/lib/kalodata";
import { kaloShopeeTops } from "./actions";
import { savedFilter } from "../riset/saved-list";
import { EmptyBox, iconBtn, ListBox, ListMeta, ProductRow, RisetToolbar } from "./riset-ui";

export type ShopeeTab = "produk" | "tersimpan";

const time = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Gagal");

/**
 * Shopee research (KaloData): last week's best sellers per market.
 * ponytail: KaloData trial accounts always get the same 10-row preview (category, keyword, period, sort and page 2
 * are ignored server-side), so the search box filters the loaded rows; kaloShopeeTops already accepts the filters for paid plans.
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
  const [filter, setFilter] = useState("");
  const [savedQ, setSavedQ] = useState("");
  const [data, setData] = useState<{ rows: KaloShopeeProduct[]; at: number; cached: boolean; country: string } | null>(null);
  const [pending, start] = useTransition();

  const load = (cc = country, refresh = false) =>
    start(async () => {
      try {
        const r = await kaloShopeeTops(cc, {}, refresh);
        setData({ rows: r.rows, at: r.at, cached: r.cached, country: r.country });
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

  const k = filter.trim().toLowerCase();
  const rows = (data?.country === country ? data.rows : []).filter((r) => !k || `${r.productName} ${r.shopName} ${r.cateNames?.join(" ")}`.toLowerCase().includes(k));

  return (
    <div className="flex-1 space-y-3">
      <RisetToolbar<ShopeeTab>
        tabs={[{ id: "produk", label: "Top produk" }, { id: "tersimpan", label: "Tersimpan", badge: savedCount || null }]}
        active={tab}
        onTab={setTab}
        search={
          tab === "produk"
            ? { value: filter, onChange: setFilter, placeholder: "Saring produk, toko, atau kategori" }
            : { value: savedQ, onChange: (v) => (setSavedQ(v), savedFilter(v)), placeholder: "Saring produk tersimpan" }
        }
      >
        {tab === "produk" && <CountrySelect value={country} onChange={setCountry} label="Pasar Shopee" options={SHOPEE_MARKETS.map((code) => ({ code }))} />}
      </RisetToolbar>

      {tab === "tersimpan" ? (
        saved
      ) : !hasSession ? (
        <EmptyBox>Hubungkan KaloData dulu lewat tombol Kelola sesi di kanan atas.</EmptyBox>
      ) : (
        <div className="space-y-3">
          <ListMeta country={country} onRefresh={() => load(country, true)} pending={pending}>
            {data?.country === country ? <b className="text-foreground">{rows.length}</b> : null} produk Shopee terlaris minggu lalu
            {data?.country === country && <> · {data.cached ? "cache" : "baru"} {time.format(data.at)}</>}
          </ListMeta>
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-muted-foreground">
            <CircleAlert className="mt-px size-3.5 shrink-0 text-amber-500" />
            Akun trial KaloData hanya dapat 10 produk Shopee teratas; kategori, kata kunci, periode, dan halaman berikutnya baru jalan di paket berbayar. Data Shopee hanya ada untuk Indonesia, Thailand, dan Vietnam.
          </p>
          {data?.country !== country ? (
            <EmptyBox>{pending ? <><Loader2 className="size-4 animate-spin" /> Mengambil produk Shopee...</> : "Belum ada data."}</EmptyBox>
          ) : (
            <ListBox dim={pending}>
              {rows.map((r, i) => (
                <ProductRow
                  key={r.pid}
                  rank={i + 1}
                  image={r.imageUrl}
                  title={r.productName}
                  actions={
                    <>
                      <SaveProductButton
                        compact
                        saved={savedKeys.includes(`${r.pid}:${country}`)}
                        product={{ productId: r.pid, country, source: "shopee", title: r.productName, image: r.imageUrl, price: r.price, shopName: r.shopName, metrics: { sale: r.unitsSold ?? null, revenue: r.revenue, rating: r.rating } }}
                      />
                      <a href={r.productUrl} target="_blank" rel="noreferrer" title="Buka di Shopee" className={iconBtn}><ExternalLink className="size-3.5" /></a>
                    </>
                  }
                >
                  {r.price} · terjual minggu ini <b className="text-foreground">{r.unitsSold ?? "-"}</b> · omzet <b className="text-foreground">{r.revenue}</b> · total {r.historicalSold} ·{" "}
                  <Star className="inline size-3 fill-amber-400 text-amber-400" /> {r.rating} · {r.shopName}
                  {r.cateNames?.length ? ` · ${r.cateNames[r.cateNames.length - 1]}` : ""}
                </ProductRow>
              ))}
              {rows.length === 0 && <p className="p-8 text-center text-xs text-muted-foreground">Tidak ada yang cocok.</p>}
            </ListBox>
          )}
        </div>
      )}
    </div>
  );
}
