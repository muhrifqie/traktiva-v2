import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import {
  Activity, BadgeCheck, Bookmark, Clock, Eye, Heart, LinkIcon, Lock, MessageCircle, Moon, Pin, Play, Share2, ShieldCheck, Sparkles, TrendingUp, UserCircle,
} from "lucide-react";
import { Advice } from "@/components/content-advice";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/page-header";
import { PlatformIcon } from "@/components/platform-icon";
import { PostCover } from "./post-cover";
import { contentHealth, HEALTH_DAYS, MIN_AVG_VIEWS } from "@/lib/content-health";
import { db } from "@/lib/db";
import { PROFILE_SYNC_EVERY_MIN } from "@/lib/profile-autosync";
import { accountPosts, accounts, accountStats, uploadJobs, type AccountPost } from "@/lib/db/schema";
import { hookInsights } from "@/lib/insights";
import type { ShopOverview } from "@/lib/platforms/tiktok-shop";
import { mediaUrl } from "@/lib/media-url";
import { getShopCache } from "@/lib/showcase";
import { SyncButton } from "./sync-button";

export const dynamic = "force-dynamic";

const TZ = "Asia/Jakarta";
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("id-ID");
const pct = new Intl.NumberFormat("id-ID", { style: "percent", maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
const dateTimeFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });

const engagement = (p: AccountPost) => p.likes + p.comments + p.shares + p.saves;

// request-time helper (server component renders once per request)
function postedWithinDays(posts: AccountPost[], days: number) {
  const since = Date.now() - days * 86400_000;
  return posts.filter((p) => p.postedAt && p.postedAt.getTime() >= since).length;
}

function Delta({ now, before }: { now: number; before?: number }) {
  if (before === undefined || now === before) return null;
  const d = now - before;
  return <span className={`text-xs font-medium ${d > 0 ? "text-status-ok" : "text-destructive"}`}>{d > 0 ? "+" : ""}{compact.format(d)}</span>;
}

const timeFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });

/** Posts uploaded from Jadwal that TikTok publishes later (postId → publish time), request-time helper. */
async function scheduledPosts(accountId: number) {
  await hookInsights().catch(() => null); // links finished jobs to their TikTok post
  const rows = await db.select({ postId: uploadJobs.postId, at: uploadJobs.postedAt, video: uploadJobs.video }).from(uploadJobs).where(and(eq(uploadJobs.accountId, accountId), eq(uploadJobs.status, "done")));
  return new Map(rows.filter((r) => r.postId && r.at && r.at.getTime() > Date.now()).map((r) => [r.postId!, { at: r.at!, video: r.video }]));
}

function VideoCard({ v, username, scheduled }: { v: AccountPost; username: string; scheduled?: { at: Date; video: string } }) {
  return (
    <a
      href={`https://www.tiktok.com/@${username}/video/${v.externalId}`}
      target="_blank"
      rel="noreferrer"
      className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-ring/40"
    >
      <div className="relative aspect-[9/16] overflow-hidden bg-muted">
        {/* TikTok keeps a scheduled post's cover private until it goes live: show our own file meanwhile */}
        {scheduled ? <video src={`${mediaUrl(scheduled.video)}#t=0.5`} muted preload="metadata" className="size-full object-cover" /> : <PostCover src={v.coverUrl} />}
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/75 to-transparent px-2 pt-8 pb-1.5 text-xs font-semibold text-white">
          <Play className="size-3.5 fill-white" /> {compact.format(v.views)}
          {v.durationSec ? <span className="ml-auto font-normal opacity-80">{Math.floor(v.durationSec / 60)}:{String(v.durationSec % 60).padStart(2, "0")}</span> : null}
        </div>
        <div className="absolute top-1.5 left-1.5 flex gap-1">
          {scheduled && <span className="flex items-center gap-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-[#4ade80]"><Clock className="size-2.5" />Terjadwal {timeFmt.format(scheduled.at)}</span>}
          {v.isPinned && <span className="flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white"><Pin className="size-2.5" />Disematkan</span>}
          {v.isPrivate && <span className="flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white"><Lock className="size-2.5" />Privat</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <p className="line-clamp-2 text-xs leading-snug">{v.caption || <span className="text-muted-foreground">Tanpa caption</span>}</p>
        <div className="mt-auto grid grid-cols-4 gap-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-0.5" title="Suka"><Heart className="size-3" />{compact.format(v.likes)}</span>
          <span className="flex items-center gap-0.5" title="Komentar"><MessageCircle className="size-3" />{compact.format(v.comments)}</span>
          <span className="flex items-center gap-0.5" title="Dibagikan"><Share2 className="size-3" />{compact.format(v.shares)}</span>
          <span className="flex items-center gap-0.5" title="Disimpan"><Bookmark className="size-3" />{compact.format(v.saves)}</span>
        </div>
        {v.postedAt && <p className="text-[11px] text-muted-foreground">{dateFmt.format(v.postedAt)}</p>}
      </div>
    </a>
  );
}

export default async function ProfilPage({ searchParams }: PageProps<"/profil">) {
  const { a: aParam, sort } = await searchParams;
  const list = await db.select().from(accounts).where(eq(accounts.platform, "tiktok")).orderBy(accounts.username);

  if (list.length === 0) {
    return (
      <>
        <PageHeader slug="profil" />
        <div className="grid flex-1 place-items-center text-center">
          <div className="space-y-3">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl border bg-muted"><UserCircle className="size-5 text-muted-foreground" /></span>
            <p className="text-sm font-medium">Belum ada akun TikTok</p>
            <Link href="/akun" className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground">Hubungkan akun</Link>
          </div>
        </div>
      </>
    );
  }

  const account = list.find((x) => String(x.id) === aParam) ?? list[0];
  const [latest, previous] = await db.select().from(accountStats).where(eq(accountStats.accountId, account.id)).orderBy(desc(accountStats.capturedAt)).limit(2);
  const byViews = sort === "populer";
  // TikTok Shop account health points (read during the showcase sync, automatic after login)
  const health = (await getShopCache<ShopOverview>(account.id, "overview"))?.data.health ?? null;
  const points = health?.score != null ? health : null;
  const pointsPct = points?.baseScore ? points.score! / points.baseScore : null;
  const posts = await db
    .select()
    .from(accountPosts)
    .where(and(eq(accountPosts.accountId, account.id)))
    .orderBy(byViews ? desc(accountPosts.views) : desc(accountPosts.postedAt));

  const totalViews = posts.reduce((s, p) => s + p.views, 0);
  const totalEng = posts.reduce((s, p) => s + engagement(p), 0);
  const best = posts.reduce<AccountPost | null>((b, p) => (!b || p.views > b.views ? p : b), null);
  const last30 = postedWithinDays(posts, 30);
  // last 7 days (same analysis as Beranda): low average views = rest the account or switch content
  const week = (await contentHealth()).find((h) => h.accountId === account.id) ?? null;
  const scheduled = await scheduledPosts(account.id);
  const canSync = !!account.sessionKey?.startsWith("cfx_") && account.status === "active";

  const chip = (active: boolean) =>
    `flex h-8 items-center gap-2 rounded-full border pr-3 pl-1 text-xs font-medium transition-colors ${active ? "border-primary/40 bg-primary/10 text-brand-light" : "bg-background text-muted-foreground hover:text-foreground"}`;
  const tab = (active: boolean) => `h-8 rounded-md px-3 text-xs font-medium ${active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <>
      <AutoRefresh />
      <PageHeader slug="profil">
        {canSync ? (
          <SyncButton accountId={account.id} username={account.username} primary={!latest} />
        ) : (
          <Link href="/akun" className="flex h-8 items-center rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground">Login dulu</Link>
        )}
      </PageHeader>

      {list.length > 1 && (
        <div className="-mt-2 flex flex-wrap gap-2">
          {list.map((x) => (
            <Link key={x.id} href={`/profil?a=${x.id}`} className={chip(x.id === account.id)}>
              {x.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote avatar
                <img src={x.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-6 rounded-full object-cover" />
              ) : (
                <span className="grid size-6 place-items-center rounded-full bg-muted"><PlatformIcon platform="tiktok" className="size-3" /></span>
              )}
              @{x.username}
            </Link>
          ))}
        </div>
      )}

      <div className="flex-1 space-y-5">
        {/* profile header */}
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 md:flex-row md:items-center">
          {account.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote avatar
            <img src={account.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-16 shrink-0 rounded-full border object-cover" />
          ) : (
            <span className="grid size-16 shrink-0 place-items-center rounded-full border bg-muted text-2xl font-semibold uppercase text-muted-foreground">
              {account.username.slice(0, 1)}
            </span>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="flex items-center gap-1.5 text-base font-semibold">
                {account.displayName || account.username}
                {latest?.verified && <BadgeCheck className="size-4 text-sky-500" />}
              </h2>
              <a href={`https://www.tiktok.com/@${account.username}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <PlatformIcon platform="tiktok" className="size-3.5" />@{account.username}
              </a>
              {latest?.isPrivate && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="size-3" />Akun privat</span>}
            </div>
            <dl className="flex flex-wrap gap-x-5 gap-y-1">
              {[
                ["Mengikuti", latest?.following, previous?.following],
                ["Pengikut", latest?.followers, previous?.followers],
                ["Suka", latest?.likes, previous?.likes],
                ["Video", latest?.videoCount, previous?.videoCount],
              ].map(([label, now, before]) => (
                <div key={label as string} className="flex items-baseline gap-1.5">
                  <dd className="text-sm font-semibold tabular-nums" title={now != null ? full.format(now as number) : undefined}>
                    {now != null ? compact.format(now as number) : "—"}
                  </dd>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  {now != null && <Delta now={now as number} before={before as number | undefined} />}
                </div>
              ))}
            </dl>
            {latest?.bio && <p className="line-clamp-2 max-w-2xl whitespace-pre-line text-xs text-muted-foreground">{latest.bio}</p>}
            {latest?.bioLink && (
              <a href={latest.bioLink.startsWith("http") ? latest.bioLink : `https://${latest.bioLink}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand-light hover:underline">
                <LinkIcon className="size-3.5" />{latest.bioLink}
              </a>
            )}
          </div>
          {/* right side: content analysis, last 7 days (same as Beranda): low average views = rest the account or switch content */}
          <div className="flex shrink-0 flex-col gap-2 md:w-1/2 md:self-stretch">
            {week && (
              <div className={`space-y-2 rounded-lg border px-3.5 py-3 ${week.status === "rest" ? "border-status-progress/40 bg-status-progress/5" : "bg-muted/30"}`}>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title={`Video ${HEALTH_DAYS} hari terakhir (yang di bawah 24 jam belum dihitung); tren dibanding ${HEALTH_DAYS} hari sebelumnya.`}>
                  <Activity className="size-3.5" /> Analisis {HEALTH_DAYS} hari
                  <span className="ml-auto"><Advice h={week} /></span>
                </div>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <dd className={`flex items-baseline gap-1.5 text-lg font-semibold tabular-nums ${week.status === "rest" ? "text-status-progress" : ""}`}>
                      {week.avgViews != null ? full.format(week.avgViews) : "—"}
                      {week.trend != null && <span className={`text-xs font-medium ${week.trend >= 0 ? "text-status-ok" : "text-destructive"}`}>{week.trend >= 0 ? "▲" : "▼"}{Math.round(Math.abs(week.trend) * 100)}%</span>}
                    </dd>
                    <dt className="text-xs text-muted-foreground">rata-rata penonton</dt>
                  </div>
                  <div>
                    <dd className="text-lg font-semibold tabular-nums">{week.posts}</dd>
                    <dt className="text-xs text-muted-foreground">video dihitung</dt>
                  </div>
                  <div>
                    <dd className="text-lg font-semibold tabular-nums">{week.engagement != null ? pct.format(week.engagement) : "—"}</dd>
                    <dt className="text-xs text-muted-foreground" title="(suka + komentar + dibagikan + disimpan) ÷ penonton">tingkat interaksi</dt>
                  </div>
                  <div title="Jam posting (WIB) yang videonya paling banyak ditonton, dari riwayat akun ini">
                    <dd className="text-lg font-semibold tabular-nums">{week.bestHour != null ? `${String(week.bestHour).padStart(2, "0")}.00` : "—"}</dd>
                    <dt className="text-xs text-muted-foreground">{week.bestHour != null ? "jam terbaik" : "jam terbaik (data kurang)"}</dt>
                  </div>
                </dl>
                {week.status === "rest" && (
                  <p className="flex items-start gap-1.5 text-[11px] text-status-progress">
                    <Moon className="mt-px size-3.5 shrink-0" />
                    Di bawah {MIN_AVG_VIEWS} penonton: istirahatkan akun 2–3 hari atau gunakan konten lain.
                  </p>
                )}
              </div>
            )}
            <p className="mt-auto flex items-center gap-1 text-xs text-muted-foreground md:justify-end">
              <Clock className="size-3" /> {latest ? `Disinkron ${dateTimeFmt.format(latest.capturedAt)}` : "Belum pernah disinkron"}
              {canSync && <span title={`Otomatis setelah ada postingan baru dan tiap ${PROFILE_SYNC_EVERY_MIN} menit selama aplikasi terbuka`}>· otomatis</span>}
              {week?.stale && <span>· data lama, klik Sinkronkan</span>}
            </p>
          </div>
        </section>

        {/* insights for learning what works + TikTok Shop account points, one row of equal cards */}
        {(posts.length > 0 || points) && (
          <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {[
              ...(points
                ? [{
                    icon: ShieldCheck,
                    label: "Poin akun",
                    value: String(points.score),
                    // points drop with TikTok Shop violations; low points limit affiliate features
                    tone: pointsPct == null ? "" : pointsPct >= 0.9 ? "text-status-ok" : pointsPct >= 0.6 ? "text-status-progress" : "text-destructive",
                    hint: [points.baseScore ? `dari ${points.baseScore}` : null, points.riskText, points.violationScore ? `${points.violationScore} poin pelanggaran` : null].filter(Boolean).join(" · "),
                  }]
                : []),
              ...(posts.length > 0
                ? [
                    { icon: Eye, label: "Rata-rata tayangan", value: compact.format(Math.round(totalViews / posts.length)), hint: `${full.format(totalViews)} total dari ${posts.length} video` },
                    { icon: Sparkles, label: "Tingkat interaksi", value: totalViews ? pct.format(totalEng / totalViews) : "—", hint: "(suka + komentar + dibagikan + disimpan) ÷ tayangan" },
                    { icon: TrendingUp, label: "Video terbaik", value: best ? compact.format(best.views) : "—", hint: best?.caption ? best.caption.slice(0, 48) : "tayangan tertinggi" },
                    { icon: Clock, label: "Posting 30 hari", value: String(last30), hint: `≈ ${(last30 / 4.3).toFixed(1)} video per minggu` },
                  ]
                : []),
            ].map((s) => (
              <div key={s.label} className="rounded-xl border bg-card p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="grid size-5 place-items-center rounded-md bg-muted text-black dark:text-white"><s.icon className="size-3" /></span>
                  {s.label}
                </div>
                <p className={`mt-1.5 text-lg font-semibold tabular-nums ${"tone" in s ? s.tone : ""}`}>{s.value}</p>
                <p className="truncate text-[11px] text-muted-foreground" title={s.hint}>{s.hint}</p>
              </div>
            ))}
          </section>
        )}

        {/* videos */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Postingan</h3>
            <span className="text-xs text-muted-foreground">{posts.length}</span>
            <div className="ml-auto flex rounded-lg border p-0.5">
              <Link href={`/profil?a=${account.id}`} className={tab(!byViews)}>Terbaru</Link>
              <Link href={`/profil?a=${account.id}&sort=populer`} className={tab(byViews)}>Terpopuler</Link>
            </div>
          </div>
          {posts.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center text-[13px] text-muted-foreground">
              {latest ? "Akun ini belum punya video publik." : "Klik Sinkronkan untuk mengambil profil dan video dari TikTok."}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {posts.map((v) => <VideoCard key={v.id} v={v} username={account.username} scheduled={scheduled.get(v.externalId)} />)}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
