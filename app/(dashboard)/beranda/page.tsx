import Link from "next/link";
import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { Activity, ArrowRight, ArrowUpRight, BadgeCheck, CalendarClock, CircleAlert, Clapperboard, Film, Loader2, Moon, Plus, Upload, Wallet } from "lucide-react";
import { GoogleIcon, VeoIcon } from "@/components/brand-icons";
import { LOGO_PATH } from "@/components/logo";
import { AutoRefresh } from "@/components/auto-refresh";
import { PlatformIcon } from "@/components/platform-icon";
import { AFFILIATE_CENTER_URL, affiliateSummary } from "@/lib/affiliate";
import { Advice } from "@/components/content-advice";
import { contentHealth, HEALTH_DAYS, MIN_AVG_VIEWS } from "@/lib/content-health";
import { db } from "@/lib/db";
import { videoProjects } from "@/lib/db/schema";
import { mediaUrl } from "@/lib/media-url";
import { projectName } from "@/lib/presets";
import { loadBeranda } from "./data";
import { KaloTopCard, KaloTopSkeleton } from "./kalo-insight";

export const dynamic = "force-dynamic";

// Beranda shows only what needs a look today: four numbers, problems (only when there are any), what's next,
// what was made, how the TikTok accounts do. Everything else lives on its own page (Pengaturan, Riset, Profil...).

const TZ = "Asia/Jakarta";
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const num = new Intl.NumberFormat("id-ID");
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", notation: "compact", maximumFractionDigits: 1 });
const timeFmt = new Intl.DateTimeFormat("id-ID", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });

function greeting(now: Date) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: TZ }).format(now));
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
}

/** One compact card; the title row links to the page that holds the full view. */
function Card({ title, icon, href, className = "", children }: { title: string; icon: React.ReactNode; href?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`flex flex-col rounded-xl border bg-card p-4 ${className}`}>
      <div className="mb-3 flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
        <span className="text-black dark:text-white">{icon}</span>
        {title}
        {href && (
          <Link href={href} className="ml-auto flex items-center gap-0.5 hover:text-foreground">
            Lihat <ArrowRight className="size-3" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Kpi({ href, icon, label, value, sub }: { href: string; icon: React.ReactNode; label: string; value: React.ReactNode; sub: React.ReactNode }) {
  return (
    <Link href={href} className="flex flex-col rounded-xl border bg-card px-4 py-4 transition-colors hover:border-ring/40">
      <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <span className="text-black dark:text-white">{icon}</span>
        {label}
      </span>
      <span className="mt-2 text-3xl font-semibold tabular-nums">{value}</span>
      <span className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</span>
    </Link>
  );
}

/** One-line advice per account from the content analysis (status decided in lib/content-health.ts). */
const Empty = ({ children }: { children: React.ReactNode }) => <p className="flex flex-1 items-center text-[13px] text-muted-foreground">{children}</p>;

export default async function BerandaPage() {
  const now = new Date();
  const [b, latestDone, health, affiliate] = await Promise.all([
    loadBeranda(),
    db.select().from(videoProjects).where(eq(videoProjects.status, "done")).orderBy(desc(videoProjects.updatedAt)).limit(3),
    contentHealth(now.getTime()),
    affiliateSummary(),
  ]);
  const { profile: p, usage: u, accounts: acc } = b;
  const lic = p.license;

  const attention = [
    ...health.filter((h) => h.status === "rest").map((h) => ({ key: `r${h.accountId}`, href: "/profil", icon: <Moon className="size-4 text-status-progress" />, title: `@${h.username}: rata-rata ${h.avgViews} penonton`, note: "Istirahatkan / ganti konten" })),
    ...acc.social.filter((a) => a.status !== "active").map((a) => ({ key: `s${a.id}`, href: "/akun", icon: <PlatformIcon platform={a.platform} className="size-4" />, title: `@${a.username}`, note: "Perlu login" })),
    ...acc.google.filter((g) => g.status !== "active").map((g) => ({ key: `g${g.id}`, href: "/pengaturan", icon: <GoogleIcon className="size-4" />, title: g.email, note: "Login ulang" })),
    ...(u.failed ? [{ key: "vf", href: "/proyek?status=failed", icon: <Film className="size-4 text-destructive" />, title: `${u.failed} proyek video gagal`, note: "Perlu dicek" }] : []),
    ...(u.uploadsFailed7 ? [{ key: "uf", href: "/jadwal", icon: <Upload className="size-4 text-destructive" />, title: `${u.uploadsFailed7} upload gagal minggu ini`, note: "Lihat jadwal" }] : []),
    ...(lic.daysLeft != null && lic.daysLeft <= 7 ? [{ key: "lic", href: "/pengaturan", icon: <BadgeCheck className="size-4 text-[#f2c94c]" />, title: `Lisensi habis ${lic.daysLeft} hari lagi`, note: "Perpanjang" }] : []),
    ...(p.update ? [{ key: "upd", href: "/pengaturan", icon: <BadgeCheck className="size-4 text-[#f2c94c]" />, title: `Update Traktiva v${p.update.version} tersedia`, note: p.update.mandatory ? "Wajib" : "Lihat" }] : []),
  ];

  return (
    <>
      <AutoRefresh />
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10">
          <svg viewBox="0 0 640 640" className="size-5 text-brand-light" aria-hidden="true"><path d={LOGO_PATH} fill="currentColor" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold leading-tight tracking-tight">{greeting(now)}, {p.name.replace("@", "")}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(now)} ·{" "}
            {u.running > 0 ? `${u.running} video sedang dibuat · ` : ""}
            {attention.length > 0 ? `${attention.length} hal perlu perhatianmu` : "Semua akun dan mesin dalam kondisi baik"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/jadwal" className="flex h-8 items-center gap-1.5 rounded-lg border bg-card px-3 text-xs font-medium hover:bg-accent">
            <Plus className="size-3.5" /> Jadwal baru
          </Link>
          <Link href="/video" className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Clapperboard className="size-3.5" /> Buat video
          </Link>
        </div>
      </header>

      <div className="flex-1 space-y-3">
        {/* the four numbers */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            href="/proyek?status=done" icon={<Film className="size-4" />} label="Video jadi" value={num.format(u.videosTotal)}
            sub={u.running ? <span className="flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> {u.running} sedang dibuat</span> : `${u.videosToday} hari ini · ${u.videos7} minggu ini`}
          />
          <Kpi href="/jadwal" icon={<Upload className="size-4" />} label="Terposting" value={num.format(u.uploadsTotal)} sub={`${u.uploads7} minggu ini`} />
          <Kpi
            href="/jadwal" icon={<CalendarClock className="size-4" />} label="Terjadwal" value={num.format(b.queuedTotal)}
            sub={b.schedule[0] ? `Berikutnya ${timeFmt.format(b.schedule[0].at * 1000)}` : "Belum ada jadwal"}
          />
          <Kpi
            href="/pengaturan" icon={<VeoIcon className="size-4" />} label="Kredit Flow" value={compact.format(acc.credits)}
            sub={`${acc.google.filter((g) => g.status === "active").length}/${acc.google.length} akun Google aktif`}
          />
        </div>

        {/* problems: only when there are any */}
        {attention.length > 0 && (
          <Card title="Perlu perhatian" icon={<CircleAlert className="size-4" />} className="border-status-progress/40">
            <ul className="divide-y">
              {attention.slice(0, 5).map((a) => (
                <li key={a.key}>
                  <Link href={a.href} className="flex items-center gap-2.5 py-1.5 text-[13px] hover:text-foreground">
                    {a.icon}
                    <span className="min-w-0 flex-1 truncate font-medium">{a.title}</span>
                    <span className="text-xs text-status-progress">{a.note}</span>
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* content analysis: last week's average views per TikTok account decides post or rest */}
        {health.length > 0 && (
          <Card title={`Analisis konten · ${HEALTH_DAYS} hari terakhir`} icon={<Activity className="size-4" />} href="/profil">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="pb-1 font-normal">Akun</th>
                    <th className="pb-1 text-right font-normal">Video</th>
                    <th className="pb-1 text-right font-normal">Rata-rata penonton</th>
                    <th className="pb-1 text-right font-normal" title="(suka + komentar + dibagikan + disimpan) ÷ penonton">Interaksi</th>
                    <th className="pb-1 pl-4 font-normal">Video terbaik</th>
                    <th className="pb-1 text-right font-normal">Jam terbaik</th>
                    <th className="pb-1 pl-4 font-normal">Saran</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {health.map((h) => (
                    <tr key={h.accountId} className="align-middle">
                      <td className="py-2.5 pr-2">
                        <span className="flex items-center gap-1.5 font-medium"><PlatformIcon platform="tiktok" className="size-3.5" />@{h.username}</span>
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{h.posts}</td>
                      <td className="py-2.5 text-right tabular-nums whitespace-nowrap">
                        <span className={`font-semibold ${h.status === "rest" ? "text-status-progress" : ""}`}>{h.avgViews ?? "—"}</span>
                        {h.trend != null && Math.abs(h.trend) >= 0.01 && (
                          <span className={`ml-1 text-[10px] ${h.trend > 0 ? "text-status-ok" : "text-destructive"}`} title="Dibanding 7 hari sebelumnya">
                            {h.trend > 0 ? "▲" : "▼"} {Math.round(Math.abs(h.trend) * 100)}%
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{h.engagement != null ? `${(h.engagement * 100).toFixed(1)}%` : "—"}</td>
                      <td className="max-w-56 py-1.5 pl-4">
                        {h.best ? (
                          <a href={`https://www.tiktok.com/@${h.username}/video/${h.best.externalId}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-foreground" title={h.best.caption}>
                            <span className="shrink-0 font-semibold tabular-nums">{compact.format(h.best.views)}</span>
                            <span className="truncate text-muted-foreground">{h.best.caption || "tanpa caption"}</span>
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{h.bestHour != null ? `${String(h.bestHour).padStart(2, "0")}.00` : "—"}</td>
                      <td className="py-2.5 pl-4">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <Advice h={h} />
                          {h.stale && <Link href="/profil" className="text-[11px] text-muted-foreground underline-offset-2 hover:underline">data lama, sinkronkan</Link>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Video {HEALTH_DAYS} hari terakhir (yang di bawah 24 jam belum dihitung); tren dibanding {HEALTH_DAYS} hari sebelumnya; jam terbaik dari riwayat akun (WIB).
              Rata-rata di bawah {MIN_AVG_VIEWS} penonton = istirahatkan akun atau ganti jenis konten dulu.
            </p>
          </Card>
        )}

        <div className="grid gap-3 lg:grid-cols-3 [&>section]:min-h-[260px]">
          {/* what sells right now (KaloData), streamed in: KaloData can be slow */}
          <Suspense fallback={<KaloTopSkeleton />}>
            <KaloTopCard />
          </Suspense>

          {/* what was made */}
          <Card title="Video terbaru" icon={<Clapperboard className="size-4" />} href="/proyek?status=done">
            {latestDone.length ? (
              <div className="grid grid-cols-3 gap-1.5">
                {latestDone.map((v) => (
                  <Link key={v.id} href={`/video/${v.id}`} className="relative aspect-[9/16] max-h-56 overflow-hidden rounded-lg bg-muted" title={projectName(v)}>
                    {v.finalPath && <video src={`${mediaUrl(v.finalPath)}#t=0.5`} muted preload="metadata" className="size-full object-cover" />}
                    <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6 text-[11px] text-white">{projectName(v)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty>Belum ada video. Mulai dari Buat Video Reels.</Empty>
            )}
          </Card>

          {/* affiliate earnings, last 7 days (data from the Tokopedia affiliate center; backend pending in lib/affiliate.ts) */}
          <Card title="Pendapatan affiliate · 7 hari" icon={<Wallet className="size-4" />}>
            {affiliate.length ? (
              <>
                <ul className="divide-y">
                  {affiliate.map((a) => (
                    <li key={a.accountId} className="py-2.5">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <PlatformIcon platform="tiktok" className="size-3.5" />
                        <span className="truncate">@{a.username}</span>
                      </p>
                      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                        <div><dt>Komisi</dt><dd className="text-sm font-semibold tabular-nums text-foreground">{a.data ? rupiah.format(a.data.commission) : "—"}</dd></div>
                        <div><dt>Penjualan</dt><dd className="text-sm font-semibold tabular-nums text-foreground">{a.data ? rupiah.format(a.data.gmv) : "—"}</dd></div>
                        <div><dt>Pesanan</dt><dd className="text-sm font-semibold tabular-nums text-foreground">{a.data ? num.format(a.data.orders) : "—"}</dd></div>
                      </dl>
                    </li>
                  ))}
                </ul>
                {affiliate.every((a) => !a.data) && (
                  <p className="mt-auto flex flex-wrap items-center gap-x-1.5 pt-3 text-xs text-muted-foreground">
                    Data komisi belum tersambung ke Traktiva.
                    <a href={AFFILIATE_CENTER_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-foreground hover:underline">
                      Buka Affiliate Center <ArrowUpRight className="size-3" />
                    </a>
                  </p>
                )}
              </>
            ) : (
              <Empty>Belum ada akun TikTok. Hubungkan di Akun Sosial.</Empty>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
