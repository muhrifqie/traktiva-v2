import Link from "next/link";
import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import {
  ArrowRight, ArrowUpRight, BadgeCheck, CalendarClock, CircleAlert, Clapperboard, Cpu, Eye, Film, Heart,
  Loader2, MessageCircle, Mic, Monitor, Plus, ShieldCheck, Store, TrendingUp, Upload, Users, Wallet,
} from "lucide-react";
import { CartesiaIcon, ChatGPTIcon, GeminiIcon, GoogleIcon, KaloDataIcon, VeoIcon } from "@/components/brand-icons";
import { LOGO_PATH } from "@/components/logo";
import { PlatformIcon } from "@/components/platform-icon";
import { db } from "@/lib/db";
import { videoProjects } from "@/lib/db/schema";
import { mediaUrl } from "@/lib/media-url";
import { projectName } from "@/lib/presets";
import { navBySlug } from "@/lib/nav";
import { KaloInsight, KaloInsightSkeleton } from "./kalo-insight";
import { DailyBars, FollowerLine } from "./charts";
import { loadBeranda } from "./data";

export const dynamic = "force-dynamic";

const TZ = "Asia/Jakarta";
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const num = new Intl.NumberFormat("id-ID");
const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat("id-ID", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
const agoFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
const QUICK = ["video", "jadwal", "akun", "profil"] as const;
const PART_LABEL: Record<string, string> = { guid: "Windows", board: "Motherboard", boardSerial: "Serial board", cpu: "CPU", ram: "RAM", disk: "Disk", bios: "BIOS" };

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

// color is kept for callers but icons are monochrome (black / white with the theme), like the sidebar
function TileHead({ icon, label, right }: { icon: React.ReactNode; label: string; color?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <span className="grid size-7 place-items-center rounded-lg bg-muted text-black dark:text-white">{icon}</span>
      {label}
      {right && <span className="ml-auto text-xs">{right}</span>}
    </div>
  );
}

/** Small status chip: icon/dot + label, never color alone. */
function Chip({ tone, children }: { tone: "ok" | "warn" | "bad" | "muted"; children: React.ReactNode }) {
  const cls = { ok: "bg-status-ok/10 text-status-ok", warn: "bg-[#f2c94c1a] text-[#f2c94c]", bad: "bg-destructive/10 text-destructive", muted: "bg-muted text-muted-foreground" }[tone];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function Avatar({ src, name, size = "size-14" }: { src: string | null; name: string; size?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="" referrerPolicy="no-referrer" className={`${size} shrink-0 rounded-2xl object-cover`} />;
  return <span className={`grid ${size} shrink-0 place-items-center rounded-2xl bg-primary text-xl font-semibold text-primary-foreground uppercase`}>{name.replace("@", "")[0] ?? "T"}</span>;
}

function Kpi({ href, icon, color, label, value, sub }: { href: string; icon: React.ReactNode; color: string; label: string; value: React.ReactNode; sub: React.ReactNode }) {
  return (
    <Tile href={href}>
      <TileHead icon={icon} label={label} color={color} />
      <p className="mt-auto pt-3 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </Tile>
  );
}

export default async function BerandaPage() {
  const now = new Date();
  const [b, latestDone] = await Promise.all([
    loadBeranda(),
    db.select().from(videoProjects).where(eq(videoProjects.status, "done")).orderBy(desc(videoProjects.updatedAt)).limit(3),
  ]);
  const { profile: p, usage: u, accounts: acc } = b;
  const lic = p.license;

  const attention = [
    ...acc.social.filter((a) => a.status !== "active").map((a) => ({ key: `s${a.id}`, href: "/akun", icon: <PlatformIcon platform={a.platform} className="size-4" />, title: `@${a.username}`, note: "Perlu login" })),
    ...acc.google.filter((g) => g.status !== "active").map((g) => ({ key: `g${g.id}`, href: "/pengaturan", icon: <GoogleIcon className="size-4" />, title: g.email, note: "Login ulang" })),
    ...(u.failed ? [{ key: "vf", href: "/proyek?status=failed", icon: <Film className="size-4 text-destructive" />, title: `${u.failed} proyek video gagal`, note: "Perlu dicek" }] : []),
    ...(u.uploadsFailed7 ? [{ key: "uf", href: "/jadwal", icon: <Upload className="size-4 text-destructive" />, title: `${u.uploadsFailed7} upload gagal minggu ini`, note: "Lihat jadwal" }] : []),
    ...(lic.daysLeft != null && lic.daysLeft <= 7 ? [{ key: "lic", href: "/pengaturan", icon: <BadgeCheck className="size-4 text-[#f2c94c]" />, title: `Lisensi habis ${lic.daysLeft} hari lagi`, note: "Perpanjang" }] : []),
  ];

  return (
    <>
      {/* frameless greeting, same rhythm as every other page header */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10">
          <svg viewBox="0 0 640 640" className="size-5 text-brand-light" aria-hidden="true"><path d={LOGO_PATH} fill="currentColor" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold leading-tight tracking-tight">{greeting(now)}, {p.name.replace("@", "")}</h1>
          <p className="truncate text-[13px] text-muted-foreground">
            {new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(now)} ·{" "}
            {u.running > 0 ? `${u.running} video sedang dibuat · ` : ""}
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

      <div className="grid flex-1 grid-flow-row-dense auto-rows-[minmax(136px,auto)] content-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* ---------- profile & license */}
        <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:col-span-2 lg:row-span-2">
          <div className="flex items-center gap-3.5">
            <Avatar src={p.avatarUrl} name={p.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold">{p.name}</p>
              <p className="truncate text-[13px] text-muted-foreground">
                {[p.username, p.email].filter(Boolean).join(" · ") || "Belum ada akun terhubung"}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {lic.role === "admin" && <Chip tone="warn">Admin</Chip>}
                <Chip tone={lic.status === "active" ? "ok" : lic.status === "expired" ? "bad" : "muted"}>
                  {lic.status === "dev" ? "Mode pengembangan" : lic.status === "active" ? `Lisensi ${lic.plan}` : "Lisensi habis"}
                </Chip>
                {p.update && <Chip tone={p.update.mandatory ? "bad" : "warn"}>Update v{p.update.version}</Chip>}
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-2 text-[13px]">
            {[
              ["Masa aktif", lic.status === "dev" ? "—" : lic.daysLeft != null ? `${lic.daysLeft} hari lagi` : "Selamanya"],
              ["Berlaku sampai", lic.expiresAt ?? "—"],
              ["Paket", lic.status === "dev" ? "Pengembangan" : `${lic.plan}${p.licenseId ? ` · #${p.licenseId}` : ""}`],
              ["Pengguna sejak", dateFmt.format(p.memberSince * 1000)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border bg-muted/30 px-3 py-2">
                <dt className="text-[11px] text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 truncate font-medium">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="grid gap-2 text-xs text-muted-foreground">
            <p className="flex items-center gap-2"><Monitor className="size-3.5" /> {p.device ?? "PC ini"} · Traktiva v{p.appVersion}</p>
            <p className="flex items-start gap-2">
              <Cpu className="mt-0.5 size-3.5 shrink-0" />
              {p.hwParts.length ? `Terkunci ke ${p.hwParts.map((x) => PART_LABEL[x] ?? x).join(", ")}` : "Kunci hardware aktif setelah lisensi diaktifkan di app"}
            </p>
          </div>

          <div className="mt-auto flex flex-wrap gap-2">
            <Link href="/pengaturan" className="flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium hover:bg-accent"><BadgeCheck className="size-3.5" /> Kelola lisensi</Link>
            <Link href="/akun" className="flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium hover:bg-accent"><Users className="size-3.5" /> Akun sosial</Link>
          </div>
        </section>

        {/* ---------- usage KPIs */}
        <Kpi
          href="/proyek?status=done" icon={<Film className="size-4" />} color="#f2994a" label="Video jadi" value={num.format(u.videosTotal)}
          sub={u.running ? <span className="flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> {u.running} sedang dibuat · {u.videos7} minggu ini</span> : `${u.videosToday} hari ini · ${u.videos7} minggu ini · ${u.videos30} bulan ini`}
        />
        <Kpi
          href="/jadwal" icon={<Upload className="size-4" />} color="#4ea7fc" label="Upload sukses" value={num.format(u.uploadsTotal)}
          sub={`${u.uploads7} minggu ini${u.successRate != null ? ` · ${Math.round(u.successRate * 100)}% berhasil` : ""}`}
        />
        <Kpi
          href="/jadwal" icon={<CalendarClock className="size-4" />} color="#8b7cf6" label="Terjadwal" value={num.format(b.queuedTotal)}
          sub={b.schedule[0] ? `Berikutnya ${timeFmt.format(b.schedule[0].at * 1000)} · ${b.scheduledToday} hari ini` : "Belum ada jadwal"}
        />
        <Kpi
          href="/pengaturan" icon={<VeoIcon className="size-4" />} color="#f2c94c" label="Kredit Flow (Veo)" value={compact.format(acc.credits)}
          sub={`${acc.google.filter((g) => g.status === "active").length} dari ${acc.google.length} akun Google aktif`}
        />

        {/* ---------- activity charts */}
        <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:col-span-2">
          <TileHead icon={<TrendingUp className="size-4" />} label="Aktivitas 14 hari" color="#2fa868" right={`${u.drafts} draf · ${u.showcaseProducts} produk etalase`} />
          <div className="grid gap-5 sm:grid-cols-2">
            <DailyBars data={u.videoSeries} color="var(--chart-1)" unit="video" label="Video selesai" />
            <DailyBars data={u.uploadSeries} color="var(--chart-2)" unit="upload" label="Upload sukses" />
          </div>
        </section>

        {/* ---------- TikTok performance */}
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:col-span-2 lg:row-span-2">
          <TileHead icon={<TrendingUp className="size-4" />} label="Performa TikTok" color="#ff3b6b" right={<Link href="/profil" className="hover:text-foreground">Profil & postingan →</Link>} />
          {b.performance.length ? (
            <ul className="grid gap-3">
              {b.performance.map((a) => (
                <li key={a.id} className="rounded-xl border p-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar src={a.avatarUrl} name={a.username} size="size-8" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">@{a.username}</p>
                      <p className="text-[11px] text-muted-foreground">{a.syncedAt ? `Sinkron ${agoFmt.format(a.syncedAt * 1000)}` : "Belum pernah disinkron"}</p>
                    </div>
                    {a.status !== "active" && <Chip tone="warn">Perlu login</Chip>}
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ["Pengikut", a.followers != null ? compact.format(a.followers) : "—", a.followersDelta7],
                      ["Total views", compact.format(a.views), null],
                      ["Rata-rata/video", a.avgViews != null ? compact.format(a.avgViews) : "—", null],
                      ["Engagement", a.engagement != null ? `${(a.engagement * 100).toFixed(1)}%` : "—", null],
                    ].map(([k, v, d]) => (
                      <div key={k as string}>
                        <dt className="text-[11px] text-muted-foreground">{k}</dt>
                        <dd className="text-[15px] font-semibold tabular-nums">
                          {v}
                          {typeof d === "number" && d !== 0 && (
                            <span className={`ml-1 text-[11px] font-medium ${d > 0 ? "text-status-ok" : "text-destructive"}`}>{d > 0 ? "▲" : "▼"} {compact.format(Math.abs(d))} 7h</span>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-3"><FollowerLine points={a.history} color="#ff3b6b" /></div>
                  {a.topPosts[0] && (
                    <p className="mt-2 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                      <Eye className="size-3" /> Teratas: {compact.format(a.topPosts[0].views)} views · {a.topPosts[0].caption?.slice(0, 60) || "tanpa caption"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-6 text-center">
              <TrendingUp className="size-6 text-muted-foreground" />
              <p className="text-[13px] font-medium">Belum ada akun TikTok</p>
              <p className="text-xs text-muted-foreground">Hubungkan di Akun Sosial, lalu sinkronkan profil.</p>
            </div>
          )}
          <p className="mt-auto flex items-center gap-1.5 rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            <Wallet className="size-3.5" /> Komisi & penjualan affiliate: segera (perlu data dari TikTok Shop Affiliate Center).
          </p>
        </section>

        {/* ---------- Traktiva uploads that performed */}
        <section className="flex flex-col rounded-2xl border bg-card p-4 sm:col-span-2">
          <TileHead
            icon={<Eye className="size-4" />} label="Video dari Traktiva di TikTok" color="#4ea7fc"
            right={b.traktivaMatched ? `${compact.format(b.traktivaViews)} views dari ${b.traktivaMatched} video` : null}
          />
          {b.traktivaPosts.length ? (
            <ul className="mt-2 divide-y">
              {b.traktivaPosts.map((v) => (
                <li key={v.id} className="flex items-center gap-3 py-2 text-[13px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {v.cover ? <img src={v.cover} alt="" referrerPolicy="no-referrer" className="h-11 w-8 shrink-0 rounded-md object-cover" /> : <span className="h-11 w-8 shrink-0 rounded-md bg-muted" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{v.product ?? v.label ?? "Video"}</p>
                    <p className="text-[11px] text-muted-foreground">@{v.account}{v.label ? ` · ${v.label}` : ""}</p>
                  </div>
                  <span className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
                    <span className="flex items-center gap-1"><Eye className="size-3" />{compact.format(v.views)}</span>
                    <span className="flex items-center gap-1"><Heart className="size-3" />{compact.format(v.likes)}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="size-3" />{compact.format(v.comments)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-auto text-xs text-muted-foreground">Views video yang diupload Traktiva muncul di sini setelah profil TikTok disinkronkan.</p>
          )}
        </section>

        {/* ---------- connected accounts */}
        <section className="flex flex-col rounded-2xl border bg-card p-4 sm:col-span-2">
          <TileHead icon={<ShieldCheck className="size-4" />} label="Akun & layanan terhubung" color="#2fa868" right={<Link href="/pengaturan" className="hover:text-foreground">Atur →</Link>} />
          <ul className="mt-2 divide-y text-[13px]">
            {acc.google.map((g) => (
              <li key={`g${g.id}`} className="flex items-center gap-2.5 py-2">
                <GoogleIcon className="size-4" />
                <span className="min-w-0 flex-1 truncate">{g.email}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{g.credits != null ? `${compact.format(g.credits)} kredit` : ""}</span>
                <Chip tone={g.status === "active" ? "ok" : "bad"}>{g.status === "active" ? "Aktif" : "Login ulang"}</Chip>
              </li>
            ))}
            {acc.social.map((a) => (
              <li key={`s${a.id}`} className="flex items-center gap-2.5 py-2">
                <PlatformIcon platform={a.platform} className="size-4" />
                <span className="min-w-0 flex-1 truncate">@{a.username}</span>
                <span className="text-xs text-muted-foreground">{a.checkedAt ? `cek ${agoFmt.format(a.checkedAt * 1000)}` : ""}</span>
                <Chip tone={a.status === "active" ? "ok" : a.status === "disabled" ? "muted" : "warn"}>{a.status === "active" ? "Aktif" : a.status === "disabled" ? "Nonaktif" : "Perlu login"}</Chip>
              </li>
            ))}
            <li className="flex items-center gap-2.5 py-2">
              <VeoIcon className="size-4" />
              <span className="min-w-0 flex-1 truncate">Video AI · Veo lewat Google Flow</span>
              <Chip tone={acc.google.some((g) => g.status === "active") ? "ok" : "warn"}>{acc.google.some((g) => g.status === "active") ? "Siap" : "Butuh akun Google"}</Chip>
            </li>
            <li className="flex items-center gap-2.5 py-2">
              <GeminiIcon className="size-4" />
              <span className="min-w-0 flex-1 truncate">Gemini · membaca foto & video referensi</span>
              <Chip tone={acc.google.some((g) => g.status === "active") ? "ok" : "muted"}>{acc.google.some((g) => g.status === "active") ? "Siap" : "Butuh akun Google"}</Chip>
            </li>
            <li className="flex items-center gap-2.5 py-2">
              <ChatGPTIcon className="size-4" />
              <span className="min-w-0 flex-1 truncate">ChatGPT · penulis naskah{acc.chatgpt ? ` · ${acc.chatgpt}` : ""}</span>
              <Chip tone={acc.chatgpt ? "ok" : "muted"}>{acc.chatgpt ? "Terhubung" : "Pakai Gemini"}</Chip>
            </li>
            <li className="flex items-center gap-2.5 py-2">
              {acc.voice.startsWith("Cartesia") ? <CartesiaIcon className="size-4" /> : <Mic className="size-4 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate">Suara AI · {acc.voice}</span>
              <Chip tone={acc.voice.includes("belum") ? "warn" : "ok"}>{acc.voice.includes("belum") ? "Belum lengkap" : "Siap"}</Chip>
            </li>
            <li className="flex items-center gap-2.5 py-2">
              <KaloDataIcon className="size-4" />
              <span className="min-w-0 flex-1 truncate">KaloData · riset produk laris</span>
              <Chip tone={acc.kalo.active ? "ok" : acc.kalo.total ? "warn" : "muted"}>{acc.kalo.total ? `${acc.kalo.active}/${acc.kalo.total} sesi aktif` : "Belum ada"}</Chip>
            </li>
            {!acc.google.length && !acc.social.length && (
              <li className="py-2 text-xs text-muted-foreground">Belum ada akun Google atau sosial. Mulai dari Pengaturan → Akun Google.</li>
            )}
          </ul>
        </section>

        {/* ---------- attention */}
        <Tile className="sm:col-span-2">
          <TileHead icon={<CircleAlert className="size-4" />} label="Perlu perhatian" color="#f2c94c" />
          {attention.length ? (
            <ul className="mt-2 divide-y">
              {attention.slice(0, 5).map((a) => (
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

        {/* ---------- upcoming schedule */}
        <Tile href="/jadwal" className="sm:col-span-2">
          <TileHead icon={<CalendarClock className="size-4" />} label="Jadwal berikutnya" color="#8b7cf6" />
          {b.schedule.length ? (
            <ul className="mt-2 divide-y">
              {b.schedule.map((s) => (
                <li key={s.id} className="flex items-center gap-2.5 py-2 text-[13px]">
                  <PlatformIcon platform={s.platform} className="size-4" />
                  <span className="w-28 shrink-0 text-xs tabular-nums text-muted-foreground">{timeFmt.format(s.at * 1000)}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{s.product ?? s.label ?? "Video"}</span>
                  <span className="text-xs text-muted-foreground">@{s.account}</span>
                  {s.status === "uploading" && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                </li>
              ))}
            </ul>
          ) : (
            <>
              <p className="mt-auto text-[13px] font-medium">Belum ada jadwal</p>
              <p className="text-xs text-muted-foreground">Atur jam upload supaya bot bekerja otomatis.</p>
            </>
          )}
        </Tile>

        {/* ---------- latest videos */}
        <Tile href="/proyek?status=done" className="sm:col-span-2">
          <TileHead icon={<Clapperboard className="size-4" />} label="Video terbaru" color="#f2994a" />
          {latestDone.length ? (
            <div className="mt-3 grid min-h-40 flex-1 grid-cols-3 gap-2">
              {latestDone.map((v) => (
                <div key={v.id} className="relative overflow-hidden rounded-xl bg-muted">
                  {v.finalPath && <video src={`${mediaUrl(v.finalPath)}#t=0.5`} muted preload="metadata" className="size-full object-cover" />}
                  <p className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6 text-[10px] text-white">{projectName(v)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-4 text-center">
              <Clapperboard className="size-6 text-muted-foreground" />
              <p className="text-[13px] font-medium">Belum ada video</p>
              <p className="text-xs text-muted-foreground">Pilih konsep di Buat Video Reels untuk video pertamamu.</p>
            </div>
          )}
        </Tile>

        {/* ---------- quick actions */}
        <Tile className="sm:col-span-2 lg:col-span-4">
          <TileHead icon={<ArrowUpRight className="size-4" />} label="Aksi cepat" right={<span className="flex items-center gap-1"><Store className="size-3.5" /> {u.showcaseProducts} produk di etalase</span>} />
          <div className="mt-3 grid flex-1 grid-cols-4 gap-2">
            {QUICK.map((slug) => {
              const item = navBySlug(slug)!;
              return (
                <Link key={slug} href={`/${slug}`} className="flex flex-col items-center justify-center gap-2 rounded-xl border bg-background p-3 text-center text-xs font-medium transition-colors hover:bg-accent">
                  <span className="grid size-9 place-items-center rounded-lg bg-muted text-black dark:text-white"><item.icon className="size-4.5" /></span>
                  <span className="line-clamp-1">{item.title}</span>
                </Link>
              );
            })}
          </div>
        </Tile>

        {/* ---------- what sells on TikTok Shop now (KaloData) */}
        <Suspense fallback={<KaloInsightSkeleton />}>
          <KaloInsight />
        </Suspense>
      </div>
    </>
  );
}
