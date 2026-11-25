"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CalendarClock, Check, ListChecks, CalendarDays, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, Clock, Eye, Film, Plus, Search, Sparkles, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Popover } from "@base-ui/react/popover";
import { confirmDialog } from "@/components/confirm-dialog";
import { openLightbox } from "@/components/media-lightbox";
import { PlatformIcon } from "@/components/platform-icon";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { accountColor } from "@/lib/account-color";
import { mediaUrl } from "@/lib/media-url";
import type { YouTubeUploadDefaults } from "@/lib/settings";
import { queuePlan } from "./actions";

// Kalender Upload: one planner for every account (TikTok, YouTube, Instagram, Facebook). Drag a video from the left onto
// a day (or a day's hour in the week view): every picked account gets it at that hour, else its next free upload hour.
// Placements are drafts kept in this browser until "Masukkan ke antrean" turns them into real upload jobs. Queued and
// posted uploads show as solid stills; hovering any still opens a card with the video playing and every detail.

type Platform = "tiktok" | "instagram" | "facebook" | "youtube" | "shopee";
type Account = { id: number; name: string; platform: Platform; avatar: string | null; active: boolean };
type Video = { rel: string; title: string; group: "editor" | "proyek" };
export type CalJob = {
  id: number;
  scheduledAt: number;
  postedAt: number | null;
  status: "queued" | "uploading" | "done" | "failed" | "cancelled";
  accountId: number;
  video: string;
  label: string | null;
  title: string | null;
  videoTitle: string | null;
  caption: string;
  views: number | null;
  error: string | null;
  progress: string | null;
};
type Draft = { id: string; rel: string; title: string; channelId: number; day: string; time: string };
type View = "week" | "month";
type Saved = { drafts: Draft[]; slots: string[]; picked: number[]; view: View };
/** One thing on the calendar: a draft (editable) or an upload job (read-only). */
type Item = { key: string; rel: string; title: string; channelId: number; day: string; time: string; draft?: Draft; job?: CalJob };

const KEY = "trk-kalender";
const OLD_KEY = "trk-yt-kalender"; // drafts of the former YouTube-only calendar
const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const MONTH = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" });
const SHORT = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" });
const FULL = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const DEFAULT_SLOTS = ["10:00", "16:00", "19:00"];
const SITE: Record<Platform, string> = { tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", shopee: "Shopee" };
const STATUS: Record<CalJob["status"] | "draft", { label: string; ring: string; badge: string }> = {
  draft: { label: "Draf", ring: "ring-foreground/40 ring-dashed", badge: "bg-foreground text-background" },
  queued: { label: "Antre", ring: "ring-[#7b86f0]", badge: "bg-[#5e6ad2] text-white" },
  uploading: { label: "Mengunggah", ring: "ring-amber-500 animate-pulse", badge: "bg-amber-500 text-black" },
  done: { label: "Terposting", ring: "ring-status-ok", badge: "bg-status-ok text-white" },
  failed: { label: "Gagal", ring: "ring-destructive", badge: "bg-destructive text-white" },
  cancelled: { label: "Dibatalkan", ring: "ring-border", badge: "bg-muted text-muted-foreground" },
};
const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeOf = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const dot = (t: string) => t.replace(":", ".");
const uid = () => Math.random().toString(36).slice(2, 10);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monday = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
const atOf = (d: { day: string; time: string }) => new Date(`${d.day}T${d.time}`).getTime();
const stateOf = (it: Item) => (it.draft ? "draft" : it.job!.status);

/** The video as a 9:16 still (frame at 1 s); plays on hover. A deleted file leaves the dark box. */
function Thumb({ rel, className }: { rel: string; className: string }) {
  return (
    <video
      src={`${mediaUrl(rel)}#t=1`}
      preload="metadata"
      muted
      playsInline
      onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
      onMouseLeave={(e) => {
        e.currentTarget.pause();
        e.currentTarget.currentTime = 1;
      }}
      className={`shrink-0 rounded bg-black object-cover ${className}`}
    />
  );
}

type Hover = { it: Item; x: number; y: number };
const CARD_W = 272;

export function JadwalCalendar({ accounts, videos, jobs, ytDefaults }: { accounts: Account[]; videos: Video[]; jobs: CalJob[]; ytDefaults: YouTubeUploadDefaults }) {
  const router = useRouter();
  const [queueOpen, setQueueOpen] = useState(false);
  const [yt, setYt] = useState(ytDefaults); // YouTube: title / description / tags / visibility / audience / AI label
  const [caption, setCaption] = useState("{judul}"); // TikTok / Instagram / Facebook
  const [ownCaption, setOwnCaption] = useState(true);
  const [queuing, startQueue] = useTransition();
  const [lateDrafts, setLateDrafts] = useState(0); // drafts whose hour has passed, counted when the dialog opens
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState<Date | null>(null); // a day inside the shown week / month (set after mount)
  const [today, setToday] = useState("");
  const [picked, setPicked] = useState<number[]>(() => accounts.filter((a) => a.active).map((a) => a.id).slice(0, 1));
  const [slots, setSlots] = useState<string[]>(DEFAULT_SLOTS);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [q, setQ] = useState("");
  const [onlyFree, setOnlyFree] = useState(true);
  const [over, setOver] = useState<string | null>(null); // drop target being dragged over ("day" or "day|time")
  const [newSlot, setNewSlot] = useState("21:00");
  const [hover, setHover] = useState<Hover | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const now = new Date();
      setToday(dayKey(now));
      setCursor(now);
      try {
        const s = JSON.parse(localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY) ?? "null") as Partial<Saved> | null;
        if (s) {
          if (s.slots?.length) setSlots(s.slots);
          if (s.drafts) setDrafts(s.drafts.filter((d) => accounts.some((a) => a.id === d.channelId)));
          if (s.picked?.length) setPicked(s.picked.filter((id) => accounts.some((a) => a.id === id)));
          if (s.view) setView(s.view);
        }
      } catch {}
      loaded.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, [accounts]);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ drafts, slots, picked, view } satisfies Saved));
      localStorage.removeItem(OLD_KEY);
    } catch {}
  }, [drafts, slots, picked, view]);

  const sortedSlots = useMemo(() => [...slots].sort(), [slots]);
  const acc = (id: number) => accounts.find((a) => a.id === id);
  const name = (id: number) => acc(id)?.name ?? "Akun";

  // ---- everything on the calendar, per day ----
  const items = useMemo(() => {
    const m = new Map<string, Item[]>();
    const add = (it: Item) => m.set(it.day, [...(m.get(it.day) ?? []), it]);
    for (const j of jobs) add({ key: `j${j.id}`, rel: j.video, title: j.videoTitle || j.title || j.caption.split("\n")[0] || j.label || "Video", channelId: j.accountId, day: dayKey(new Date(j.scheduledAt)), time: timeOf(j.scheduledAt), job: j });
    for (const d of drafts) add({ key: d.id, rel: d.rel, title: d.title, channelId: d.channelId, day: d.day, time: d.time, draft: d });
    for (const list of m.values()) list.sort((a, b) => a.time.localeCompare(b.time) || a.channelId - b.channelId);
    return m;
  }, [jobs, drafts]);

  // ---- placing ----
  /** The hour for the account that day: `want` when free, else the first free upload hour (not in the past today). */
  const freeSlot = (channelId: number, day: string, list: Draft[], want?: string, skip?: string) => {
    const taken = new Set([
      ...(items.get(day) ?? []).filter((x) => x.job && x.job.status !== "failed" && x.channelId === channelId).map((x) => x.time),
      ...list.filter((d) => d.day === day && d.channelId === channelId && d.id !== skip).map((d) => d.time),
    ]);
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes() + 30;
    const ok = (t: string) => !taken.has(t) && (day !== today || Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) > nowMin);
    if (want && ok(want)) return want;
    return sortedSlots.find(ok) ?? null;
  };
  const place = (rel: string, title: string, day: string, want?: string) => {
    if (!picked.length) return toast.error("Pilih minimal satu akun di atas dulu.");
    if (today && day < today) return toast.error("Tanggal yang sudah lewat tidak bisa dipakai.");
    const next = [...drafts];
    const full: string[] = [];
    for (const channelId of picked) {
      const time = freeSlot(channelId, day, next, want);
      if (!time) full.push(name(channelId));
      else next.push({ id: uid(), rel, title, channelId, day, time });
    }
    setDrafts(next);
    if (full.length) toast.warning(`Jam tayang hari itu sudah penuh untuk ${full.join(", ")}. Tambah jam atau pilih tanggal lain.`);
  };
  const move = (id: string, day: string, want?: string) => {
    const d = drafts.find((x) => x.id === id);
    if (!d || (d.day === day && (!want || d.time === want))) return;
    if (today && day < today) return toast.error("Tanggal yang sudah lewat tidak bisa dipakai.");
    const time = freeSlot(d.channelId, day, drafts, want, id);
    if (!time) return toast.warning(`Jam tayang ${name(d.channelId)} di tanggal itu sudah penuh.`);
    setDrafts((list) => list.map((x) => (x.id === id ? { ...x, day, time } : x)));
  };
  const dropZone = (day: string, want?: string) => {
    const k = want ? `${day}|${want}` : day;
    const past = !!today && day < today;
    const on = {
      onDragOver: (e: React.DragEvent) => {
        if (past) return;
        e.preventDefault();
        e.stopPropagation();
        if (over !== k) setOver(k);
      },
      onDragLeave: () => over === k && setOver(null),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(null);
        try {
          const p = JSON.parse(e.dataTransfer.getData("text/plain")) as { kind: "video"; rel: string; title: string } | { kind: "draft"; id: string };
          if (p.kind === "video") place(p.rel, p.title, day, want);
          else move(p.id, day, want);
        } catch {}
      },
    };
    return { on, active: over === k, past };
  };
  /** Spread the videos not planned yet over the next days: one a day per picked account. */
  const autoFill = (days = 7) => {
    if (!picked.length) return toast.error("Pilih minimal satu akun dulu.");
    const queue = shown.filter((v) => !planned.has(v.rel));
    if (!queue.length) return toast.info("Semua video di daftar ini sudah punya jadwal.");
    const next = [...drafts];
    let placed = 0;
    for (let i = 0; i < days && queue.length; i++) {
      const day = dayKey(addDays(new Date(), i));
      const v = queue.shift()!;
      for (const channelId of picked) {
        const time = freeSlot(channelId, day, next);
        if (!time) continue;
        next.push({ id: uid(), rel: v.rel, title: v.title, channelId, day, time });
        placed++;
      }
    }
    setDrafts(next);
    toast.success(`${placed} draf dibuat untuk ${days} hari ke depan`);
  };

  // ---- drafts -> real upload jobs ----
  const draftPlatforms = new Set(drafts.map((d) => acc(d.channelId)?.platform));
  const hasYt = draftPlatforms.has("youtube");
  const hasOther = [...draftPlatforms].some((p) => p !== "youtube");
  const queue = () =>
    startQueue(async () => {
      try {
        const r = await queuePlan({ yt, caption, ownCaption, drafts: drafts.map((d) => ({ id: d.id, rel: d.rel, channelId: d.channelId, at: atOf(d) })) });
        setDrafts((list) => list.filter((d) => !r.queued.includes(d.id)));
        if (r.queued.length) toast.success(`${r.queued.length} video masuk antrean upload. Aplikasi harus terbuka di jam tayangnya.`);
        if (r.failed.length) toast.error(`${r.failed.length} draf tetap di kalender: ${[...new Set(r.failed.map((f) => f.error))].join("; ")}`);
        setQueueOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    });

  // ---- content list ----
  const planned = new Set([...drafts.map((d) => d.rel), ...jobs.filter((j) => j.status !== "cancelled" && j.status !== "failed").map((j) => j.video)]); // ponytail: cheap, no memo
  const shown = videos.filter((v) => (!q.trim() || v.title.toLowerCase().includes(q.trim().toLowerCase())) && (!onlyFree || !planned.has(v.rel)));

  // ---- the shown range ----
  const base = cursor ?? new Date(2000, 0, 1);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday(base), i));
  const monthWeeks = (() => {
    const first = new Date(base.getFullYear(), base.getMonth(), 1);
    const start = monday(first);
    const out: Date[][] = [];
    for (let w = 0; w < 6; w++) {
      const row = Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i));
      if (w >= 4 && row[0].getMonth() !== base.getMonth()) break;
      out.push(row);
    }
    return out;
  })();
  const step = (n: number) => setCursor((c) => (view === "week" ? addDays(c ?? new Date(), n * 7) : new Date((c ?? new Date()).getFullYear(), (c ?? new Date()).getMonth() + n, 1)));
  const title = view === "week" ? `${SHORT.format(weekDays[0])} – ${SHORT.format(weekDays[6])} ${weekDays[6].getFullYear()}` : MONTH.format(base);
  const rangeKeys = new Set((view === "week" ? weekDays : monthWeeks.flat().filter((d) => d.getMonth() === base.getMonth())).map(dayKey));
  const inRange = [...items.entries()].filter(([k]) => rangeKeys.has(k)).flatMap(([, l]) => l);
  const counts = (Object.keys(STATUS) as (keyof typeof STATUS)[]).map((s) => [s, inRange.filter((it) => stateOf(it) === s).length] as const).filter(([, n]) => n);

  // hover card beside the still (right, or left near the window edge), clamped to the window
  const showCard = (it: Item, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const x = r.right + 10 + CARD_W > window.innerWidth ? r.left - 10 - CARD_W : r.right + 10;
    setHover({ it, x, y: Math.max(8, Math.min(r.top - 40, window.innerHeight - 560)) });
  };
  const hoverProps = (it: Item) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => showCard(it, e.currentTarget),
    onMouseLeave: () => setHover(null),
  });
  const dragProps = (it: Item) => ({
    draggable: !!it.draft,
    onDragStart: (e: React.DragEvent) => {
      setHover(null);
      if (!it.draft) return;
      e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "draft", id: it.draft.id }));
      e.dataTransfer.effectAllowed = "move";
    },
  });
  const play = (it: Item) => openLightbox([{ src: mediaUrl(it.rel), kind: "video", label: it.title }]);
  const badge = (it: Item, small?: boolean) => (
    <span className={`absolute right-0.5 bottom-0.5 left-0.5 flex items-center gap-0.5 rounded bg-black/65 px-0.5 py-px ${small ? "" : "text-[10px]"}`}>
      <i className="size-1.5 shrink-0 rounded-full" style={{ background: accountColor(it.channelId) }} />
      <PlatformIcon platform={acc(it.channelId)?.platform ?? "tiktok"} className="size-2.5 shrink-0" />
      <span className={`truncate font-medium text-white tabular-nums ${small ? "text-[9px]" : ""}`}>{dot(it.time)}</span>
    </span>
  );

  /** A planned video: its still, hour, account; drafts can be dragged, re-timed and removed; click plays it. */
  const card = (it: Item, big?: boolean) => {
    const s = STATUS[stateOf(it)];
    return !big ? (
      <button
        key={it.key}
        type="button"
        {...dragProps(it)}
        {...hoverProps(it)}
        onClick={() => play(it)}
        aria-label={`${it.title}, ${name(it.channelId)} ${dot(it.time)}`}
        className={`relative overflow-hidden rounded ring-2 ring-offset-1 ring-offset-card transition-transform duration-150 hover:z-10 hover:scale-105 ${it.draft ? "cursor-grab opacity-80" : ""} ${s.ring} ${it.job?.status === "cancelled" ? "opacity-40 grayscale" : ""}`}
      >
        <Thumb rel={it.rel} className="aspect-[9/16] w-full rounded-none" />
        {badge(it, true)}
        {it.job?.status === "failed" && <AlertTriangle className="absolute top-0.5 right-0.5 size-3 text-destructive drop-shadow" />}
      </button>
    ) : (
      <div
        key={it.key}
        {...dragProps(it)}
        {...hoverProps(it)}
        className={`group relative flex items-center gap-1.5 overflow-hidden rounded-md border bg-background p-1 ${it.draft ? "cursor-grab border-dashed" : "bg-muted/50"}`}
        style={{ borderColor: accountColor(it.channelId) }}
      >
        <button type="button" onClick={() => play(it)} aria-label={`Putar ${it.title}`} className={`relative shrink-0 rounded ring-2 ${s.ring}`}>
          <Thumb rel={it.rel} className="h-16 w-9" />
        </button>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1 text-[10px]">
            <PlatformIcon platform={acc(it.channelId)?.platform ?? "tiktok"} className="size-3 shrink-0" />
            {it.draft ? (
              <select
                value={it.time}
                onChange={(e) => setDrafts((list) => list.map((y) => (y.id === it.draft!.id ? { ...y, time: e.target.value } : y)))}
                aria-label="Jam tayang"
                className="bg-transparent font-medium tabular-nums outline-none"
              >
                {[...new Set([...sortedSlots, it.time])].sort().map((t) => <option key={t} value={t}>{dot(t)}</option>)}
              </select>
            ) : (
              <span className="font-medium tabular-nums">{dot(it.time)}</span>
            )}
            <span className={`ml-auto rounded px-1 text-[9px] font-semibold ${s.badge}`}>{s.label}</span>
          </div>
          <p className="line-clamp-2 text-[11px]">{it.title}</p>
          <p className="truncate text-[10px] text-muted-foreground">{name(it.channelId)}</p>
        </div>
        {it.draft && (
          <button type="button" onClick={() => setDrafts((list) => list.filter((y) => y.id !== it.draft!.id))} aria-label="Hapus draf" className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded bg-background/90 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive">
            <X className="size-3" />
          </button>
        )}
      </div>
    );
  };

  // full window under the header, like the Editor: accounts · videos · calendar
  const shell = "fixed inset-x-0 top-[calc(var(--titlebar-height)+var(--header-height))] bottom-(--statusbar-height) z-40 flex flex-col bg-sidebar";
  const back = (
    <Link href="/beranda" className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
      <ArrowLeft className="size-4" /> Kembali
    </Link>
  );
  if (!accounts.length)
    return (
      <div className={shell}>
        <div className="p-3">{back}</div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <CalendarClock className="size-7 text-muted-foreground" />
          <p className="text-sm font-medium">Belum ada akun</p>
          <p className="max-w-sm text-xs text-muted-foreground">Hubungkan akun TikTok, YouTube, Instagram, atau Facebook dulu di Akun Sosial, lalu kembali ke sini untuk menyusun jadwal.</p>
        </div>
      </div>
    );

  // accounts grouped by platform; a group header picks or drops the whole platform
  const groups = (["tiktok", "youtube", "instagram", "facebook"] as Platform[]).map((p) => [p, accounts.filter((a) => a.platform === p)] as const).filter(([, l]) => l.length);
  const toggle = (ids: number[], on: boolean) => setPicked((p) => (on ? [...new Set([...p, ...ids])] : p.filter((x) => !ids.includes(x))));
  const allPicked = picked.length === accounts.length;

  return (
    <div className={shell}>
      {/* ── toolbar ─────────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        {back}
        <div className="h-5 w-px bg-border" />
        <span className="flex items-center gap-1.5 px-1 text-[13px] font-semibold"><CalendarClock className="size-4 text-[#7b86f0]" /> Kalender Upload</span>
        <span className="hidden text-xs text-muted-foreground md:inline">Pilih akun di kiri, lalu tarik video ke tanggal atau jam.</span>
        <div className="ml-auto flex items-center gap-1">
          <Link href="/jadwal?tampilan=daftar" className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium hover:bg-accent">
            <ListChecks className="size-3.5" /> Daftar & riwayat
          </Link>
          <div className="mx-1 h-5 w-px bg-border" />
          <span className={`px-1.5 text-xs ${drafts.length ? "" : "text-muted-foreground"}`}>
            {drafts.length ? <><b className="tabular-nums">{drafts.length}</b> draf</> : "Belum ada draf"}
          </span>
          {drafts.length > 0 && (
            <button
              type="button"
              onClick={async () => (await confirmDialog({ title: `Hapus ${drafts.length} draf?`, description: "Hanya draf di kalender ini; jadwal yang sudah di antrean tidak tersentuh.", danger: true })) && setDrafts([])}
              aria-label="Hapus semua draf"
              title="Hapus semua draf"
              className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            disabled={!drafts.length}
            onClick={() => {
              setLateDrafts(drafts.filter((d) => atOf(d) < Date.now() + 5 * 60_000).length);
              setQueueOpen(true);
            }}
            title={drafts.length ? "Ubah semua draf jadi jadwal upload" : "Tarik video ke kalender dulu"}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            <Upload className="size-3.5" /> Masukkan ke antrean
          </button>
        </div>
      </div>

      <Dialog open={queueOpen} onOpenChange={(o) => !queuing && setQueueOpen(o)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Masukkan {drafts.length} draf ke antrean</DialogTitle>
            <DialogDescription>
              {[...new Set(drafts.map((d) => d.channelId))].map(name).join(", ")}. Tiap video diunggah di jam tayangnya, jadi aplikasi harus terbuka saat itu. <code>{"{judul}"}</code> diganti judul tiap video.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 text-xs">
            {hasOther && (
              <fieldset className="grid gap-2">
                <legend className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold">
                  <PlatformIcon platform="tiktok" className="size-3.5" /><PlatformIcon platform="instagram" className="size-3.5" /><PlatformIcon platform="facebook" className="size-3.5" /> Caption
                </legend>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={ownCaption} onChange={(e) => setOwnCaption(e.target.checked)} className="accent-primary" /> Pakai caption bawaan video proyek (kalau ada)</label>
                <textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} rows={3} placeholder="Caption & hashtag" className="resize-none rounded-md border bg-background px-2 py-1.5" />
                <p className="text-[11px] text-muted-foreground">Produk keranjang TikTok ikut tertaut kalau produk proyeknya ada di etalase akun itu.</p>
              </fieldset>
            )}
            {hasYt && (
              <fieldset className="grid gap-2">
                <legend className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold"><PlatformIcon platform="youtube" className="size-3.5" /> YouTube</legend>
                <label className="grid gap-1">
                  <span className="font-medium">Judul</span>
                  <input value={yt.title} onChange={(e) => setYt({ ...yt, title: e.target.value })} maxLength={200} className="h-8 rounded-md border bg-background px-2" />
                </label>
                <label className="grid gap-1">
                  <span className="font-medium">Deskripsi</span>
                  <textarea value={yt.description} onChange={(e) => setYt({ ...yt, description: e.target.value })} maxLength={2200} rows={3} className="resize-none rounded-md border bg-background px-2 py-1.5" />
                </label>
                <label className="grid gap-1">
                  <span className="font-medium">Tag <span className="font-normal text-muted-foreground">(pisahkan dengan koma)</span></span>
                  <input value={yt.tags} onChange={(e) => setYt({ ...yt, tags: e.target.value })} className="h-8 rounded-md border bg-background px-2" />
                </label>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="flex items-center gap-1.5">
                    Visibilitas
                    <select value={yt.visibility} onChange={(e) => setYt({ ...yt, visibility: e.target.value as YouTubeUploadDefaults["visibility"] })} className="h-7 rounded-md border bg-background px-1.5">
                      <option value="public">Publik</option>
                      <option value="unlisted">Tidak publik</option>
                      <option value="private">Pribadi</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={yt.madeForKids} onChange={(e) => setYt({ ...yt, madeForKids: e.target.checked })} className="accent-primary" /> Untuk anak-anak</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={yt.aiContent} onChange={(e) => setYt({ ...yt, aiContent: e.target.checked })} className="accent-primary" /> Konten AI</label>
                </div>
              </fieldset>
            )}
            {lateDrafts > 0 && (
              <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-amber-600 dark:text-amber-400">{lateDrafts} draf jamnya sudah lewat: draf itu tetap di kalender, geser dulu ke jam lain.</p>
            )}
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setQueueOpen(false)} disabled={queuing} className="h-8 rounded-lg border px-3 text-xs hover:bg-accent">Batal</button>
            <button type="button" onClick={queue} disabled={queuing || (hasYt && !yt.title.trim())} className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              <Upload className="size-3.5" /> {queuing ? "Memasukkan..." : "Masukkan ke antrean"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid min-h-0 flex-1 grid-cols-[232px_288px_minmax(0,1fr)]">
        {/* ── accounts ────────────────────────────────────────────────────────────────────────── */}
        <aside className="flex min-h-0 flex-col border-r">
          <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
            <p className="text-[13px] font-semibold">Posting ke <span className="font-normal text-muted-foreground tabular-nums">{picked.length}/{accounts.length}</span></p>
            <button type="button" onClick={() => setPicked(allPicked ? [] : accounts.map((a) => a.id))} className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground">
              {allPicked ? "Kosongkan" : "Pilih semua"}
            </button>
          </div>
          <div className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-2 pb-3">
            {groups.map(([p, list]) => {
              const ids = list.map((a) => a.id);
              const allOn = ids.every((id) => picked.includes(id));
              return (
                <div key={p}>
                  <button type="button" onClick={() => toggle(ids, !allOn)} title={allOn ? `Lepas semua akun ${SITE[p]}` : `Pilih semua akun ${SITE[p]}`} className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground">
                    <PlatformIcon platform={p} className="size-3.5" /> {SITE[p]}
                    <span className="font-normal tabular-nums">{ids.filter((id) => picked.includes(id)).length}/{ids.length}</span>
                    <span className="ml-auto font-normal">{allOn ? "Lepas" : "Semua"}</span>
                  </button>
                  <div className="mt-0.5 space-y-1">
                    {list.map((a) => {
                      const on = picked.includes(a.id);
                      const color = accountColor(a.id);
                      const n = drafts.filter((d) => d.channelId === a.id).length;
                      const qn = jobs.filter((j) => j.accountId === a.id && j.status === "queued").length;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => toggle([a.id], !on)}
                          aria-pressed={on}
                          className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${on ? "bg-card" : "border-transparent hover:bg-accent/60"} ${a.active ? "" : "opacity-50"}`}
                          style={on ? { borderColor: `${color}80`, boxShadow: `inset 3px 0 0 ${color}` } : undefined}
                        >
                          {a.avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element -- remote account avatar
                            <img src={a.avatar} alt="" className={`size-7 shrink-0 rounded-md ${on ? "" : "opacity-60 grayscale"}`} />
                          ) : (
                            <span className="grid size-7 shrink-0 place-items-center rounded-md text-xs font-semibold text-white" style={{ background: color }}>{a.name.replace("@", "").slice(0, 1).toUpperCase()}</span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-xs font-medium ${on ? "" : "text-muted-foreground"}`}>{a.name}</span>
                            <span className="block truncate text-[10px] text-muted-foreground">{!a.active ? "Perlu login ulang" : [n ? `${n} draf` : "", qn ? `${qn} antre` : ""].filter(Boolean).join(" · ") || "Belum ada jadwal"}</span>
                          </span>
                          <span className={`grid size-4 shrink-0 place-items-center rounded border ${on ? "border-transparent text-white" : "border-muted-foreground/40"}`} style={on ? { background: color } : undefined}>
                            {on && <Check className="size-3" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* ── videos: one list (project exports and Editor renders) ───────────────────────────── */}
        <section className="flex min-h-0 flex-col gap-2 border-r p-2.5">
          <div className="flex items-center justify-between px-0.5">
            <p className="text-[13px] font-semibold">Video <span className="font-normal text-muted-foreground tabular-nums">{shown.length}</span></p>
            <button type="button" onClick={() => autoFill(7)} className="flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium hover:bg-accent" title="Satu video per hari untuk tiap akun terpilih, 7 hari ke depan">
              <Sparkles className="size-3.5 text-primary" /> Isi 7 hari
            </button>
          </div>
          <label className="flex h-8 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-xs">
            <Search className="size-3.5 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari video…" aria-label="Cari video" className="min-w-0 flex-1 bg-transparent outline-none" />
          </label>
          <label className="flex items-center gap-1.5 px-0.5 text-xs text-muted-foreground"><input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} className="accent-primary" /> Hanya yang belum dijadwalkan</label>
          <div className="no-scrollbar -mx-1 grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-1.5 overflow-y-auto px-1 pb-1">
            {shown.map((v) => (
              <div
                key={v.rel}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "video", rel: v.rel, title: v.title }));
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className="group relative cursor-grab overflow-hidden rounded-lg border bg-black hover:ring-2 hover:ring-primary/60 active:cursor-grabbing"
                title={v.title}
              >
                <Thumb rel={v.rel} className="aspect-[9/16] w-full" />
                <span className="pointer-events-none absolute top-1 left-1 rounded bg-black/65 px-1 text-[9px] font-medium text-white">{v.group === "editor" ? "Editor" : "Proyek"}</span>
                <span className="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/90 to-transparent p-1 pt-5 text-[10px] leading-tight text-white">{v.title}</span>
                {planned.has(v.rel) && <span className="pointer-events-none absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground"><CalendarClock className="size-3" /></span>}
              </div>
            ))}
            {!shown.length && (
              <p className="col-span-2 flex flex-col items-center gap-1 p-4 text-center text-xs text-muted-foreground"><Film className="size-5" /> {onlyFree ? "Semua video sudah punya jadwal." : "Belum ada video."}</p>
            )}
          </div>
        </section>

        {/* ── calendar ────────────────────────────────────────────────────────────────────────── */}
        <section className="@container flex min-h-0 flex-col overflow-hidden bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
            <button type="button" onClick={() => step(-1)} aria-label="Sebelumnya" className="grid size-8 place-items-center rounded-md border hover:bg-accent"><ChevronLeft className="size-4" /></button>
            <h2 className="min-w-44 text-center text-sm font-semibold capitalize">{cursor ? title : "…"}</h2>
            <button type="button" onClick={() => step(1)} aria-label="Berikutnya" className="grid size-8 place-items-center rounded-md border hover:bg-accent"><ChevronRight className="size-4" /></button>
            <button type="button" onClick={() => setCursor(new Date())} className="h-8 rounded-md border px-2.5 text-xs hover:bg-accent">Hari ini</button>
            <div className="ml-2 grid grid-cols-2 gap-0.5 rounded-lg bg-muted p-0.5 text-xs font-medium">
              {([["week", "Minggu", CalendarRange], ["month", "Bulan", CalendarDays]] as const).map(([v, label, Icon]) => (
                <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={`flex h-7 items-center gap-1 rounded-md px-2.5 ${view === v ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>
            <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 pl-1 text-[11px] text-muted-foreground @[1000px]:flex">
              {counts.map(([s, n]) => (
                <span key={s} className="flex items-center gap-1">
                  <i className={`size-2 rounded-full ${STATUS[s].badge.split(" ")[0]}`} /> {STATUS[s].label} <b className="font-semibold text-foreground tabular-nums">{n}</b>
                </span>
              ))}
            </div>
            <div className="ml-auto" />
            <Popover.Root>
              <Popover.Trigger className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs hover:bg-accent data-[popup-open]:bg-accent">
                <Clock className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Jam tayang</span>
                <span className="font-medium tabular-nums">{sortedSlots.slice(0, 4).map(dot).join(" · ")}{sortedSlots.length > 4 ? ` +${sortedSlots.length - 4}` : ""}</span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner sideOffset={6} align="end" className="isolate z-50 outline-none">
                  <Popover.Popup className="w-64 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg outline-none">
                    <p className="text-sm font-medium">Jam tayang</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Video yang ditarik ke sebuah tanggal memakai jam kosong pertama di daftar ini, untuk tiap akun.</p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {sortedSlots.map((t) => (
                        <span key={t} className="flex h-7 items-center gap-1 rounded-md bg-muted pr-1 pl-2 text-xs font-medium tabular-nums">
                          {dot(t)}
                          <button type="button" disabled={slots.length < 2} onClick={() => setSlots((s) => s.filter((x) => x !== t))} aria-label={`Hapus jam ${dot(t)}`} className="grid size-5 place-items-center rounded text-muted-foreground hover:text-destructive disabled:opacity-30">
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <form
                      className="mt-2.5 flex items-center gap-1.5 border-t pt-2.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!newSlot) return;
                        if (slots.includes(newSlot)) return toast.info(`Jam ${dot(newSlot)} sudah ada.`);
                        setSlots((s) => [...s, newSlot]);
                      }}
                    >
                      <input type="time" value={newSlot} onChange={(e) => setNewSlot(e.target.value)} aria-label="Jam baru" className="h-8 flex-1 rounded-md border bg-background px-2 text-xs" />
                      <button type="submit" className="flex h-8 items-center gap-1 rounded-md bg-foreground px-2.5 text-xs font-medium text-background hover:opacity-90"><Plus className="size-3.5" /> Tambah</button>
                    </form>
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          </div>

          {view === "week" ? (
            // week: a column per day, a row per upload hour (+ other hours); drop on an hour = that hour
            <div className="no-scrollbar min-h-0 flex-1 overflow-auto">
              <div className="grid min-w-[760px]" style={{ gridTemplateColumns: `64px repeat(7, minmax(0, 1fr))` }}>
                <div className="sticky top-0 z-10 border-b bg-card" />
                {weekDays.map((d) => {
                  const k = dayKey(d);
                  const z = dropZone(k);
                  return (
                    <div key={k} {...z.on} className={`sticky top-0 z-10 border-b border-l bg-card px-2 py-1.5 text-center ${z.past ? "opacity-50" : ""} ${z.active ? "bg-primary/10" : ""}`}>
                      <p className="text-[11px] text-muted-foreground">{DAYS[(d.getDay() + 6) % 7]}</p>
                      <p className={`mx-auto grid size-7 place-items-center rounded-full text-sm font-semibold tabular-nums ${k === today ? "bg-primary text-primary-foreground" : ""}`}>{d.getDate()}</p>
                    </div>
                  );
                })}
                {[...sortedSlots, "lain"].map((slot) => (
                  <div key={slot} className="contents">
                    <div className="border-b px-2 py-2 text-right text-[11px] font-medium tabular-nums text-muted-foreground">{slot === "lain" ? "Lainnya" : dot(slot)}</div>
                    {weekDays.map((d) => {
                      const k = dayKey(d);
                      const here = (items.get(k) ?? []).filter((it) => (slot === "lain" ? !sortedSlots.includes(it.time) : it.time === slot));
                      const z = dropZone(k, slot === "lain" ? undefined : slot);
                      return (
                        <div key={k} {...z.on} className={`min-h-24 space-y-1 border-b border-l p-1 transition-colors ${z.past ? "bg-muted/30" : ""} ${z.active ? "bg-primary/10 ring-2 ring-primary/50 ring-inset" : ""}`}>
                          {here.map((it) => card(it, true))}
                          {!here.length && !z.past && slot !== "lain" && <p className="grid h-full min-h-20 place-items-center text-[10px] text-muted-foreground/40">Tarik ke sini</p>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // month: compact; each day shows its videos as stills (columns follow the cell's width)
            <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-auto">
              <div className="grid grid-cols-7 border-b text-center text-[11px] font-medium text-muted-foreground">
                {DAYS.map((d) => <div key={d} className="py-1.5">{d}</div>)}
              </div>
              <div className="grid auto-rows-[minmax(96px,auto)] grid-cols-7">
                {monthWeeks.flat().map((d) => {
                  const k = dayKey(d);
                  const inMonth = d.getMonth() === base.getMonth();
                  const here = items.get(k) ?? [];
                  const z = dropZone(k);
                  return (
                    <div key={k} {...z.on} className={`@container flex flex-col gap-1 border-r border-b p-1.5 [&:nth-child(7n)]:border-r-0 ${inMonth ? "" : "bg-muted/30"} ${z.past ? "opacity-60" : ""} ${z.active ? "bg-primary/10 ring-2 ring-primary/50 ring-inset" : ""}`}>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className={`grid size-6 place-items-center rounded-full tabular-nums ${k === today ? "bg-primary font-semibold text-primary-foreground" : inMonth ? "" : "text-muted-foreground"}`}>{d.getDate()}</span>
                        {here.length > 0 && <span className="text-muted-foreground tabular-nums">{here.length} video</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 p-0.5 @[150px]:grid-cols-3 @[240px]:grid-cols-4">
                        {here.slice(0, 6).map((it) => card(it))}
                      </div>
                      {here.length > 6 && (
                        <button type="button" onClick={() => (setCursor(d), setView("week"))} className="text-left text-[10px] text-muted-foreground hover:text-foreground">+{here.length - 6} lagi · buka minggu ini</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {hover && <Preview key={hover.it.key} h={hover} account={acc(hover.it.channelId)} />}
    </div>
  );
}

/** The hover card: the video playing, then everything about the upload or draft. */
function Preview({ h, account }: { h: Hover; account?: Account }) {
  const { it } = h;
  const j = it.job;
  const s = STATUS[stateOf(it)];
  return (
    <div
      style={{ left: h.x, top: h.y, width: CARD_W }}
      className="pointer-events-none fixed z-50 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl duration-200 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2"
    >
      <div className="relative bg-black">
        <video src={mediaUrl(it.rel)} autoPlay muted loop playsInline className="mx-auto aspect-[9/16] max-h-80 object-contain" />
        <span className={`absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.badge}`}>{s.label}</span>
      </div>
      <div className="space-y-1.5 p-3 text-xs">
        <p className="line-clamp-2 text-[13px] leading-snug font-semibold">{it.title}</p>
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <i className="size-2 shrink-0 rounded-full" style={{ background: accountColor(it.channelId) }} />
          <PlatformIcon platform={account?.platform ?? "tiktok"} className="size-3.5 shrink-0" />
          <span className="truncate">{account ? `${SITE[account.platform]} · ${account.name}` : "Akun dihapus"}</span>
        </p>
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="size-3.5 shrink-0" />
          {j?.status === "done" && j.postedAt ? `Terposting ${FULL.format(j.postedAt)}` : `${it.draft ? "Rencana" : "Jadwal"} ${FULL.format(atOf(it))}`}
          {j?.views != null && <span className="ml-auto flex items-center gap-0.5"><Eye className="size-3.5" />{j.views.toLocaleString("id-ID")}</span>}
        </p>
        {j?.caption && j.caption.split("\n")[0] !== it.title && <p className="line-clamp-3 whitespace-pre-line text-muted-foreground">{j.caption}</p>}
        {it.draft && <p className="text-muted-foreground">Belum di antrean: tekan &quot;Masukkan ke antrean&quot; untuk menjadwalkannya.</p>}
        {j?.status === "uploading" && j.progress && <p className="text-amber-600 dark:text-amber-400">{j.progress}</p>}
        {j?.status === "failed" && j.error && <p className="line-clamp-3 text-destructive">{j.error}</p>}
      </div>
    </div>
  );
}
