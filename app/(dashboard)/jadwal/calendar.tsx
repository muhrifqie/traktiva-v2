"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, CalendarClock, CalendarDays, CalendarRange, Check, ChevronDown, ChevronLeft, ChevronRight, CircleQuestionMark, Clock, Eye, Film, ListChecks,
  LoaderCircle, PencilLine, Plus, Rows3, Search, Trash2, Upload, WandSparkles, X, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Popover } from "@base-ui/react/popover";
import { confirmDialog } from "@/components/confirm-dialog";
import { openLightbox } from "@/components/media-lightbox";
import { PlatformIcon } from "@/components/platform-icon";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { accountColor } from "@/lib/account-color";
import { mediaUrl } from "@/lib/media-url";
import type { YouTubeUploadDefaults } from "@/lib/settings";
import { queuePlan, saveDrafts } from "./actions";

// Kalender Upload: one planner for every account (TikTok, YouTube, Instagram, Facebook), filling the window like the
// Editor: accounts · videos · calendar. Drag a video onto a day or hour: every picked account gets it there (or at its
// next free upload hour). Drafts are saved in the DB until "Masukkan ke antrean" turns them into upload jobs.
// One meaning per colour: the frame of a still is its ACCOUNT's colour (same as the left column), the small corner icon
// is its STATUS, a dashed frame is a draft. Hovering a still opens a card with the video playing and every detail.

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
export type Draft = { id: string; rel: string; title: string; channelId: number; day: string; time: string };
type View = "week" | "month" | "akun";
type Saved = { drafts?: Draft[]; slots: string[]; picked: number[]; view: View };
/** One thing on the calendar: a draft (editable) or an upload job (read-only). */
type Item = { key: string; rel: string; title: string; channelId: number; day: string; time: string; draft?: Draft; job?: CalJob };
type State = CalJob["status"] | "draft";

const KEY = "trk-kalender"; // per-browser conveniences (hours, picked accounts, view); drafts moved to the DB
const OLD_KEY = "trk-yt-kalender";
const GUIDE_KEY = "trk-kalender-guide";
const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const MONTH = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" });
const SHORT = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" });
const FULL = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const DEFAULT_SLOTS = ["10:00", "16:00", "19:00"];
const PLATFORMS: Platform[] = ["tiktok", "youtube", "instagram", "facebook"];
const SITE: Record<Platform, string> = { tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", shopee: "Shopee" };
const STATUS: Record<State, { label: string; icon: LucideIcon; cls: string; spin?: boolean; hint: string }> = {
  draft: { label: "Draf", icon: PencilLine, cls: "bg-foreground text-background", hint: "Rencana, belum di antrean. Bingkai putus-putus, bisa digeser atau dihapus." },
  queued: { label: "Antre", icon: Clock, cls: "bg-[#5e6ad2] text-white", hint: "Sudah di antrean, diunggah otomatis di jamnya." },
  uploading: { label: "Mengunggah", icon: LoaderCircle, cls: "bg-amber-500 text-black", spin: true, hint: "Sedang diunggah sekarang." },
  done: { label: "Terposting", icon: Check, cls: "bg-status-ok text-white", hint: "Sudah tayang." },
  failed: { label: "Gagal", icon: AlertTriangle, cls: "bg-destructive text-white", hint: "Gagal; buka Daftar & riwayat untuk mengulang." },
  cancelled: { label: "Dibatalkan", icon: X, cls: "bg-muted text-muted-foreground", hint: "Dibatalkan." },
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
const stateOf = (it: Item): State => (it.draft ? "draft" : it.job!.status);

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

/** Status as a small round icon (the same everywhere: stills, legend, guide). */
function StatusDot({ s, className = "size-3.5" }: { s: State; className?: string }) {
  const S = STATUS[s];
  const Icon = S.icon;
  return (
    <span className={`grid shrink-0 place-items-center rounded-full ${S.cls} ${className}`}>
      <Icon className={`size-[70%] ${S.spin ? "animate-spin" : ""}`} strokeWidth={3} />
    </span>
  );
}

type Hover = { it: Item; x: number; y: number };
const CARD_W = 272;

export function JadwalCalendar({ accounts, videos, jobs, ytDefaults, initialDrafts, best }: { accounts: Account[]; videos: Video[]; jobs: CalJob[]; ytDefaults: YouTubeUploadDefaults; initialDrafts: Draft[]; best: Record<number, number[]> }) {
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
  const [drafts, setDrafts] = useState<Draft[]>(initialDrafts.filter((d) => accounts.some((a) => a.id === d.channelId)));
  const [q, setQ] = useState("");
  const [onlyFree, setOnlyFree] = useState(true);
  const [over, setOver] = useState<string | null>(null); // drop target being dragged over
  const [newSlot, setNewSlot] = useState("21:00");
  const [hover, setHover] = useState<Hover | null>(null);
  const [focus, setFocus] = useState<number | null>(null); // account hovered in the left column: its uploads stand out
  const [guideOpen, setGuideOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [plan, setPlan] = useState({ start: "", days: 7, perDay: 1, hours: "best" as "best" | "slots", same: true });
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
          // drafts from before they lived in the DB: bring them over once
          if (s.drafts?.length && !initialDrafts.length) setDrafts(s.drafts.filter((d) => accounts.some((a) => a.id === d.channelId)));
          if (s.picked?.length) setPicked(s.picked.filter((id) => accounts.some((a) => a.id === id)));
          if (s.view) setView(s.view);
        }
        if (!localStorage.getItem(GUIDE_KEY)) {
          setGuideOpen(true); // first visit: the guide explains the page once
          localStorage.setItem(GUIDE_KEY, "1");
        }
      } catch {}
      loaded.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, [accounts, initialDrafts]);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ slots, picked, view } satisfies Saved));
      localStorage.removeItem(OLD_KEY);
    } catch {}
  }, [slots, picked, view]);
  // drafts go to the DB shortly after every change
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => void saveDrafts(drafts).catch((e) => toast.error(`Draf gagal disimpan: ${e instanceof Error ? e.message : e}`)), 500);
    return () => clearTimeout(t);
  }, [drafts]);

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
  /** The hour for the account that day: `want` when free, else the first free hour of `hours` (not in the past today). */
  const freeSlot = (channelId: number, day: string, list: Draft[], want?: string, skip?: string, hours = sortedSlots) => {
    const taken = new Set([
      ...(items.get(day) ?? []).filter((x) => x.job && x.job.status !== "failed" && x.channelId === channelId).map((x) => x.time),
      ...list.filter((d) => d.day === day && d.channelId === channelId && d.id !== skip).map((d) => d.time),
    ]);
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes() + 30;
    const ok = (t: string) => !taken.has(t) && (day !== today || Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) > nowMin);
    if (want && ok(want)) return want;
    return hours.find(ok) ?? null;
  };
  const place = (rel: string, title: string, day: string, want?: string, only?: number) => {
    const targets = only ? [only] : picked;
    if (!targets.length) return toast.error("Pilih minimal satu akun di kolom kiri dulu.");
    if (today && day < today) return toast.error("Tanggal yang sudah lewat tidak bisa dipakai.");
    const next = [...drafts];
    const full: string[] = [];
    for (const channelId of targets) {
      const time = freeSlot(channelId, day, next, want);
      if (!time) full.push(name(channelId));
      else next.push({ id: uid(), rel, title, channelId, day, time });
    }
    setDrafts(next);
    if (full.length) toast.warning(`Jam tayang hari itu sudah penuh untuk ${full.join(", ")}. Tambah jam atau pilih tanggal lain.`);
  };
  const move = (id: string, day: string, want?: string, toAccount?: number) => {
    const d = drafts.find((x) => x.id === id);
    const channelId = toAccount ?? d?.channelId;
    if (!d || !channelId || (d.day === day && d.channelId === channelId && (!want || d.time === want))) return;
    if (today && day < today) return toast.error("Tanggal yang sudah lewat tidak bisa dipakai.");
    const time = freeSlot(channelId, day, drafts, want ?? (channelId !== d.channelId ? d.time : undefined), id);
    if (!time) return toast.warning(`Jam tayang ${name(channelId)} di tanggal itu sudah penuh.`);
    setDrafts((list) => list.map((x) => (x.id === id ? { ...x, day, time, channelId } : x)));
  };
  const dropZone = (day: string, want?: string, account?: number) => {
    const k = `${day}|${want ?? ""}|${account ?? ""}`;
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
          if (p.kind === "video") place(p.rel, p.title, day, want, account);
          else move(p.id, day, want, account);
        } catch {}
      },
    };
    return { on, active: over === k, past };
  };

  // ---- Susun otomatis: unplanned videos over the coming days, at each account's best hours (or the calendar's) ----
  const openPlan = () => {
    if (!picked.length) return toast.error("Pilih minimal satu akun di kolom kiri dulu.");
    setPlan((p) => ({ ...p, start: p.start && p.start >= today ? p.start : today }));
    setPlanOpen(true);
  };
  const hoursFor = (id: number) => (plan.hours === "best" && best[id]?.length ? [...best[id]].sort((a, b) => a - b).map((h) => `${pad(h)}:00`) : sortedSlots);
  const runPlan = () => {
    const pool = videos.filter((v) => !onlyFree || !planned.has(v.rel)); // same rule as the video list
    if (!pool.length) return toast.info("Semua video sudah punya jadwal. Matikan \"Hanya yang belum dijadwalkan\" kalau mau memakai ulang video.");
    const next = [...drafts];
    let placed = 0;
    const [y, m, d0] = plan.start.split("-").map(Number);
    outer: for (let i = 0; i < plan.days; i++) {
      const day = dayKey(new Date(y, m - 1, d0 + i));
      for (let n = 0; n < plan.perDay; n++) {
        const shared = plan.same ? pool.shift() : undefined;
        if (plan.same && !shared) break outer;
        for (const channelId of picked) {
          const v = shared ?? pool.shift();
          if (!v) break outer;
          const hours = hoursFor(channelId);
          const time = freeSlot(channelId, day, next, hours[n % hours.length], undefined, hours);
          if (!time) continue;
          next.push({ id: uid(), rel: v.rel, title: v.title, channelId, day, time });
          placed++;
        }
      }
    }
    setDrafts(next);
    setPlanOpen(false);
    if (placed) toast.success(`${placed} draf disusun. Cek dulu, lalu tekan "Masukkan ke antrean".`);
    else toast.warning("Tidak ada jam kosong di rentang itu. Tambah jam tayang atau pilih tanggal lain.");
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
  const step = (n: number) => setCursor((c) => (view !== "month" ? addDays(c ?? new Date(), n * 7) : new Date((c ?? new Date()).getFullYear(), (c ?? new Date()).getMonth() + n, 1)));
  const title = view !== "month" ? `${SHORT.format(weekDays[0])} – ${SHORT.format(weekDays[6])} ${weekDays[6].getFullYear()}` : MONTH.format(base);
  const rangeKeys = new Set((view !== "month" ? weekDays : monthWeeks.flat().filter((d) => d.getMonth() === base.getMonth())).map(dayKey));
  const inRange = [...items.entries()].filter(([k]) => rangeKeys.has(k)).flatMap(([, l]) => l);
  const counts = (Object.keys(STATUS) as State[]).map((s) => [s, inRange.filter((it) => stateOf(it) === s).length] as const).filter(([, n]) => n);

  // hover card beside the still (right, or left near the window edge), clamped to the window
  const showCard = (it: Item, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const x = r.right + 10 + CARD_W > window.innerWidth ? r.left - 10 - CARD_W : r.right + 10;
    setHover({ it, x, y: Math.max(8, Math.min(r.top - 40, window.innerHeight - 560)) });
  };
  const play = (it: Item) => openLightbox([{ src: mediaUrl(it.rel), kind: "video", label: it.title }]);

  /** A planned video as a still: frame = account colour (dashed = draft), corner icon = status; click plays it. */
  const card = (it: Item) => {
    const s = stateOf(it);
    const color = accountColor(it.channelId);
    const dim = focus !== null && it.channelId !== focus;
    return (
      <button
        key={it.key}
        type="button"
        draggable={!!it.draft}
        onDragStart={(e) => {
          setHover(null);
          if (!it.draft) return;
          e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "draft", id: it.draft.id }));
          e.dataTransfer.effectAllowed = "move";
        }}
        onMouseEnter={(e) => showCard(it, e.currentTarget)}
        onMouseLeave={() => setHover(null)}
        onClick={() => play(it)}
        aria-label={`${it.title}, ${name(it.channelId)} ${dot(it.time)}, ${STATUS[s].label}`}
        className={`group/still relative rounded transition-[transform,opacity] duration-150 hover:z-10 hover:scale-105 ${it.draft ? "cursor-grab outline-2 outline-offset-1 outline-dashed" : ""} ${s === "cancelled" ? "grayscale" : ""} ${dim ? "opacity-15" : ""}`}
        style={it.draft ? { outlineColor: color } : { boxShadow: `0 0 0 1px var(--card), 0 0 0 3px ${color}` }}
      >
        <Thumb rel={it.rel} className={`aspect-[9/16] w-full ${it.draft ? "opacity-75" : ""}`} />
        <StatusDot s={s} className="absolute -top-1 -left-1 size-3.5 ring-2 ring-card" />
        <span className="absolute bottom-0.5 left-0.5 grid size-3.5 place-items-center rounded bg-black/70"><PlatformIcon platform={acc(it.channelId)?.platform ?? "tiktok"} className="size-2.5" /></span>
        {it.draft && (
          <span
            role="button"
            aria-label="Hapus draf"
            onClick={(e) => {
              e.stopPropagation();
              setHover(null);
              setDrafts((list) => list.filter((y) => y.id !== it.draft!.id));
            }}
            className="absolute top-0 right-0 hidden size-4 place-items-center rounded-bl rounded-tr bg-black/75 text-white group-hover/still:grid hover:text-destructive"
          >
            <X className="size-3" />
          </span>
        )}
      </button>
    );
  };
  const stills = (list: Item[], min: number) => (
    <div className="grid content-start gap-2 p-1" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}>{list.map(card)}</div>
  );

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
  const groups = PLATFORMS.map((p) => [p, accounts.filter((a) => a.platform === p)] as const).filter(([, l]) => l.length);
  const ordered = groups.flatMap(([, l]) => l);
  const toggle = (ids: number[], on: boolean) => setPicked((p) => (on ? [...new Set([...p, ...ids])] : p.filter((x) => !ids.includes(x))));
  const allPicked = picked.length === accounts.length;
  const avatar = (a: Account, size: string, on = true) =>
    a.avatar ? (
      // eslint-disable-next-line @next/next/no-img-element -- remote account avatar
      <img src={a.avatar} alt="" className={`${size} shrink-0 rounded-md ${on ? "" : "opacity-60 grayscale"}`} />
    ) : (
      <span className={`grid ${size} shrink-0 place-items-center rounded-md text-xs font-semibold text-white`} style={{ background: accountColor(a.id) }}>{a.name.replace("@", "").slice(0, 1).toUpperCase()}</span>
    );
  // the 3 steps of the page; the current one is lit
  const stepNow = !picked.length ? 1 : !drafts.length ? 2 : 3;
  const STEPS = ["Pilih akun", "Tarik video ke kalender", "Masukkan ke antrean"];

  return (
    <div className={shell}>
      {/* ── toolbar: back · steps · list · guide · drafts ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        {back}
        <div className="h-5 w-px bg-border" />
        <span className="flex items-center gap-1.5 px-1 text-[13px] font-semibold"><CalendarClock className="size-4 text-[#7b86f0]" /> Kalender Upload</span>
        <ol className="hidden items-center gap-1 lg:flex" aria-label="Langkah">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < stepNow;
            const cur = n === stepNow;
            return (
              <li key={label} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground/50" />}
                <span className={`flex h-7 items-center gap-1.5 rounded-full px-2 text-xs ${cur ? "bg-primary/15 font-semibold text-foreground ring-1 ring-primary/40" : done ? "text-muted-foreground" : "text-muted-foreground/60"}`}>
                  <span className={`grid size-4 place-items-center rounded-full text-[10px] font-bold ${done ? "bg-status-ok text-white" : cur ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{done ? <Check className="size-3" strokeWidth={3} /> : n}</span>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setGuideOpen(true)} className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
            <CircleQuestionMark className="size-4" /> Panduan
          </button>
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
            className={`flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground ${stepNow === 3 ? "ring-2 ring-primary/40 ring-offset-2 ring-offset-sidebar" : ""}`}
          >
            <Upload className="size-3.5" /> Masukkan ke antrean
          </button>
        </div>
      </div>

      {/* ── dialog: drafts -> queue ─────────────────────────────────────────────────────────────── */}
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

      {/* ── dialog: Susun otomatis ──────────────────────────────────────────────────────────────── */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><WandSparkles className="size-4 text-primary" /> Susun otomatis</DialogTitle>
            <DialogDescription>Video yang belum punya jadwal dibagi ke {picked.length} akun terpilih. Hasilnya draf: cek dulu, baru masukkan ke antrean.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-xs">
            <div className="grid grid-cols-3 gap-2">
              <label className="grid gap-1">
                <span className="font-medium">Mulai</span>
                <input type="date" min={today} value={plan.start} onChange={(e) => setPlan({ ...plan, start: e.target.value })} className="h-8 rounded-md border bg-background px-2" />
              </label>
              <label className="grid gap-1">
                <span className="font-medium">Selama</span>
                <select value={plan.days} onChange={(e) => setPlan({ ...plan, days: Number(e.target.value) })} className="h-8 rounded-md border bg-background px-1.5">
                  {[3, 7, 14, 30].map((n) => <option key={n} value={n}>{n} hari</option>)}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="font-medium">Per akun/hari</span>
                <select value={plan.perDay} onChange={(e) => setPlan({ ...plan, perDay: Number(e.target.value) })} className="h-8 rounded-md border bg-background px-1.5">
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n} video</option>)}
                </select>
              </label>
            </div>
            <div className="grid gap-1.5">
              <span className="font-medium">Jam tayang</span>
              {([["best", "Jam terbaik tiap akun", "Dari jam postingan akun itu yang paling banyak ditonton; akun baru memakai jam ramai umum."], ["slots", "Jam tayang kalender", sortedSlots.map(dot).join(" · ")]] as const).map(([v, label, hint]) => (
                <label key={v} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 ${plan.hours === v ? "border-primary bg-primary/5" : "hover:bg-accent/50"}`}>
                  <input type="radio" checked={plan.hours === v} onChange={() => setPlan({ ...plan, hours: v })} className="mt-0.5 accent-primary" />
                  <span><b className="font-medium">{label}</b><br /><span className="text-muted-foreground">{hint}</span></span>
                </label>
              ))}
            </div>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={plan.same} onChange={(e) => setPlan({ ...plan, same: e.target.checked })} className="mt-0.5 accent-primary" />
              <span>Video yang sama untuk semua akun di hari itu<br /><span className="text-muted-foreground">Matikan supaya tiap akun dapat video berbeda (butuh lebih banyak video).</span></span>
            </label>
            <p className="rounded-md bg-muted px-2 py-1.5 text-muted-foreground">
              Video {onlyFree ? "belum terjadwal" : "dipakai"}: <b className="text-foreground tabular-nums">{videos.filter((v) => !onlyFree || !planned.has(v.rel)).length}</b> · Perkiraan draf: <b className="text-foreground tabular-nums">{plan.days * plan.perDay * picked.length}</b>. TikTok: maksimal 3 video/hari per akun.
            </p>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setPlanOpen(false)} className="h-8 rounded-lg border px-3 text-xs hover:bg-accent">Batal</button>
            <button type="button" onClick={runPlan} disabled={!plan.start} className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              <WandSparkles className="size-3.5" /> Susun
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── dialog: guide ───────────────────────────────────────────────────────────────────────── */}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CalendarClock className="size-4 text-[#7b86f0]" /> Panduan Kalender Upload</DialogTitle>
            <DialogDescription>Satu tempat untuk menjadwalkan video ke semua akun: TikTok, YouTube, Instagram, dan Facebook.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 text-xs leading-relaxed">
            <section>
              <h3 className="mb-2 text-[13px] font-semibold">Alurnya 3 langkah</h3>
              <ol className="grid gap-2 sm:grid-cols-3">
                {[
                  ["Pilih akun", "Centang akun di kolom kiri. Klik nama platform untuk memilih semua akun platform itu."],
                  ["Tarik video ke kalender", "Seret video dari kolom tengah ke tanggal atau baris jam. Tiap akun terpilih dapat satu draf. Atau pakai Susun otomatis."],
                  ["Masukkan ke antrean", "Atur caption/judul sekali untuk semua draf, lalu draf jadi jadwal upload sungguhan."],
                ].map(([t, d], i) => (
                  <li key={t} className="rounded-lg border bg-card p-2.5">
                    <span className="mb-1 grid size-5 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{i + 1}</span>
                    <b className="font-semibold">{t}</b>
                    <p className="mt-0.5 text-muted-foreground">{d}</p>
                  </li>
                ))}
              </ol>
            </section>
            <section className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 text-[13px] font-semibold">Arti tanda</h3>
                <ul className="grid gap-1.5">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 flex gap-1">{ordered.slice(0, 3).map((a) => <i key={a.id} className="size-3 rounded-sm" style={{ boxShadow: `0 0 0 2px ${accountColor(a.id)}` }} />)}</span>
                    <span><b>Warna bingkai = akun.</b> Sama dengan warna centang di kolom kiri.</span>
                  </li>
                  {(Object.keys(STATUS) as State[]).map((s) => (
                    <li key={s} className="flex items-start gap-2"><StatusDot s={s} className="mt-0.5 size-3.5" /><span><b>{STATUS[s].label}.</b> {STATUS[s].hint}</span></li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-[13px] font-semibold">Tampilan</h3>
                <ul className="grid gap-1.5 text-muted-foreground">
                  <li><b className="text-foreground">Minggu:</b> satu baris per jam tayang. Seret ke baris jam = video tayang di jam itu.</li>
                  <li><b className="text-foreground">Bulan:</b> sebulan penuh. Klik &quot;N video&quot; untuk membuka minggunya.</li>
                  <li><b className="text-foreground">Per akun:</b> satu baris per akun. Seret ke baris akun = khusus akun itu; draf bisa dipindah antar akun.</li>
                  <li><b className="text-foreground">Arahkan kursor</b> ke akun di kiri untuk menyorot jadwalnya, ke thumbnail untuk melihat detail dan memutar videonya.</li>
                </ul>
                <h3 className="mt-3 mb-2 text-[13px] font-semibold">Tips</h3>
                <ul className="grid list-disc gap-1 pl-4 text-muted-foreground">
                  <li>Atur jam di <b className="text-foreground">Jam tayang</b>; draf baru memakai jam kosong pertama.</li>
                  <li>Aplikasi harus terbuka di jam tayang supaya video terunggah.</li>
                  <li>TikTok: maksimal 3 video/hari per akun, jarak antar posting minimal 20 menit.</li>
                  <li>Draf tersimpan otomatis; yang gagal bisa diulang di <b className="text-foreground">Daftar & riwayat</b>.</li>
                </ul>
              </div>
            </section>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setGuideOpen(false)} className="h-8 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90">Mengerti</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid min-h-0 flex-1 grid-cols-[232px_288px_minmax(0,1fr)]">
        {/* ── ① accounts ──────────────────────────────────────────────────────────────────────── */}
        <aside className="flex min-h-0 flex-col border-r">
          <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold"><span className="grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">1</span> Posting ke <span className="font-normal text-muted-foreground tabular-nums">{picked.length}/{accounts.length}</span></p>
            <button type="button" onClick={() => setPicked(allPicked ? [] : accounts.map((a) => a.id))} className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground">
              {allPicked ? "Kosongkan" : "Pilih semua"}
            </button>
          </div>
          <div className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-2 pb-3" onMouseLeave={() => setFocus(null)}>
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
                      const mine = inRange.filter((it) => it.channelId === a.id);
                      const n = mine.filter((it) => it.draft).length;
                      const qn = mine.length - n;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => toggle([a.id], !on)}
                          onMouseEnter={() => setFocus(a.id)}
                          aria-pressed={on}
                          className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${on ? "bg-card" : "border-transparent hover:bg-accent/60"} ${a.active ? "" : "opacity-50"}`}
                          style={on ? { borderColor: `${color}80`, boxShadow: `inset 3px 0 0 ${color}` } : undefined}
                        >
                          {avatar(a, "size-7", on)}
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-xs font-medium ${on ? "" : "text-muted-foreground"}`}>{a.name}</span>
                            <span className="block truncate text-[10px] text-muted-foreground">{!a.active ? "Perlu login ulang" : [qn ? `${qn} jadwal` : "", n ? `${n} draf` : ""].filter(Boolean).join(" · ") || (view === "month" ? "Kosong bulan ini" : "Kosong minggu ini")}</span>
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
          <p className="border-t px-3 py-2 text-[10px] leading-snug text-muted-foreground">Arahkan kursor ke akun untuk menyorot jadwalnya di kalender.</p>
        </aside>

        {/* ── ② videos: one list (project exports and Editor renders) ─────────────────────────── */}
        <section className="flex min-h-0 flex-col gap-2 border-r p-2.5">
          <div className="flex items-center justify-between px-0.5">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold"><span className="grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">2</span> Video <span className="font-normal text-muted-foreground tabular-nums">{shown.length}</span></p>
            <button type="button" onClick={openPlan} className="flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium hover:bg-accent" title="Bagi video yang belum terjadwal ke akun terpilih secara otomatis">
              <WandSparkles className="size-3.5 text-primary" /> Susun otomatis
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
                title={`${v.title}\nSeret ke kalender`}
              >
                <Thumb rel={v.rel} className="aspect-[9/16] w-full" />
                <span className="pointer-events-none absolute top-1 left-1 rounded bg-black/65 px-1 text-[9px] font-medium text-white">{v.group === "editor" ? "Editor" : "Proyek"}</span>
                <span className="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/90 to-transparent p-1 pt-5 text-[10px] leading-tight text-white">{v.title}</span>
                {planned.has(v.rel) && <span className="pointer-events-none absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground" title="Sudah dijadwalkan"><CalendarClock className="size-3" /></span>}
              </div>
            ))}
            {!shown.length && (
              <div className="col-span-2 flex flex-col items-center gap-1.5 p-4 text-center text-xs text-muted-foreground">
                <Film className="size-5" />
                {!videos.length ? (
                  <>Belum ada video. Ekspor proyek atau render di Editor dulu.</>
                ) : q.trim() ? (
                  <>Tidak ada video yang cocok dengan &quot;{q.trim()}&quot;.</>
                ) : (
                  <>
                    Semua {videos.length} video sudah dijadwalkan.
                    <button type="button" onClick={() => setOnlyFree(false)} className="mt-1 rounded-md border px-2 py-1 font-medium text-foreground hover:bg-accent">Tampilkan semua video</button>
                  </>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── ③ calendar ──────────────────────────────────────────────────────────────────────── */}
        <section className="@container flex min-h-0 flex-col overflow-hidden bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
            <button type="button" onClick={() => step(-1)} aria-label="Sebelumnya" className="grid size-8 place-items-center rounded-md border hover:bg-accent"><ChevronLeft className="size-4" /></button>
            <h2 className="min-w-40 text-center text-sm font-semibold capitalize">{cursor ? title : "…"}</h2>
            <button type="button" onClick={() => step(1)} aria-label="Berikutnya" className="grid size-8 place-items-center rounded-md border hover:bg-accent"><ChevronRight className="size-4" /></button>
            <button type="button" onClick={() => setCursor(new Date())} className="h-8 rounded-md border px-2.5 text-xs hover:bg-accent">Hari ini</button>
            <div className="ml-1 flex gap-0.5 rounded-lg bg-muted p-0.5 text-xs font-medium">
              {([["week", "Minggu", CalendarRange], ["month", "Bulan", CalendarDays], ["akun", "Per akun", Rows3]] as const).map(([v, label, Icon]) => (
                <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={`flex h-7 items-center gap-1 rounded-md px-2.5 ${view === v ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>
            <div className="hidden flex-wrap items-center gap-x-2.5 gap-y-1 pl-1 text-[11px] text-muted-foreground @[1050px]:flex">
              {counts.map(([s, n]) => (
                <span key={s} className="flex items-center gap-1" title={STATUS[s].hint}>
                  <StatusDot s={s} /> {STATUS[s].label} <b className="font-semibold text-foreground tabular-nums">{n}</b>
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

          {view === "month" ? (
            // month: busy weeks share the height, past empty weeks shrink to a thin row; the count opens that week
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="grid grid-cols-7 border-b text-center text-[11px] font-medium text-muted-foreground">
                {DAYS.map((d) => <div key={d} className="py-1.5">{d}</div>)}
              </div>
              <div
                className="grid min-h-0 flex-1 grid-cols-7"
                style={{ gridTemplateRows: monthWeeks.map((row) => (today && dayKey(row[6]) < today && row.every((d) => !items.get(dayKey(d))?.length) ? "30px" : "minmax(0, 1fr)")).join(" ") }}
              >
                {monthWeeks.flat().map((d) => {
                  const k = dayKey(d);
                  const inMonth = d.getMonth() === base.getMonth();
                  const here = items.get(k) ?? [];
                  const z = dropZone(k);
                  return (
                    <div key={k} {...z.on} className={`flex min-h-0 flex-col gap-1 overflow-hidden border-r border-b p-1 [&:nth-child(7n)]:border-r-0 ${inMonth ? "" : "bg-muted/30"} ${z.past ? "opacity-60" : ""} ${z.active ? "bg-primary/10 ring-2 ring-primary/50 ring-inset" : ""}`}>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className={`grid size-5 place-items-center rounded-full tabular-nums ${k === today ? "bg-primary font-semibold text-primary-foreground" : inMonth ? "" : "text-muted-foreground"}`}>{d.getDate()}</span>
                        {here.length > 0 && (
                          <button type="button" onClick={() => (setCursor(d), setView("week"))} title="Buka minggu ini" className="rounded px-1 text-[10px] text-muted-foreground tabular-nums hover:bg-accent hover:text-foreground">{here.length} video</button>
                        )}
                      </div>
                      <div className="min-h-0 overflow-hidden">{stills(here, 22)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            // week: a row per upload hour (+ other hours) · Per akun: a row per account; rows share the height
            <div
              className="grid min-h-0 flex-1"
              style={{
                gridTemplateColumns: `${view === "akun" ? "168px" : "52px"} repeat(7, minmax(0, 1fr))`,
                gridTemplateRows: view === "akun" ? `auto repeat(${ordered.length}, minmax(0, 1fr))` : `auto repeat(${sortedSlots.length}, minmax(0, 1fr)) minmax(0, 0.6fr)`,
              }}
            >
              <div className="border-b" />
              {weekDays.map((d) => {
                const k = dayKey(d);
                const z = dropZone(k);
                return (
                  <div key={k} {...z.on} className={`flex items-center justify-center gap-1.5 border-b border-l py-1.5 ${z.past ? "opacity-50" : ""} ${z.active ? "bg-primary/10" : ""}`}>
                    <span className="text-[11px] text-muted-foreground">{DAYS[(d.getDay() + 6) % 7]}</span>
                    <span className={`grid size-6 place-items-center rounded-full text-xs font-semibold tabular-nums ${k === today ? "bg-primary text-primary-foreground" : ""}`}>{d.getDate()}</span>
                  </div>
                );
              })}
              {view === "akun"
                ? ordered.map((a) => (
                    <div key={a.id} className="contents">
                      <div
                        onMouseEnter={() => setFocus(a.id)}
                        onMouseLeave={() => setFocus(null)}
                        className="flex min-w-0 items-center gap-2 border-b px-2"
                        style={{ boxShadow: `inset 3px 0 0 ${accountColor(a.id)}` }}
                      >
                        {avatar(a, "size-6")}
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium">{a.name}</span>
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><PlatformIcon platform={a.platform} className="size-2.5" /> {SITE[a.platform]}</span>
                        </span>
                      </div>
                      {weekDays.map((d) => {
                        const k = dayKey(d);
                        const here = (items.get(k) ?? []).filter((it) => it.channelId === a.id);
                        const z = dropZone(k, undefined, a.id);
                        return (
                          <div key={k} {...z.on} className={`no-scrollbar min-h-0 overflow-y-auto border-b border-l transition-colors ${z.past ? "bg-muted/30" : ""} ${z.active ? "bg-primary/10 ring-2 ring-primary/50 ring-inset" : ""}`}>
                            {here.length ? stills(here, 26) : !z.past && <p className="grid h-full place-items-center text-[10px] text-muted-foreground/30">+</p>}
                          </div>
                        );
                      })}
                    </div>
                  ))
                : [...sortedSlots, "lain"].map((slot) => (
                    <div key={slot} className="contents">
                      <div className="border-b px-1.5 py-1.5 text-right text-[11px] font-medium tabular-nums text-muted-foreground">{slot === "lain" ? "Lain" : dot(slot)}</div>
                      {weekDays.map((d) => {
                        const k = dayKey(d);
                        const here = (items.get(k) ?? []).filter((it) => (slot === "lain" ? !sortedSlots.includes(it.time) : it.time === slot));
                        const z = dropZone(k, slot === "lain" ? undefined : slot);
                        return (
                          <div key={k} {...z.on} className={`no-scrollbar min-h-0 overflow-y-auto border-b border-l transition-colors ${z.past ? "bg-muted/30" : ""} ${z.active ? "bg-primary/10 ring-2 ring-primary/50 ring-inset" : ""}`}>
                            {here.length ? stills(here, 30) : !z.past && slot !== "lain" && <p className="grid h-full place-items-center text-[10px] text-muted-foreground/40">Tarik ke sini</p>}
                          </div>
                        );
                      })}
                    </div>
                  ))}
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
  const s = stateOf(it);
  return (
    <div
      style={{ left: h.x, top: h.y, width: CARD_W }}
      className="pointer-events-none fixed z-50 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl duration-200 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2"
    >
      <div className="relative bg-black">
        <video src={mediaUrl(it.rel)} autoPlay muted loop playsInline className="mx-auto aspect-[9/16] max-h-80 object-contain" />
        <span className={`absolute top-2 left-2 flex items-center gap-1 rounded-full py-0.5 pr-2 pl-0.5 text-[10px] font-semibold ${STATUS[s].cls}`}><StatusDot s={s} className="size-4 ring-1 ring-white/40" /> {STATUS[s].label}</span>
      </div>
      <div className="space-y-1.5 p-3 text-xs">
        <p className="line-clamp-2 text-[13px] leading-snug font-semibold">{it.title}</p>
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <i className="size-2.5 shrink-0 rounded-sm" style={{ background: accountColor(it.channelId) }} />
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
