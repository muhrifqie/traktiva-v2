import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Store } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PlatformIcon } from "@/components/platform-icon";
import { db } from "@/lib/db";
import { accounts, showcaseProducts } from "@/lib/db/schema";
import { PRESETS } from "@/lib/presets";
import type { ShopOverview } from "@/lib/platforms/tiktok-shop";
import { getSettings, SYNC_CHOICES } from "@/lib/settings";
import { getShopCache } from "@/lib/showcase";
import { AddProductsButton, AutoSyncSelect, ShowcaseGrid, SyncButton } from "./showcase-grid";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export default async function ShowcasePage({ searchParams }: PageProps<"/showcase">) {
  const sp = await searchParams;
  const tiktok = (await db.select().from(accounts).where(eq(accounts.platform, "tiktok"))).sort((a, b) => a.username.localeCompare(b.username));
  const current = tiktok.find((a) => a.username === sp.akun) ?? tiktok.find((a) => a.status === "active") ?? tiktok[0];
  const rows = current
    ? await db.select().from(showcaseProducts).where(eq(showcaseProducts.accountId, current.id)).orderBy(asc(showcaseProducts.position))
    : [];
  // account performance lives on Profil & Postingan; here the overview only tells "synced at least once"
  const overview = current ? await getShopCache<ShopOverview>(current.id, "overview") : null;
  const lastSync = rows.reduce<Date | null>((m, r) => (!m || r.syncedAt > m ? r.syncedAt : m), null);
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
            {tiktok.map((a) => (
              <Link
                key={a.id}
                href={`/showcase?akun=${encodeURIComponent(a.username)}`}
                className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${a.id === current?.id ? "border-primary/50 bg-primary/10 text-brand-light" : "bg-card text-muted-foreground hover:text-foreground"}`}
              >
                <PlatformIcon platform="tiktok" className="size-3.5" /> @{a.username}
                {a.status !== "active" && <span className="text-[10px] text-status-progress">perlu login</span>}
              </Link>
            ))}
            <span className="ml-auto" />
            <AutoSyncSelect value={getSettings().showcaseSyncMinutes ?? 60} choices={[...SYNC_CHOICES]} />
            <span className="text-xs text-muted-foreground">
              {rows.length} produk di etalase{lastSync ? ` · sinkron ${fmt.format(lastSync)}` : ""}
            </span>
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
            }))}
            neverSynced={!lastSync && !overview} // every sync stores the overview, even for an empty showcase
          />
        </div>
      )}
    </>
  );
}
