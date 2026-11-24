import Link from "next/link";
import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { CalendarClock, ChartNoAxesColumn, Plus, Store } from "lucide-react";
import { AccountAvatar } from "@/components/account-avatar";
import { PageHeader } from "@/components/page-header";
import { contentHealth } from "@/lib/content-health";
import { db } from "@/lib/db";
import { accounts, accountStats, showcaseProducts, uploadJobs } from "@/lib/db/schema";
import type { ShopOverview } from "@/lib/platforms/tiktok-shop";
import { getShopCache } from "@/lib/showcase";

export const dynamic = "force-dynamic";

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);
const num = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const HEALTH = { rest: "Perlu istirahat: views turun tajam", drop: "Views turun dari minggu lalu", rare: "Jarang posting minggu ini" } as const;

// TikTok Shop home (the sidebar's TikTok Shop button): every account side by side, each linking into its own
// Etalase, Performa and Jadwal (?akun=<id>), so there is no global account picker to keep in mind.
export default async function TikTokShopPage() {
  const list = await db.select().from(accounts).where(eq(accounts.platform, "tiktok")).orderBy(accounts.username);
  const ids = list.map((a) => a.id);
  const weekAgo = daysAgo(7);
  const perAccount = (status: "queued" | "done", since?: Date) =>
    db
      .select({ id: uploadJobs.accountId, n: count() })
      .from(uploadJobs)
      .where(and(inArray(uploadJobs.accountId, ids), eq(uploadJobs.status, status), since ? gte(uploadJobs.scheduledAt, since) : undefined))
      .groupBy(uploadJobs.accountId);
  const [products, queued, posted, stats, health, points] = await Promise.all([
    db.select({ id: showcaseProducts.accountId, n: count() }).from(showcaseProducts).where(inArray(showcaseProducts.accountId, ids)).groupBy(showcaseProducts.accountId),
    perAccount("queued"),
    perAccount("done", weekAgo),
    Promise.all(ids.map((id) => db.select().from(accountStats).where(eq(accountStats.accountId, id)).orderBy(desc(accountStats.capturedAt)).limit(1).get())),
    contentHealth(),
    Promise.all(ids.map(async (id) => (await getShopCache<ShopOverview>(id, "overview"))?.data.health ?? null)),
  ]);
  const by = (rows: { id: number; n: number }[], id: number) => rows.find((r) => r.id === id)?.n ?? 0;
  const sum = (rows: { n: number }[]) => rows.reduce((s, r) => s + r.n, 0);

  const totals = [
    { label: "Akun", value: list.length, sub: `${list.filter((a) => a.status === "active").length} login` },
    { label: "Produk di etalase", value: sum(products) },
    { label: "Antre upload", value: sum(queued) },
    { label: "Terposting 7 hari", value: sum(posted) },
  ];

  return (
    <>
      <PageHeader slug="tiktok-shop">
        <Link href="/akun" className="flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3.5 text-[13px] font-medium hover:bg-accent">
          <Plus className="size-4" /> Tambah akun
        </Link>
      </PageHeader>

      {list.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center">
          <Store className="size-7 text-muted-foreground" />
          <p className="text-sm font-medium">Belum ada akun TikTok</p>
          <Link href="/akun" className="mt-2 flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">Hubungkan akun</Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {totals.map((t) => (
              <div key={t.label} className="rounded-xl border bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">{t.label}</p>
                <p className="text-xl font-semibold tabular-nums">
                  {t.value}
                  {t.sub && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{t.sub}</span>}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.map((a, i) => {
              const s = stats[i];
              const h = health.find((x) => x.accountId === a.id);
              const p = points[i];
              const warn = h && h.status in HEALTH ? HEALTH[h.status as keyof typeof HEALTH] : null;
              const cell = (label: string, value: string | number) => (
                <div className="rounded-lg bg-muted/40 px-2.5 py-2">
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                  <p className="text-sm font-semibold tabular-nums">{value}</p>
                </div>
              );
              return (
                <section key={a.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                  <header className="flex items-center gap-3">
                    <AccountAvatar a={a} size="size-10" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">@{a.username}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.displayName ?? "TikTok"}</p>
                    </div>
                    {a.status === "active" ? (
                      <span className="rounded-full bg-status-ok/10 px-2 py-0.5 text-[11px] font-medium text-status-ok">Login</span>
                    ) : (
                      <Link href="/akun" className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive hover:underline">Perlu login</Link>
                    )}
                  </header>
                  <div className="grid grid-cols-3 gap-2">
                    {cell("Pengikut", s ? num.format(s.followers) : "—")}
                    {cell("Etalase", by(products, a.id))}
                    {cell("Antre", by(queued, a.id))}
                    {cell("Poin akun", p?.score != null ? `${p.score}${p.baseScore ? `/${p.baseScore}` : ""}` : "—")}
                    {cell("Views/video", h?.avgViews != null ? num.format(h.avgViews) : "—")}
                    {cell("Posting 7h", by(posted, a.id))}
                  </div>
                  {warn && <p className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-600 dark:text-amber-300">{warn}</p>}
                  <div className="mt-auto grid grid-cols-3 gap-2 text-xs font-medium">
                    <Link href={`/showcase?akun=${a.id}`} className="flex h-8 items-center justify-center gap-1.5 rounded-lg border hover:bg-accent"><Store className="size-3.5" /> Etalase</Link>
                    <Link href={`/profil?akun=${a.id}`} className="flex h-8 items-center justify-center gap-1.5 rounded-lg border hover:bg-accent"><ChartNoAxesColumn className="size-3.5" /> Performa</Link>
                    <Link href={`/jadwal?tampilan=daftar&akun=${a.id}`} className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"><CalendarClock className="size-3.5" /> Jadwalkan</Link>
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
