import { and, asc, count, eq, inArray } from "drizzle-orm";
import { CalendarClock, ChartNoAxesColumn, Clock, Eye, Film, Repeat, UserCircle, Users } from "lucide-react";
import { AccountOverviewCard, OverviewEmpty } from "@/components/platform-overview";
import { PageHeader } from "@/components/page-header";
import { PlatformIcon } from "@/components/platform-icon";
import { db } from "@/lib/db";
import { accounts, uploadJobs } from "@/lib/db/schema";
import { YT_CACHE, ytSummary, type YouTubeCache } from "@/lib/platforms/youtube-studio";
import { VERIFY_URL } from "@/lib/platforms/youtube-upload";
import { getShopCache } from "@/lib/showcase";
import { uploadLimitUntil } from "@/lib/youtube-limit";
import { YouTubeConnectButton } from "../akun/tiktok-connect";

export const dynamic = "force-dynamic";

const num = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const timeFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

// YouTube (sidebar → Platform): every channel as a card, same layout as TikTok (components/platform-overview.tsx);
// a channel opens its own pages, 1 Channel · 2 Performa · 3 Unduh Shorts (?akun=<id>, components/platform-tabs.tsx).
export default async function YouTubePage() {
  const list = await db.select().from(accounts).where(eq(accounts.platform, "youtube")).orderBy(asc(accounts.username));
  const ids = list.map((a) => a.id);
  const [caches, limits, queued] = await Promise.all([
    Promise.all(ids.map((id) => getShopCache<YouTubeCache>(id, YT_CACHE))),
    Promise.all(ids.map((id) => uploadLimitUntil(id))),
    ids.length
      ? db.select({ id: uploadJobs.accountId, n: count() }).from(uploadJobs).where(and(inArray(uploadJobs.accountId, ids), eq(uploadJobs.status, "queued"))).groupBy(uploadJobs.accountId)
      : Promise.resolve([] as { id: number; n: number }[]),
  ]);
  const sums = caches.map((c) => (c ? ytSummary(c.data) : null));
  const q = (id: number) => queued.find((r) => r.id === id)?.n ?? 0;

  return (
    <>
      <PageHeader slug="youtube">{list.length > 0 && <YouTubeConnectButton label="Tambah channel" />}</PageHeader>

      {list.length === 0 ? (
        <OverviewEmpty icon={<PlatformIcon platform="youtube" className="size-7" />} title="Belum ada channel YouTube" text="Login sekali di jendela Chrome yang terbuka; sesinya disimpan di profil browser khusus channel itu.">
          <YouTubeConnectButton />
        </OverviewEmpty>
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="text-[13px] font-semibold text-muted-foreground">Channel ({list.length})</h2>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {list.map((a, i) => {
                const s = sums[i];
                const limit = limits[i];
                return (
                  <AccountOverviewCard
                    key={a.id}
                    a={a}
                    loginHref="/akun?platform=youtube"
                    href={`/youtube-channel?akun=${a.id}`}
                    stats={[
                      { icon: Users, label: "Subscriber", value: s ? num.format(s.subscribers) : "—" },
                      { icon: Film, label: "Video", value: s ? `${s.videos}` : "—" },
                      { icon: Eye, label: "Views 28h", value: s ? num.format(s.views28) : "—" },
                      { icon: Clock, label: "Jam tonton", value: s ? num.format(s.hours28) : "—" },
                      { icon: Repeat, label: "Ditonton", value: s?.stay ?? "—" },
                      { icon: CalendarClock, label: "Antre", value: q(a.id) },
                    ]}
                    note={caches[i] ? `Diperbarui ${timeFmt.format(caches[i]!.capturedAt)} WIB · ${s?.shorts ?? 0} Shorts` : "Belum disinkron dari YouTube Studio"}
                    warning={
                      limit ? (
                        <>
                          Batas upload harian tercapai sampai {timeFmt.format(limit)}; jadwal menunggu otomatis.{" "}
                          <a href={VERIFY_URL} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">Verifikasi nomor HP</a>
                        </>
                      ) : undefined
                    }
                    actions={[
                      { href: `/youtube-channel?akun=${a.id}`, label: "Channel", icon: UserCircle },
                      { href: `/youtube-performa?akun=${a.id}`, label: "Performa", icon: ChartNoAxesColumn },
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
