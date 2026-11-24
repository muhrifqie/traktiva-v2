import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { BadgeDollarSign, ChevronRight, Clock, Compass, ExternalLink, Eye, Film, Flame, Heart, Layers, Loader2, Repeat, UserPlus, Users, UsersRound, Zap, type LucideIcon } from "lucide-react";
import { AccountAvatar } from "@/components/account-avatar";
import { PageHeader } from "@/components/page-header";
import { PlatformIcon } from "@/components/platform-icon";
import { db } from "@/lib/db";
import { accountPosts, accounts, type Account } from "@/lib/db/schema";
import { YT_CACHE, type InsightCard, type YouTubeCache } from "@/lib/platforms/youtube-studio";
import { getShopCache } from "@/lib/showcase";
import { DailyBars } from "../beranda/charts";
import { ChannelSelect } from "./channel-select";
import { AutoSync, YouTubeSyncButton } from "./sync-button";

export const dynamic = "force-dynamic";

const num = new Intl.NumberFormat("id-ID");
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const timeFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const TYPE = { short: "Shorts", video: "Video", live: "Live" } as const;
const dur = (s: number | null) => (s == null ? "—" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
const RED = "#ff3333";

type Post = typeof accountPosts.$inferSelect;
type Channel = { a: Account; cache: { data: YouTubeCache; capturedAt: Date } | null; posts: Post[] };

// ---------- reading Studio's cards (Indonesian Studio: Chrome runs with --lang=id-ID) ----------

/** "1.234" · "0,5" · "1,2 rb" · "3 jt" → number */
function idNum(s: string | undefined) {
  const m = s?.match(/([\d.,]+)\s*(rb|jt|M)?/);
  if (!m) return null;
  return Number(m[1].replace(/\./g, "").replace(",", ".")) * ({ rb: 1e3, jt: 1e6, M: 1e9 }[m[2] as "rb"] ?? 1);
}
const cards = (d: YouTubeCache) => [...d.insight.overview, ...d.insight.shorts];
const card = (d: YouTubeCache, re: RegExp) => cards(d).find((c) => re.test(c.title));
/** daily views of the last 28 days (overview chart) */
const viewSeries = (d: YouTubeCache) => d.insight.overview.find((c) => c.series && /^Penayangan$/i.test(c.title))?.series?.points ?? [];
function stats(c: Channel) {
  const d = c.cache?.data;
  if (!d) return null;
  const stay = cards(d).flatMap((x) => x.metrics).find((m) => /tetap menonton/i.test(m.label ?? ""));
  return {
    subscribers: d.channel.subscribers,
    videos: c.posts.length,
    shorts: c.posts.filter((p) => d.types[p.externalId] === "short").length,
    views28: viewSeries(d).reduce((s, [, n]) => s + n, 0),
    hours28: idNum(card(d, /waktu tonton/i)?.metrics[0]?.value) ?? 0,
    stay: stay?.value ?? null,
    monetization: d.monetization,
  };
}

// ---------- small pieces ----------

function Tile({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#ff3333]/10 text-[#ff3333]"><Icon className="size-[18px]" /></span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-lg leading-tight font-semibold tabular-nums">{value}{sub && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{sub}</span>}</p>
      </div>
    </div>
  );
}

/** Small bento number: icon + label, big value. */
function Kpi({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex flex-col justify-between gap-2 rounded-xl border bg-card p-4">
      <span className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-4" /> {label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/** Horizontal share bar row: label, value, thin bar. */
function BarRow({ label, value, pct, lead }: { label: string; value: string; pct: number; lead?: React.ReactNode }) {
  return (
    <li className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-muted-foreground">{lead}{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: RED }} /></div>
    </li>
  );
}

/** Bento cell: icon + title on top, any content below. */
function Box({ icon: Icon, title, hint, className = "", children }: { icon: LucideIcon; title: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 ${className}`}>
      <header className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <h3 className="truncate text-[13px] font-semibold">{title}</h3>
        {hint && <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{hint}</span>}
      </header>
      {children}
    </section>
  );
}

/** One Studio Insight card, drawn generically: headline numbers, a daily chart, labelled rows. */
function Card({ c }: { c: InsightCard }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
      <h3 className="text-[13px] font-semibold">{c.title}</h3>
      {c.metrics.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          {c.metrics.map((m, i) => (
            <p key={i} className="min-w-0">
              <span className="text-2xl font-semibold tabular-nums">{m.value}</span>
              {m.label && <span className="ml-1.5 text-xs text-muted-foreground">{m.label}</span>}
            </p>
          ))}
        </div>
      )}
      {c.series && <DailyBars data={c.series.points.map(([day, n]) => ({ day, n }))} color={RED} unit="" label={c.series.label} period={`${c.series.points.length} hari`} />}
      {c.rows.length > 0 && (
        <ul className="space-y-1.5 text-xs">
          {c.rows.map((r, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-muted-foreground" title={r.label}>{r.label}</span>
              <span className="font-medium tabular-nums">{r.value || "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Progress({ label, value, need, unit = "" }: { label: string; value: number; need: number; unit?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{compact.format(value)}{unit} / {compact.format(need)}{unit}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / need) * 100)}%`, background: RED }} /></div>
    </div>
  );
}

function VideoTable({ rows, channelOf }: { rows: { p: Post; type: keyof typeof TYPE }[]; channelOf?: (p: Post) => Account | undefined }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[760px] text-[13px]">
        <thead className="border-b text-xs text-muted-foreground">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium">Video</th>
            {channelOf && <th className="px-3 py-2 font-medium">Channel</th>}
            <th className="px-3 py-2 font-medium">Tanggal</th>
            <th className="px-3 py-2 text-right font-medium">Durasi</th>
            <th className="px-3 py-2 text-right font-medium">Penayangan</th>
            <th className="px-3 py-2 text-right font-medium">Suka</th>
            <th className="px-3 py-2 text-right font-medium">Komentar</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, type }) => {
            const ch = channelOf?.(p);
            return (
              <tr key={p.id} className="border-b last:border-0 hover:bg-accent/30">
                <td className="px-3 py-2">
                  <a href={type === "short" ? `https://youtube.com/shorts/${p.externalId}` : `https://youtu.be/${p.externalId}`} target="_blank" rel="noreferrer" className="group flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail */}
                    <img src={p.coverUrl ?? ""} alt="" loading="lazy" className={`shrink-0 rounded-md bg-muted object-cover ${type === "short" ? "h-14 w-8" : "h-9 w-16"}`} />
                    <span className="min-w-0">
                      <span className="line-clamp-2 group-hover:underline">{p.caption}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="rounded bg-muted px-1.5">{TYPE[type]}</span>
                        {p.isPrivate && <span className="rounded bg-amber-500/12 px-1.5 text-amber-600 dark:text-amber-300">Tidak publik</span>}
                        <ExternalLink className="size-3 opacity-0 group-hover:opacity-100" />
                      </span>
                    </span>
                  </a>
                </td>
                {channelOf && (
                  <td className="px-3 py-2">
                    {ch && (
                      <Link href={`/youtube-performa?akun=${ch.id}`} className="flex items-center gap-2 whitespace-nowrap hover:underline">
                        <AccountAvatar a={ch} size="size-5" /> {ch.displayName || ch.username}
                      </Link>
                    )}
                  </td>
                )}
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{p.postedAt ? dateFmt.format(p.postedAt) : "Draf"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{dur(p.durationSec)}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{num.format(p.views)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num.format(p.likes)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num.format(p.comments)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Waiting({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <p className="text-sm font-medium">Mengambil data {name} dari YouTube Studio...</p>
      <p className="max-w-sm text-xs text-muted-foreground">Berjalan otomatis di latar belakang (±1 menit). Setelah itu diperbarui sendiri tiap 3 jam.</p>
    </div>
  );
}

// ---------- views ----------

/** Every channel side by side, in the same bento as one channel: summed numbers, then per-channel comparisons. */
function AllChannels({ list }: { list: Channel[] }) {
  const rows = list.map((c) => ({ ...c, s: stats(c) }));
  const synced = rows.filter((r) => r.s);
  const sum = (f: (r: (typeof synced)[number]) => number) => synced.reduce((t, r) => t + f(r), 0);
  const kpi = (r: Channel, re: RegExp) => idNum(card(r.cache!.data, re)?.metrics[0]?.value) ?? 0;
  const byDay = new Map<number, number>();
  for (const r of synced) for (const [day, n] of viewSeries(r.cache!.data)) byDay.set(day, (byDay.get(day) ?? 0) + n);
  const days = [...byDay].sort((a, b) => a[0] - b[0]).map(([day, n]) => ({ day, n }));
  const views28 = sum((r) => r.s!.views28);
  const name = (a: Account) => a.displayName || a.username;
  const top = synced
    .flatMap((r) => r.posts.map((p) => ({ p, a: r.a })))
    .sort((x, y) => y.p.views - x.p.views)
    .slice(0, 5);
  const monet = (m: NonNullable<ReturnType<typeof stats>>["monetization"]) =>
    m ? (m.monetized ? 100 : Math.max(m.subscribers / m.subscribersNeeded, m.shortsViews / m.shortsViewsNeeded, m.watchHours / m.watchHoursNeeded) * 100) : null;
  const empty = <p className="text-xs text-muted-foreground">Belum ada data.</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={Layers} label="Channel" value={`${list.length}`} sub={`${list.filter((c) => c.a.status === "active").length} login`} />
        <Tile icon={Users} label="Subscriber" value={num.format(sum((r) => r.s!.subscribers))} />
        <Tile icon={Film} label="Video" value={num.format(sum((r) => r.s!.videos))} sub={`${num.format(sum((r) => r.s!.shorts))} Shorts`} />
        <Tile icon={Eye} label="Penayangan total" value={num.format(sum((r) => r.posts.reduce((t, p) => t + p.views, 0)))} />
      </div>

      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold text-muted-foreground">Insight 28 hari, semua channel</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Box icon={Eye} title="Penayangan" hint="28 hari" className="md:col-span-2">
            <p className="text-3xl font-semibold tabular-nums">{num.format(views28)}</p>
            {days.length > 0 && <DailyBars data={days} color={RED} unit="views" label="Per hari, digabung" period="28 hari" />}
          </Box>
          <div className="grid grid-cols-2 gap-3 md:col-span-2">
            <Kpi icon={Clock} label="Jam tonton" value={num.format(Math.round(sum((r) => r.s!.hours28) * 10) / 10)} />
            <Kpi icon={UserPlus} label="Subscriber baru" value={num.format(sum((r) => kpi(r, /^Subscriber$/i)))} />
            <Kpi icon={Zap} label="Penayangan 48 jam" value={num.format(sum((r) => kpi(r, /48 jam/i)))} />
            <Kpi icon={UsersRound} label="Audiens bulanan" value={num.format(sum((r) => kpi(r, /audiens/i)))} />
          </div>

          <Box icon={Layers} title="Penayangan per channel" hint="28 hari">
            {synced.length ? (
              <ul className="space-y-2 text-xs">
                {[...synced].sort((x, y) => y.s!.views28 - x.s!.views28).map((r) => (
                  <BarRow key={r.a.id} lead={<AccountAvatar a={r.a} size="size-4" />} label={name(r.a)} value={num.format(r.s!.views28)} pct={views28 ? (r.s!.views28 / views28) * 100 : 0} />
                ))}
              </ul>
            ) : empty}
          </Box>

          <Box icon={Repeat} title="Ditonton sampai habis?" hint="Shorts">
            {synced.length ? (
              <ul className="space-y-2 text-xs">
                {synced.map((r) => (
                  <BarRow key={r.a.id} lead={<AccountAvatar a={r.a} size="size-4" />} label={name(r.a)} value={r.s!.stay ?? "—"} pct={idNum(r.s!.stay ?? undefined) ?? 0} />
                ))}
              </ul>
            ) : empty}
          </Box>

          <Box icon={Flame} title="Konten populer" hint="semua waktu">
            {top.length ? (
              <ol className="space-y-2 text-xs">
                {top.map(({ p, a }, i) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <span className="grid size-5 shrink-0 place-items-center rounded bg-muted text-[10px] font-semibold">{i + 1}</span>
                    <AccountAvatar a={a} size="size-4" />
                    <a href={`https://youtu.be/${p.externalId}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline" title={`${p.caption} · ${name(a)}`}>{p.caption}</a>
                    <span className="flex shrink-0 items-center gap-1 font-medium tabular-nums"><Eye className="size-3 text-muted-foreground" />{compact.format(p.views)}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="text-xs text-muted-foreground">Belum ada penayangan.</p>}
          </Box>

          <Box icon={BadgeDollarSign} title="Menuju monetisasi" hint="syarat terdekat">
            {synced.length ? (
              <ul className="space-y-2 text-xs">
                {synced.map((r) => {
                  const pct = monet(r.s!.monetization);
                  return <BarRow key={r.a.id} lead={<AccountAvatar a={r.a} size="size-4" />} label={name(r.a)} value={r.s!.monetization?.monetized ? "Aktif" : pct != null ? `${pct.toFixed(0)}%` : "—"} pct={pct ?? 0} />;
                })}
              </ul>
            ) : empty}
          </Box>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold text-muted-foreground">Perbandingan channel</h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead className="border-b text-xs text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Channel</th>
                <th className="px-3 py-2 text-right font-medium">Subscriber</th>
                <th className="px-3 py-2 text-right font-medium">Video</th>
                <th className="px-3 py-2 text-right font-medium">Penayangan 28h</th>
                <th className="px-3 py-2 text-right font-medium">Jam tonton</th>
                <th className="px-3 py-2 text-right font-medium">Tetap menonton</th>
                <th className="px-3 py-2 font-medium">Diperbarui</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ a, s, cache }) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-accent/30">
                  <td className="px-3 py-2">
                    <Link href={`/youtube-performa?akun=${a.id}`} className="flex items-center gap-2.5">
                      <AccountAvatar a={a} size="size-8" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{name(a)}</span>
                        <span className="block truncate text-xs text-muted-foreground">@{a.username}</span>
                      </span>
                    </Link>
                  </td>
                  {s ? (
                    <>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{num.format(s.subscribers)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.videos}<span className="ml-1 text-xs text-muted-foreground">({s.shorts} Shorts)</span></td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{num.format(s.views28)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num.format(s.hours28)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.stay ?? "—"}</td>
                    </>
                  ) : (
                    <td colSpan={5} className="px-3 py-2 text-xs text-muted-foreground">
                      {a.status === "active" ? <span className="flex items-center gap-1.5"><Loader2 className="size-3 animate-spin" /> Mengambil data dari Studio...</span> : "Perlu login ulang"}
                    </td>
                  )}
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{cache ? timeFmt.format(cache.capturedAt) : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/youtube-performa?akun=${a.id}`} aria-label={`Detail ${name(a)}`} className="inline-grid size-7 place-items-center rounded-md hover:bg-accent"><ChevronRight className="size-4" /></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** One channel in full: tiles, Studio's Insight cards, monetization progress and every video. */
function OneChannel({ c }: { c: Channel }) {
  const d = c.cache?.data;
  const name = c.a.displayName || c.a.username;
  if (!d) return c.a.status === "active" ? <Waiting name={name} /> : <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Sesi {name} habis. Login ulang di menu YouTube.</p>;
  const s = stats(c)!;
  const m = d.monetization;
  // Studio's cards, picked by title into a fixed bento; cards not recognised still show (generic) at the end
  const all = cards(d);
  const used = new Set<InsightCard>();
  const take = (re: RegExp) => {
    const x = all.find((y) => !used.has(y) && re.test(y.title));
    if (x) all.filter((y) => y.title === x.title).forEach((y) => used.add(y)); // the same card can come twice
    return x;
  };
  const views = take(/^Penayangan$/i);
  const kpis = [
    { icon: Clock, label: "Jam tonton", card: take(/waktu tonton/i) },
    { icon: UserPlus, label: "Subscriber baru", card: take(/^Subscriber$/i) },
    { icon: Zap, label: "Penayangan 48 jam", card: take(/48 jam/i) },
    { icon: UsersRound, label: "Audiens bulanan", card: take(/audiens/i) },
  ];
  const stay = take(/berinteraksi/i);
  const traffic = take(/menemukan/i);
  const popular = [take(/konten populer/i), take(/terpopuler/i), take(/ditonton sekarang/i)].flatMap((x) => x?.rows ?? []);
  const top = popular.filter((r, i) => popular.findIndex((y) => y.label === r.label) === i).slice(0, 5);
  take(/total subscriber/i); // same number as the Subscriber tile
  take(/performa video terbaru/i); // Studio's per-video teaser: the table below has every video
  const rest = all.filter((x, i) => !used.has(x) && all.findIndex((y) => y.title === x.title) === i);
  const metric = (x?: InsightCard) => x?.metrics[0]?.value ?? "—";
  const [stayPct, skipPct] = [stay?.metrics[0], stay?.metrics[1]];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={Users} label="Subscriber" value={num.format(s.subscribers)} />
        <Tile icon={Film} label="Video" value={`${s.videos}`} sub={`${s.shorts} Shorts`} />
        <Tile icon={Eye} label="Penayangan total" value={num.format(c.posts.reduce((t, p) => t + p.views, 0))} />
        <Tile icon={Heart} label="Suka & komentar" value={num.format(c.posts.reduce((t, p) => t + p.likes + p.comments, 0))} />
      </div>

      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold text-muted-foreground">Insight 28 hari</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {/* views: the big cell with its chart, the 4 small numbers beside it */}
          <Box icon={Eye} title="Penayangan" hint="28 hari" className="md:col-span-2">
            <p className="text-3xl font-semibold tabular-nums">{metric(views)}</p>
            {views?.series && <DailyBars data={views.series.points.map(([day, n]) => ({ day, n }))} color={RED} unit="views" label="Per hari" period="28 hari" />}
          </Box>
          <div className="grid grid-cols-2 gap-3 md:col-span-2">
            {kpis.map((k) => <Kpi key={k.label} icon={k.icon} label={k.label} value={metric(k.card)} />)}
          </div>

          <Box icon={Repeat} title="Ditonton sampai habis?" hint="Shorts">
            {stayPct ? (
              <>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                  <span style={{ width: `${idNum(stayPct.value) ?? 0}%`, background: RED }} />
                </div>
                <div className="flex justify-between gap-2 text-xs">
                  <span><b className="text-base tabular-nums">{stayPct.value}</b> <span className="text-muted-foreground">{stayPct.label}</span></span>
                  {skipPct && <span className="text-right"><b className="text-base tabular-nums">{skipPct.value}</b> <span className="text-muted-foreground">{skipPct.label}</span></span>}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Belum ada data.</p>
            )}
          </Box>

          <Box icon={Compass} title="Sumber penonton" hint="Shorts">
            {traffic?.rows.length ? (
              <ul className="space-y-2 text-xs">
                {traffic.rows.map((r) => (
                  <li key={r.label} className="space-y-1">
                    <div className="flex justify-between gap-2"><span className="truncate text-muted-foreground">{r.label}</span><span className="font-medium tabular-nums">{r.value}</span></div>
                    <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${idNum(r.value) ?? 0}%`, background: RED }} /></div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Belum ada data.</p>
            )}
          </Box>

          <Box icon={Flame} title="Konten populer" hint="48 jam">
            {top.length ? (
              <ol className="space-y-2 text-xs">
                {top.map((r, i) => (
                  <li key={r.label} className="flex items-center gap-2">
                    <span className="grid size-5 shrink-0 place-items-center rounded bg-muted text-[10px] font-semibold">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate" title={r.label}>{r.label}</span>
                    <span className="flex shrink-0 items-center gap-1 font-medium tabular-nums"><Eye className="size-3 text-muted-foreground" />{r.value || "—"}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-muted-foreground">Belum ada penayangan.</p>
            )}
          </Box>

          {m && (
            <Box icon={BadgeDollarSign} title={m.monetized ? "Monetisasi aktif" : "Menuju monetisasi"}>
              <Progress label="Subscriber" value={m.subscribers} need={m.subscribersNeeded} />
              <Progress label="Views Shorts (90 hari)" value={m.shortsViews} need={m.shortsViewsNeeded} />
              <Progress label="atau jam tonton (12 bln)" value={m.watchHours} need={m.watchHoursNeeded} unit=" jam" />
            </Box>
          )}

          {rest.map((x, i) => <Card key={i} c={x} />)}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold text-muted-foreground">Konten ({c.posts.length})</h2>
        <VideoTable rows={c.posts.map((p) => ({ p, type: d.types[p.externalId] ?? "video" }))} />
      </section>
    </div>
  );
}

// YouTube → Performa: Studio data of every channel (auto-synced after login, on first open and every 3 hours).
// The channel dropdown switches between all channels side by side and one channel in full.
export default async function YouTubePerformaPage({ searchParams }: PageProps<"/youtube-performa">) {
  const { akun } = await searchParams;
  const accs = await db.select().from(accounts).where(eq(accounts.platform, "youtube")).orderBy(asc(accounts.username));

  if (!accs.length) {
    return (
      <>
        <PageHeader slug="youtube-performa" />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center">
          <PlatformIcon platform="youtube" className="size-7" />
          <p className="text-sm font-medium">Belum ada channel YouTube</p>
          <Link href="/youtube" className="mt-2 flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">Hubungkan channel</Link>
        </div>
      </>
    );
  }

  const ids = accs.map((a) => a.id);
  const [caches, posts] = await Promise.all([
    Promise.all(ids.map((id) => getShopCache<YouTubeCache>(id, YT_CACHE))),
    db.select().from(accountPosts).where(inArray(accountPosts.accountId, ids)).orderBy(desc(accountPosts.postedAt)),
  ]);
  const channels: Channel[] = accs.map((a, i) => ({ a, cache: caches[i], posts: posts.filter((p) => p.accountId === a.id) }));
  const wanted = Array.isArray(akun) ? akun[0] : akun;
  const one = channels.find((c) => String(c.a.id) === wanted) ?? (channels.length === 1 ? channels[0] : null);
  // channels never synced but still logged in: fetch them now (on screen) instead of waiting for the 3-hour timer
  const missing = (one ? [one] : channels).filter((c) => !c.cache && c.a.status === "active" && c.a.externalId?.startsWith("UC")).map((c) => c.a.id);

  // header line: when the shown data was refreshed (the oldest channel in "Semua channel")
  const shown = (one ? [one] : channels).map((c) => c.cache?.capturedAt).filter((d): d is Date => !!d);
  const oldest = shown.length ? new Date(Math.min(...shown.map((d) => d.getTime()))) : null;
  const updated = oldest
    ? `Data diperbarui ${timeFmt.format(oldest)} WIB · sinkron otomatis tiap 3 jam`
    : "Mengambil data pertama dari YouTube Studio...";
  return (
    <>
      <PageHeader slug="youtube-performa" desc={updated}>
        {one?.cache && <YouTubeSyncButton accountId={one.a.id} name={one.a.displayName || one.a.username} />}
        <ChannelSelect
          current={one ? one.a.id : "all"}
          channels={channels.map((c) => ({ id: c.a.id, name: c.a.displayName || c.a.username, handle: c.a.username, avatarUrl: c.a.avatarUrl, status: c.a.status, synced: !!c.cache }))}
        />
      </PageHeader>
      <AutoSync ids={missing} />
      {one ? <OneChannel c={one} /> : <AllChannels list={channels} />}
    </>
  );
}
