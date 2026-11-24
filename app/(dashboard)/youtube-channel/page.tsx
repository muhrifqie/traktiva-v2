import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, count, eq } from "drizzle-orm";
import { CalendarClock, Clock, Eye, Film, MonitorPlay, Repeat, Smartphone, Users } from "lucide-react";
import { AccountAvatar } from "@/components/account-avatar";
import { OverviewTiles } from "@/components/platform-overview";
import { PageHeader } from "@/components/page-header";
import { YouTubeTabs } from "@/components/platform-tabs";
import { db } from "@/lib/db";
import { accounts, uploadJobs } from "@/lib/db/schema";
import { PLATFORM } from "@/lib/platforms";
import { YT_CACHE, ytSummary, type YouTubeCache } from "@/lib/platforms/youtube-studio";
import { VERIFY_URL } from "@/lib/platforms/youtube-upload";
import { youtubeUploadDefaults } from "@/lib/settings";
import { getShopCache } from "@/lib/showcase";
import { uploadLimitUntil } from "@/lib/youtube-limit";
import { UploadSettings } from "../youtube/upload-settings";

export const dynamic = "force-dynamic";

const num = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const timeFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const COLOR = PLATFORM.youtube.color;

// Tab 1 of one YouTube channel (opened from its card on /youtube): the channel, its numbers, login state,
// and the upload template (shared by every channel).
export default async function YouTubeChannelPage({ searchParams }: PageProps<"/youtube-channel">) {
  const { akun } = await searchParams;
  const list = await db.select().from(accounts).where(eq(accounts.platform, "youtube")).orderBy(asc(accounts.username));
  const wanted = Number(Array.isArray(akun) ? akun[0] : akun);
  const a = list.find((x) => x.id === wanted) ?? (list.length === 1 ? list[0] : undefined);
  if (!a) redirect("/youtube");

  const [cache, limit, [queued]] = await Promise.all([
    getShopCache<YouTubeCache>(a.id, YT_CACHE),
    uploadLimitUntil(a.id),
    db.select({ n: count() }).from(uploadJobs).where(and(eq(uploadJobs.accountId, a.id), eq(uploadJobs.status, "queued"))),
  ]);
  const s = cache ? ytSummary(cache.data) : null;
  const name = a.displayName || a.username;

  return (
    <>
      <PageHeader slug="youtube-channel" desc={cache ? `Data diperbarui ${timeFmt.format(cache.capturedAt)} WIB` : "Belum disinkron dari YouTube Studio"}>
        {a.externalId?.startsWith("UC") && (
          <a href={`https://studio.youtube.com/channel/${a.externalId}`} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-[13px] font-medium hover:bg-accent">
            <MonitorPlay className="size-4" /> YouTube Studio
          </a>
        )}
        <Link href={`/jadwal?tampilan=daftar&akun=${a.id}`} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">
          <CalendarClock className="size-4" /> Jadwalkan
        </Link>
      </PageHeader>
      <YouTubeTabs accountId={a.id} current="channel" />

      <div className="space-y-5">
        <section className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <AccountAvatar a={{ ...a, platform: "youtube" }} size="size-12" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{name}</p>
            <p className="truncate text-xs text-muted-foreground">@{a.username}</p>
          </div>
          {a.status === "active" ? (
            <span className="rounded-full bg-status-ok/12 px-2.5 py-1 text-[11px] font-medium text-status-ok">Login</span>
          ) : (
            <Link href="/akun?platform=youtube" className="rounded-full bg-destructive/12 px-2.5 py-1 text-[11px] font-medium text-destructive hover:underline">Perlu login ulang</Link>
          )}
        </section>

        {limit && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
            Batas upload harian tercapai sampai {timeFmt.format(limit)}; jadwal menunggu otomatis.{" "}
            <a href={VERIFY_URL} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">Verifikasi nomor HP</a>
          </p>
        )}

        <OverviewTiles
          color={COLOR}
          tiles={[
            { icon: Users, label: "Subscriber", value: s ? num.format(s.subscribers) : "—" },
            { icon: Film, label: "Video", value: s ? s.videos : "—" },
            { icon: Smartphone, label: "Shorts", value: s ? s.shorts : "—" },
            { icon: Eye, label: "Penayangan 28 hari", value: s ? num.format(s.views28) : "—" },
            { icon: Clock, label: "Jam tonton 28 hari", value: s ? num.format(s.hours28) : "—" },
            { icon: Repeat, label: "Rata-rata ditonton", value: s?.stay ?? "—" },
            { icon: CalendarClock, label: "Antre upload", value: queued?.n ?? 0 },
          ]}
        />

        <UploadSettings initial={youtubeUploadDefaults()} />
      </div>
    </>
  );
}
