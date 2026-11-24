"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Blend, Bookmark, CalendarClock, Check, ExternalLink, Trash2, Type, Frame, Layers, Maximize2, Move, Play, Scissors, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Columns2, Crop, FlipHorizontal2, FolderOpen, Loader2, Palette, PictureInPicture2,
  Music, Plus, Ratio, RefreshCw, Rows2, Search, Shuffle, Square, Timer, Upload, Video, Volume2, VolumeX, X, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { mediaUrl } from "@/lib/media-url";
import type { EditorPreset, YouTubeUploadDefaults } from "@/lib/settings";
import type { EditorJob, SourceFile } from "@/lib/youtube-editor";
import { ASPECTS, PIP_RANGE, pipBox, RATIO_RANGE, SIZES, type Aspect, type EditorSettings, type Fill, type Fit, type Flip, type Seam, type Shape, type Size } from "@/lib/youtube-editor-config";
import { clipLengths, deletePreset, removeEditorFile, showEditorFile, musicList, savePreset, scheduleResults, openMediaFolder, previewClip, previewFrame, refreshLists, renderStatus, renderVideos, saveEditorSettings, stopRender, uploadEditorMusic } from "./actions";

// YouTube → Editor, full screen over the app (sidebar hidden): media on the left, the live monitor in the middle,
// settings on the right. Click Shorts to pick them, drag the divider (or the reaction overlay) on the monitor, press Render.

const KEY = "trk-yt-editor"; // picks and media filters survive a refresh (the configuration lives in settings.json)
type Tab = "asli" | "game" | "hasil";
type Sort = "new" | "old" | "az";
type Show = "all" | "todo" | "done";
type Saved = { channel: string; queue: string[]; games: string[]; random: boolean; q: string; sort: Sort; show: Show; tab: Tab };
const PAGE = 24;
const PREVIEW_SECS = 6; // length of the playable preview (lib renderPreviewClip default)
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
// monitor backdrop: warm dark squares, like an editor canvas
const CHECKER: React.CSSProperties = {
  backgroundColor: "#16110e",
  backgroundImage: "conic-gradient(#2a211c 25%, transparent 0 50%, #2a211c 0 75%, transparent 0)",
  backgroundSize: "24px 24px",
};
const ON = "border-orange-400/60 bg-orange-500/10 font-semibold text-orange-600 dark:text-orange-300";

function Segmented<T extends string>({ value, onChange, items, disabled }: { value: T; onChange: (v: T) => void; items: { v: T; label: React.ReactNode; title?: string }[]; disabled?: boolean }) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-muted p-0.5">
      {items.map((it) => (
        <button key={it.v} type="button" title={it.title} disabled={disabled} onClick={() => onChange(it.v)} aria-pressed={value === it.v} className={`flex h-8 items-center justify-center gap-1 rounded-md px-1.5 text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-50 ${value === it.v ? "bg-amber-500/20 text-orange-700 shadow-sm ring-1 ring-amber-500/40 dark:text-amber-200" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"}`}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ value, min, max, step = 5, onChange, disabled, label }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; disabled?: boolean; label: string }) {
  return <input type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 w-full cursor-pointer accent-orange-500 disabled:opacity-50" />;
}

/** Settings section: icon + title (+ current value), folds open/closed. */
function Section({ icon: Icon, tone, title, value, children }: { icon: LucideIcon; tone: string; title: string; value?: string; children: React.ReactNode }) {
  return (
    <details open className="group border-b last:border-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-semibold select-none hover:bg-accent/40">
        <span className={`grid size-6 place-items-center rounded-md ${tone}`}><Icon className="size-3.5" /></span>
        {title}
        {value && <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">{value}</span>}
        <ChevronDown className={`size-4 text-muted-foreground transition-transform group-open:rotate-180 ${value ? "" : "ml-auto"}`} />
      </summary>
      <div className="space-y-2.5 px-4 pb-4">{children}</div>
    </details>
  );
}

function Row({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-[78px] shrink-0 items-center gap-1 text-[11px] text-muted-foreground"><Icon className="size-3.5" /> {label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Sketch of the frame (before a real preview frame exists): where each video goes. */
function LayoutSketch({ cfg }: { cfg: EditorSettings }) {
  const part = "grid h-full w-full place-items-center text-[11px] font-medium";
  const asli = <span className={`${part} bg-amber-500/20 text-amber-200`}><Video className="mb-0.5 size-5" />Asli</span>;
  const game = <span className={`${part} bg-rose-500/20 text-rose-200`}><Layers className="mb-0.5 size-5" />Overlay</span>;
  if (cfg.layout === "pip") return cfg.pipMain === "original" ? asli : game;
  const track = `${cfg.ratio}fr ${100 - cfg.ratio}fr`;
  return <div className="grid h-full w-full" style={cfg.layout === "side" ? { gridTemplateColumns: track } : { gridTemplateRows: track }}>{asli}{game}</div>;
}

const SHAPES: { v: Shape; label: string; radius: string }[] = [
  { v: "rect", label: "Kotak", radius: "1px" },
  { v: "round", label: "Bulat", radius: "4px" },
  { v: "circle", label: "Lingkaran", radius: "999px" },
];

const PANELS_KEY = "trk-yt-editor-panels";
const PANELS = { left: 320, right: 320 };
const PANEL_RANGE = [240, 560] as const;

/** Drag bar between two panels: reports the pointer's horizontal movement while held. */
function Gutter({ onDrag, onDone, onReset }: { onDrag: (dx: number) => void; onDone: () => void; onReset: () => void }) {
  const last = useRef<number | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title="Geser untuk mengubah lebar panel (klik ganda: lebar awal)"
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        last.current = e.clientX;
      }}
      onPointerMove={(e) => {
        if (last.current == null) return;
        onDrag(e.clientX - last.current);
        last.current = e.clientX;
      }}
      onPointerUp={() => {
        last.current = null;
        onDone();
      }}
      onDoubleClick={onReset}
      className="group flex cursor-col-resize touch-none items-center justify-center select-none"
    >
      <span className="h-12 w-1 rounded-full bg-border transition-colors group-hover:bg-orange-400 group-active:bg-orange-500" />
    </div>
  );
}

const FLIPS: { v: Flip; label: string; title: string }[] = [
  { v: "none", label: "Asli", title: "Tidak dibalik" },
  { v: "h", label: "⇆", title: "Cermin kiri-kanan" },
  { v: "v", label: "⇅", title: "Balik atas-bawah" },
  { v: "hv", label: "⇆⇅", title: "Keduanya" },
];

export function VideoEditor({
  originals, initialGameplay, initialResults, initialJob, initialSettings, initialRendered, initialMusic, initialPresets, channels, uploadDefaults, initialPick,
}: {
  originals: { channel: string; files: SourceFile[] }[]; initialGameplay: SourceFile[]; initialResults: SourceFile[]; initialJob: EditorJob | null;
  initialSettings: EditorSettings; initialRendered: Record<string, string>; initialMusic: { src: string; name: string; dur: number }[];
  initialPresets: EditorPreset[]; channels: { id: number; name: string }[]; uploadDefaults: YouTubeUploadDefaults; initialPick: string | null;
}) {
  const [tab, setTab] = useState<Tab>("asli");
  const [channel, setChannel] = useState(originals[0]?.channel ?? "");
  const [queue, setQueue] = useState<string[]>([]); // picked originals, in render order
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
  const [vid, setVid] = useState<{ url: string | null; key: string; busy: boolean }>({ url: null, key: "", busy: false });
  const [music, setMusic] = useState(initialMusic);
  const [presets, setPresets] = useState(initialPresets);
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initialPick ? [initialPick] : [])); // results chosen for the Kalender
  const [plan, setPlan] = useState(() => ({
    accountId: channels[0]?.id ?? 0,
    startAt: "",
    gap: 120,
    title: uploadDefaults.title,
    description: uploadDefaults.description,
    tags: uploadDefaults.tags,
    visibility: uploadDefaults.visibility,
  }));
  const [scheduling, setScheduling] = useState(false);
  // right-click menu on any video: an original, an overlay clip or a result
  type MenuKind = "asli" | "game" | "hasil";
  const [menu, setMenu] = useState<{ x: number; y: number; rel: string; name: string; kind: MenuKind } | null>(null);
  const router = useRouter();
  useEffect(() => {
    if (!menu) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menu]);
  const openMenu = (kind: MenuKind, rel: string, name: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 200), rel, name, kind });
  };
  const reveal = async (rel: string) => {
    setMenu(null);
    const r = await showEditorFile(rel);
    if ("error" in r) toast.error(r.error);
  };
  const without = (rel: string) => (s0: Set<string>) => {
    const n = new Set(s0);
    n.delete(rel);
    return n;
  };
  const trash = async (kind: MenuKind, rel: string, name: string) => {
    setMenu(null);
    const what = { asli: "Video asli", game: "Video overlay", hasil: "File hasil" }[kind];
    const extra = { asli: " Thumbnail dan deskripsinya ikut dipindah.", game: " File yang sangat besar bisa langsung terhapus permanen kalau Recycle Bin penuh.", hasil: " Jadwal yang sudah memakai video ini akan gagal." }[kind];
    if (!(await confirmDialog({ title: `Hapus "${name.replace(/^\d{14}\s+/, "").slice(0, 60)}"?`, description: `${what} dipindah ke Recycle Bin, masih bisa dikembalikan dari sana.${extra}`, danger: true }))) return;
    const r = await removeEditorFile(rel);
    if ("error" in r) return toast.error(r.error);
    setResults(r.ok!.results);
    setRendered(r.ok!.rendered);
    setGameplay(r.ok!.gameplay);
    setPicked(without(rel));
    setGames(without(rel));
    setQueue((qq) => qq.filter((x) => x !== rel));
    if (kind === "asli") router.refresh(); // the originals list comes from the server
    toast.success("Video dipindah ke Recycle Bin");
  };
  const applyPreset = (pr: EditorPreset) => {
    setMany(pr.settings);
    setPresetOpen(false);
    toast.success(`Gaya "${pr.name}" dipakai`);
  };
  const storePreset = async () => {
    const name = presetName.trim();
    if (!name) return toast.error("Beri nama gaya dulu.");
    setPresets(await savePreset(name, cfg));
    setPresetName("");
    toast.success(`Gaya "${name}" disimpan`);
  };
  const dropPreset = async (name: string) => setPresets(await deletePreset(name));
  const togglePicked = (rel: string) =>
    setPicked((s0) => {
      const n = new Set(s0);
      if (n.has(rel)) n.delete(rel);
      else n.add(rel);
      return n;
    });
  const schedule = async () => {
    if (!plan.accountId) return toast.error("Belum ada channel YouTube. Hubungkan di menu Akun.");
    const startAt = plan.startAt ? new Date(plan.startAt).getTime() : Date.now() + 10 * 60_000;
    setScheduling(true);
    // oldest first, so the queue follows the render order
    const videos = results.filter((r) => picked.has(r.rel)).map((r) => r.rel).reverse();
    const r = await scheduleResults({ accountId: plan.accountId, videos, startAt, gapMinutes: plan.gap, title: plan.title, description: plan.description, tags: plan.tags, visibility: plan.visibility, madeForKids: uploadDefaults.madeForKids, aiContent: uploadDefaults.aiContent });
    setScheduling(false);
    if ("error" in r) return toast.error(r.error);
    setPicked(new Set());
    toast.success(`${r.ok!.count} video masuk Kalender Upload, mulai ${new Date(r.ok!.first).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}`);
  };
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState<string | null>(null);
  const ear = useRef<HTMLAudioElement>(null);
  const listen = (src: string) => {
    const a = ear.current!;
    if (listening === src) {
      a.pause();
      setListening(null);
      return;
    }
    a.src = mediaUrl(src);
    a.volume = 0.6;
    void a.play();
    setListening(src);
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.set("music", file);
    const r = await uploadEditorMusic(fd);
    setUploading(false);
    if ("error" in r) return toast.error(r.error);
    setMusic(await musicList());
    set("music", r.ok!.src);
    toast.success(`Musik "${r.ok!.name}" ditambahkan`);
  };
  const [drag, setDrag] = useState<number | null>(null);
  // reaction overlay being moved/resized on the monitor (committed on release)
  const [ov, setOv] = useState<{ x: number; y: number; size: number } | null>(null);
  const ovStart = useRef<{ cx: number; cy: number; mode: "move" | "size"; scale: number; box: ReturnType<typeof pipBox> } | null>(null);
  const [at, setAt] = useState(2); // monitor time (s) inside the clip
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [show, setShow] = useState<Show>("all");
  const [page, setPage] = useState(0);
  const restored = useRef(false);
  const [panels, setPanels] = useState(PANELS);
  const resize = (side: "left" | "right", dx: number) =>
    setPanels((p) => ({ ...p, [side]: Math.round(Math.min(PANEL_RANGE[1], Math.max(PANEL_RANGE[0], p[side] + dx))) }));
  const savePanels = () =>
    setPanels((p) => {
      try {
        localStorage.setItem(PANELS_KEY, JSON.stringify(p));
      } catch {}
      return p;
    });
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const p = JSON.parse(localStorage.getItem(PANELS_KEY) ?? "null") as typeof PANELS | null;
        if (p?.left && p?.right) setPanels({ left: Math.min(PANEL_RANGE[1], Math.max(PANEL_RANGE[0], p.left)), right: Math.min(PANEL_RANGE[1], Math.max(PANEL_RANGE[0], p.right)) });
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const running = !!job?.running;
  const setMany = (patch: Partial<EditorSettings>) => {
    setSaved(false);
    setCfg((c) => ({ ...c, ...patch }));
  };
  const set = <K extends keyof EditorSettings>(k: K, v: EditorSettings[K]) => setMany({ [k]: v } as Partial<EditorSettings>);

  // restore picks and media filters after mount (no localStorage during the server render)
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
        if (initialPick) {
          setTab("hasil"); // came from Galeri → Jadwalkan
        }
      } catch {}
      restored.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, [originals, initialPick]);
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

  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      const j = await renderStatus();
      setJob(j);
      if (!j?.running) {
        const r = await refreshLists();
        setResults(r.results);
        setRendered(r.rendered);
        const fresh = j?.done.map((d) => d.rel) ?? [];
        setPicked(new Set(fresh));
        toast.success(`${fresh.length} video selesai dirender`, { action: fresh.length ? { label: "Jadwalkan", onClick: () => setTab("hasil") } : undefined });
      }
    }, 1500);
    return () => clearInterval(t);
  }, [running]);

  // ---- media ------------------------------------------------------------------------------------------------------
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
  const pick = (rel: string) => {
    if (inQueue.has(rel)) setQueue((qq) => qq.filter((x) => x !== rel));
    else {
      setQueue((qq) => [...qq, rel]);
      setActive(rel);
    }
  };
  const toggleGame = (rel: string) =>
    setGames((g) => {
      const n = new Set(g);
      if (n.has(rel)) n.delete(rel);
      else n.add(rel);
      return n;
    });

  // ---- monitor ----------------------------------------------------------------------------------------------------
  const clip = active && (inQueue.has(active) || byRel.has(active)) ? active : (queue[0] ?? files[0]?.rel ?? null);
  const idx = queue.indexOf(clip ?? "");
  const step = (d: number) => queue.length && setActive(queue[(Math.max(idx, 0) + d + queue.length) % queue.length]);
  const pool = gameplay.filter((g) => games.has(g.rel)).length ? gameplay.filter((g) => games.has(g.rel)) : gameplay;
  const sampleGame = (random ? pool[0] : pool[Math.max(idx, 0) % Math.max(pool.length, 1)])?.rel;
  const clipLen = clip ? (lengths[clip] ?? 0) : 0;
  const gameLen = sampleGame ? (lengths[sampleGame] ?? 0) : 0;
  useEffect(() => {
    const need = [clip, sampleGame].filter((r): r is string => !!r && !(r in lengths));
    if (!need.length) return;
    let live = true;
    void clipLengths(need).then((r) => live && setLengths((l) => ({ ...l, ...r })));
    return () => {
      live = false;
    };
  }, [clip, sampleGame, lengths]);
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
    if (cfg.layout === "pip") return;
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
  // playable preview: shown only while it still matches what is on the monitor (any change falls back to the still)
  const vidKey = JSON.stringify([clip, sampleGame, cfg, at]);
  const showVid = !!vid.url && vid.key === vidKey;
  const playPreview = async () => {
    if (!clip || !sampleGame) return;
    const key = vidKey;
    setVid({ url: null, key, busy: true });
    const r = await previewClip(clip, sampleGame, cfg, at);
    if ("error" in r) {
      setVid({ url: null, key: "", busy: false });
      toast.error(r.error ?? "Preview video gagal dibuat");
    } else setVid({ url: mediaUrl(r.ok!), key, busy: false });
  };
  const pb = pipBox(ov ? { ...cfg, pipX: ov.x, pipY: ov.y, pipSize: ov.size } : cfg, W, H);
  const ovDown = (e: React.PointerEvent, mode: "move" | "size") => {
    if (running) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    ovStart.current = { cx: e.clientX, cy: e.clientY, mode, scale: box.current!.getBoundingClientRect().width / W, box: pipBox(cfg, W, H) };
    setOv({ x: cfg.pipX, y: cfg.pipY, size: cfg.pipSize });
  };
  const ovMove = (e: React.PointerEvent) => {
    const st = ovStart.current;
    if (!st) return;
    const dx = (e.clientX - st.cx) / st.scale;
    const dy = (e.clientY - st.cy) / st.scale;
    const b = st.box;
    const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)));
    if (st.mode === "size") setOv((o) => o && { ...o, size: clamp(((b.w + dx) / W) * 100, PIP_RANGE[0], PIP_RANGE[1]) });
    else {
      const fx = W - b.tw - 2 * b.m;
      const fy = H - b.th - 2 * b.m;
      setOv((o) => o && { ...o, x: fx > 0 ? clamp(((b.x + dx - b.m) / fx) * 100, 0, 100) : o.x, y: fy > 0 ? clamp(((b.y + dy - b.m) / fy) * 100, 0, 100) : o.y });
    }
  };
  const ovUp = () => {
    if (!ovStart.current || !ov) return;
    ovStart.current = null;
    setMany({ pipX: ov.x, pipY: ov.y, pipSize: ov.size });
    setOv(null);
  };

  // ---- actions ----------------------------------------------------------------------------------------------------
  const reload = async () => {
    const r = await refreshLists();
    setGameplay(r.gameplay);
    setResults(r.results);
    setRendered(r.rendered);
    setGames((g) => new Set([...g].filter((x) => r.gameplay.some((y) => y.rel === x))));
    toast.success(`${r.gameplay.length} video overlay`);
  };
  const render = async () => {
    if (!gameplay.length) return toast.error("Tambahkan video overlay dulu (tab Overlay → Folder overlay).");
    const r = await renderVideos({ originals: queue, gameplay: [...games], settings: cfg, random });
    if ("error" in r) return toast.error(r.error);
    setJob(r.ok ?? null);
    toast.success(`Merender ${queue.length} video`);
  };
  const pct = job?.total ? ((job.done.length + job.failed.length) / job.total) * 100 : 0;

  const shell = "fixed inset-x-0 top-[calc(var(--titlebar-height)+var(--header-height))] bottom-(--statusbar-height) z-40 flex flex-col bg-sidebar";
  const back = (
    <Link href="/youtube" className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
      <ArrowLeft className="size-4" /> Kembali
    </Link>
  );
  if (!originals.length)
    return (
      <div className={shell}>
        <div className="p-3">{back}</div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <Clapperboard className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">Belum ada video asli</p>
          <p className="max-w-sm text-xs text-muted-foreground">Unduh Shorts dulu di menu Unduh Shorts. Hasilnya otomatis muncul di sini untuk digabung dengan gameplay.</p>
          <Link href="/youtube-shorts" className="mt-2 flex h-9 items-center rounded-lg bg-orange-500 text-white shadow-sm hover:bg-orange-600 px-3.5 text-[13px] font-medium">Buka Unduh Shorts</Link>
        </div>
      </div>
    );

  const card = "rounded-xl border bg-card";
  return (
    <div className={shell}>
      {/* ── toolbar ─────────────────────────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        {back}
        <div className="h-5 w-px bg-border" />
        <span className="flex items-center gap-1.5 px-1 text-[13px] font-semibold"><Clapperboard className="size-4 text-orange-500" /> Editor Video</span>
        <div className="mx-1 h-5 w-px bg-border" />
        <div className="flex gap-1">
          {(Object.keys(SIZES) as Size[]).map((sz) => {
            const [w, h] = sz.split("x").map(Number);
            const on = cfg.size === sz;
            return (
              <button key={sz} type="button" disabled={running} onClick={() => set("size", sz)} aria-pressed={on} title={`${SIZES[sz].label} ${SIZES[sz].note}`} className={`flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors disabled:opacity-50 ${on ? ON : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
                <span className={`block rounded-[2px] border-[1.5px] ${on ? "border-orange-400" : "border-current"}`} style={w >= h ? { width: 14, height: Math.round((14 * h) / w) } : { height: 14, width: Math.round((14 * w) / h) }} />
                {SIZES[sz].label}
              </button>
            );
          })}
        </div>
        <div className="mx-1 h-5 w-px bg-border" />
        <div className="w-72">
          <Segmented value={cfg.layout} onChange={(v) => set("layout", v)} disabled={running} items={[{ v: "side", label: <><Columns2 className="size-3.5" /> Samping</> }, { v: "stack", label: <><Rows2 className="size-3.5" /> Tumpuk</> }, { v: "pip", label: <><PictureInPicture2 className="size-3.5" /> Reaction</> }]} />
        </div>
        <div className="relative">
          <button type="button" onClick={() => setPresetOpen((v) => !v)} aria-expanded={presetOpen} className={`flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs ${presetOpen ? ON : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
            <Bookmark className="size-3.5" /> Gaya {presets.length > 0 && <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{presets.length}</span>}
            <ChevronDown className="size-3.5" />
          </button>
          {presetOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setPresetOpen(false)} />
              <div className="absolute top-11 left-0 z-50 w-72 rounded-xl border bg-popover p-2 text-popover-foreground shadow-xl">
                <p className="px-1.5 pb-1.5 text-[11px] font-semibold text-muted-foreground">Gaya tersimpan</p>
                <div className="no-scrollbar max-h-64 space-y-0.5 overflow-y-auto">
                  {presets.map((pr) => (
                    <div key={pr.name} className="group flex items-center gap-1 rounded-lg hover:bg-accent">
                      <button type="button" onClick={() => applyPreset(pr)} disabled={running} className="flex h-9 min-w-0 flex-1 items-center gap-2 px-2 text-left text-xs">
                        <Bookmark className="size-3.5 shrink-0 text-orange-500" />
                        <span className="truncate">{pr.name}</span>
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{SIZES[pr.settings.size]?.label} · {{ side: "Samping", stack: "Tumpuk", pip: "Reaction" }[pr.settings.layout]}</span>
                      </button>
                      <button type="button" onClick={() => void dropPreset(pr.name)} aria-label={`Hapus gaya ${pr.name}`} title="Hapus" className="mr-1 grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"><Trash2 className="size-3.5" /></button>
                    </div>
                  ))}
                  {!presets.length && <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">Belum ada. Atur Editor, lalu simpan di bawah.</p>}
                </div>
                <div className="mt-2 flex gap-1.5 border-t pt-2">
                  <input value={presetName} onChange={(e) => setPresetName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void storePreset()} maxLength={40} placeholder="Nama gaya, mis. Reaction pojok" aria-label="Nama gaya" className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-orange-400/40" />
                  <button type="button" onClick={() => void storePreset()} className="h-8 shrink-0 rounded-md bg-orange-500 px-2.5 text-xs font-semibold text-white hover:bg-orange-600">Simpan</button>
                </div>
              </div>
            </>
          )}
        </div>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {saved ? <Check className="size-3.5 text-amber-500" /> : <Loader2 className="size-3.5 animate-spin" />} {saved ? "Tersimpan" : "Menyimpan…"}
        </span>
        {running && (
          <button type="button" onClick={() => void stopRender()} className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium hover:border-destructive/40 hover:text-destructive"><Square className="size-4" /> Batalkan</button>
        )}
        <button type="button" onClick={render} disabled={running || !queue.length} title={queue.length ? undefined : "Pilih video asli dulu"} className="relative flex h-9 items-center gap-1.5 overflow-hidden rounded-lg bg-orange-500 text-white shadow-sm hover:bg-orange-600 px-4 text-[13px] font-semibold disabled:opacity-50">
          {running && <span className="absolute inset-y-0 left-0 bg-white/20 transition-[width]" style={{ width: `${pct}%` }} />}
          {running ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          <span className="relative">{running ? `Merender ${job!.done.length}/${job!.total}` : queue.length ? `Render ${queue.length} video` : "Render"}</span>
        </button>
      </div>

      {/* ── media | monitor | settings ──────────────────────────────────────────────────────────────────────────── */}
      <div className="grid min-h-0 flex-1 p-3" style={{ gridTemplateColumns: `${panels.left}px 12px minmax(0,1fr) 12px ${panels.right}px` }}>
        {/* media */}
        <section className={`${card} flex min-h-0 flex-col overflow-hidden`}>
          <div className="grid grid-cols-3 gap-1 border-b p-1.5 text-xs font-medium">
            {([["asli", "Video asli", Video, queue.length], ["game", "Overlay", Layers, games.size], ["hasil", "Hasil", Check, results.length]] as const).map(([t, label, Icon, n]) => (
              <button key={t} type="button" onClick={() => setTab(t)} className={`flex h-8 items-center justify-center gap-1 rounded-md transition-colors ${tab === t ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="size-3.5" /> {label}
                {n > 0 && <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${tab === t ? "bg-orange-500 text-white" : "bg-muted"}`}>{n}</span>}
              </button>
            ))}
          </div>
          {tab === "asli" && (
            <div className="flex min-h-0 flex-1 flex-col gap-2 p-2.5">
              <select value={channel} onChange={(e) => (setChannel(e.target.value), setPage(0))} aria-label="Channel" className="h-9 rounded-lg border bg-background px-2 text-xs">
                {originals.map((c) => <option key={c.channel} value={c.channel}>{c.channel} ({c.files.length})</option>)}
              </select>
              <label className="flex h-9 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-xs focus-within:ring-2 focus-within:ring-orange-400/40">
                <Search className="size-3.5 text-muted-foreground" />
                <input value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} placeholder="Cari judul…" aria-label="Cari judul" className="min-w-0 flex-1 bg-transparent outline-none" />
                {q && <button type="button" onClick={() => setQ("")} aria-label="Hapus pencarian"><X className="size-3.5 text-muted-foreground" /></button>}
              </label>
              <div className="flex gap-1.5">
                <div className="flex-1"><Segmented value={show} onChange={(v) => (setShow(v), setPage(0))} items={[{ v: "all", label: "Semua" }, { v: "todo", label: "Belum" }, { v: "done", label: "Sudah" }]} /></div>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Urutkan" className="h-9 rounded-lg border bg-background px-1.5 text-xs">
                  <option value="new">Terbaru</option>
                  <option value="old">Terlama</option>
                  <option value="az">A–Z</option>
                </select>
              </div>
              <div className="flex items-center gap-1 text-[11px]">
                <span className="flex-1 text-muted-foreground">{queue.length ? <><b className="text-foreground">{queue.length}</b> dipilih</> : "Klik video untuk memilih"}</span>
                <button type="button" onClick={() => setQueue((qq) => [...qq, ...shown.map((f) => f.rel).filter((r) => !qq.includes(r))])} className="flex h-7 items-center gap-1 rounded-md px-2 hover:bg-accent"><Plus className="size-3" /> Pilih halaman</button>
                {queue.length > 0 && <button type="button" onClick={() => setQueue([])} className="flex h-7 items-center gap-1 rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-3" /> Hapus</button>}
              </div>
              <div className="no-scrollbar -mx-1 grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2 overflow-y-auto p-1">
                {shown.map((f) => {
                  const on = inQueue.has(f.rel);
                  const n = queue.indexOf(f.rel) + 1;
                  return (
                    <div key={f.rel} onContextMenu={openMenu("asli", f.rel, f.name)} className={`group relative overflow-hidden rounded-lg border bg-muted transition-shadow ${on ? "ring-2 ring-orange-400" : "hover:ring-2 hover:ring-border"} ${menu?.rel === f.rel ? "ring-2 ring-amber-400" : ""}`}>
                      <button type="button" onClick={() => pick(f.rel)} title={`${on ? "Batal pilih" : "Pilih"}: ${f.name}`} className="block w-full text-left">
                        <video src={`${mediaUrl(f.rel)}#t=1`} preload="metadata" muted className="aspect-[9/16] w-full object-cover" />
                        <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/85 to-transparent p-1.5 pt-5 text-[9px] leading-tight text-white">{f.name}</span>
                      </button>
                      <span className={`pointer-events-none absolute top-1 left-1 grid size-5 place-items-center rounded-full text-[10px] font-bold ${on ? "bg-amber-400 text-black" : "border border-white/70 bg-black/30 text-white opacity-0 group-hover:opacity-100"}`}>{on ? n : <Plus className="size-3" />}</span>
                      {f.rel === clip && <span className="pointer-events-none absolute top-1 right-1 rounded bg-amber-400 px-1 text-[8px] font-semibold text-black">Di layar</span>}
                      {rendered[f.rel] && f.rel !== clip && <span className="pointer-events-none absolute top-1 right-1 rounded bg-black/60 px-1 text-[8px] font-semibold text-emerald-300">✓ Sudah</span>}
                      <button type="button" onClick={() => setActive(f.rel)} title="Lihat di layar" className="absolute right-1 bottom-8 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white opacity-0 group-hover:opacity-100">Lihat</button>
                    </div>
                  );
                })}
                {!shown.length && <p className="col-span-full p-4 text-center text-xs text-muted-foreground">Tidak ada video yang cocok.</p>}
              </div>
              <div className="flex items-center gap-1 text-[11px]">
                <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Sebelumnya" className="grid size-8 place-items-center rounded-md border hover:bg-accent disabled:opacity-40"><ChevronLeft className="size-4" /></button>
                <span className="flex-1 text-center tabular-nums text-muted-foreground">Hal {current + 1}/{pages} · {filtered.length} video</span>
                <button type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Berikutnya" className="grid size-8 place-items-center rounded-md border hover:bg-accent disabled:opacity-40"><ChevronRight className="size-4" /></button>
              </div>
            </div>
          )}
          {tab === "game" && (
            <div className="flex min-h-0 flex-1 flex-col gap-2 p-2.5">
              <div className="flex gap-1.5">
                <button type="button" onClick={() => void openMediaFolder("gameplay")} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border text-xs hover:bg-accent"><FolderOpen className="size-3.5" /> Folder overlay</button>
                <button type="button" onClick={reload} aria-label="Muat ulang" title="Muat ulang" className="grid size-9 place-items-center rounded-lg border hover:bg-accent"><RefreshCw className="size-3.5" /></button>
              </div>
              <Segmented value={random ? "acak" : "urut"} onChange={(v) => setRandom(v === "acak")} disabled={running} items={[{ v: "acak", label: <><Shuffle className="size-3.5" /> Acak</>, title: "Tiap video dapat overlay acak" }, { v: "urut", label: "Bergiliran", title: "Overlay dipakai bergantian sesuai urutan" }]} />
              <p className="text-[11px] text-muted-foreground">{games.size ? `${games.size} dipilih` : "Belum ada yang dipilih = semua dipakai"}</p>
              <div className="no-scrollbar -mx-1 grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2 overflow-y-auto p-1">
                {gameplay.map((f) => {
                  const on = games.has(f.rel);
                  return (
                    <button key={f.rel} type="button" onClick={() => toggleGame(f.rel)} onContextMenu={openMenu("game", f.rel, f.name)} title={f.name} className={`relative overflow-hidden rounded-lg border bg-muted text-left transition-shadow ${on ? "ring-2 ring-rose-400" : "hover:ring-2 hover:ring-border"}`}>
                      <video src={`${mediaUrl(f.rel)}#t=2`} preload="metadata" muted className="aspect-video w-full object-cover" />
                      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 to-transparent p-1 pt-3 text-[10px] text-white">{f.name}</span>
                      {on && <span className="absolute top-1 left-1 grid size-5 place-items-center rounded-full bg-rose-500 text-white"><Check className="size-3" /></span>}
                    </button>
                  );
                })}
                {!gameplay.length && <p className="col-span-full p-3 text-center text-xs text-muted-foreground">Taruh video (mp4) di Folder overlay, lalu muat ulang.</p>}
              </div>
            </div>
          )}
          {tab === "hasil" && (
            <div className="flex min-h-0 flex-1 flex-col gap-2 p-2.5">
              <div className="flex items-center gap-1 text-[11px]">
                <span className="flex-1 text-muted-foreground">{picked.size ? <><b className="text-foreground">{picked.size}</b> dipilih</> : "Klik untuk memilih, klik kanan untuk opsi"}</span>
                <button type="button" onClick={() => setPicked(new Set(results.map((r) => r.rel)))} className="flex h-7 items-center gap-1 rounded-md px-2 hover:bg-accent"><Plus className="size-3" /> Semua</button>
                {picked.size > 0 && <button type="button" onClick={() => setPicked(new Set())} className="flex h-7 items-center gap-1 rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-3" /> Hapus</button>}
                <button type="button" onClick={() => void openMediaFolder("results")} title="Buka folder hasil" aria-label="Buka folder hasil" className="grid size-7 place-items-center rounded-md hover:bg-accent"><FolderOpen className="size-3.5" /></button>
              </div>
              {job?.failed.map((f) => <p key={f} className="text-[11px] text-destructive">{f}</p>)}
              <div className="no-scrollbar -mx-1 grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2 overflow-y-auto p-1">
                {results.map((r) => {
                  const on = picked.has(r.rel);
                  return (
                    <div
                      key={r.rel}
                      onContextMenu={openMenu("hasil", r.rel, r.name)}
                      className={`group relative overflow-hidden rounded-lg border bg-muted ${on ? "ring-2 ring-orange-400" : "hover:ring-2 hover:ring-border"} ${menu?.rel === r.rel ? "ring-2 ring-amber-400" : ""}`}
                    >
                      <button type="button" onClick={() => togglePicked(r.rel)} title={r.name} className="block w-full">
                        <video src={`${mediaUrl(r.rel)}#t=1`} preload="metadata" muted className="aspect-[9/16] w-full object-cover" />
                      </button>
                      <span className={`pointer-events-none absolute top-1 left-1 grid size-5 place-items-center rounded-full ${on ? "bg-orange-500 text-white" : "border border-white/70 bg-black/30 text-white opacity-0 group-hover:opacity-100"}`}>{on ? <Check className="size-3" /> : <Plus className="size-3" />}</span>
                      <a href={mediaUrl(r.rel)} target="_blank" rel="noreferrer" title="Putar" aria-label={`Putar ${r.name}`} className="absolute right-1 bottom-1 grid size-6 place-items-center rounded bg-black/60 text-white opacity-0 group-hover:opacity-100"><ExternalLink className="size-3" /></a>
                    </div>
                  );
                })}
                {!results.length && <p className="col-span-full p-4 text-center text-xs text-muted-foreground">Belum ada hasil render.</p>}
              </div>
              {picked.size > 0 && (
                <div className="space-y-2 rounded-lg border bg-background/60 p-2.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold"><CalendarClock className="size-3.5 text-rose-400" /> Jadwalkan ke YouTube</p>
                  {channels.length ? (
                    <>
                      <select value={plan.accountId} onChange={(e) => setPlan({ ...plan, accountId: Number(e.target.value) })} aria-label="Channel" className="h-8 w-full rounded-md border bg-background px-2 text-xs">
                        {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <div className="grid grid-cols-2 gap-1.5">
                        <label className="space-y-0.5 text-[10px] text-muted-foreground">Mulai
                          <input type="datetime-local" value={plan.startAt} onChange={(e) => setPlan({ ...plan, startAt: e.target.value })} className="h-8 w-full rounded-md border bg-background px-1.5 text-xs text-foreground" />
                        </label>
                        <label className="space-y-0.5 text-[10px] text-muted-foreground">Jarak
                          <select value={plan.gap} onChange={(e) => setPlan({ ...plan, gap: Number(e.target.value) })} className="h-8 w-full rounded-md border bg-background px-1.5 text-xs text-foreground">
                            {[60, 120, 180, 360, 720, 1440].map((m) => <option key={m} value={m}>{m < 1440 ? `${m / 60} jam` : "1 hari"}</option>)}
                          </select>
                        </label>
                      </div>
                      <input value={plan.title} onChange={(e) => setPlan({ ...plan, title: e.target.value })} maxLength={200} placeholder="Judul, {judul} = judul Short" aria-label="Judul" className="h-8 w-full rounded-md border bg-background px-2 text-xs" />
                      <textarea value={plan.description} onChange={(e) => setPlan({ ...plan, description: e.target.value })} rows={2} placeholder="Deskripsi" aria-label="Deskripsi" className="w-full resize-none rounded-md border bg-background px-2 py-1.5 text-xs" />
                      <div className="grid grid-cols-[1fr_auto] gap-1.5">
                        <input value={plan.tags} onChange={(e) => setPlan({ ...plan, tags: e.target.value })} placeholder="Tag, pisahkan koma" aria-label="Tag" className="h-8 min-w-0 rounded-md border bg-background px-2 text-xs" />
                        <select value={plan.visibility} onChange={(e) => setPlan({ ...plan, visibility: e.target.value as typeof plan.visibility })} aria-label="Visibilitas" className="h-8 rounded-md border bg-background px-1.5 text-xs">
                          <option value="public">Publik</option>
                          <option value="unlisted">Tidak publik</option>
                          <option value="private">Pribadi</option>
                        </select>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Kosongkan Mulai = 10 menit lagi. Jarak minimal 1 jam supaya tidak kena batas upload harian.</p>
                      <button type="button" onClick={() => void schedule()} disabled={scheduling} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-rose-500 text-xs font-semibold text-white hover:bg-rose-600 disabled:opacity-50">
                        {scheduling ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarClock className="size-3.5" />} Jadwalkan {picked.size} video
                      </button>
                    </>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Belum ada channel YouTube. Hubungkan dulu di menu <Link href="/akun" className="underline">Akun</Link>.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <Gutter onDrag={(dx) => resize("left", dx)} onDone={savePanels} onReset={() => (resize("left", PANELS.left - panels.left), savePanels())} />
        {/* monitor */}
        <section className="flex min-h-0 flex-col items-center gap-2 rounded-xl border p-3" style={CHECKER}>
          <div className="flex w-full items-center gap-2 text-[11px] text-white/70">
            <button type="button" onClick={() => step(-1)} disabled={queue.length < 2} aria-label="Video sebelumnya" className="grid size-7 place-items-center rounded-md hover:bg-white/10 disabled:opacity-30"><ChevronLeft className="size-4" /></button>
            <span className="min-w-0 flex-1 truncate text-center">
              {clip ? byRel.get(clip)?.name : "—"}
              {idx >= 0 && <span className="ml-1.5 text-white/40">({idx + 1}/{queue.length})</span>}
            </span>
            <button type="button" onClick={() => step(1)} disabled={queue.length < 2} aria-label="Video berikutnya" className="grid size-7 place-items-center rounded-md hover:bg-white/10 disabled:opacity-30"><ChevronRight className="size-4" /></button>
          </div>
          <div className="flex min-h-0 w-full flex-1 items-center justify-center" style={{ containerType: "size" }}>
            <div
              ref={box}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              className={`relative touch-none overflow-hidden rounded-md bg-black select-none ${cfg.layout === "pip" ? "" : cfg.layout === "side" ? "cursor-ew-resize" : "cursor-ns-resize"}`}
              style={{ aspectRatio: `${W} / ${H}`, width: `min(100cqw, calc(100cqh * ${(W / H).toFixed(4)}))` }}
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
                  <span className={`absolute grid size-7 place-items-center rounded-full border-2 border-white bg-orange-500 text-white shadow-lg ${cfg.layout === "side" ? "top-1/2 -left-3.5 -translate-y-1/2" : "left-1/2 -top-3.5 -translate-x-1/2"}`}>
                    {cfg.layout === "side" ? <Columns2 className="size-3.5" /> : <Rows2 className="size-3.5" />}
                  </span>
                </span>
              )}
              {cfg.layout === "pip" && (
                <div
                  onPointerDown={(e) => ovDown(e, "move")}
                  onPointerMove={ovMove}
                  onPointerUp={ovUp}
                  title="Geser untuk memindah overlay"
                  className={`group/ov absolute cursor-move border-2 border-dashed ${ov ? "border-rose-400 bg-rose-400/10" : "border-white/70 hover:border-rose-400"}`}
                  style={{
                    left: `${(pb.x / W) * 100}%`, top: `${(pb.y / H) * 100}%`, width: `${(pb.tw / W) * 100}%`, height: `${(pb.th / H) * 100}%`,
                    borderRadius: cfg.pipShape === "circle" ? "50%" : `${((pb.r + pb.b) / pb.tw) * 100}% / ${((pb.r + pb.b) / pb.th) * 100}%`,
                  }}
                >
                  <span className="pointer-events-none absolute top-1/2 left-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white opacity-0 group-hover/ov:opacity-100"><Move className="size-3.5" /></span>
                  <span onPointerDown={(e) => ovDown(e, "size")} onPointerMove={ovMove} onPointerUp={ovUp} title="Tarik untuk mengubah ukuran" className="absolute -right-2 -bottom-2 size-4 cursor-nwse-resize rounded-full border-2 border-white bg-rose-500 shadow" />
                  {ov && <span className="pointer-events-none absolute -top-6 left-0 rounded bg-black/70 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-white tabular-nums">{ov.size}% lebar</span>}
                </div>
              )}
              {drag != null && <span className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded bg-black/70 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-white tabular-nums">Asli {drag}% · Overlay {100 - drag}%</span>}
              {preview.busy && drag == null && <span className="pointer-events-none absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-black/60"><Loader2 className="size-4 animate-spin text-white" /></span>}
              {showVid && (
                <div className="absolute inset-0 z-10 bg-black" onPointerDown={(e) => e.stopPropagation()}>
                  <video src={vid.url!} autoPlay controls playsInline className="h-full w-full object-contain" />
                  <button type="button" onClick={() => setVid({ url: null, key: "", busy: false })} aria-label="Tutup preview video" title="Kembali ke gambar" className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/70 text-white hover:bg-black"><X className="size-4" /></button>
                </div>
              )}
            </div>
          </div>
          <div className="flex w-full max-w-xl items-center gap-2 text-[11px] text-white/70">
            <button type="button" onClick={playPreview} disabled={!clip || !sampleGame || vid.busy} title={`Putar ${PREVIEW_SECS} detik hasil dengan suara, mulai dari waktu ini`} className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-amber-400 px-3 text-xs font-semibold text-black hover:bg-amber-300 disabled:opacity-50">
              {vid.busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 fill-current" />}
              {vid.busy ? "Menyiapkan…" : "Putar preview"}
            </button>
            <Timer className="size-3.5 shrink-0" />
            <span className="w-9 tabular-nums">{fmt(at)}</span>
            <input type="range" aria-label="Waktu preview" min={0} max={Math.max(1, Math.floor(clipLen) - 1)} step={1} value={Math.min(at, Math.max(1, Math.floor(clipLen) - 1))} onChange={(e) => setAt(Number(e.target.value))} className="h-1 flex-1 cursor-pointer accent-orange-500" />
            <span className="w-9 text-right tabular-nums">{fmt(clipLen)}</span>
          </div>
          <p className="text-center text-[11px] text-white/50">
            {preview.error ? <span className="text-red-400">{preview.error}</span> : cfg.layout === "pip" ? "Geser overlay untuk memindah, tarik titik merah muda untuk mengubah ukuran" : "Geser garis di layar untuk mengatur porsi"}
          </p>
        </section>

        <Gutter onDrag={(dx) => resize("right", -dx)} onDone={savePanels} onReset={() => (resize("right", PANELS.right - panels.right), savePanels())} />
        {/* settings */}
        <section className={`${card} no-scrollbar min-h-0 overflow-y-auto`}>
          {cfg.layout === "pip" ? (
            <>
              <Section icon={PictureInPicture2} tone="bg-rose-500/15 text-rose-400" title="Overlay" value={`${cfg.pipSize}% lebar`}>
                <Segmented value={cfg.pipMain} onChange={(v) => set("pipMain", v)} disabled={running} items={[{ v: "original", label: "Asli di belakang" }, { v: "game", label: "Overlay di belakang" }]} />
                <Row icon={Frame} label="Bentuk">
                  <div className="grid grid-cols-3 gap-1">
                    {SHAPES.map((sh) => (
                      <button key={sh.v} type="button" onClick={() => set("pipShape", sh.v)} disabled={running} aria-pressed={cfg.pipShape === sh.v} className={`flex h-8 items-center justify-center gap-1.5 rounded-md border text-[11px] ${cfg.pipShape === sh.v ? ON : "hover:bg-accent"}`}>
                        <span className="size-3 border-[1.5px] border-current" style={{ borderRadius: sh.radius }} /> {sh.label}
                      </button>
                    ))}
                  </div>
                </Row>
                <Row icon={Maximize2} label="Ukuran">
                  <div className="flex items-center gap-2">
                    <Slider label="Ukuran overlay" value={cfg.pipSize} min={PIP_RANGE[0]} max={PIP_RANGE[1]} onChange={(v) => set("pipSize", v)} disabled={running} />
                    <span className="w-9 shrink-0 text-right text-[11px] tabular-nums">{cfg.pipSize}%</span>
                  </div>
                </Row>
                <Row icon={Move} label="Posisi">
                  <div className="grid w-fit grid-cols-3 gap-1">
                    {[0, 50, 100].flatMap((y) => [0, 50, 100].map((x) => ({ x, y }))).map(({ x, y }) => {
                      const on = cfg.pipX === x && cfg.pipY === y;
                      return (
                        <button key={`${x}-${y}`} type="button" onClick={() => setMany({ pipX: x, pipY: y })} disabled={running} aria-label={`Posisi ${x}% ${y}%`} className={`relative size-7 rounded-md border ${on ? ON : "hover:bg-accent"}`}>
                          <span className={`absolute size-2 rounded-sm ${on ? "bg-orange-500" : "bg-muted-foreground/50"}`} style={{ left: `calc(${x}% * 0.55 + 3px)`, top: `calc(${y}% * 0.55 + 3px)` }} />
                        </button>
                      );
                    })}
                  </div>
                </Row>
              </Section>
              <Section icon={Scissors} tone="bg-red-500/15 text-red-400" title="Crop overlay" value={cfg.pipShape === "circle" ? "1:1" : cfg.pipAspect}>
                <div className="grid grid-cols-5 gap-1">
                  {(Object.keys(ASPECTS) as Aspect[]).map((a) => {
                    const on = cfg.pipShape === "circle" ? a === "1:1" : cfg.pipAspect === a;
                    const r = ASPECTS[a];
                    return (
                      <button key={a} type="button" onClick={() => set("pipAspect", a)} disabled={running || cfg.pipShape === "circle"} aria-pressed={on} className={`flex h-11 flex-col items-center justify-center gap-1 rounded-md border text-[10px] tabular-nums disabled:opacity-50 ${on ? ON : "hover:bg-accent"}`}>
                        <span className="block rounded-[2px] border-[1.5px] border-current" style={r >= 1 ? { width: 16, height: Math.round(16 / r) } : { height: 16, width: Math.round(16 * r) }} />
                        {a}
                      </button>
                    );
                  })}
                </div>
                {cfg.pipShape === "circle" && <p className="text-[11px] text-muted-foreground">Lingkaran selalu 1:1.</p>}
                <Row icon={Scissors} label="Zoom">
                  <div className="flex items-center gap-2">
                    <Slider label="Zoom crop" value={cfg.pipZoom} min={100} max={300} step={10} onChange={(v) => set("pipZoom", v)} disabled={running} />
                    <span className="w-9 shrink-0 text-right text-[11px] tabular-nums">{(cfg.pipZoom / 100).toFixed(1)}×</span>
                  </div>
                </Row>
                <Row icon={Move} label="Geser ←→">
                  <Slider label="Fokus crop kiri-kanan" value={cfg.pipFocusX} min={0} max={100} onChange={(v) => set("pipFocusX", v)} disabled={running} />
                </Row>
                <Row icon={Move} label="Geser ↑↓">
                  <Slider label="Fokus crop atas-bawah" value={cfg.pipFocusY} min={0} max={100} onChange={(v) => set("pipFocusY", v)} disabled={running} />
                </Row>
              </Section>
              <Section icon={Frame} tone="bg-stone-500/20 text-stone-300" title="Bingkai">
                <Segmented value={String(cfg.pipBorder) as "0" | "1" | "2" | "3"} onChange={(v) => set("pipBorder", Number(v) as 0 | 1 | 2 | 3)} disabled={running} items={[{ v: "0", label: "Tanpa" }, { v: "1", label: "Tipis" }, { v: "2", label: "Sedang" }, { v: "3", label: "Tebal" }]} />
                <div className="grid grid-cols-2 gap-1">
                  {([["white", "Putih", "#fff"], ["black", "Hitam", "#000"]] as const).map(([v, label, bg]) => (
                    <button key={v} type="button" onClick={() => set("pipBorderColor", v)} disabled={running || !cfg.pipBorder} aria-pressed={cfg.pipBorderColor === v} className={`flex h-8 items-center justify-center gap-1.5 rounded-md border text-[11px] disabled:opacity-50 ${cfg.pipBorderColor === v ? ON : "hover:bg-accent"}`}>
                      <span className="size-3 rounded-full border" style={{ background: bg }} /> {label}
                    </button>
                  ))}
                </div>
              </Section>
            </>
          ) : (
            <Section icon={Ratio} tone="bg-rose-500/15 text-rose-400" title="Porsi asli : overlay" value={`${cfg.ratio} : ${100 - cfg.ratio}`}>
              <Slider label="Porsi video asli" value={cfg.ratio} min={RATIO_RANGE[0]} max={RATIO_RANGE[1]} onChange={(v) => set("ratio", v)} disabled={running} />
              <div className="flex gap-1">
                {[50, 60, 70].map((r) => (
                  <button key={r} type="button" onClick={() => set("ratio", r)} disabled={running} className={`h-7 flex-1 rounded-md border text-[11px] tabular-nums ${cfg.ratio === r ? ON : "border-transparent bg-muted text-muted-foreground hover:text-foreground"}`}>{r} : {100 - r}</button>
                ))}
              </div>
              <Row icon={Blend} label="Garis tengah">
                <Segmented value={String(cfg.seam) as "0" | "24" | "64"} onChange={(v) => set("seam", Number(v) as Seam)} disabled={running} items={[{ v: "0", label: "Tajam" }, { v: "24", label: "Halus" }, { v: "64", label: "Lembut" }]} />
              </Row>
            </Section>
          )}
          <Section icon={Play} tone="bg-yellow-500/15 text-yellow-500" title="Mulai overlay" value={cfg.gameStart === -1 ? "acak" : cfg.gameStart === -2 ? "bersambung" : `detik ${fmt(cfg.gameStart)}`}>
            <Segmented
              value={cfg.gameStart === -1 ? "acak" : cfg.gameStart === -2 ? "sambung" : "pilih"}
              onChange={(v) => set("gameStart", v === "acak" ? -1 : v === "sambung" ? -2 : 0)}
              disabled={running}
              items={[
                { v: "acak", label: <><Shuffle className="size-3.5" /> Acak</>, title: "Tiap video mulai dari titik acak" },
                { v: "sambung", label: "Bersambung", title: "Video berikutnya melanjutkan overlay dari titik video sebelumnya berhenti: tidak ada bagian yang terulang" },
                { v: "pilih", label: <><Timer className="size-3.5" /> Detik…</>, title: "Semua video mulai dari detik yang sama" },
              ]}
            />
            {cfg.gameStart >= 0 && (
              <div className="flex items-center gap-2">
                <Slider label="Detik mulai overlay" value={Math.min(cfg.gameStart, Math.max(1, Math.floor(gameLen) - 1))} min={0} max={Math.max(1, Math.floor(gameLen) - 1)} step={1} onChange={(v) => set("gameStart", v)} disabled={running} />
                <input type="number" aria-label="Detik mulai" min={0} max={Math.floor(gameLen) || undefined} value={cfg.gameStart} onChange={(e) => set("gameStart", Math.max(0, Math.round(Number(e.target.value) || 0)))} disabled={running} className="h-8 w-16 shrink-0 rounded-md border bg-background px-2 text-right text-xs tabular-nums" />
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              {gameLen ? `Video overlay ${fmt(gameLen)}. ` : ""}
              {cfg.gameStart === -2 ? "Video ke-2 melanjutkan dari titik video ke-1 berhenti, dan seterusnya. " : ""}
              {random ? "Klip overlay dibagi bergiliran acak: tidak ada yang terulang sebelum semua terpakai." : "Klip overlay dipakai bergantian sesuai urutan."}
            </p>
          </Section>
          <Section icon={Timer} tone="bg-amber-500/15 text-amber-500" title="Durasi" value={cfg.maxLen ? `maks ${fmt(cfg.maxLen)}` : "penuh"}>
            <Row icon={Scissors} label="Lewati awal">
              <div className="flex items-center gap-2">
                <Slider label="Lewati detik awal" value={Math.min(cfg.trimStart, 30)} min={0} max={30} step={1} onChange={(v) => set("trimStart", v)} disabled={running} />
                <span className="w-9 shrink-0 text-right text-[11px] tabular-nums">{cfg.trimStart} dtk</span>
              </div>
            </Row>
            <Row icon={Timer} label="Panjang maks">
              <Segmented value={String(cfg.maxLen) as string} onChange={(v) => set("maxLen", Number(v))} disabled={running} items={[{ v: "0", label: "Penuh" }, { v: "59", label: "59 dtk" }, { v: "45", label: "45" }, { v: "30", label: "30" }]} />
            </Row>
            <p className="text-[11px] text-muted-foreground">Berlaku untuk semua video. 59 detik = aman sebagai Shorts.</p>
          </Section>
          <Section icon={Type} tone="bg-pink-500/15 text-pink-400" title="Teks di video" value={{ none: "tanpa", title: "judul", custom: "sendiri" }[cfg.textMode]}>
            <Segmented value={cfg.textMode} onChange={(v) => set("textMode", v)} disabled={running} items={[{ v: "none", label: "Tanpa" }, { v: "title", label: "Judul Short" }, { v: "custom", label: "Tulis sendiri" }]} />
            {cfg.textMode === "custom" && (
              <textarea value={cfg.textCustom} onChange={(e) => set("textCustom", e.target.value.slice(0, 200))} rows={2} disabled={running} placeholder="Mis. Tunggu endingnya! {judul}" aria-label="Teks di video" className="w-full resize-none rounded-md border bg-background px-2 py-1.5 text-xs" />
            )}
            {cfg.textMode !== "none" && (
              <>
                <Row icon={Move} label="Posisi">
                  <Segmented value={cfg.textPos} onChange={(v) => set("textPos", v)} disabled={running} items={[{ v: "top", label: "Atas" }, { v: "middle", label: "Tengah" }, { v: "bottom", label: "Bawah" }]} />
                </Row>
                <Row icon={Maximize2} label="Ukuran">
                  <Segmented value={cfg.textSize} onChange={(v) => set("textSize", v)} disabled={running} items={[{ v: "s", label: "Kecil" }, { v: "m", label: "Sedang" }, { v: "l", label: "Besar" }]} />
                </Row>
                <div className="grid grid-cols-3 gap-1">
                  {([["box", "Kotak", "bg-black/70 text-white"], ["outline", "Garis", "text-white [text-shadow:0_0_2px_#000,0_0_2px_#000,0_0_2px_#000]"], ["yellow", "Kuning", "text-[#FFD93D] [text-shadow:0_0_2px_#000,0_0_2px_#000,0_0_2px_#000]"]] as const).map(([v, label, look]) => (
                    <button key={v} type="button" onClick={() => set("textStyle", v)} disabled={running} aria-pressed={cfg.textStyle === v} className={`flex h-10 items-center justify-center rounded-md border bg-stone-500/30 text-xs ${cfg.textStyle === v ? "ring-2 ring-orange-400" : "hover:bg-stone-500/40"}`}>
                      <span className={`rounded px-1.5 py-0.5 font-bold ${look}`}>{label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">{"{judul}"} diganti judul Short (tanpa nama channel dan emoji).</p>
              </>
            )}
          </Section>
          <Section icon={Crop} tone="bg-amber-500/15 text-amber-500" title="Tampilan">
            {([["fitOriginal", "Video asli", Video], ["fitGame", "Overlay", Layers]] as const).map(([k, label, Icon]) => (
              <Row key={k} icon={Icon} label={label}>
                <Segmented value={cfg[k]} onChange={(v: Fit) => set(k, v)} disabled={running} items={[{ v: "cover", label: "Penuh", title: "Memenuhi bagiannya, tepi terpotong" }, { v: "contain", label: "Utuh", title: "Tidak terpotong, sisanya diisi warna latar" }]} />
              </Row>
            ))}
            <Row icon={Palette} label="Latar">
              <div className="grid grid-cols-3 gap-1">
                {([["blur", "Blur", "linear-gradient(135deg,#94a3b8,#475569)"], ["black", "Hitam", "#000"], ["white", "Putih", "#fff"]] as [Fill, string, string][]).map(([v, label, bg]) => (
                  <button key={v} type="button" onClick={() => set("fill", v)} disabled={running} aria-pressed={cfg.fill === v} className={`flex h-8 items-center justify-center gap-1 rounded-md border text-[11px] font-medium disabled:opacity-50 ${cfg.fill === v ? ON : "hover:bg-accent"}`}>
                    <span className="size-3 rounded-full border" style={{ background: bg }} /> {label}
                  </button>
                ))}
              </div>
            </Row>
          </Section>
          <Section icon={FlipHorizontal2} tone="bg-orange-500/15 text-orange-400" title="Cermin / balik">
            {([["flipOriginal", "Video asli", Video], ["flipGame", "Overlay", Layers]] as const).map(([k, label, Icon]) => (
              <Row key={k} icon={Icon} label={label}>
                <Segmented value={cfg[k]} onChange={(v: Flip) => set(k, v)} disabled={running} items={FLIPS} />
              </Row>
            ))}
          </Section>
          <Section icon={Music} tone="bg-fuchsia-500/15 text-fuchsia-400" title="Musik" value={!cfg.music ? "tanpa" : cfg.music === "*" ? "acak" : `${cfg.volMusic}%`}>
            <div className="space-y-1">
              {[{ src: "", name: "Tanpa musik", dur: 0 }, { src: "*", name: "Acak dari Pustaka", dur: 0 }, ...music].map((m) => {
                const on = cfg.music === m.src;
                const track = m.src !== "" && m.src !== "*";
                return (
                  <div key={m.src || "none"} className={`flex items-center gap-1 rounded-lg border pr-1 transition-colors ${on ? ON : "border-transparent hover:bg-accent"}`}>
                    <button type="button" onClick={() => set("music", m.src)} disabled={running || (m.src === "*" && !music.length)} aria-pressed={on} className="flex h-9 min-w-0 flex-1 items-center gap-2 px-2.5 text-left text-xs disabled:opacity-50">
                      {m.src === "" ? <VolumeX className="size-3.5 shrink-0" /> : m.src === "*" ? <Shuffle className="size-3.5 shrink-0" /> : <Music className="size-3.5 shrink-0" />}
                      <span className="truncate">{m.name}</span>
                      {m.dur > 0 && <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{fmt(m.dur)}</span>}
                    </button>
                    {track && (
                      <button type="button" onClick={() => listen(m.src)} aria-label={listening === m.src ? "Hentikan" : "Dengarkan"} title={listening === m.src ? "Hentikan" : "Dengarkan"} className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-background">
                        {listening === m.src ? <Square className="size-3 fill-current" /> : <Play className="size-3 fill-current" />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <label className={`flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed text-xs hover:bg-accent ${uploading ? "pointer-events-none opacity-60" : ""}`}>
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} {uploading ? "Mengunggah…" : "Unggah musik (MP3, WAV, M4A)"}
              <input type="file" accept="audio/*" hidden onChange={(e) => (void upload(e.target.files?.[0]), (e.target.value = ""))} />
            </label>
            <Row icon={Volume2} label="Volume">
              <div className="flex items-center gap-2">
                <Slider label="Volume musik" value={cfg.volMusic} min={0} max={100} onChange={(v) => set("volMusic", v)} disabled={running || !cfg.music} />
                <span className="w-9 shrink-0 text-right text-[11px] tabular-nums">{cfg.volMusic}%</span>
              </div>
            </Row>
            <p className="text-[11px] text-muted-foreground">Musik diulang sepanjang video dan memudar di 2 detik terakhir. Lagu yang sama ada di Pustaka Buat Video. Pakai musik bebas royalti.</p>
            <audio ref={ear} onEnded={() => setListening(null)} hidden />
          </Section>
          <p className="px-4 py-3 text-[11px] text-muted-foreground">Metadata hasil dirapikan (judul & tanggal). Semua setelan tersimpan otomatis.</p>
        </section>
      </div>
      {menu && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setMenu(null)} onContextMenu={(e) => (e.preventDefault(), setMenu(null))} />
          <div role="menu" className="fixed z-[61] w-52 rounded-xl border bg-popover p-1 text-xs text-popover-foreground shadow-xl" style={{ left: menu.x, top: menu.y }}>
            <p className="truncate px-2.5 pt-1.5 pb-1 text-[10px] text-muted-foreground">{menu.name.replace(/^\d{14}\s+/, "")}</p>
            {menu.kind === "asli" && (
              <>
                <button role="menuitem" type="button" onClick={() => (setActive(menu.rel), setMenu(null))} className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left hover:bg-accent"><Play className="size-3.5 text-amber-500" /> Lihat di layar</button>
                <button role="menuitem" type="button" onClick={() => (pick(menu.rel), setMenu(null))} className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left hover:bg-accent"><Check className="size-3.5 text-orange-500" /> {inQueue.has(menu.rel) ? "Batal pilih" : "Pilih untuk dirender"}</button>
              </>
            )}
            {menu.kind === "game" && (
              <button role="menuitem" type="button" onClick={() => (toggleGame(menu.rel), setMenu(null))} className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left hover:bg-accent"><Check className="size-3.5 text-orange-500" /> {games.has(menu.rel) ? "Batal pilih" : "Pilih sebagai overlay"}</button>
            )}
            {menu.kind !== "asli" && (
              <a role="menuitem" href={mediaUrl(menu.rel)} target="_blank" rel="noreferrer" onClick={() => setMenu(null)} className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left hover:bg-accent"><Play className="size-3.5 text-amber-500" /> Putar</a>
            )}
            {menu.kind === "hasil" && (
              <button role="menuitem" type="button" onClick={() => (togglePicked(menu.rel), setMenu(null))} className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left hover:bg-accent"><Check className="size-3.5 text-orange-500" /> {picked.has(menu.rel) ? "Batal pilih" : "Pilih untuk dijadwalkan"}</button>
            )}
            <button role="menuitem" type="button" onClick={() => void reveal(menu.rel)} className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left hover:bg-accent"><FolderOpen className="size-3.5 text-yellow-500" /> Tampilkan di folder</button>
            <div className="my-1 h-px bg-border" />
            <button role="menuitem" type="button" onClick={() => void trash(menu.kind, menu.rel, menu.name)} className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-destructive hover:bg-destructive/10"><Trash2 className="size-3.5" /> Hapus</button>
          </div>
        </>
      )}
    </div>
  );
}
