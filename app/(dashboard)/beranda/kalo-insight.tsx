import Link from "next/link";
import { ArrowUpRight, Bot, Flame, Megaphone, Percent, Sparkles, TrendingUp } from "lucide-react";
import { kaloTopProducts, kaloTopVideos } from "@/app/(dashboard)/kalodata/actions";
import { getKv } from "@/lib/kalo";
import type { KaloTopProduct, KaloTopVideo } from "@/lib/kalodata";

const productImg = (id: string) => `https://img.kalocdn.com/tiktok.product/${id}/cover.png`;
const videoImg = (id: string) => `https://img.kalocdn.com/tiktok.video/${id}/cover.png`;
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const time = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const DAY = 86_400_000;

/** Ranking from KaloData (6 h cache, refetched when stale); any older cached copy when KaloData is unreachable. */
async function rows<T>(fetch: () => Promise<{ rows: T[]; at: number }>, key: string) {
  try {
    return await fetch();
  } catch {
    const old = await getKv<T[]>(key);
    return old ? { rows: old.data, at: old.capturedAt.getTime() } : null;
  }
}

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

/** Beranda tile: what sells on TikTok Shop Indonesia right now, with a few patterns worth copying. */
export async function KaloInsight() {
  const [p, v] = await Promise.all([
    rows<KaloTopProduct>(() => kaloTopProducts("ID"), "kalo:tops:product:ID:p1"),
    rows<KaloTopVideo>(() => kaloTopVideos("ID"), "kalo:tops:video:ID:p1"),
  ]);
  if (!p?.rows.length && !v?.rows.length) {
    return (
      <Shell>
        <p className="mt-auto text-[13px] text-muted-foreground">Belum ada data. Tambahkan sesi KaloData di Riset Produk untuk melihat produk dan video terlaris.</p>
      </Shell>
    );
  }

  const products = p?.rows ?? [];
  const videos = v?.rows ?? [];
  const at = Math.max(p?.at ?? 0, v?.at ?? 0); // also the reference "today" (keeps render pure)
  // collect_day = first day KaloData tracked the product: recent ones are new entries in the top list
  const fresh = products.filter((r) => r.collect_day && at - Date.parse(r.collect_day) < 60 * DAY);
  const withCommission = products
    .map((r) => ({ r, c: parseFloat(r.commission_rate) }))
    .filter((x) => x.c > 0)
    .sort((a, b) => b.c - a.c);
  const mostSold = [...products].sort((a, b) => b.sale - a.sale)[0];
  const adShare = videos.length ? Math.round((videos.filter((x) => x.ad === 1).length / videos.length) * 100) : 0;
  const aiCount = videos.filter((x) => x.ai_video === 1).length;
  const dur = median(videos.map((x) => x.original_duration ?? parseFloat(x.duration)).filter((n) => n > 0));

  const facts = [
    mostSold && { icon: <Flame className="size-3.5 text-black dark:text-white" />, text: <>Paling banyak terjual: <b>{compact.format(mostSold.sale)}×</b> {short(mostSold.product_title)} ({mostSold.unit_price})</> },
    withCommission[0] && { icon: <Percent className="size-3.5 text-black dark:text-white" />, text: <>Komisi tertinggi di top 20: <b>{withCommission[0].r.commission_rate}</b> · {short(withCommission[0].r.product_title)}</> },
    fresh.length > 0 && { icon: <Sparkles className="size-3.5 text-black dark:text-white" />, text: <><b>{fresh.length} produk baru</b> (≤60 hari) langsung masuk top 20{fresh[0] ? <> · {short(fresh[0].product_title)}</> : null}</> },
    videos.length > 0 && { icon: <Megaphone className="size-3.5 text-black dark:text-white" />, text: <><b>{adShare}%</b> video terlaris dibantu iklan · durasi tengah <b>{Math.round(dur)} dtk</b></> },
    aiCount > 0 && { icon: <Bot className="size-3.5 text-violet-500" />, text: <><b>{aiCount} dari {videos.length}</b> video terlaris dibuat dengan AI</> },
  ].filter(Boolean) as { icon: React.ReactNode; text: React.ReactNode }[];

  return (
    <Shell at={at}>
      <div className="mt-3 grid flex-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
        {/* top products */}
        <ol className="min-w-0 space-y-1.5">
          {products.slice(0, 5).map((r, i) => (
            <li key={r.id} className="flex items-center gap-2.5">
              <span className="w-4 text-center text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={productImg(r.id)} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-9 shrink-0 rounded-lg bg-muted object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium" title={r.product_title}>{r.product_title}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  <b className="text-foreground">{r.revenue}</b> · {compact.format(r.sale)} terjual · {r.unit_price}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {/* patterns */}
        <ul className="min-w-0 space-y-2 rounded-xl bg-muted/50 p-3">
          <li className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Yang menarik</li>
          {facts.map((f, i) => (
            <li key={i} className="flex gap-2 text-[12px] leading-snug">
              <span className="mt-0.5 shrink-0">{f.icon}</span>
              <span className="min-w-0">{f.text}</span>
            </li>
          ))}
        </ul>

        {/* top videos */}
        <div className="grid grid-cols-3 gap-2">
          {videos.slice(0, 3).map((x, i) => (
            <div key={x.id} className="relative aspect-[9/16] overflow-hidden rounded-xl bg-muted" title={x.description}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={videoImg(x.id)} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
              <span className="absolute top-1 left-1 rounded bg-black/70 px-1 text-[10px] font-semibold text-white">#{i + 1}</span>
              <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-1.5 pt-5 text-[10px] leading-tight text-white">
                <b>{x.revenue}</b>
                <br />
                {x.duration}
                {x.ad === 1 ? " · iklan" : ""}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}

const short = (s: string) => (s.length > 38 ? `${s.slice(0, 36).trim()}…` : s);

function Shell({ at, children }: { at?: number; children: React.ReactNode }) {
  return (
    <section className="relative flex flex-col overflow-hidden rounded-2xl border bg-card p-4 sm:col-span-2 lg:col-span-4">
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <span className="grid size-7 place-items-center rounded-lg bg-muted text-black dark:text-white">
          <TrendingUp className="size-4" />
        </span>
        Lagi laris di TikTok Shop Indonesia · 30 hari
        {at ? <span className="text-xs">· diperbarui {time.format(at)}</span> : null}
        <Link href="/riset/tiktok" className="ml-auto flex items-center gap-1 text-xs font-medium text-foreground hover:underline">
          Riset lengkap <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
      {children}
    </section>
  );
}

/** Beranda card: the 4 best-selling TikTok Shop products (KaloData, last 30 days). */
export async function KaloTopCard() {
  const p = await rows<KaloTopProduct>(() => kaloTopProducts("ID"), "kalo:tops:product:ID:p1");
  const products = p?.rows ?? [];
  return (
    <TopShell at={p?.at}>
      {products.length ? (
        <ol className="space-y-2.5">
          {products.slice(0, 4).map((r, i) => (
            <li key={r.id}>
              <Link href={`/riset/tiktok?tab=cari&q=${encodeURIComponent(r.product_title.slice(0, 60))}`} className="flex items-center gap-2 rounded-lg py-0.5 hover:bg-accent/50">
                <span className="w-4 text-center text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element -- KaloData CDN */}
                <img src={productImg(r.id)} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-11 shrink-0 rounded-lg bg-muted object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium" title={r.product_title}>{r.product_title}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    <b className="text-foreground">{r.revenue}</b> · {compact.format(r.sale)} terjual · {r.unit_price}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="flex flex-1 items-center text-xs text-muted-foreground">Belum ada data. Tambahkan sesi KaloData di Riset Produk.</p>
      )}
    </TopShell>
  );
}

function TopShell({ at, children }: { at?: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
        <Flame className="size-4 text-black dark:text-white" />
        Produk terlaris · KaloData 30 hari
        {at ? <span className="font-normal">· {time.format(at)}</span> : null}
        <Link href="/riset/tiktok" className="ml-auto flex items-center gap-0.5 hover:text-foreground">
          Lihat <ArrowUpRight className="size-3" />
        </Link>
      </div>
      {children}
    </section>
  );
}

export function KaloTopSkeleton() {
  return (
    <TopShell>
      <div className="h-36 animate-pulse rounded-lg bg-muted/60" />
    </TopShell>
  );
}

export function KaloInsightSkeleton() {
  return (
    <Shell>
      <div className="mt-3 h-40 animate-pulse rounded-xl bg-muted/60" />
    </Shell>
  );
}
