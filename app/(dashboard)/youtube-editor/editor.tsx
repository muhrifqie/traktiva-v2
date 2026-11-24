"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Blend, Check, CheckCheck, ChevronLeft, ChevronRight, Columns2, Crop, Eye, FlipHorizontal2, FolderOpen, Gamepad2, LayoutPanelLeft, Loader2, Palette, PictureInPicture2,
  PieChart, Play, Ratio, RefreshCw, Rows2, Save, Search, Shuffle, Square, Video, Volume2, VolumeX, X, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { mediaUrl } from "@/lib/media-url";
import type { EditorJob, SourceFile } from "@/lib/youtube-editor";
import { PIP_RANGE, RATIO_RANGE, SIZES, type Corner, type EditorSettings, type Fill, type Fit, type Flip, type Seam, type Size } from "@/lib/youtube-editor-config";
import { openMediaFolder, previewFrame, refreshLists, renderStatus, renderVideos, saveEditorSettings, stopRender } from "./actions";

const KEY = "trk-yt-editor"; // picks and list filters survive a refresh (the configuration itself lives in settings.json)
type Sort = "new" | "old" | "az";
type Show = "all" | "todo" | "done";
type Saved = { channel: string; picked: string[]; games: string[]; random: boolean; q: string; sort: Sort; show: Show };
const PAGE = 24;
const RED = "#ff3333";

function Segmented<T extends string>({ value, onChange, items, disabled }: { value: T; onChange: (v: T) => void; items: { v: T; label: React.ReactNode }[]; disabled?: boolean }) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-muted p-0.5">
      {items.map((it) => (
        <button key={it.v} type="button" disabled={disabled} onClick={() => onChange(it.v)} aria-pressed={value === it.v} className={`flex h-7 items-center justify-center gap-1 rounded-md px-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${value === it.v ? "bg-[#ff3333] text-white shadow-xs" : "text-muted-foreground hover:text-foreground"}`}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** One setting: colored icon + label (+ value on the right), then its control. */
function Field({ icon: Icon, color, label, value, children }: { icon: LucideIcon; color: string; label: string; value?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <span className="grid size-5 place-items-center rounded-md" style={{ background: `${color}22`, color }}><Icon className="size-3" /></span>
        {label}
        {value && <span className="ml-auto tabular-nums text-muted-foreground">{value}</span>}
      </p>
      {children}
    </div>
  );
}

function Slider({ value, min, max, step = 5, onChange, disabled, label }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; disabled?: boolean; label: string }) {
  return <input type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 w-full cursor-pointer accent-[#ff3333] disabled:opacity-50" />;
}

/** Size button: the frame's shape drawn at its aspect ratio, name and pixels. */
function SizeButton({ size, active, onClick, disabled }: { size: Size; active: boolean; onClick: () => void; disabled?: boolean }) {
  const [w, h] = size.split("x").map(Number);
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors disabled:opacity-50 ${active ? "border-[#ff3333] bg-[#ff3333]/10" : "hover:bg-accent"}`}>
      <span className="grid size-7 shrink-0 place-items-center">
        <span className={`block rounded-[3px] border-2 ${active ? "border-[#ff3333]" : "border-muted-foreground/60"}`} style={w >= h ? { width: 22, height: Math.round((22 * h) / w) } : { height: 24, width: Math.round((24 * w) / h) }} />
      </span>
      <span className="min-w-0">
        <span className={`block text-xs font-semibold ${active ? "text-[#ff3333]" : ""}`}>{SIZES[size].label}</span>
        <span className="block text-[10px] text-muted-foreground tabular-nums">{SIZES[size].note}</span>
      </span>
    </button>
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

const FLIPS: { v: Flip; label: string }[] = [
  { v: "none", label: "Asli" },
  { v: "h", label: "⇆" },
  { v: "v", label: "⇅" },
  { v: "hv", label: "⇆⇅" },
];

// Pick gameplay + downloaded Shorts, set size/layout/share/fit/sound/flip (drag the divider right on the preview), render.
export function VideoEditor({
  originals, initialGameplay, initialResults, initialJob, initialSettings, initialRendered,
}: {
  originals: { channel: string; files: SourceFile[] }[]; initialGameplay: SourceFile[]; initialResults: SourceFile[]; initialJob: EditorJob | null;
  initialSettings: EditorSettings; initialRendered: Record<string, string>;
}) {
  const [channel, setChannel] = useState(originals[0]?.channel ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [games, setGames] = useState<Set<string>>(new Set());
  const [gameplay, setGameplay] = useState(initialGameplay);
  const [results, setResults] = useState(initialResults);
  const [rendered, setRendered] = useState(initialRendered);
  const [cfg, setCfg] = useState<EditorSettings>(initialSettings);
  const [saved, setSaved] = useState(true);
  const [random, setRandom] = useState(true);
  const [job, setJob] = useState(initialJob);
  const [preview, setPreview] = useState<{ url: string | null; busy: boolean; error: string | null }>({ url: null, busy: false, error: null });
  const [drag, setDrag] = useState<number | null>(null); // divider position while dragging (%)
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

  // restore the last picks and filters after mount (no localStorage during the server render)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Saved> | null;
        if (s) {
          if (originals.some((c) => c.channel === s.channel)) setChannel(s.channel!);
          setPicked(new Set(s.picked ?? []));
          setGames(new Set(s.games ?? []));
          setRandom(s.random ?? true);
          setQ(s.q ?? "");
          setSort(s.sort ?? "new");
          setShow(s.show ?? "all");
        }
      } catch {}
      restored.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, [originals]);
  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ channel, picked: [...picked], games: [...games], random, q, sort, show } satisfies Saved));
    } catch {}
  }, [channel, picked, games, random, q, sort, show]);

  // the configuration is saved on the server (settings.json) a moment after each change
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

  // ---- originals: search, filter, sort, pages --------------------------------------------------------------
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
  const chosen = files.filter((f) => picked.has(f.rel));
  const toggle = (set: Set<string>, rel: string) => {
    const n = new Set(set);
    if (n.has(rel)) n.delete(rel);
    else n.add(rel);
    return n;
  };

  // ---- real preview: one frame of the result, redone when a setting or the sample changes ---------------------
  const sampleOriginal = (chosen[0] ?? files[0])?.rel;
  const sampleGame = (gameplay.find((g) => games.has(g.rel)) ?? gameplay[0])?.rel;
  useEffect(() => {
    if (!sampleOriginal || !sampleGame) return;
    let live = true;
    const t = setTimeout(async () => {
      setPreview((p) => ({ ...p, busy: true, error: null }));
      const r = await previewFrame(sampleOriginal, sampleGame, cfg);
      if (!live) return;
      if ("error" in r) setPreview((p) => ({ ...p, busy: false, error: r.error ?? "Gagal membuat preview" }));
      else setPreview({ url: `${mediaUrl(r.ok!)}?v=${Date.now()}`, busy: false, error: null });
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [sampleOriginal, sampleGame, cfg]);

  // drag the divider on the preview (side/stack) or click a corner (reaction)
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
      const top = e.clientY - r.top < r.height / 2;
      const left = e.clientX - r.left < r.width / 2;
      set("pipCorner", `${top ? "t" : "b"}${left ? "l" : "r"}` as Corner);
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

  const reload = async () => {
    const r = await refreshLists();
    setGameplay(r.gameplay);
    setResults(r.results);
    setRendered(r.rendered);
    setGames((g) => new Set([...g].filter((x) => r.gameplay.some((y) => y.rel === x))));
    toast.success(`${r.gameplay.length} klip gameplay`);
  };
  const render = async () => {
    const r = await renderVideos({ originals: chosen.map((f) => f.rel), gameplay: [...games], settings: cfg, random });
    if ("error" in r) return toast.error(r.error);
    setJob(r.ok ?? null);
    toast.success(`Merender ${chosen.length} video`);
  };
  const pct = job?.total ? ((job.done.length + job.failed.length) / job.total) * 100 : 0;
  const [W, H] = cfg.size.split("x").map(Number);

  if (!originals.length)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center">
        <Columns2 className="size-7 text-muted-foreground" />
        <p className="text-sm font-medium">Belum ada video asli</p>
        <p className="max-w-sm text-xs text-muted-foreground">Unduh Shorts dulu di menu Unduh Shorts. Hasilnya otomatis muncul di sini untuk digabung dengan gameplay.</p>
        <Link href="/youtube-shorts" className="mt-2 flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">Buka Unduh Shorts</Link>
      </div>
    );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        {/* 1. gameplay: a compact strip on top, always in view */}
        <section className="space-y-2.5 rounded-xl border bg-card p-3.5">
          <header className="flex flex-wrap items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-[#ff3333]/15 text-[#ff3333]"><Gamepad2 className="size-4" /></span>
            <h3 className="text-[13px] font-semibold">1. Gameplay</h3>
            <span className="text-xs text-muted-foreground">{games.size ? `${games.size} dipilih` : "tidak ada yang dipilih = pakai semua"}</span>
            <button type="button" onClick={() => void openMediaFolder("gameplay")} className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs hover:bg-accent"><FolderOpen className="size-3.5" /> Folder Gameplay</button>
            <button type="button" onClick={reload} title="Muat ulang daftar" aria-label="Muat ulang daftar" className="grid size-8 place-items-center rounded-lg border hover:bg-accent"><RefreshCw className="size-3.5" /></button>
          </header>
          {gameplay.length ? (
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
              {gameplay.map((f) => {
                const on = games.has(f.rel);
                return (
                  <button key={f.rel} type="button" onClick={() => setGames((g) => toggle(g, f.rel))} aria-pressed={on} title={f.name} className={`relative w-40 shrink-0 overflow-hidden rounded-lg border bg-muted text-left ${on ? "ring-2 ring-[#ff3333]" : ""}`}>
                    <video src={`${mediaUrl(f.rel)}#t=2`} preload="metadata" muted className="aspect-video w-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 to-transparent p-1.5 pt-4 text-[11px] text-white">{f.name}</span>
                    <span className={`absolute top-1.5 left-1.5 grid size-5 place-items-center rounded-md border text-white ${on ? "border-transparent bg-[#ff3333]" : "border-white/70 bg-black/30"}`}>{on && <Check className="size-3" />}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Belum ada klip. Klik <b>Folder Gameplay</b>, taruh video gameplay (mp4) di sana, lalu tekan muat ulang.</p>
          )}
        </section>

        {/* 2. originals: search, filter, sort and pages */}
        <section className="space-y-3 rounded-xl border bg-card p-3.5">
          <header className="flex flex-wrap items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-300"><Video className="size-4" /></span>
            <h3 className="text-[13px] font-semibold">2. Video asli</h3>
            <span className="text-xs text-muted-foreground">{chosen.length} dipilih</span>
            <select value={channel} onChange={(e) => (setChannel(e.target.value), setPicked(new Set()), setPage(0))} aria-label="Channel" className="ml-auto h-8 rounded-lg border bg-background px-2 text-xs">
              {originals.map((c) => <option key={c.channel} value={c.channel}>{c.channel} ({c.files.length})</option>)}
            </select>
          </header>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex h-8 min-w-48 flex-1 items-center gap-1.5 rounded-lg border bg-background px-2.5">
              <Search className="size-3.5 text-muted-foreground" />
              <input value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} placeholder="Cari judul…" aria-label="Cari judul" className="min-w-0 flex-1 bg-transparent outline-none" />
              {q && <button type="button" onClick={() => setQ("")} aria-label="Hapus pencarian"><X className="size-3.5 text-muted-foreground" /></button>}
            </label>
            <div className="w-52"><Segmented value={show} onChange={(v) => (setShow(v), setPage(0))} items={[{ v: "all", label: "Semua" }, { v: "todo", label: "Belum" }, { v: "done", label: "Sudah" }]} /></div>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Urutkan" className="h-8 rounded-lg border bg-background px-2">
              <option value="new">Terbaru</option>
              <option value="old">Terlama</option>
              <option value="az">Judul A–Z</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-muted-foreground">Pilih:</span>
            <button type="button" onClick={() => setPicked((p) => new Set([...p, ...shown.map((f) => f.rel)]))} className="flex h-7 items-center gap-1 rounded-lg px-2 hover:bg-accent"><CheckCheck className="size-3.5" /> Halaman ini</button>
            <button type="button" onClick={() => setPicked(new Set(filtered.map((f) => f.rel)))} className="flex h-7 items-center gap-1 rounded-lg px-2 hover:bg-accent"><CheckCheck className="size-3.5" /> Semua hasil ({filtered.length})</button>
            <button type="button" onClick={() => setPicked(new Set())} className="flex h-7 items-center gap-1 rounded-lg px-2 hover:bg-accent"><X className="size-3.5" /> Kosongkan</button>
          </div>
          {shown.length ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 xl:grid-cols-8">
              {shown.map((f) => {
                const on = picked.has(f.rel);
                return (
                  <button key={f.rel} type="button" onClick={() => setPicked((p) => toggle(p, f.rel))} aria-pressed={on} title={f.name} className={`relative overflow-hidden rounded-lg border bg-muted text-left ${on ? "ring-2 ring-sky-500" : ""}`}>
                    <video src={`${mediaUrl(f.rel)}#t=1`} preload="metadata" muted className="aspect-[9/16] w-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/85 to-transparent p-1 pt-5 text-[10px] leading-tight text-white">{f.name}</span>
                    <span className={`absolute top-1 left-1 grid size-4 place-items-center rounded border text-white ${on ? "border-transparent bg-sky-500" : "border-white/70 bg-black/30"}`}>{on && <Check className="size-3" />}</span>
                    {rendered[f.rel] && <span className="absolute top-1 right-1 rounded bg-status-ok px-1 text-[9px] font-semibold text-white">Sudah</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">Tidak ada video yang cocok.</p>
          )}
          {pages > 1 && (
            <nav className="flex flex-wrap items-center justify-center gap-1 text-xs" aria-label="Halaman">
              <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Sebelumnya" className="grid size-8 place-items-center rounded-lg border hover:bg-accent disabled:opacity-40"><ChevronLeft className="size-4" /></button>
              {Array.from({ length: pages }, (_, i) => i)
                .filter((i) => i === 0 || i === pages - 1 || Math.abs(i - current) <= 1)
                .map((i, k, arr) => (
                  <span key={i} className="flex items-center gap-1">
                    {k > 0 && i - arr[k - 1] > 1 && <span className="px-1 text-muted-foreground">…</span>}
                    <button type="button" onClick={() => setPage(i)} aria-current={i === current} className={`grid h-8 min-w-8 place-items-center rounded-lg px-2 tabular-nums ${i === current ? "bg-[#ff3333] font-semibold text-white" : "border hover:bg-accent"}`}>{i + 1}</button>
                  </span>
                ))}
              <button type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Berikutnya" className="grid size-8 place-items-center rounded-lg border hover:bg-accent disabled:opacity-40"><ChevronRight className="size-4" /></button>
              <span className="ml-2 text-muted-foreground">{filtered.length} video</span>
            </nav>
          )}
        </section>
      </div>

      {/* settings + action, stays in view */}
      <aside className="space-y-3 lg:sticky lg:top-0">
        <section className="space-y-3 rounded-xl border bg-card p-4">
          {/* preview: drag the divider (side/stack) or click a corner (reaction) right on it */}
          <div
            ref={box}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            className={`relative mx-auto touch-none overflow-hidden rounded-lg border bg-muted select-none ${cfg.layout === "pip" ? "cursor-pointer" : cfg.layout === "side" ? "cursor-ew-resize" : "cursor-ns-resize"}`}
            style={{ aspectRatio: `${W} / ${H}`, width: W > H ? "100%" : W === H ? "78%" : "58%" }}
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
                <span className={`absolute grid size-5 place-items-center rounded-full bg-[#ff3333] text-white shadow ${cfg.layout === "side" ? "top-1/2 -left-2.5 -translate-y-1/2" : "left-1/2 -top-2.5 -translate-x-1/2"}`}>
                  {cfg.layout === "side" ? <Columns2 className="size-3" /> : <Rows2 className="size-3" />}
                </span>
              </span>
            )}
            {drag != null && <span className="pointer-events-none absolute top-1.5 left-1/2 -translate-x-1/2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-white tabular-nums">Asli {drag}% · Gameplay {100 - drag}%</span>}
            {preview.busy && drag == null && <span className="pointer-events-none absolute inset-0 grid place-items-center bg-background/40"><Loader2 className="size-5 animate-spin" /></span>}
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            <Eye className="mr-1 inline size-3" />
            {preview.error ? <span className="text-destructive">{preview.error}</span> : cfg.layout === "pip" ? "Klik pojok di preview untuk memindah video kecil" : "Geser garis merah di preview untuk mengatur porsi"}
          </p>

          <Field icon={Ratio} color={RED} label="Ukuran hasil">
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(SIZES) as Size[]).map((sz) => <SizeButton key={sz} size={sz} active={cfg.size === sz} onClick={() => set("size", sz)} disabled={running} />)}
            </div>
          </Field>
          <Field icon={LayoutPanelLeft} color="#0ea5e9" label="Tata letak">
            <Segmented
              value={cfg.layout}
              onChange={(v) => set("layout", v)}
              disabled={running}
              items={[{ v: "side", label: "Kiri–kanan" }, { v: "stack", label: "Atas–bawah" }, { v: "pip", label: "Reaction" }]}
            />
          </Field>
          {cfg.layout === "pip" ? (
            <Field icon={PictureInPicture2} color="#8b5cf6" label="Reaction" value={`video kecil ${cfg.pipSize}%`}>
              <Segmented value={cfg.pipMain} onChange={(v) => set("pipMain", v)} disabled={running} items={[{ v: "original", label: <><Video className="size-3.5" /> Asli penuh</> }, { v: "game", label: <><Gamepad2 className="size-3.5" /> Gameplay penuh</> }]} />
              <Slider label="Ukuran video kecil" value={cfg.pipSize} min={PIP_RANGE[0]} max={PIP_RANGE[1]} onChange={(v) => set("pipSize", v)} disabled={running} />
              <div className="grid grid-cols-4 gap-1">
                {([["tl", "Kiri atas"], ["tr", "Kanan atas"], ["bl", "Kiri bawah"], ["br", "Kanan bawah"]] as [Corner, string][]).map(([c, label]) => (
                  <button key={c} type="button" title={label} aria-label={label} aria-pressed={cfg.pipCorner === c} onClick={() => set("pipCorner", c)} disabled={running} className={`relative h-8 rounded-md border ${cfg.pipCorner === c ? "border-[#ff3333] bg-[#ff3333]/10" : "hover:bg-accent"}`}>
                    <span className={`absolute size-2.5 rounded-sm ${cfg.pipCorner === c ? "bg-[#ff3333]" : "bg-muted-foreground/50"} ${c[0] === "t" ? "top-1" : "bottom-1"} ${c[1] === "l" ? "left-1.5" : "right-1.5"}`} />
                  </button>
                ))}
              </div>
            </Field>
          ) : (
            <>
              <Field icon={PieChart} color="#8b5cf6" label="Porsi asli : gameplay" value={`${cfg.ratio} : ${100 - cfg.ratio}`}>
                <Slider label="Porsi video asli" value={cfg.ratio} min={RATIO_RANGE[0]} max={RATIO_RANGE[1]} onChange={(v) => set("ratio", v)} disabled={running} />
                <div className="flex gap-1">
                  {[50, 60, 70].map((r) => (
                    <button key={r} type="button" onClick={() => set("ratio", r)} disabled={running} className={`h-6 flex-1 rounded-md text-[11px] tabular-nums ${cfg.ratio === r ? "bg-[#ff3333] font-semibold text-white" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{r} : {100 - r}</button>
                  ))}
                </div>
              </Field>
              <Field icon={Blend} color="#a855f7" label="Garis tengah">
                <Segmented value={String(cfg.seam) as "0" | "24" | "64"} onChange={(v) => set("seam", Number(v) as Seam)} disabled={running} items={[{ v: "0", label: "Tajam" }, { v: "24", label: "Halus" }, { v: "64", label: "Lembut" }]} />
              </Field>
            </>
          )}
          <Field icon={Crop} color="#f59e0b" label="Mode tampil">
            <div className="grid grid-cols-2 gap-2">
              {([["fitOriginal", "Video asli", Video], ["fitGame", "Gameplay", Gamepad2]] as const).map(([k, label, Icon]) => (
                <div key={k} className="space-y-1">
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Icon className="size-3" /> {label}</p>
                  <Segmented value={cfg[k]} onChange={(v: Fit) => set(k, v)} disabled={running} items={[{ v: "cover", label: "Penuh" }, { v: "contain", label: "Utuh" }]} />
                </div>
              ))}
            </div>
          </Field>
          <Field icon={FlipHorizontal2} color="#f97316" label="Cermin / balik">
            {([["flipOriginal", "Video asli", Video], ["flipGame", "Gameplay", Gamepad2]] as const).map(([k, label, Icon]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="flex w-20 shrink-0 items-center gap-1 text-[11px] text-muted-foreground"><Icon className="size-3" /> {label}</span>
                <div className="flex-1"><Segmented value={cfg[k]} onChange={(v: Flip) => set(k, v)} disabled={running} items={FLIPS} /></div>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">⇆ cermin kiri-kanan · ⇅ balik atas-bawah</p>
          </Field>
          <Field icon={Palette} color="#10b981" label="Warna latar (mode Utuh)">
            <div className="grid grid-cols-3 gap-1.5">
              {([["blur", "Blur", "linear-gradient(135deg,#94a3b8,#475569)"], ["black", "Hitam", "#000"], ["white", "Putih", "#fff"]] as [Fill, string, string][]).map(([v, label, bg]) => (
                <button key={v} type="button" onClick={() => set("fill", v)} disabled={running} aria-pressed={cfg.fill === v} className={`flex h-8 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium disabled:opacity-50 ${cfg.fill === v ? "border-[#ff3333] bg-[#ff3333]/10 text-[#ff3333]" : "hover:bg-accent"}`}>
                  <span className="size-3.5 rounded-full border" style={{ background: bg }} /> {label}
                </button>
              ))}
            </div>
          </Field>
          <Field icon={Volume2} color="#06b6d4" label="Suara">
            {([["volOriginal", "Video asli", Video, 150], ["volGame", "Gameplay", Gamepad2, 100]] as const).map(([k, label, Icon, max]) => (
              <div key={k} className="flex items-center gap-2 text-[11px]">
                <span className="flex w-20 shrink-0 items-center gap-1 text-muted-foreground"><Icon className="size-3" /> {label}</span>
                <Slider label={`Volume ${label}`} value={cfg[k]} min={0} max={max} onChange={(v) => set(k, v)} disabled={running} />
                <span className="flex w-10 shrink-0 items-center justify-end tabular-nums">{cfg[k] ? `${cfg[k]}%` : <VolumeX className="size-3.5 text-muted-foreground" />}</span>
              </div>
            ))}
          </Field>
          <Field icon={Shuffle} color="#ec4899" label="Klip gameplay per video">
            <Segmented value={random ? "acak" : "urut"} onChange={(v) => setRandom(v === "acak")} disabled={running} items={[{ v: "acak", label: <><Shuffle className="size-3.5" /> Acak</> }, { v: "urut", label: "Bergiliran" }]} />
          </Field>
          <p className="flex items-center gap-1.5 border-t pt-2.5 text-[11px] text-muted-foreground">
            {saved ? <Save className="size-3.5 text-status-ok" /> : <Loader2 className="size-3.5 animate-spin" />}
            {saved ? "Konfigurasi tersimpan" : "Menyimpan konfigurasi…"} · metadata hasil dirapikan (judul & tanggal)
          </p>
        </section>

        {job && (job.running || job.total > 0) && (
          <section className="space-y-2.5 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-[13px] font-medium">
              {job.running ? <Loader2 className="size-4 animate-spin text-[#ff3333]" /> : <Check className="size-4 text-status-ok" />}
              <span className="flex-1">{job.running ? "Merender" : job.cancelled ? "Dibatalkan" : "Selesai"} {job.done.length}/{job.total}</span>
              {job.failed.length > 0 && <span className="text-xs text-destructive">{job.failed.length} gagal</span>}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#ff3333] transition-[width]" style={{ width: `${pct}%` }} /></div>
            {job.current && <p className="truncate text-xs text-muted-foreground">{job.current}</p>}
            {job.failed.map((f) => <p key={f} className="text-[11px] text-destructive">{f}</p>)}
            {job.running && <button type="button" onClick={() => void stopRender()} className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border text-xs font-medium hover:border-destructive/40 hover:text-destructive"><Square className="size-3.5" /> Batalkan</button>}
          </section>
        )}

        <button type="button" onClick={render} disabled={running || !chosen.length} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          {running ? "Sedang merender…" : chosen.length ? `Render ${chosen.length} video` : "Pilih video asli dulu"}
        </button>

        {results.length > 0 && (
          <section className="space-y-2 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <h3 className="flex-1 text-[13px] font-semibold">Hasil terbaru</h3>
              <button type="button" onClick={() => void openMediaFolder("results")} className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs hover:bg-accent"><FolderOpen className="size-3.5" /> Folder</button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {results.slice(0, 9).map((r) => (
                <a key={r.rel} href={mediaUrl(r.rel)} target="_blank" rel="noreferrer" title={r.name} className="overflow-hidden rounded-md border bg-muted">
                  <video src={`${mediaUrl(r.rel)}#t=1`} preload="metadata" muted className="aspect-[9/16] w-full object-cover" />
                </a>
              ))}
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}
