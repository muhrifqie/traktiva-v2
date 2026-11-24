"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Check, ChevronLeft, ChevronRight, Clock, Film, GripVertical, Plus, Search, Sparkles, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { accountColor } from "@/lib/account-color";
import { mediaUrl } from "@/lib/media-url";

// YouTube Kalender (UI first): drag a video from the left onto a day; every picked channel gets it at its next free
// upload hour that day (the hours are set once, e.g. 10.00 · 16.00 · 19.00). Placements are drafts kept in this
// browser for now; "Masukkan ke antrean" (turning them into real upload jobs) comes next.

type Channel = { id: number; name: string; avatar: string | null; active: boolean };
type Video = { rel: string; title: string; group: "editor" | "proyek" };
type Job = { id: number; accountId: number; video: string; title: string; status: string; at: number };
type Draft = { id: string; rel: string; title: string; channelId: number; day: string; time: string };
type Saved = { drafts: Draft[]; slots: string[]; picked: number[] };

const KEY = "trk-yt-kalender";
const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const MONTH = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" });
const DEFAULT_SLOTS = ["10:00", "16:00", "19:00"];
const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeOf = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const uid = () => Math.random().toString(36).slice(2, 10);

export function YouTubeCalendar({ channels, videos, jobs }: { channels: Channel[]; videos: Video[]; jobs: Job[] }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [today, setToday] = useState(""); // set after mount (no Date during the server render)
  const [picked, setPicked] = useState<number[]>(() => channels.filter((c) => c.active).map((c) => c.id).slice(0, 1));
  const [slots, setSlots] = useState<string[]>(DEFAULT_SLOTS);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [tab, setTab] = useState<Video["group"]>(videos.some((v) => v.group === "editor") ? "editor" : "proyek");
  const [q, setQ] = useState("");
  const [onlyFree, setOnlyFree] = useState(true);
  const [over, setOver] = useState<string | null>(null); // day being dragged over
  const [newSlot, setNewSlot] = useState("21:00");
  const loaded = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setToday(dayKey(new Date()));
      try {
        const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Saved> | null;
        if (s) {
          if (s.slots?.length) setSlots(s.slots);
          if (s.drafts) setDrafts(s.drafts.filter((d) => channels.some((c) => c.id === d.channelId)));
          if (s.picked?.length) setPicked(s.picked.filter((id) => channels.some((c) => c.id === id)));
        }
      } catch {}
      loaded.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, [channels]);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ drafts, slots, picked } satisfies Saved));
    } catch {}
  }, [drafts, slots, picked]);

  // ---- month grid (weeks start on Monday) ----
  const weeks = useMemo(() => {
    const first = new Date(month);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    const out: Date[][] = [];
    for (let w = 0; w < 6; w++) {
      const row = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i));
      if (w >= 4 && row[0].getMonth() !== month.getMonth()) break;
      out.push(row);
    }
    return out;
  }, [month]);
  const jobsByDay = useMemo(() => {
    const m = new Map<string, Job[]>();
    for (const j of jobs) {
      const k = dayKey(new Date(j.at));
      m.set(k, [...(m.get(k) ?? []), j]);
    }
    return m;
  }, [jobs]);
  const draftsByDay = useMemo(() => {
    const m = new Map<string, Draft[]>();
    for (const d of drafts) m.set(d.day, [...(m.get(d.day) ?? []), d].sort((a, b) => a.time.localeCompare(b.time)));
    return m;
  }, [drafts]);

  // ---- placing ----
  const name = (id: number) => channels.find((c) => c.id === id)?.name ?? "Channel";
  /** The first upload hour of that day still free for the channel (not in the past for today). */
  const freeSlot = (channelId: number, day: string, list: Draft[], skip?: string) => {
    const taken = new Set([
      ...(jobsByDay.get(day) ?? []).filter((j) => j.accountId === channelId).map((j) => timeOf(j.at)),
      ...list.filter((d) => d.day === day && d.channelId === channelId && d.id !== skip).map((d) => d.time),
    ]);
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes() + 30;
    return [...slots].sort().find((t) => !taken.has(t) && (day !== today || Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) > nowMin)) ?? null;
  };
  const place = (rel: string, title: string, day: string) => {
    if (!picked.length) return toast.error("Pilih minimal satu channel di atas dulu.");
    if (today && day < today) return toast.error("Tanggal yang sudah lewat tidak bisa dipakai.");
    const next = [...drafts];
    const full: string[] = [];
    for (const channelId of picked) {
      const time = freeSlot(channelId, day, next);
      if (!time) full.push(name(channelId));
      else next.push({ id: uid(), rel, title, channelId, day, time });
    }
    setDrafts(next);
    if (full.length) toast.warning(`Jam tayang hari itu sudah penuh untuk ${full.join(", ")}. Tambah jam atau pilih tanggal lain.`);
  };
  const move = (id: string, day: string) => {
    const d = drafts.find((x) => x.id === id);
    if (!d || d.day === day) return;
    if (today && day < today) return toast.error("Tanggal yang sudah lewat tidak bisa dipakai.");
    const time = freeSlot(d.channelId, day, drafts, id);
    if (!time) return toast.warning(`Jam tayang ${name(d.channelId)} di tanggal itu sudah penuh.`);
    setDrafts((list) => list.map((x) => (x.id === id ? { ...x, day, time } : x)));
  };
  const onDrop = (day: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setOver(null);
    const raw = e.dataTransfer.getData("text/plain");
    try {
      const p = JSON.parse(raw) as { kind: "video"; rel: string; title: string } | { kind: "draft"; id: string };
      if (p.kind === "video") place(p.rel, p.title, day);
      else move(p.id, day);
    } catch {}
  };
  /** Spread the videos not planned yet over the next days: one a day per picked channel. */
  const autoFill = (days = 7) => {
    if (!picked.length) return toast.error("Pilih minimal satu channel dulu.");
    const used = new Set([...drafts.map((d) => d.rel), ...jobs.map((j) => j.video)]);
    const queue = shown.filter((v) => !used.has(v.rel));
    if (!queue.length) return toast.info("Semua video di daftar ini sudah punya jadwal.");
    const next = [...drafts];
    let placed = 0;
    const start = new Date();
    for (let i = 0; i < days && queue.length; i++) {
      const day = dayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
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
  const plannedRels = useMemo(() => new Set([...drafts.map((d) => d.rel), ...jobs.map((j) => j.video)]), [drafts, jobs]);
  const shown = videos.filter((v) => v.group === tab && (!q.trim() || v.title.toLowerCase().includes(q.trim().toLowerCase())) && (!onlyFree || !plannedRels.has(v.rel)));
  const monthDrafts = drafts.filter((d) => d.day.startsWith(dayKey(month).slice(0, 7)));

  if (!channels.length)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center">
        <CalendarClock className="size-7 text-muted-foreground" />
        <p className="text-sm font-medium">Belum ada channel YouTube</p>
        <p className="max-w-sm text-xs text-muted-foreground">Hubungkan channel dulu di YouTube → Ringkasan, lalu kembali ke sini untuk menyusun jadwal.</p>
      </div>
    );

  return (
    <div className="flex flex-1 flex-col gap-3">
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
                  <img src={c.avatar} alt="" className="size-5 rounded-full" />
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
          {[...slots].sort().map((t) => (
            <span key={t} className="flex h-7 items-center gap-1 rounded-md bg-muted px-2 text-xs tabular-nums">
              {t.replace(":", ".")}
              {slots.length > 1 && (
                <button type="button" onClick={() => setSlots((s) => s.filter((x) => x !== t))} aria-label={`Hapus jam ${t}`} className="text-muted-foreground hover:text-destructive"><X className="size-3" /></button>
              )}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <input type="time" value={newSlot} onChange={(e) => setNewSlot(e.target.value)} aria-label="Jam baru" className="h-7 rounded-md border bg-background px-1.5 text-xs" />
            <button type="button" onClick={() => newSlot && !slots.includes(newSlot) && setSlots((s) => [...s, newSlot])} className="grid size-7 place-items-center rounded-md border hover:bg-accent" aria-label="Tambah jam"><Plus className="size-3.5" /></button>
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

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* ── content to drag ─────────────────────────────────────────────────────────────────── */}
        <section className="flex min-h-0 flex-col gap-2 rounded-xl border bg-card p-2.5 lg:max-h-[calc(100vh-260px)]">
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
              <Sparkles className="size-3.5 text-[#ff3333]" /> Isi otomatis 7 hari
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">Tarik video ke tanggal di kalender.</p>
          <div className="no-scrollbar -mx-1 min-h-0 flex-1 space-y-1.5 overflow-y-auto px-1">
            {shown.map((v) => (
              <div
                key={v.rel}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "video", rel: v.rel, title: v.title }));
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className="flex cursor-grab items-center gap-2 rounded-lg border bg-background p-1.5 hover:border-[#ff3333]/50 active:cursor-grabbing"
                title={v.title}
              >
                <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />
                <video src={`${mediaUrl(v.rel)}#t=1`} preload="metadata" muted className="h-12 w-[27px] shrink-0 rounded bg-black object-cover" />
                <span className="line-clamp-2 min-w-0 flex-1 text-xs leading-snug">{v.title}</span>
                {plannedRels.has(v.rel) && <CalendarClock className="size-3.5 shrink-0 text-[#ff3333]" />}
              </div>
            ))}
            {!shown.length && (
              <p className="flex flex-col items-center gap-1 p-4 text-center text-xs text-muted-foreground"><Film className="size-5" /> {onlyFree ? "Semua video sudah punya jadwal." : "Belum ada video."}</p>
            )}
          </div>
        </section>

        {/* ── month ───────────────────────────────────────────────────────────────────────────── */}
        <section className="flex min-h-0 flex-col rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <button type="button" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Bulan sebelumnya" className="grid size-8 place-items-center rounded-md border hover:bg-accent"><ChevronLeft className="size-4" /></button>
            <h2 className="min-w-36 text-center text-sm font-semibold capitalize">{MONTH.format(month)}</h2>
            <button type="button" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Bulan berikutnya" className="grid size-8 place-items-center rounded-md border hover:bg-accent"><ChevronRight className="size-4" /></button>
            <button type="button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="h-8 rounded-md border px-2.5 text-xs hover:bg-accent">Hari ini</button>
            <span className="ml-auto text-xs text-muted-foreground">{monthDrafts.length} draf bulan ini · {jobs.filter((j) => dayKey(new Date(j.at)).startsWith(dayKey(month).slice(0, 7))).length} sudah terjadwal</span>
          </div>
          <div className="grid grid-cols-7 border-b text-center text-[11px] font-medium text-muted-foreground">
            {DAYS.map((d) => <div key={d} className="py-1.5">{d}</div>)}
          </div>
          <div className="grid flex-1 auto-rows-fr grid-cols-7">
            {weeks.flat().map((d) => {
              const k = dayKey(d);
              const inMonth = d.getMonth() === month.getMonth();
              const past = !!today && k < today;
              const dayJobs = jobsByDay.get(k) ?? [];
              const dayDrafts = draftsByDay.get(k) ?? [];
              return (
                <div
                  key={k}
                  onDragOver={(e) => {
                    if (past) return;
                    e.preventDefault();
                    if (over !== k) setOver(k);
                  }}
                  onDragLeave={() => over === k && setOver(null)}
                  onDrop={onDrop(k)}
                  className={`min-h-28 space-y-1 border-r border-b p-1.5 transition-colors [&:nth-child(7n)]:border-r-0 ${inMonth ? "" : "bg-muted/30"} ${past ? "opacity-50" : ""} ${over === k ? "bg-[#ff3333]/10 ring-2 ring-[#ff3333]/50 ring-inset" : ""}`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={`grid size-6 place-items-center rounded-full tabular-nums ${k === today ? "bg-[#ff3333] font-semibold text-white" : inMonth ? "text-foreground" : "text-muted-foreground"}`}>{d.getDate()}</span>
                    {dayJobs.length + dayDrafts.length > 0 && <span className="text-muted-foreground tabular-nums">{dayJobs.length + dayDrafts.length}</span>}
                  </div>
                  {/* already queued / posted (read-only) */}
                  {dayJobs.map((j) => (
                    <div key={`j${j.id}`} title={`${name(j.accountId)} · ${j.title}`} className="flex items-center gap-1 rounded-md border-l-2 bg-muted/60 px-1.5 py-0.5 text-[10px]" style={{ borderLeftColor: accountColor(j.accountId) }}>
                      <span className="tabular-nums text-muted-foreground">{timeOf(j.at).replace(":", ".")}</span>
                      <span className="min-w-0 flex-1 truncate">{j.title}</span>
                      {j.status === "done" && <Check className="size-3 shrink-0 text-emerald-500" />}
                    </div>
                  ))}
                  {/* drafts (drag to another day, or remove) */}
                  {dayDrafts.map((x) => (
                    <div
                      key={x.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "draft", id: x.id }));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      title={`${name(x.channelId)} · ${x.title} (draf)`}
                      className="group flex cursor-grab items-center gap-1 rounded-md border border-dashed bg-background px-1.5 py-0.5 text-[10px]"
                      style={{ borderColor: accountColor(x.channelId) }}
                    >
                      <span className="size-1.5 shrink-0 rounded-full" style={{ background: accountColor(x.channelId) }} />
                      <select
                        value={x.time}
                        onChange={(e) => setDrafts((list) => list.map((y) => (y.id === x.id ? { ...y, time: e.target.value } : y)))}
                        aria-label="Jam tayang"
                        className="bg-transparent tabular-nums outline-none"
                      >
                        {[...new Set([...slots, x.time])].sort().map((t) => <option key={t} value={t}>{t.replace(":", ".")}</option>)}
                      </select>
                      <span className="min-w-0 flex-1 truncate">{x.title}</span>
                      <button type="button" onClick={() => setDrafts((list) => list.filter((y) => y.id !== x.id))} aria-label="Hapus draf" className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"><X className="size-3" /></button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
