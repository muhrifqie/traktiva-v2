import Link from "next/link";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { CalendarClock, ChartNoAxesColumn, ChevronRight, Clock, Download, Eye, Film, Layers, MonitorPlay, Repeat, Users } from "lucide-react";
import { AccountOverviewCard, OverviewEmpty, OverviewTiles } from "@/components/platform-overview";
import { PageHeader } from "@/components/page-header";
import { YouTubeTabs } from "@/components/platform-tabs";
import { PlatformIcon } from "@/components/platform-icon";
import { db } from "@/lib/db";
import { accounts, uploadJobs } from "@/lib/db/schema";
import { PLATFORM } from "@/lib/platforms";
import { YT_CACHE, ytSummary, type YouTubeCache } from "@/lib/platforms/youtube-studio";
import { VERIFY_URL } from "@/lib/platforms/youtube-upload";
import { youtubeUploadDefaults } from "@/lib/settings";
import { getShopCache } from "@/lib/showcase";
import { uploadLimitUntil } from "@/lib/youtube-limit";
import { UploadSettings } from "./upload-settings";
import { YouTubeConnectButton } from "../akun/tiktok-connect";

export const dynamic = "force-dynamic";

const num = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const timeFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const COLOR = PLATFORM.youtube.color;

// YouTube → Ringkasan (also the group button): every channel side by side, same layout as TikTok Shop → Ringkasan
// (components/platform-overview.tsx); then the upload templates and the YouTube tools.
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
  const total = (f: (s: NonNullable<(typeof sums)[number]>) => number) => sums.reduce((t, s) => t + (s ? f(s) : 0), 0);
  const q = (id: number) => queued.find((r) => r.id === id)?.n ?? 0;

  return (
    <>
      <PageHeader slug="youtube">{list.length > 0 && <YouTubeConnectButton label="Tambah channel" />}</PageHeader>
      <YouTubeTabs current="channel" />

      {list.length === 0 ? (
        <OverviewEmpty icon={<PlatformIcon platform="youtube" className="size-7" />} title="Belum ada channel YouTube" text="Login sekali di jendela Chrome yang terbuka; sesinya disimpan di profil browser khusus channel itu.">
          <YouTubeConnectButton />
        </OverviewEmpty>
      ) : (
        <div className="space-y-6">
          <OverviewTiles
            color={COLOR}
            tiles={[
              { icon: Layers, label: "Channel", value: list.length, sub: `${list.filter((a) => a.status === "active").length} login` },
              { icon: Users, label: "Subscriber", value: num.format(total((s) => s.subscribers)) },
              { icon: Eye, label: "Penayangan 28 hari", value: num.format(total((s) => s.views28)) },
              { icon: CalendarClock, label: "Antre upload", value: queued.reduce((t, r) => t + r.n, 0) },
            ]}
          />
          <section className="space-y-2">
            <h2 className="text-[13px] font-semibold text-muted-foreground">Channel ({list.length})</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((a, i) => {
                const s = sums[i];
                const limit = limits[i];
                return (
                  <AccountOverviewCard
                    key={a.id}
                    a={a}
                    loginHref="/akun?platform=youtube"
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
                      { href: `/youtube-performa?akun=${a.id}`, label: "Performa", icon: ChartNoAxesColumn },
                      ...(a.externalId?.startsWith("UC") ? [{ href: `https://studio.youtube.com/channel/${a.externalId}`, label: "Studio", icon: MonitorPlay, external: true }] : []),
                      { href: `/jadwal?tampilan=daftar&akun=${a.id}`, label: "Jadwalkan", icon: CalendarClock, primary: true },
                    ]}
                  />
                );
              })}
            </div>
          </section>

          <UploadSettings initial={youtubeUploadDefaults()} />

          <section className="space-y-2">
            <h2 className="text-[13px] font-semibold text-muted-foreground">Alat</h2>
            <Link href="/youtube-shorts" className="flex max-w-md items-center gap-3 rounded-xl border bg-card p-4 hover:border-ring/30 hover:bg-accent/40">
              <span className="grid size-10 place-items-center rounded-lg" style={{ background: `${COLOR}1a`, color: COLOR }}><Download className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Shorts Downloader</p>
                <p className="text-xs text-muted-foreground">Unduh semua Shorts dari satu channel.</p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          </section>
        </div>
      )}
    </>
  );
}
