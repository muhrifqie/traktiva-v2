import Link from "next/link";
import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { Award, CalendarClock, ChartNoAxesColumn, Eye, Plus, Send, Store, Users } from "lucide-react";
import { AccountOverviewCard, OverviewEmpty } from "@/components/platform-overview";
import { PageHeader } from "@/components/page-header";
import { SyncAllButton } from "../profil/sync-button";
import { PlatformIcon } from "@/components/platform-icon";
import { contentHealth } from "@/lib/content-health";
import { db } from "@/lib/db";
import { accounts, accountStats, showcaseProducts, uploadJobs } from "@/lib/db/schema";
import type { ShopOverview } from "@/lib/platforms/tiktok-shop";
import { getShopCache } from "@/lib/showcase";

export const dynamic = "force-dynamic";

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);
const num = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const timeFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const HEALTH = { rest: "Perlu istirahat: views turun tajam", drop: "Views turun dari minggu lalu", rare: "Jarang posting minggu ini" } as const;

// TikTok (sidebar → Platform): every logged-in account as a card; the account opens its own pages, 1 Profil and
// 2 Etalase (?akun=<id>, components/platform-tabs.tsx), plus Jadwalkan. Same layout as YouTube → Ringkasan (components/platform-overview.tsx).
export default async function TikTokShopPage() {
  const list = await db.select().from(accounts).where(eq(accounts.platform, "tiktok")).orderBy(accounts.username);
  const ids = list.map((a) => a.id);
  const perAccount = (status: "queued" | "done", since?: Date) =>
    db
      .select({ id: uploadJobs.accountId, n: count() })
      .from(uploadJobs)
      .where(and(inArray(uploadJobs.accountId, ids), eq(uploadJobs.status, status), since ? gte(uploadJobs.scheduledAt, since) : undefined))
      .groupBy(uploadJobs.accountId);
  const [products, queued, posted, stats, health, points] = await Promise.all([
    db.select({ id: showcaseProducts.accountId, n: count() }).from(showcaseProducts).where(inArray(showcaseProducts.accountId, ids)).groupBy(showcaseProducts.accountId),
    perAccount("queued"),
    perAccount("done", daysAgo(7)),
    Promise.all(ids.map((id) => db.select().from(accountStats).where(eq(accountStats.accountId, id)).orderBy(desc(accountStats.capturedAt)).limit(1).get())),
    contentHealth(),
    Promise.all(ids.map(async (id) => (await getShopCache<ShopOverview>(id, "overview"))?.data.health ?? null)),
  ]);
  const by = (rows: { id: number; n: number }[], id: number) => rows.find((r) => r.id === id)?.n ?? 0;

  return (
    <>
      <PageHeader slug="tiktok-shop">
        {list.length > 0 && <SyncAllButton platform="tiktok" />}
        {list.length > 0 && (
          <Link href="/akun" className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" /> Tambah akun
          </Link>
        )}
      </PageHeader>

      {list.length === 0 ? (
        <OverviewEmpty icon={<PlatformIcon platform="tiktok" className="size-7" />} title="Belum ada akun TikTok" text="Login sekali di jendela Chrome yang terbuka; sesinya disimpan di profil browser khusus akun itu.">
          <Link href="/akun" className="flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">Hubungkan akun</Link>
        </OverviewEmpty>
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="text-[13px] font-semibold text-muted-foreground">Akun ({list.length})</h2>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {list.map((a, i) => {
                const s = stats[i];
                const h = health.find((x) => x.accountId === a.id);
                const p = points[i];
                return (
                  <AccountOverviewCard
                    key={a.id}
                    a={a}
                    loginHref="/akun?platform=tiktok"
                    href={`/profil?akun=${a.id}`}
                    stats={[
                      { icon: Users, label: "Pengikut", value: s ? num.format(s.followers) : "—" },
                      { icon: Store, label: "Etalase", value: by(products, a.id) },
                      { icon: CalendarClock, label: "Antre", value: by(queued, a.id) },
                      { icon: Award, label: "Poin akun", value: p?.score != null ? `${p.score}${p.baseScore ? `/${p.baseScore}` : ""}` : "—" },
                      { icon: Eye, label: "Views/video", value: h?.avgViews != null ? num.format(h.avgViews) : "—" },
                      { icon: Send, label: "Posting 7h", value: by(posted, a.id) },
                    ]}
                    note={s ? `Diperbarui ${timeFmt.format(s.capturedAt)} WIB` : "Belum disinkron"}
                    warning={h && h.status in HEALTH ? HEALTH[h.status as keyof typeof HEALTH] : undefined}
                    actions={[
                      { href: `/profil?akun=${a.id}`, label: "Profil", icon: ChartNoAxesColumn },
                      { href: `/showcase?akun=${a.id}`, label: "Etalase", icon: Store },
                      { href: `/jadwal?tampilan=daftar&akun=${a.id}`, label: "Jadwalkan", icon: CalendarClock, primary: true },
                    ]}
                  />
                );
              })}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
