"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, CalendarDays, CalendarRange, Check, ChevronLeft, ChevronRight, Clock, Film, Play, Plus, Search, Sparkles, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { openLightbox } from "@/components/media-lightbox";
import { accountColor } from "@/lib/account-color";
import { mediaUrl } from "@/lib/media-url";

// YouTube Kalender (UI first): drag a video from the left onto a day (or a day's hour in the week view); every picked
// channel gets it at that hour, else its next free upload hour that day. Every planned item shows the video itself.
// Placements are drafts kept in this browser for now; "Masukkan ke antrean" (real upload jobs) comes next.

type Channel = { id: number; name: string; avatar: string | null; active: boolean };
type Video = { rel: string; title: string; group: "editor" | "proyek" };
type Job = { id: number; accountId: number; video: string; title: string; status: string; at: number };
type Draft = { id: string; rel: string; title: string; channelId: number; day: string; time: string };
type Saved = { drafts: Draft[]; slots: string[]; picked: number[]; view: View };
type View = "week" | "month";
/** One thing on the calendar: a draft (editable) or a job already queued/posted (read-only). */
type Item = { key: string; rel: string; title: string; channelId: number; day: string; time: string; draft?: Draft; status?: string };

const KEY = "trk-yt-kalender";
const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const MONTH = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" });
const SHORT = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" });
const DEFAULT_SLOTS = ["10:00", "16:00", "19:00"];
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

/** The video as a small 9:16 still; plays on hover. */
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

export function YouTubeCalendar({ channels, videos, jobs }: { channels: Channel[]; videos: Video[]; jobs: Job[] }) {
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState<Date | null>(null); // a day inside the shown week / month (set after mount)
  const [today, setToday] = useState("");
  const [picked, setPicked] = useState<number[]>(() => channels.filter((c) => c.active).map((c) => c.id).slice(0, 1));
  const [slots, setSlots] = useState<string[]>(DEFAULT_SLOTS);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [tab, setTab] = useState<Video["group"]>(videos.some((v) => v.group === "editor") ? "editor" : "proyek");
  const [q, setQ] = useState("");
  const [onlyFree, setOnlyFree] = useState(true);
  const [over, setOver] = useState<string | null>(null); // drop target being dragged over ("day" or "day|time")
  const [newSlot, setNewSlot] = useState("21:00");
  const loaded = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const now = new Date();
      setToday(dayKey(now));
      setCursor(now);
      try {
        const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Saved> | null;
        if (s) {
          if (s.slots?.length) setSlots(s.slots);
          if (s.drafts) setDrafts(s.drafts.filter((d) => channels.some((c) => c.id === d.channelId)));
          if (s.picked?.length) setPicked(s.picked.filter((id) => channels.some((c) => c.id === id)));
          if (s.view) setView(s.view);
        }
      } catch {}
      loaded.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, [channels]);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ drafts, slots, picked, view } satisfies Saved));
    } catch {}
  }, [drafts, slots, picked, view]);

  const sortedSlots = useMemo(() => [...slots].sort(), [slots]);
  const name = (id: number) => channels.find((c) => c.id === id)?.name ?? "Channel";

  // ---- everything on the calendar, per day ----
  const items = useMemo(() => {
    const m = new Map<string, Item[]>();
    const add = (it: Item) => m.set(it.day, [...(m.get(it.day) ?? []), it]);
    for (const j of jobs) add({ key: `j${j.id}`, rel: j.video, title: j.title, channelId: j.accountId, day: dayKey(new Date(j.at)), time: timeOf(j.at), status: j.status });
    for (const d of drafts) add({ key: d.id, rel: d.rel, title: d.title, channelId: d.channelId, day: d.day, time: d.time, draft: d });
    for (const list of m.values()) list.sort((a, b) => a.time.localeCompare(b.time) || a.channelId - b.channelId);
    return m;
  }, [jobs, drafts]);

  // ---- placing ----
  /** The hour for the channel that day: `want` when free, else the first free upload hour (not in the past today). */
  const freeSlot = (channelId: number, day: string, list: Draft[], want?: string, skip?: string) => {
    const taken = new Set([
      ...(items.get(day) ?? []).filter((x) => !x.draft && x.channelId === channelId).map((x) => x.time),
      ...list.filter((d) => d.day === day && d.channelId === channelId && d.id !== skip).map((d) => d.time),
    ]);
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes() + 30;
    const ok = (t: string) => !taken.has(t) && (day !== today || Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) > nowMin);
    if (want && ok(want)) return want;
    return sortedSlots.find(ok) ?? null;
  };
  const place = (rel: string, title: string, day: string, want?: string) => {
    if (!picked.length) return toast.error("Pilih minimal satu channel di atas dulu.");
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
  /** Spread the videos not planned yet over the next days: one a day per picked channel. */
  const autoFill = (days = 7) => {
    if (!picked.length) return toast.error("Pilih minimal satu channel dulu.");
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

  // ---- content list ----
  const planned = new Set([...drafts.map((d) => d.rel), ...jobs.map((j) => j.video)]); // ponytail: cheap, no memo
  const shown = videos.filter((v) => v.group === tab && (!q.trim() || v.title.toLowerCase().includes(q.trim().toLowerCase())) && (!onlyFree || !planned.has(v.rel)));

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
  const range = view === "week" ? weekDays.map(dayKey) : monthWeeks.flat().filter((d) => d.getMonth() === base.getMonth()).map(dayKey);
  const inRange = (day: string) => range.includes(day);
  const draftCount = drafts.filter((d) => inRange(d.day)).length;
  const jobCount = jobs.filter((j) => inRange(dayKey(new Date(j.at)))).length;
  const step = (n: number) => setCursor((c) => (view === "week" ? addDays(c ?? new Date(), n * 7) : new Date((c ?? new Date()).getFullYear(), (c ?? new Date()).getMonth() + n, 1)));
  const title = view === "week" ? `${SHORT.format(weekDays[0])} – ${SHORT.format(weekDays[6])} ${weekDays[6].getFullYear()}` : MONTH.format(base);

  /** A planned video: its still, hour, channel; drafts can be dragged, re-timed and removed; click plays it. */
  const card = (it: Item, big?: boolean) =>
    !big ? (
      <button
        key={it.key}
        type="button"
        draggable={!!it.draft}
        onDragStart={(e) => {
          if (!it.draft) return;
          e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "draft", id: it.draft.id }));
          e.dataTransfer.effectAllowed = "move";
        }}
        onClick={() => openLightbox([{ src: it.rel, kind: "video", label: it.title }])}
        title={`${name(it.channelId)} · ${dot(it.time)} · ${it.title}${it.draft ? " (draf)" : it.status === "done" ? " (sudah diposting)" : " (di antrean)"}`}
        className={`relative overflow-hidden rounded border-2 ${it.draft ? "border-dashed" : ""}`}
        style={{ borderColor: accountColor(it.channelId) }}
      >
        <Thumb rel={it.rel} className="aspect-[9/16] w-full rounded-none" />
        <span className="absolute inset-x-0 bottom-0 bg-black/70 text-center text-[9px] leading-4 font-medium text-white tabular-nums">{dot(it.time)}</span>
      </button>
    ) : (
    <div
      key={it.key}
      draggable={!!it.draft}
      onDragStart={(e) => {
        if (!it.draft) return;
        e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "draft", id: it.draft.id }));
        e.dataTransfer.effectAllowed = "move";
      }}
      title={`${name(it.channelId)} · ${dot(it.time)} · ${it.title}${it.draft ? " (draf)" : it.status === "done" ? " (sudah diposting)" : " (di antrean)"}`}
      className={`group relative flex items-center gap-1.5 overflow-hidden rounded-md border bg-background ${big ? "p-1" : "p-0.5"} ${it.draft ? "cursor-grab border-dashed" : "border-solid bg-muted/50"}`}
      style={{ borderColor: accountColor(it.channelId) }}
    >
      <button type="button" onClick={() => openLightbox([{ src: it.rel, kind: "video", label: it.title }])} aria-label={`Putar ${it.title}`} className="relative shrink-0">
        <Thumb rel={it.rel} className={big ? "h-16 w-9" : "h-9 w-5"} />
        <Play className="absolute inset-0 m-auto size-3 fill-white text-white opacity-0 group-hover:opacity-90" />
      </button>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1 text-[10px]">
          <span className="size-1.5 shrink-0 rounded-full" style={{ background: accountColor(it.channelId) }} />
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
          {it.status === "done" && <Check className="size-3 text-emerald-500" />}
        </div>
        {big && <p className="line-clamp-2 text-[11px]">{it.title}</p>}
        {big && <p className="truncate text-[10px] text-muted-foreground">{name(it.channelId)}</p>}
      </div>
      {it.draft && (
        <button type="button" onClick={() => setDrafts((list) => list.filter((y) => y.id !== it.draft!.id))} aria-label="Hapus draf" className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded bg-background/90 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive">
          <X className="size-3" />
        </button>
      )}
    </div>
    );

  if (!channels.length)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center">
        <CalendarClock className="size-7 text-muted-foreground" />
        <p className="text-sm font-medium">Belum ada channel YouTube</p>
        <p className="max-w-sm text-xs text-muted-foreground">Hubungkan channel dulu di YouTube → Ringkasan, lalu kembali ke sini untuk menyusun jadwal.</p>
      </div>
    );

  return (
    <div className="flex min-h-[calc(100vh-190px)] flex-1 flex-col gap-3">
      {/* ── toolbar: channels · upload hours · drafts ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Channel</span>
          {channels.map((c) => {
            const on = picked.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                aria-pressed={on}
                title={c.active ? undefined : "Perlu login ulang"}
                className={`flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors ${on ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"} ${c.active ? "" : "opacity-50"}`}
                style={on ? { borderColor: accountColor(c.id) } : undefined}
              >
                {c.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote channel avatar
                  <img src={c.avatar} alt="" className="size-5 rounded-full" style={{ boxShadow: `0 0 0 2px ${accountColor(c.id)}` }} />
                ) : (
                  <span className="size-2.5 rounded-full" style={{ background: accountColor(c.id) }} />
                )}
                {c.name}
                {on && <Check className="size-3" />}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 flex items-center gap-1 text-xs font-medium text-muted-foreground"><Clock className="size-3.5" /> Jam tayang</span>
          {sortedSlots.map((t) => (
            <span key={t} className="flex h-7 items-center gap-1 rounded-md bg-muted px-2 text-xs tabular-nums">
              {dot(t)}
              {slots.length > 1 && (
                <button type="button" onClick={() => setSlots((s) => s.filter((x) => x !== t))} aria-label={`Hapus jam ${t}`} className="text-muted-foreground hover:text-destructive"><X className="size-3" /></button>
              )}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <input type="time" value={newSlot} onChange={(e) => setNewSlot(e.target.value)} aria-label="Jam baru" className="h-7 rounded-md border bg-background px-1.5 text-xs" />
            <button type="button" onClick={() => newSlot && !slots.includes(newSlot) && setSlots((s) => [...s, newSlot])} className="grid size-7 place-items-center rounded-md border hover:bg-accent" aria-label="Tambah jam" title="Tambah jam tayang"><Plus className="size-3.5" /></button>
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{drafts.length ? `${drafts.length} draf` : "Belum ada draf"}</span>
          {drafts.length > 0 && (
            <button type="button" onClick={() => setDrafts([])} className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-accent hover:text-destructive"><Trash2 className="size-3.5" /> Kosongkan</button>
          )}
          <button type="button" disabled title="Menyusul: draf diubah jadi jadwal upload sungguhan" className="flex h-9 items-center gap-1.5 rounded-lg bg-[#ff3333] px-3.5 text-[13px] font-semibold text-white opacity-50">
            <Upload className="size-4" /> Masukkan ke antrean
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* ── content to drag ─────────────────────────────────────────────────────────────────── */}
        <section className="flex min-h-0 flex-col gap-2 rounded-xl border bg-card p-2.5 lg:max-h-[calc(100vh-250px)]">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5 text-xs font-medium">
            {([["editor", "Hasil Editor"], ["proyek", "Video proyek"]] as const).map(([g, label]) => (
              <button key={g} type="button" onClick={() => setTab(g)} className={`h-7 rounded-md ${tab === g ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {label} <span className="text-muted-foreground tabular-nums">{videos.filter((v) => v.group === g).length}</span>
              </button>
            ))}
          </div>
          <label className="flex h-8 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-xs">
            <Search className="size-3.5 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari video…" aria-label="Cari video" className="min-w-0 flex-1 bg-transparent outline-none" />
          </label>
          <div className="flex items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5 text-muted-foreground"><input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} className="accent-[#ff3333]" /> Belum dijadwalkan</label>
            <button type="button" onClick={() => autoFill(7)} className="ml-auto flex h-7 items-center gap-1 rounded-md border px-2 font-medium hover:bg-accent" title="Satu video per hari untuk tiap channel terpilih, 7 hari ke depan">
              <Sparkles className="size-3.5 text-[#ff3333]" /> Isi 7 hari
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">Tarik video ke tanggal atau jam di kalender. Arahkan kursor untuk memutar.</p>
          <div className="no-scrollbar -mx-1 grid min-h-0 flex-1 auto-rows-min grid-cols-3 gap-1.5 overflow-y-auto px-1 pb-1">
            {shown.map((v) => (
              <div
                key={v.rel}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "video", rel: v.rel, title: v.title }));
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className="group relative cursor-grab overflow-hidden rounded-lg border bg-black hover:ring-2 hover:ring-[#ff3333]/60 active:cursor-grabbing"
                title={v.title}
              >
                <Thumb rel={v.rel} className="aspect-[9/16] w-full" />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/90 to-transparent p-1 pt-5 text-[10px] leading-tight text-white">{v.title}</span>
                {planned.has(v.rel) && <span className="pointer-events-none absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-[#ff3333] text-white"><CalendarClock className="size-3" /></span>}
              </div>
            ))}
            {!shown.length && (
              <p className="col-span-3 flex flex-col items-center gap-1 p-4 text-center text-xs text-muted-foreground"><Film className="size-5" /> {onlyFree ? "Semua video sudah punya jadwal." : "Belum ada video."}</p>
            )}
          </div>
        </section>

        {/* ── calendar ────────────────────────────────────────────────────────────────────────── */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card lg:max-h-[calc(100vh-250px)]">
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
            <span className="ml-auto text-xs text-muted-foreground">{draftCount} draf · {jobCount} di antrean/terposting</span>
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
                    <div key={k} {...z.on} className={`sticky top-0 z-10 border-b border-l bg-card px-2 py-1.5 text-center ${z.past ? "opacity-50" : ""} ${z.active ? "bg-[#ff3333]/10" : ""}`}>
                      <p className="text-[11px] text-muted-foreground">{DAYS[(d.getDay() + 6) % 7]}</p>
                      <p className={`mx-auto grid size-7 place-items-center rounded-full text-sm font-semibold tabular-nums ${k === today ? "bg-[#ff3333] text-white" : ""}`}>{d.getDate()}</p>
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
                        <div key={k} {...z.on} className={`min-h-24 space-y-1 border-b border-l p-1 transition-colors ${z.past ? "bg-muted/30 opacity-60" : ""} ${z.active ? "bg-[#ff3333]/10 ring-2 ring-[#ff3333]/50 ring-inset" : ""}`}>
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
            // month: compact; each day shows its videos as small stills
            <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-auto">
              <div className="grid grid-cols-7 border-b text-center text-[11px] font-medium text-muted-foreground">
                {DAYS.map((d) => <div key={d} className="py-1.5">{d}</div>)}
              </div>
              <div className="grid flex-1 auto-rows-[minmax(110px,1fr)] grid-cols-7">
                {monthWeeks.flat().map((d) => {
                  const k = dayKey(d);
                  const inMonth = d.getMonth() === base.getMonth();
                  const here = items.get(k) ?? [];
                  const z = dropZone(k);
                  return (
                    <div key={k} {...z.on} className={`flex flex-col gap-1 border-r border-b p-1.5 [&:nth-child(7n)]:border-r-0 ${inMonth ? "" : "bg-muted/30"} ${z.past ? "opacity-50" : ""} ${z.active ? "bg-[#ff3333]/10 ring-2 ring-[#ff3333]/50 ring-inset" : ""}`}>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className={`grid size-6 place-items-center rounded-full tabular-nums ${k === today ? "bg-[#ff3333] font-semibold text-white" : inMonth ? "" : "text-muted-foreground"}`}>{d.getDate()}</span>
                        {here.length > 0 && <span className="text-muted-foreground tabular-nums">{here.length} video</span>}
                      </div>
                      <div className="grid grid-cols-3 gap-1">
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
    </div>
  );
}
