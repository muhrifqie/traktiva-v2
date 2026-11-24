"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Blend, Check, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Columns2, Crop, Eye, FlipHorizontal2, FolderOpen, Gamepad2, Loader2, Music, Palette, PictureInPicture2,
  Plus, Ratio, RefreshCw, Rows2, Save, Search, Shuffle, Square, Upload, Video, Volume2, VolumeX, X, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { mediaUrl } from "@/lib/media-url";
import type { EditorJob, SourceFile } from "@/lib/youtube-editor";
import { PIP_RANGE, RATIO_RANGE, SIZES, type Corner, type EditorSettings, type Fill, type Fit, type Flip, type Seam, type Size } from "@/lib/youtube-editor-config";
import { clipLengths, openMediaFolder, previewFrame, refreshLists, renderStatus, renderVideos, saveEditorSettings, stopRender } from "./actions";

// YouTube → Editor laid out like a video editor (CapCut / Premiere): media bin on the left, the monitor in the middle,
// the inspector on the right and a timeline underneath. Click a Short to put it on the timeline, click a clip to see
// it on the monitor, drag the divider (or click a corner) right on the monitor, press Render.

const KEY = "trk-yt-editor"; // timeline, picks and bin filters survive a refresh (the configuration lives in settings.json)
type Tab = "asli" | "game" | "hasil";
type Sort = "new" | "old" | "az";
type Show = "all" | "todo" | "done";
type Saved = { channel: string; queue: string[]; games: string[]; random: boolean; q: string; sort: Sort; show: Show; tab: Tab };
const PAGE = 18;
const RED = "#ff3333";
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function Segmented<T extends string>({ value, onChange, items, disabled }: { value: T; onChange: (v: T) => void; items: { v: T; label: React.ReactNode; title?: string }[]; disabled?: boolean }) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-muted p-0.5">
      {items.map((it) => (
        <button key={it.v} type="button" title={it.title} disabled={disabled} onClick={() => onChange(it.v)} aria-pressed={value === it.v} className={`flex h-7 items-center justify-center gap-1 rounded-md px-1.5 text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-50 ${value === it.v ? "bg-[#ff3333] text-white shadow-xs" : "text-muted-foreground hover:text-foreground"}`}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ value, min, max, step = 5, onChange, disabled, label }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; disabled?: boolean; label: string }) {
  return <input type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 w-full cursor-pointer accent-[#ff3333] disabled:opacity-50" />;
}

/** Inspector section: colored icon + title, folds open/closed like a properties panel. */
function Section({ icon: Icon, color, title, value, open = true, children }: { icon: LucideIcon; color: string; title: string; value?: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group border-b last:border-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-semibold select-none hover:bg-accent/40">
        <span className="grid size-5 place-items-center rounded-md" style={{ background: `${color}22`, color }}><Icon className="size-3" /></span>
        {title}
        {value && <span className="ml-auto font-normal tabular-nums text-muted-foreground">{value}</span>}
        <ChevronDown className={`size-3.5 text-muted-foreground transition-transform group-open:rotate-180 ${value ? "" : "ml-auto"}`} />
      </summary>
      <div className="space-y-2 px-3 pb-3">{children}</div>
    </details>
  );
}

function Row({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-[74px] shrink-0 items-center gap-1 text-[11px] text-muted-foreground"><Icon className="size-3" /> {label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Sketch of the frame (before a real preview frame exists): where each video goes. */
function LayoutSketch({ cfg }: { cfg: EditorSettings }) {
  const part = "grid h-full w-full place-items-center text-[10px] font-medium";
  const asli = <span className={`${part} bg-sky-500/20 text-sky-700 dark:text-sky-300`}><Video className="mb-0.5 size-4" />Asli</span>;
  const game = <span className={`${part} bg-[#ff3333]/15 text-[#ff3333]`}><Gamepad2 className="mb-0.5 size-4" />Gameplay</span>;
  if (cfg.layout === "pip") {
    const [big, small] = cfg.pipMain === "original" ? [asli, game] : [game, asli];
    const pos = { tl: "top-2 left-2", tr: "top-2 right-2", bl: "bottom-2 left-2", br: "bottom-2 right-2" }[cfg.pipCorner];
    return (
      <div className="relative h-full w-full">
        {big}
        <div className={`absolute ${pos} aspect-[9/16] overflow-hidden rounded border-2 border-white bg-background`} style={{ width: `${cfg.pipSize}%` }}>{small}</div>
      </div>
    );
  }
  const track = `${cfg.ratio}fr ${100 - cfg.ratio}fr`;
  return <div className="grid h-full w-full" style={cfg.layout === "side" ? { gridTemplateColumns: track } : { gridTemplateRows: track }}>{asli}{game}</div>;
}

const FLIPS: { v: Flip; label: string; title: string }[] = [
  { v: "none", label: "Asli", title: "Tidak dibalik" },
  { v: "h", label: "⇆", title: "Cermin kiri-kanan" },
  { v: "v", label: "⇅", title: "Balik atas-bawah" },
  { v: "hv", label: "⇆⇅", title: "Keduanya" },
];

export function VideoEditor({
  originals, initialGameplay, initialResults, initialJob, initialSettings, initialRendered,
}: {
  originals: { channel: string; files: SourceFile[] }[]; initialGameplay: SourceFile[]; initialResults: SourceFile[]; initialJob: EditorJob | null;
  initialSettings: EditorSettings; initialRendered: Record<string, string>;
}) {
  const [tab, setTab] = useState<Tab>("asli");
  const [channel, setChannel] = useState(originals[0]?.channel ?? "");
  const [queue, setQueue] = useState<string[]>([]); // the timeline: originals in render order
  const [active, setActive] = useState<string | null>(null); // clip shown on the monitor
  const [lengths, setLengths] = useState<Record<string, number>>({});
  const [games, setGames] = useState<Set<string>>(new Set());
  const [gameplay, setGameplay] = useState(initialGameplay);
  const [results, setResults] = useState(initialResults);
  const [rendered, setRendered] = useState(initialRendered);
  const [cfg, setCfg] = useState<EditorSettings>(initialSettings);
  const [saved, setSaved] = useState(true);
  const [random, setRandom] = useState(true);
  const [job, setJob] = useState(initialJob);
  const [preview, setPreview] = useState<{ url: string | null; busy: boolean; error: string | null }>({ url: null, busy: false, error: null });
  const [drag, setDrag] = useState<number | null>(null);
  const [at, setAt] = useState(2); // monitor time (s) inside the active clip
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [show, setShow] = useState<Show>("all");
  const [page, setPage] = useState(0);
  const restored = useRef(false);
  const running = !!job?.running;
  const set = <K extends keyof EditorSettings>(k: K, v: EditorSettings[K]) => {
    setSaved(false);
    setCfg((c) => ({ ...c, [k]: v }));
  };

  // restore the timeline and bin filters after mount (no localStorage during the server render)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Saved> | null;
        if (s) {
          if (originals.some((c) => c.channel === s.channel)) setChannel(s.channel!);
          const all = new Set(originals.flatMap((c) => c.files.map((f) => f.rel)));
          setQueue((s.queue ?? []).filter((r) => all.has(r)));
          setGames(new Set(s.games ?? []));
          setRandom(s.random ?? true);
          setQ(s.q ?? "");
          setSort(s.sort ?? "new");
          setShow(s.show ?? "all");
          setTab(s.tab ?? "asli");
        }
      } catch {}
      restored.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, [originals]);
  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ channel, queue, games: [...games], random, q, sort, show, tab } satisfies Saved));
    } catch {}
  }, [channel, queue, games, random, q, sort, show, tab]);

  // configuration → settings.json, a moment after each change
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(async () => {
      try {
        await saveEditorSettings(cfg);
        setSaved(true);
      } catch {
        toast.error("Konfigurasi Editor gagal disimpan");
      }
    }, 600);
    return () => clearTimeout(t);
  }, [cfg]);

  // lengths of the clips on the timeline (block widths, monitor scrub range)
  const missing = queue.filter((r) => !(r in lengths)).join("|");
  useEffect(() => {
    if (!missing) return;
    let live = true;
    void clipLengths(missing.split("|")).then((r) => live && setLengths((l) => ({ ...l, ...r })));
    return () => {
      live = false;
    };
  }, [missing]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      const j = await renderStatus();
      setJob(j);
      if (!j?.running) {
        const r = await refreshLists();
        setResults(r.results);
        setRendered(r.rendered);
      }
    }, 1500);
    return () => clearInterval(t);
  }, [running]);

  // ---- media bin ------------------------------------------------------------------------------------------------
  const byRel = useMemo(() => new Map(originals.flatMap((c) => c.files.map((f) => [f.rel, f] as const))), [originals]);
  const files = useMemo(() => originals.find((c) => c.channel === channel)?.files ?? [], [originals, channel]);
  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    const list = files.filter((f) => (!k || f.name.toLowerCase().includes(k)) && (show === "all" || (show === "done") === !!rendered[f.rel]));
    if (sort === "old") return [...list].reverse();
    if (sort === "az") return [...list].sort((a, b) => a.name.localeCompare(b.name, "id"));
    return list;
  }, [files, q, show, sort, rendered]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages - 1);
  const shown = filtered.slice(current * PAGE, current * PAGE + PAGE);
  const inQueue = useMemo(() => new Set(queue), [queue]);
  const addOrRemove = (rel: string) => {
    if (inQueue.has(rel)) setQueue((qq) => qq.filter((x) => x !== rel));
    else {
      setQueue((qq) => [...qq, rel]);
      setActive(rel);
      setAt(2);
    }
  };
  const toggleGame = (rel: string) =>
    setGames((g) => {
      const n = new Set(g);
      if (n.has(rel)) n.delete(rel);
      else n.add(rel);
      return n;
    });

  // ---- monitor ---------------------------------------------------------------------------------------------------
  const clip = active && inQueue.has(active) ? active : (queue[0] ?? files[0]?.rel ?? null);
  const pool = gameplay.filter((g) => games.has(g.rel)).length ? gameplay.filter((g) => games.has(g.rel)) : gameplay;
  const gameFor = (i: number) => (random ? null : pool[i % Math.max(pool.length, 1)]);
  const sampleGame = (gameFor(Math.max(0, queue.indexOf(clip ?? ""))) ?? pool[0])?.rel;
  const clipLen = clip ? lengths[clip] ?? 0 : 0;
  useEffect(() => {
    if (!clip || !sampleGame) return;
    let live = true;
    const t = setTimeout(async () => {
      setPreview((p) => ({ ...p, busy: true, error: null }));
      const r = await previewFrame(clip, sampleGame, cfg, at);
      if (!live) return;
      if ("error" in r) setPreview((p) => ({ ...p, busy: false, error: r.error ?? "Gagal membuat preview" }));
      else setPreview({ url: `${mediaUrl(r.ok!)}?v=${Date.now()}`, busy: false, error: null });
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [clip, sampleGame, cfg, at]);

  const box = useRef<HTMLDivElement>(null);
  const pctAt = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    const raw = cfg.layout === "side" ? ((e.clientX - r.left) / r.width) * 100 : ((e.clientY - r.top) / r.height) * 100;
    return Math.round(Math.min(RATIO_RANGE[1], Math.max(RATIO_RANGE[0], raw)));
  };
  const onDown = (e: React.PointerEvent) => {
    if (running) return;
    if (cfg.layout === "pip") {
      const r = box.current!.getBoundingClientRect();
      set("pipCorner", `${e.clientY - r.top < r.height / 2 ? "t" : "b"}${e.clientX - r.left < r.width / 2 ? "l" : "r"}` as Corner);
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag(pctAt(e));
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag != null) setDrag(pctAt(e));
  };
  const onUp = () => {
    if (drag == null) return;
    set("ratio", drag);
    setDrag(null);
  };
  const line = drag ?? cfg.ratio;
  const [W, H] = cfg.size.split("x").map(Number);

  // ---- actions ----------------------------------------------------------------------------------------------------
  const reload = async () => {
    const r = await refreshLists();
    setGameplay(r.gameplay);
    setResults(r.results);
    setRendered(r.rendered);
    setGames((g) => new Set([...g].filter((x) => r.gameplay.some((y) => y.rel === x))));
    toast.success(`${r.gameplay.length} klip gameplay`);
  };
  const render = async () => {
    if (!gameplay.length) return toast.error("Tambahkan gameplay dulu (tab Gameplay → Folder Gameplay).");
    const r = await renderVideos({ originals: queue, gameplay: [...games], settings: cfg, random });
    if ("error" in r) return toast.error(r.error);
    setJob(r.ok ?? null);
    toast.success(`Merender ${queue.length} video`);
  };
  const pct = job?.total ? ((job.done.length + job.failed.length) / job.total) * 100 : 0;
  const total = queue.reduce((s, r) => s + (lengths[r] ?? 0), 0);
  const maxLen = Math.max(1, ...queue.map((r) => lengths[r] ?? 0));

  if (!originals.length)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center">
        <Clapperboard className="size-7 text-muted-foreground" />
        <p className="text-sm font-medium">Belum ada video asli</p>
        <p className="max-w-sm text-xs text-muted-foreground">Unduh Shorts dulu di menu Unduh Shorts. Hasilnya otomatis muncul di sini untuk digabung dengan gameplay.</p>
        <Link href="/youtube-shorts" className="mt-2 flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">Buka Unduh Shorts</Link>
      </div>
    );

  const card = "rounded-xl border bg-card";
  return (
    <div className="flex flex-1 flex-col gap-3">
      {/* ── toolbar ─────────────────────────────────────────────────────────────────────────────────────────────── */}
      <div className={`${card} flex flex-wrap items-center gap-2 px-3 py-2`}>
        <span className="flex items-center gap-1.5 text-[13px] font-semibold"><Clapperboard className="size-4 text-[#ff3333]" /> Proyek</span>
        <span className="text-xs text-muted-foreground">{queue.length} klip · {fmt(total)}</span>
        <div className="mx-2 h-5 w-px bg-border" />
        <div className="flex gap-1">
          {(Object.keys(SIZES) as Size[]).map((sz) => {
            const [w, h] = sz.split("x").map(Number);
            const on = cfg.size === sz;
            return (
              <button key={sz} type="button" disabled={running} onClick={() => set("size", sz)} aria-pressed={on} title={`${SIZES[sz].label} ${SIZES[sz].note}`} className={`flex h-8 items-center gap-1.5 rounded-lg border px-2 text-xs disabled:opacity-50 ${on ? "border-[#ff3333] bg-[#ff3333]/10 font-semibold text-[#ff3333]" : "hover:bg-accent"}`}>
                <span className={`block rounded-[2px] border-[1.5px] ${on ? "border-[#ff3333]" : "border-muted-foreground/60"}`} style={w >= h ? { width: 14, height: Math.round((14 * h) / w) } : { height: 14, width: Math.round((14 * w) / h) }} />
                {SIZES[sz].label}
              </button>
            );
          })}
        </div>
        <div className="mx-2 h-5 w-px bg-border" />
        <div className="w-64">
          <Segmented value={cfg.layout} onChange={(v) => set("layout", v)} disabled={running} items={[{ v: "side", label: <><Columns2 className="size-3.5" /> Samping</> }, { v: "stack", label: <><Rows2 className="size-3.5" /> Tumpuk</> }, { v: "pip", label: <><PictureInPicture2 className="size-3.5" /> Reaction</> }]} />
        </div>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {saved ? <Save className="size-3.5 text-status-ok" /> : <Loader2 className="size-3.5 animate-spin" />} {saved ? "Tersimpan" : "Menyimpan…"}
        </span>
        {running ? (
          <button type="button" onClick={() => void stopRender()} className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium hover:border-destructive/40 hover:text-destructive"><Square className="size-4" /> Batalkan</button>
        ) : null}
        <button type="button" onClick={render} disabled={running || !queue.length} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#ff3333] px-4 text-[13px] font-semibold text-white hover:bg-[#ff3333]/90 disabled:opacity-50">
          {running ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {running ? `Merender ${job!.done.length}/${job!.total}` : queue.length ? `Render ${queue.length} video` : "Render"}
        </button>
      </div>
      {running && (
        <div className="-mt-1 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#ff3333] transition-[width]" style={{ width: `${pct}%` }} /></div>
      )}

      {/* ── media bin | monitor | inspector ─────────────────────────────────────────────────────────────────────── */}
      <div className="grid gap-3 lg:h-[640px] lg:grid-cols-[230px_minmax(0,1fr)_250px] xl:grid-cols-[280px_minmax(0,1fr)_300px]">
        {/* media bin */}
        <section className={`${card} flex min-h-0 flex-col overflow-hidden`}>
          <div className="grid grid-cols-3 border-b text-xs font-medium">
            {([["asli", "Video asli", Video], ["game", "Gameplay", Gamepad2], ["hasil", "Hasil", Check]] as const).map(([t, label, Icon]) => (
              <button key={t} type="button" onClick={() => setTab(t)} className={`flex items-center justify-center gap-1 border-b-2 py-2.5 ${tab === t ? "border-[#ff3333] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
          </div>
          {tab === "asli" && (
            <div className="flex min-h-0 flex-1 flex-col gap-2 p-2.5">
              <select value={channel} onChange={(e) => (setChannel(e.target.value), setPage(0))} aria-label="Channel" className="h-8 rounded-lg border bg-background px-2 text-xs">
                {originals.map((c) => <option key={c.channel} value={c.channel}>{c.channel} ({c.files.length})</option>)}
              </select>
              <label className="flex h-8 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-xs">
                <Search className="size-3.5 text-muted-foreground" />
                <input value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} placeholder="Cari judul…" aria-label="Cari judul" className="min-w-0 flex-1 bg-transparent outline-none" />
                {q && <button type="button" onClick={() => setQ("")} aria-label="Hapus pencarian"><X className="size-3.5 text-muted-foreground" /></button>}
              </label>
              <div className="flex gap-1.5">
                <div className="flex-1"><Segmented value={show} onChange={(v) => (setShow(v), setPage(0))} items={[{ v: "all", label: "Semua" }, { v: "todo", label: "Belum" }, { v: "done", label: "Sudah" }]} /></div>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Urutkan" className="h-8 rounded-lg border bg-background px-1.5 text-xs">
                  <option value="new">Terbaru</option>
                  <option value="old">Terlama</option>
                  <option value="az">A–Z</option>
                </select>
              </div>
              <div className="no-scrollbar grid min-h-0 flex-1 auto-rows-min grid-cols-3 gap-1.5 overflow-y-auto">
                {shown.map((f) => {
                  const on = inQueue.has(f.rel);
                  return (
                    <button key={f.rel} type="button" onClick={() => addOrRemove(f.rel)} title={`${on ? "Keluarkan dari" : "Masukkan ke"} timeline: ${f.name}`} className={`group relative overflow-hidden rounded-md border bg-muted text-left ${on ? "ring-2 ring-sky-500" : ""}`}>
                      <video src={`${mediaUrl(f.rel)}#t=1`} preload="metadata" muted className="aspect-[9/16] w-full object-cover" />
                      <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/85 to-transparent p-1 pt-4 text-[9px] leading-tight text-white">{f.name}</span>
                      <span className={`absolute top-1 left-1 grid size-4 place-items-center rounded text-white ${on ? "bg-sky-500" : "bg-black/50 opacity-0 group-hover:opacity-100"}`}>{on ? <Check className="size-3" /> : <Plus className="size-3" />}</span>
                      {rendered[f.rel] && <span className="absolute top-1 right-1 rounded bg-status-ok px-1 text-[8px] font-semibold text-white">Sudah</span>}
                    </button>
                  );
                })}
                {!shown.length && <p className="col-span-3 p-4 text-center text-xs text-muted-foreground">Tidak ada video yang cocok.</p>}
              </div>
              <div className="flex items-center gap-1 text-[11px]">
                <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Sebelumnya" className="grid size-7 place-items-center rounded-md border hover:bg-accent disabled:opacity-40"><ChevronLeft className="size-3.5" /></button>
                <span className="flex-1 text-center tabular-nums text-muted-foreground">Hal {current + 1}/{pages} · {filtered.length} video</span>
                <button type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Berikutnya" className="grid size-7 place-items-center rounded-md border hover:bg-accent disabled:opacity-40"><ChevronRight className="size-3.5" /></button>
              </div>
              <button type="button" onClick={() => setQueue((qq) => [...qq, ...shown.map((f) => f.rel).filter((r) => !qq.includes(r))])} className="flex h-8 items-center justify-center gap-1 rounded-lg border text-xs hover:bg-accent"><Plus className="size-3.5" /> Masukkan halaman ini ke timeline</button>
            </div>
          )}
          {tab === "game" && (
            <div className="flex min-h-0 flex-1 flex-col gap-2 p-2.5">
              <div className="flex gap-1.5">
                <button type="button" onClick={() => void openMediaFolder("gameplay")} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border text-xs hover:bg-accent"><FolderOpen className="size-3.5" /> Folder Gameplay</button>
                <button type="button" onClick={reload} aria-label="Muat ulang" title="Muat ulang" className="grid size-8 place-items-center rounded-lg border hover:bg-accent"><RefreshCw className="size-3.5" /></button>
              </div>
              <p className="text-[11px] text-muted-foreground">{games.size ? `${games.size} dipilih` : "Tidak ada yang dipilih = semua dipakai"}</p>
              <div className="no-scrollbar grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-1.5 overflow-y-auto">
                {gameplay.map((f) => {
                  const on = games.has(f.rel);
                  return (
                    <button key={f.rel} type="button" onClick={() => toggleGame(f.rel)} title={f.name} className={`relative overflow-hidden rounded-md border bg-muted text-left ${on ? "ring-2 ring-[#ff3333]" : ""}`}>
                      <video src={`${mediaUrl(f.rel)}#t=2`} preload="metadata" muted className="aspect-video w-full object-cover" />
                      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 to-transparent p-1 pt-3 text-[10px] text-white">{f.name}</span>
                      {on && <span className="absolute top-1 left-1 grid size-4 place-items-center rounded bg-[#ff3333] text-white"><Check className="size-3" /></span>}
                    </button>
                  );
                })}
                {!gameplay.length && <p className="col-span-2 p-3 text-center text-xs text-muted-foreground">Taruh video gameplay (mp4) di Folder Gameplay, lalu muat ulang.</p>}
              </div>
              <Segmented value={random ? "acak" : "urut"} onChange={(v) => setRandom(v === "acak")} disabled={running} items={[{ v: "acak", label: <><Shuffle className="size-3.5" /> Acak</> }, { v: "urut", label: "Bergiliran" }]} />
            </div>
          )}
          {tab === "hasil" && (
            <div className="flex min-h-0 flex-1 flex-col gap-2 p-2.5">
              <button type="button" onClick={() => void openMediaFolder("results")} className="flex h-8 items-center justify-center gap-1.5 rounded-lg border text-xs hover:bg-accent"><FolderOpen className="size-3.5" /> Buka folder hasil</button>
              {job?.failed.map((f) => <p key={f} className="text-[11px] text-destructive">{f}</p>)}
              <div className="no-scrollbar grid min-h-0 flex-1 auto-rows-min grid-cols-3 gap-1.5 overflow-y-auto">
                {results.map((r) => (
                  <a key={r.rel} href={mediaUrl(r.rel)} target="_blank" rel="noreferrer" title={r.name} className="overflow-hidden rounded-md border bg-muted">
                    <video src={`${mediaUrl(r.rel)}#t=1`} preload="metadata" muted className="aspect-[9/16] w-full object-cover" />
                  </a>
                ))}
                {!results.length && <p className="col-span-3 p-4 text-center text-xs text-muted-foreground">Belum ada hasil render.</p>}
              </div>
            </div>
          )}
        </section>

        {/* monitor */}
        <section className={`${card} flex min-h-0 flex-col items-center justify-center gap-2 bg-[#0b0b0b] p-3`}>
          <div
            ref={box}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            className={`relative touch-none overflow-hidden rounded-md bg-black select-none ${cfg.layout === "pip" ? "cursor-pointer" : cfg.layout === "side" ? "cursor-ew-resize" : "cursor-ns-resize"}`}
            style={{ aspectRatio: `${W} / ${H}`, width: `min(100%, calc(min(520px, 62vh) * ${(W / H).toFixed(4)}))` }}
          >
            {preview.url && sampleGame ? (
              // eslint-disable-next-line @next/next/no-img-element -- generated local preview frame
              <img src={preview.url} alt="Preview hasil" draggable={false} className="pointer-events-none h-full w-full object-contain" />
            ) : (
              <LayoutSketch cfg={cfg} />
            )}
            {cfg.layout !== "pip" && (
              <span className="pointer-events-none absolute" style={cfg.layout === "side" ? { left: `${line}%`, top: 0, bottom: 0 } : { top: `${line}%`, left: 0, right: 0 }}>
                <span className={`absolute bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,.35)] ${cfg.layout === "side" ? "inset-y-0 -left-px w-0.5" : "inset-x-0 -top-px h-0.5"}`} />
                <span className={`absolute grid size-6 place-items-center rounded-full bg-[#ff3333] text-white shadow ${cfg.layout === "side" ? "top-1/2 -left-3 -translate-y-1/2" : "left-1/2 -top-3 -translate-x-1/2"}`}>
                  {cfg.layout === "side" ? <Columns2 className="size-3.5" /> : <Rows2 className="size-3.5" />}
                </span>
              </span>
            )}
            {drag != null && <span className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded bg-black/70 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-white tabular-nums">Asli {drag}% · Gameplay {100 - drag}%</span>}
            {preview.busy && drag == null && <span className="pointer-events-none absolute top-2 right-2"><Loader2 className="size-4 animate-spin text-white" /></span>}
          </div>
          <div className="flex w-full max-w-md items-center gap-2 text-[11px] text-white/70">
            <Eye className="size-3.5 shrink-0" />
            <span className="w-9 tabular-nums">{fmt(at)}</span>
            <input type="range" aria-label="Waktu preview" min={0} max={Math.max(1, Math.floor(clipLen) - 1)} step={1} value={Math.min(at, Math.max(1, Math.floor(clipLen) - 1))} onChange={(e) => setAt(Number(e.target.value))} className="h-1 flex-1 cursor-pointer accent-[#ff3333]" />
            <span className="w-9 text-right tabular-nums">{fmt(clipLen)}</span>
          </div>
          <p className="text-center text-[11px] text-white/60">
            {preview.error ? <span className="text-red-400">{preview.error}</span> : cfg.layout === "pip" ? "Klik pojok di layar untuk memindah video kecil" : "Geser garis merah di layar untuk mengatur porsi"}
          </p>
        </section>

        {/* inspector */}
        <section className={`${card} no-scrollbar min-h-0 overflow-y-auto`}>
          <p className="border-b px-3 py-2.5 text-[13px] font-semibold">Inspektor</p>
          {cfg.layout === "pip" ? (
            <Section icon={PictureInPicture2} color="#8b5cf6" title="Reaction" value={`kecil ${cfg.pipSize}%`}>
              <Segmented value={cfg.pipMain} onChange={(v) => set("pipMain", v)} disabled={running} items={[{ v: "original", label: "Asli penuh" }, { v: "game", label: "Gameplay penuh" }]} />
              <Slider label="Ukuran video kecil" value={cfg.pipSize} min={PIP_RANGE[0]} max={PIP_RANGE[1]} onChange={(v) => set("pipSize", v)} disabled={running} />
              <div className="grid grid-cols-4 gap-1">
                {([["tl", "Kiri atas"], ["tr", "Kanan atas"], ["bl", "Kiri bawah"], ["br", "Kanan bawah"]] as [Corner, string][]).map(([c, label]) => (
                  <button key={c} type="button" title={label} aria-label={label} aria-pressed={cfg.pipCorner === c} onClick={() => set("pipCorner", c)} disabled={running} className={`relative h-8 rounded-md border ${cfg.pipCorner === c ? "border-[#ff3333] bg-[#ff3333]/10" : "hover:bg-accent"}`}>
                    <span className={`absolute size-2.5 rounded-sm ${cfg.pipCorner === c ? "bg-[#ff3333]" : "bg-muted-foreground/50"} ${c[0] === "t" ? "top-1" : "bottom-1"} ${c[1] === "l" ? "left-1.5" : "right-1.5"}`} />
                  </button>
                ))}
              </div>
            </Section>
          ) : (
            <Section icon={Ratio} color="#8b5cf6" title="Porsi asli : gameplay" value={`${cfg.ratio} : ${100 - cfg.ratio}`}>
              <Slider label="Porsi video asli" value={cfg.ratio} min={RATIO_RANGE[0]} max={RATIO_RANGE[1]} onChange={(v) => set("ratio", v)} disabled={running} />
              <div className="flex gap-1">
                {[50, 60, 70].map((r) => (
                  <button key={r} type="button" onClick={() => set("ratio", r)} disabled={running} className={`h-6 flex-1 rounded-md text-[11px] tabular-nums ${cfg.ratio === r ? "bg-[#ff3333] font-semibold text-white" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{r} : {100 - r}</button>
                ))}
              </div>
              <Row icon={Blend} label="Garis tengah">
                <Segmented value={String(cfg.seam) as "0" | "24" | "64"} onChange={(v) => set("seam", Number(v) as Seam)} disabled={running} items={[{ v: "0", label: "Tajam" }, { v: "24", label: "Halus" }, { v: "64", label: "Lembut" }]} />
              </Row>
            </Section>
          )}
          <Section icon={Crop} color="#f59e0b" title="Tampilan">
            {([["fitOriginal", "Video asli", Video], ["fitGame", "Gameplay", Gamepad2]] as const).map(([k, label, Icon]) => (
              <Row key={k} icon={Icon} label={label}>
                <Segmented value={cfg[k]} onChange={(v: Fit) => set(k, v)} disabled={running} items={[{ v: "cover", label: "Penuh", title: "Memenuhi bagiannya, tepi terpotong" }, { v: "contain", label: "Utuh", title: "Tidak terpotong, sisanya diisi warna latar" }]} />
              </Row>
            ))}
            <Row icon={Palette} label="Latar">
              <div className="grid grid-cols-3 gap-1">
                {([["blur", "Blur", "linear-gradient(135deg,#94a3b8,#475569)"], ["black", "Hitam", "#000"], ["white", "Putih", "#fff"]] as [Fill, string, string][]).map(([v, label, bg]) => (
                  <button key={v} type="button" onClick={() => set("fill", v)} disabled={running} aria-pressed={cfg.fill === v} className={`flex h-7 items-center justify-center gap-1 rounded-md border text-[11px] font-medium disabled:opacity-50 ${cfg.fill === v ? "border-[#ff3333] bg-[#ff3333]/10 text-[#ff3333]" : "hover:bg-accent"}`}>
                    <span className="size-3 rounded-full border" style={{ background: bg }} /> {label}
                  </button>
                ))}
              </div>
            </Row>
          </Section>
          <Section icon={FlipHorizontal2} color="#f97316" title="Cermin / balik">
            {([["flipOriginal", "Video asli", Video], ["flipGame", "Gameplay", Gamepad2]] as const).map(([k, label, Icon]) => (
              <Row key={k} icon={Icon} label={label}>
                <Segmented value={cfg[k]} onChange={(v: Flip) => set(k, v)} disabled={running} items={FLIPS} />
              </Row>
            ))}
          </Section>
          <Section icon={Volume2} color="#06b6d4" title="Suara">
            {([["volOriginal", "Video asli", Video, 150], ["volGame", "Gameplay", Gamepad2, 100]] as const).map(([k, label, Icon, max]) => (
              <Row key={k} icon={Icon} label={label}>
                <div className="flex items-center gap-2">
                  <Slider label={`Volume ${label}`} value={cfg[k]} min={0} max={max} onChange={(v) => set(k, v)} disabled={running} />
                  <span className="flex w-9 shrink-0 justify-end text-[11px] tabular-nums">{cfg[k] ? `${cfg[k]}%` : <VolumeX className="size-3.5 text-muted-foreground" />}</span>
                </div>
              </Row>
            ))}
          </Section>
          <p className="px-3 py-2.5 text-[11px] text-muted-foreground">Metadata hasil dirapikan (judul & tanggal). Konfigurasi tersimpan otomatis.</p>
        </section>
      </div>

      {/* ── timeline ────────────────────────────────────────────────────────────────────────────────────────────── */}
      <section className={`${card} overflow-hidden`}>
        <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
          <span className="font-semibold">Timeline</span>
          <span className="text-muted-foreground">tiap klip = 1 video hasil · klik klip untuk lihat di layar</span>
          {queue.length > 0 && <button type="button" onClick={() => setQueue([])} className="ml-auto flex h-7 items-center gap-1 rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-3.5" /> Kosongkan</button>}
        </div>
        {queue.length ? (
          <div className="no-scrollbar overflow-x-auto">
            <div className="min-w-max">
              {(
                [
                  { id: "v1", label: "Video asli", icon: Video, color: "#0ea5e9", vol: null },
                  { id: "v2", label: "Gameplay", icon: Gamepad2, color: RED, vol: null },
                  { id: "a1", label: "Suara asli", icon: Music, color: "#0ea5e9", vol: "volOriginal" as const },
                  { id: "a2", label: "Suara game", icon: Music, color: RED, vol: "volGame" as const },
                ] as const
              ).map((tr) => (
                <div key={tr.id} className="flex border-b last:border-0">
                  {/* track header (sticky): name + mute */}
                  <div className="sticky left-0 z-10 flex w-36 shrink-0 items-center gap-1.5 border-r bg-card px-2.5 text-[11px] font-medium">
                    <tr.icon className="size-3.5" style={{ color: tr.color }} /> {tr.label}
                    {tr.vol && (
                      <button type="button" onClick={() => set(tr.vol!, cfg[tr.vol!] ? 0 : tr.vol === "volOriginal" ? 100 : 40)} disabled={running} title={cfg[tr.vol] ? "Bisukan" : "Nyalakan"} className="ml-auto grid size-6 place-items-center rounded hover:bg-accent">
                        {cfg[tr.vol] ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5 text-destructive" />}
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1 p-1.5">
                    {queue.map((rel, i) => {
                      const f = byRel.get(rel);
                      const len = lengths[rel] ?? 0;
                      const w = 90 + Math.round((len / maxLen) * 150);
                      const on = rel === clip;
                      const g = gameFor(i);
                      const muted = tr.vol ? !cfg[tr.vol] : false;
                      return (
                        <button
                          key={rel}
                          type="button"
                          onClick={() => (setActive(rel), setAt(Math.min(at, Math.max(1, Math.floor(len) - 1))))}
                          className={`group relative flex h-10 shrink-0 items-center gap-1.5 overflow-hidden rounded-md px-2 text-left text-[10px] text-white ${on ? "ring-2 ring-white" : ""} ${muted ? "opacity-35" : ""}`}
                          style={{ width: w, background: tr.id === "v1" || tr.id === "a1" ? "#0369a1" : "#b91c1c" }}
                          title={f?.name}
                        >
                          {tr.id === "v1" && <video src={`${mediaUrl(rel)}#t=1`} preload="metadata" muted className="h-8 w-[18px] shrink-0 rounded-sm object-cover" />}
                          {tr.id.startsWith("a") && <span className="flex h-6 flex-1 items-center gap-px opacity-70">{Array.from({ length: 18 }, (_, k) => <span key={k} className="w-0.5 flex-1 rounded-full bg-white" style={{ height: `${25 + ((k * 37 + i * 11) % 70)}%` }} />)}</span>}
                          {(tr.id === "v1" || tr.id === "v2") && (
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{tr.id === "v1" ? f?.name : g ? g.name : random ? "Acak" : "—"}</span>
                              <span className="block tabular-nums opacity-80">{len ? fmt(len) : "…"}</span>
                            </span>
                          )}
                          {tr.id === "v1" && (
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label="Keluarkan dari timeline"
                              onClick={(e) => (e.stopPropagation(), setQueue((qq) => qq.filter((x) => x !== rel)))}
                              onKeyDown={(e) => e.key === "Enter" && setQueue((qq) => qq.filter((x) => x !== rel))}
                              className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded bg-black/50 opacity-0 group-hover:opacity-100"
                            >
                              <X className="size-3" />
                            </span>
                          )}
                          {tr.id === "v1" && rendered[rel] && <span className="absolute bottom-0.5 right-1 text-[8px] font-semibold text-emerald-300">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 p-6 text-xs text-muted-foreground">
            <Plus className="size-4" /> Klik video di panel <b className="text-foreground">Video asli</b> untuk memasukkannya ke timeline.
          </div>
        )}
      </section>
    </div>
  );
}
