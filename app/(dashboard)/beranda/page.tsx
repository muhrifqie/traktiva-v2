import Link from "next/link";
import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import {
  ArrowRight, ArrowUpRight, CalendarClock, CircleAlert, Clapperboard, Coins, Film, Loader2, Plus, ShieldCheck, TrendingUp, Users,
} from "lucide-react";
import { GoogleIcon } from "@/components/brand-icons";
import { LOGO_PATH } from "@/components/logo";
import { PlatformIcon } from "@/components/platform-icon";
import { db } from "@/lib/db";
import { accounts, accountStats, googleAccounts, PLATFORMS, videoProjects } from "@/lib/db/schema";
import { mediaUrl } from "@/lib/media-url";
import { projectName } from "@/lib/presets";
import { navBySlug, navColor } from "@/lib/nav";
import { KaloInsight, KaloInsightSkeleton } from "./kalo-insight";

export const dynamic = "force-dynamic";

const TZ = "Asia/Jakarta";
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const QUICK = ["video", "jadwal", "akun", "profil"] as const;

function greeting(now: Date) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: TZ }).format(now));
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
}

/** Bento tile: same frame everywhere; pass href to make the whole tile a link. */
function Tile({ className = "", href, children }: { className?: string; href?: string; children: React.ReactNode }) {
  const base = `group relative flex flex-col overflow-hidden rounded-2xl border bg-card p-4 ${className}`;
  return href ? (
    <Link href={href} className={`${base} transition-colors hover:border-ring/40`}>
      {children}
      <ArrowUpRight className="absolute top-3.5 right-3.5 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  ) : (
    <section className={base}>{children}</section>
  );
}

function TileHead({ icon, label, color }: { icon: React.ReactNode; label: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <span className="grid size-7 place-items-center rounded-lg" style={color ? { background: `${color}1a`, color } : undefined}>{icon}</span>
      {label}
    </div>
  );
}

export default async function BerandaPage() {
  const now = new Date();
  const [social, google, jobs, latestDone] = await Promise.all([
    db.select().from(accounts),
    db.select().from(googleAccounts),
    db.select({ id: videoProjects.id, status: videoProjects.status, name: videoProjects.product, title: videoProjects.title, presetId: videoProjects.presetId }).from(videoProjects),
    db.select().from(videoProjects).where(eq(videoProjects.status, "done")).orderBy(desc(videoProjects.updatedAt)).limit(3),
  ]);

  const tiktok = social.find((a) => a.platform === "tiktok" && a.status === "active") ?? social.find((a) => a.platform === "tiktok");
  const [stat, prevStat] = tiktok
    ? await db.select().from(accountStats).where(eq(accountStats.accountId, tiktok.id)).orderBy(desc(accountStats.capturedAt)).limit(2)
    : [];

  const activeSocial = social.filter((a) => a.status === "active").length;
  const platforms = PLATFORMS.filter((p) => social.some((a) => a.platform === p));
  const activeGoogle = google.filter((g) => g.status === "active");
  const credits = activeGoogle.reduce((n, g) => n + (g.credits ?? 0), 0);
  const done = jobs.filter((j) => j.status === "done").length;
  const running = jobs.filter((j) => j.status === "running").length;

  const failedIds = jobs.filter((j) => j.status === "failed").slice(0, 2);
  const attention = [
    ...social.filter((a) => a.status !== "active").map((a) => ({ key: `s${a.id}`, href: "/akun", icon: <PlatformIcon platform={a.platform} className="size-4" />, title: `@${a.username}`, note: "Perlu login" })),
    ...google.filter((g) => g.status !== "active").map((g) => ({ key: `g${g.id}`, href: "/pengaturan", icon: <GoogleIcon className="size-4" />, title: g.email, note: "Login ulang" })),
    ...failedIds.map((j) => ({ key: `v${j.id}`, href: `/video/${j.id}`, icon: <Film className="size-4 text-destructive" />, title: projectName({ title: j.title, presetId: j.presetId, product: j.name }), note: "Perlu dicek" })),
  ];
  const followerDelta = stat && prevStat ? stat.followers - prevStat.followers : null;

  return (
    <>
      {/* frameless greeting, same rhythm as every other page header */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10">
          <svg viewBox="0 0 640 640" className="size-5 text-brand-light" aria-hidden="true"><path d={LOGO_PATH} fill="currentColor" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold leading-tight tracking-tight">{greeting(now)}</h1>
          <p className="truncate text-[13px] text-muted-foreground">
            {new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(now)} ·{" "}
            {running > 0 ? `${running} video sedang dibuat · ` : ""}
            {attention.length > 0 ? `${attention.length} hal perlu perhatianmu` : "Semua akun dan mesin dalam kondisi baik"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/jadwal" className="flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3.5 text-[13px] font-medium hover:bg-accent">
            <Plus className="size-4" /> Jadwal baru
          </Link>
          <Link href="/video" className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground shadow-xs hover:bg-primary/90">
            <Clapperboard className="size-4" /> Buat video
          </Link>
        </div>
      </header>

      <div className="grid flex-1 auto-rows-[minmax(136px,auto)] content-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* social accounts */}
        <Tile href="/akun">
          <TileHead icon={<Users className="size-4" />} label="Akun sosial" color="#2fa868" />
          <p className="mt-auto text-3xl font-semibold tabular-nums">
            {activeSocial}<span className="text-base font-normal text-muted-foreground">/{social.length}</span>
          </p>
          <div className="mt-1 flex items-center gap-1">
            {platforms.length ? platforms.map((p) => <PlatformIcon key={p} platform={p} className="size-3.5" />) : <span className="text-xs text-muted-foreground">Belum ada akun</span>}
          </div>
        </Tile>

        {/* flow credits */}
        <Tile href="/pengaturan">
          <TileHead icon={<GoogleIcon className="size-4" />} label="Kredit Flow" />
          <p className="mt-auto flex items-baseline gap-1.5 text-3xl font-semibold tabular-nums">
            <Coins className="size-5 self-center text-[#f2c94c]" />
            {compact.format(credits)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{activeGoogle.length} akun Google aktif</p>
        </Tile>

        {/* videos */}
        <Tile href="/proyek">
          <TileHead icon={<Film className="size-4" />} label="Video jadi" color="#f2994a" />
          <p className="mt-auto text-3xl font-semibold tabular-nums">{done}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            {running > 0 ? <><Loader2 className="size-3 animate-spin" /> {running} sedang dibuat</> : "selesai dibuat"}
          </p>
        </Tile>

        {/* tiktok growth */}
        <Tile href="/profil">
          <TileHead icon={<TrendingUp className="size-4" />} label={tiktok ? `@${tiktok.username}` : "Pengikut TikTok"} color="#ff3b6b" />
          <p className="mt-auto text-3xl font-semibold tabular-nums">{stat ? compact.format(stat.followers) : "—"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {followerDelta !== null ? (
              <span className={followerDelta >= 0 ? "text-status-ok" : "text-destructive"}>{followerDelta >= 0 ? "+" : ""}{compact.format(followerDelta)} sejak sinkron lalu</span>
            ) : stat ? "pengikut" : "Sinkronkan di Profil"}
          </p>
        </Tile>

        {/* latest videos */}
        <Tile href="/proyek?status=done" className="sm:col-span-2 lg:row-span-2">
          <TileHead icon={<Clapperboard className="size-4" />} label="Video terbaru" color="#f2994a" />
          {latestDone.length ? (
            <div className="mt-3 grid flex-1 grid-cols-3 gap-2">
              {latestDone.map((v) => (
                <div key={v.id} className="relative overflow-hidden rounded-xl bg-muted">
                  {v.finalPath && <video src={`${mediaUrl(v.finalPath)}#t=0.5`} muted preload="metadata" className="size-full object-cover" />}
                  <p className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6 text-[10px] text-white">{projectName(v)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-center">
              <Clapperboard className="size-6 text-muted-foreground" />
              <p className="text-[13px] font-medium">Belum ada video</p>
              <p className="text-xs text-muted-foreground">Pilih konsep di Buat Video Reels untuk video pertamamu.</p>
            </div>
          )}
        </Tile>

        {/* attention */}
        <Tile className="sm:col-span-2">
          <TileHead icon={<CircleAlert className="size-4" />} label="Perlu perhatian" color="#f2c94c" />
          {attention.length ? (
            <ul className="mt-2 divide-y">
              {attention.slice(0, 4).map((a) => (
                <li key={a.key}>
                  <Link href={a.href} className="flex items-center gap-2.5 py-2 text-[13px] hover:text-foreground">
                    {a.icon}
                    <span className="min-w-0 flex-1 truncate font-medium">{a.title}</span>
                    <span className="text-xs text-status-progress">{a.note}</span>
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-auto flex items-center gap-2 text-[13px] text-muted-foreground">
              <ShieldCheck className="size-4 text-status-ok" /> Tidak ada yang perlu dibereskan.
            </p>
          )}
        </Tile>

        {/* quick actions */}
        <Tile className="sm:col-span-2 lg:col-span-2">
          <TileHead icon={<ArrowUpRight className="size-4" />} label="Aksi cepat" />
          <div className="mt-3 grid flex-1 grid-cols-4 gap-2">
            {QUICK.map((slug) => {
              const item = navBySlug(slug)!;
              const color = navColor(item) ?? "#2fa868";
              return (
                <Link key={slug} href={`/${slug}`} className="flex flex-col items-center justify-center gap-2 rounded-xl border bg-background p-3 text-center text-xs font-medium transition-colors hover:bg-accent">
                  <span className="grid size-9 place-items-center rounded-lg" style={{ background: `${color}1a`, color }}><item.icon className="size-4.5" /></span>
                  <span className="line-clamp-1">{item.title}</span>
                </Link>
              );
            })}
          </div>
        </Tile>

        {/* what sells on TikTok Shop now (KaloData) */}
        <Suspense fallback={<KaloInsightSkeleton />}>
          <KaloInsight />
        </Suspense>

        {/* schedule */}
        <Tile href="/jadwal" className="sm:col-span-2 lg:col-span-4">
          <TileHead icon={<CalendarClock className="size-4" />} label="Jadwal hari ini" color="#4ea7fc" />
          <p className="mt-auto text-[13px] font-medium">Belum ada jadwal</p>
          <p className="text-xs text-muted-foreground">Atur jam upload supaya bot bekerja otomatis.</p>
        </Tile>
      </div>
    </>
  );
}
