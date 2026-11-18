import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import {
  BadgeCheck, Bookmark, Clock, Eye, Heart, LinkIcon, Lock, MessageCircle, Pin, Play, Share2, Sparkles, TrendingUp, UserCircle,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PlatformIcon } from "@/components/platform-icon";
import { db } from "@/lib/db";
import { accountPosts, accounts, accountStats, type AccountPost } from "@/lib/db/schema";
import { SyncButton } from "./sync-button";
import { mediaUrl } from "@/lib/media-url";

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

function VideoCard({ v, username }: { v: AccountPost; username: string }) {
  return (
    <a
      href={`https://www.tiktok.com/@${username}/video/${v.externalId}`}
      target="_blank"
      rel="noreferrer"
      className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-ring/40"
    >
      <div className="relative aspect-[9/16] overflow-hidden bg-muted">
        {v.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- TikTok CDN covers are signed + expiring; next/image would cache stale links
          <img src={mediaUrl(v.coverUrl)} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/75 to-transparent px-2 pt-8 pb-1.5 text-xs font-semibold text-white">
          <Play className="size-3.5 fill-white" /> {compact.format(v.views)}
          {v.durationSec ? <span className="ml-auto font-normal opacity-80">{Math.floor(v.durationSec / 60)}:{String(v.durationSec % 60).padStart(2, "0")}</span> : null}
        </div>
        <div className="absolute top-1.5 left-1.5 flex gap-1">
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
  const posts = await db
    .select()
    .from(accountPosts)
    .where(and(eq(accountPosts.accountId, account.id)))
    .orderBy(byViews ? desc(accountPosts.views) : desc(accountPosts.postedAt));

  const totalViews = posts.reduce((s, p) => s + p.views, 0);
  const totalEng = posts.reduce((s, p) => s + engagement(p), 0);
  const best = posts.reduce<AccountPost | null>((b, p) => (!b || p.views > b.views ? p : b), null);
  const last30 = postedWithinDays(posts, 30);
  const canSync = !!account.sessionKey?.startsWith("cfx_") && account.status === "active";

  const chip = (active: boolean) =>
    `flex h-8 items-center gap-2 rounded-full border pr-3 pl-1 text-xs font-medium transition-colors ${active ? "border-primary/40 bg-primary/10 text-brand-light" : "bg-background text-muted-foreground hover:text-foreground"}`;
  const tab = (active: boolean) => `h-8 rounded-md px-3 text-xs font-medium ${active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <>
      <PageHeader slug="profil">
        {canSync ? (
          <SyncButton accountId={account.id} username={account.username} primary={!latest} syncedAt={latest ? latest.capturedAt.getTime() : null} auto />
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
        <section className="flex flex-col gap-5 rounded-xl border bg-card p-5 md:flex-row md:items-center">
          {account.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote avatar
            <img src={account.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-24 shrink-0 rounded-full border object-cover md:size-28" />
          ) : (
            <span className="grid size-24 shrink-0 place-items-center rounded-full border bg-muted text-3xl font-semibold uppercase text-muted-foreground md:size-28">
              {account.username.slice(0, 1)}
            </span>
          )}
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="flex items-center gap-1.5 text-xl font-semibold">
                {account.displayName || account.username}
                {latest?.verified && <BadgeCheck className="size-5 text-sky-500" />}
              </h2>
              <a href={`https://www.tiktok.com/@${account.username}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <PlatformIcon platform="tiktok" className="size-3.5" />@{account.username}
              </a>
              {latest?.isPrivate && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="size-3" />Akun privat</span>}
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-2">
              {[
                ["Mengikuti", latest?.following, previous?.following],
                ["Pengikut", latest?.followers, previous?.followers],
                ["Suka", latest?.likes, previous?.likes],
                ["Video", latest?.videoCount, previous?.videoCount],
              ].map(([label, now, before]) => (
                <div key={label as string} className="flex items-baseline gap-1.5">
                  <dd className="text-lg font-semibold tabular-nums" title={now != null ? full.format(now as number) : undefined}>
                    {now != null ? compact.format(now as number) : "—"}
                  </dd>
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  {now != null && <Delta now={now as number} before={before as number | undefined} />}
                </div>
              ))}
            </dl>
            {latest?.bio && <p className="max-w-2xl whitespace-pre-line text-sm">{latest.bio}</p>}
            {latest?.bioLink && (
              <a href={latest.bioLink.startsWith("http") ? latest.bioLink : `https://${latest.bioLink}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-brand-light hover:underline">
                <LinkIcon className="size-3.5" />{latest.bioLink}
              </a>
            )}
          </div>
          <p className="flex items-center gap-1 self-start text-xs text-muted-foreground md:self-end">
            <Clock className="size-3" /> {latest ? `Disinkron ${dateTimeFmt.format(latest.capturedAt)}` : "Belum pernah disinkron"}
          </p>
        </section>

        {/* insights for learning what works */}
        {posts.length > 0 && (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { icon: Eye, color: "#4ea7fc", label: "Rata-rata tayangan", value: compact.format(Math.round(totalViews / posts.length)), hint: `${full.format(totalViews)} total dari ${posts.length} video` },
              { icon: Sparkles, color: "#e535ab", label: "Engagement rate", value: totalViews ? pct.format(totalEng / totalViews) : "—", hint: "(suka + komentar + share + simpan) ÷ tayangan" },
              { icon: TrendingUp, color: "#2fa868", label: "Video terbaik", value: best ? compact.format(best.views) : "—", hint: best?.caption ? best.caption.slice(0, 48) : "tayangan tertinggi" },
              { icon: Clock, color: "#f2994a", label: "Posting 30 hari", value: String(last30), hint: `≈ ${(last30 / 4.3).toFixed(1)} video per minggu` },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <span className="grid size-7 place-items-center rounded-lg" style={{ background: `${s.color}1a`, color: s.color }}><s.icon className="size-4" /></span>
                  {s.label}
                </div>
                <p className="mt-3 text-2xl font-semibold tabular-nums">{s.value}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.hint}</p>
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
              {posts.map((v) => <VideoCard key={v.id} v={v} username={account.username} />)}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
