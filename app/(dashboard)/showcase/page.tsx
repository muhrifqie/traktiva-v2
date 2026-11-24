import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { Store } from "lucide-react";
import { AccountTabs } from "@/components/account-avatar";
import { PageHeader } from "@/components/page-header";
import { pickActive } from "@/lib/settings";
import { db } from "@/lib/db";
import { accounts, showcaseProducts, uploadJobs } from "@/lib/db/schema";
import { PRESETS } from "@/lib/presets";
import type { ShopOverview } from "@/lib/platforms/tiktok-shop";
import { getShopCache } from "@/lib/showcase";
import { AddProductsButton, LiveSync, ShowcaseGrid, SyncButton } from "./showcase-grid";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export default async function ShowcasePage({ searchParams }: PageProps<"/showcase">) {
  const { akun } = await searchParams;
  const tiktok = (await db.select().from(accounts).where(eq(accounts.platform, "tiktok"))).sort((a, b) => a.username.localeCompare(b.username));
  const current = pickActive(tiktok, akun)!; // null only when there is no TikTok account (the empty state below)
  const rows = current
    ? await db.select().from(showcaseProducts).where(eq(showcaseProducts.accountId, current.id)).orderBy(asc(showcaseProducts.position))
    : [];
  // account performance lives on Profil & Postingan; here the overview only tells "synced at least once"
  const overview = current ? await getShopCache<ShopOverview>(current.id, "overview") : null;
  const lastSync = rows.reduce<Date | null>((m, r) => (!m || r.syncedAt > m ? r.syncedAt : m), null);
  // how many videos with each product link went out from Jadwal on this account (live vs. waiting at TikTok)
  const done = current ? await db.select({ productId: uploadJobs.productId, postedAt: uploadJobs.postedAt }).from(uploadJobs).where(and(eq(uploadJobs.accountId, current.id), eq(uploadJobs.status, "done"))) : [];
  const now = new Date();
  const tally = (pid: string, live: boolean) => done.filter((j) => j.productId === pid && j.postedAt && (j.postedAt <= now) === live).length;
  const concepts = PRESETS.filter((p) => p.available).map((p) => ({ id: p.id, title: p.title, bestFor: p.bestFor }));

  return (
    <>
      <PageHeader slug="showcase">
        {current && (
          <>
            <AddProductsButton accountId={current.id} />
            <SyncButton accountId={current.id} />
          </>
        )}
      </PageHeader>

      {tiktok.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center">
          <Store className="size-7 text-muted-foreground" />
          <p className="text-sm font-medium">Belum ada akun TikTok</p>
          <p className="max-w-sm text-xs text-muted-foreground">Tambahkan akun TikTok yang sudah jadi kreator affiliate di menu Akun Sosial, lalu etalasenya bisa disinkronkan di sini.</p>
          <Link href="/akun" className="mt-2 flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">Ke Akun Sosial</Link>
        </div>
      ) : (
        <div className="flex-1 space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <AccountTabs list={tiktok} current={current.id} href={(id) => `/showcase?akun=${id}`} />
            <span className="ml-auto" />
            {current.status === "active" && lastSync ? (
              <LiveSync accountId={current.id} lastSync={lastSync.getTime()} count={rows.length} />
            ) : (
              <span className="text-xs text-muted-foreground">
                {rows.length} produk di etalase{lastSync ? ` · sinkron ${fmt.format(lastSync)}` : ""}
              </span>
            )}
          </div>

          <ShowcaseGrid
            accountId={current!.id}
            concepts={concepts}
            products={rows.map((r) => ({
              id: r.id,
              productId: r.productId,
              title: r.title,
              price: r.price,
              originalPrice: r.originalPrice,
              commission: r.commission,
              stock: r.stock,
              inStock: r.inStock,
              hidden: r.hidden,
              shopName: r.shopName,
              cover: r.cover,
              labels: r.labels,
              hasDetail: !!r.detail,
              posted: tally(r.productId, true),
              scheduled: tally(r.productId, false),
            }))}
            neverSynced={!lastSync && !overview} // every sync stores the overview, even for an empty showcase
          />
        </div>
      )}
    </>
  );
}
