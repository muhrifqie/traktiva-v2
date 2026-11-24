"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Bookmark, CalendarClock, Keyboard, PencilLine, Redo2, Undo2, Check, ExternalLink, Trash2, Layers, Move, Play, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Columns2, FolderOpen, Loader2, PictureInPicture2,
  Plus, RefreshCw, Rows2, Search, Shuffle, Square, Timer, Upload, Video, X,
} from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { mediaUrl } from "@/lib/media-url";
import type { EditorPreset } from "@/lib/settings";
import type { EditorJob, SourceFile } from "@/lib/youtube-editor";
import { PIP_RANGE, pipBox, RATIO_RANGE, SIZES, withOverride, type EditorSettings, type Size, type VideoOverride } from "@/lib/youtube-editor-config";
import { CHECKER, fmt, Gutter, LayoutSketch, ON, PANEL_RANGE, PANELS, PANELS_KEY, Segmented } from "./ui";
import { SettingsPanel } from "./settings-panel";
import { clipLengths, deletePreset, removeEditorFile, retryFailed, showEditorFile, savePreset, openMediaFolder, previewClip, previewFrame, refreshLists, renderStatus, renderVideos, saveEditorSettings, stopRender } from "./actions";

// YouTube → Editor, full screen over the app (sidebar hidden): media on the left, the live monitor in the middle,
// settings on the right. Click Shorts to pick them, drag the divider (or the reaction overlay) on the monitor, press Render.

const KEY = "trk-yt-editor"; // picks and media filters survive a refresh (the configuration lives in settings.json)
type Tab = "asli" | "game" | "hasil";
type Sort = "new" | "old" | "az";
type Show = "all" | "todo" | "done";
type Saved = { channel: string; queue: string[]; games: string[]; random: boolean; q: string; sort: Sort; show: Show; tab: Tab; overrides?: Record<string, VideoOverride> };
const PAGE = 24;
const PREVIEW_SECS = 6; // length of the playable preview (lib renderPreviewClip default)
const SPEED = 0.2; // rough render time per second of video (veryfast x264, measured ~10 s for 2×30 s), for the estimate
type History = { past: EditorSettings[]; future: EditorSettings[]; at: number };
/** One undo step per change; changes within 0.6 s (a slider drag) count as one. */
function remember(h: History, current: EditorSettings) {
  if (Date.now() - h.at > 600) h.past = [...h.past.slice(-49), current];
  h.at = Date.now();
  h.future = [];
}

export function VideoEditor({
  originals, initialGameplay, initialResults, initialJob, initialSettings, initialRendered, initialMusic, initialPresets, initialPick,
}: {
  originals: { channel: string; files: SourceFile[] }[]; initialGameplay: SourceFile[]; initialResults: SourceFile[]; initialJob: EditorJob | null;
  initialSettings: EditorSettings; initialRendered: Record<string, string>; initialMusic: { src: string; name: string; dur: number }[];
  initialPresets: EditorPreset[]; initialPick: string | null;
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
  const [presets, setPresets] = useState(initialPresets);
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initialPick ? [initialPick] : [])); // results chosen for the Kalender
  const [overrides, setOverrides] = useState<Record<string, VideoOverride>>({}); // "Khusus video ini"
  const [ownOpen, setOwnOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [tick, setTick] = useState(0); // render clock for the ETA (set while polling)
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
  const cfgRef = useRef(cfg);
  useEffect(() => {
    cfgRef.current = cfg;
  }, [cfg]);
  const hist = useRef<History>({ past: [], future: [], at: 0 });
  const [histN, setHistN] = useState({ past: 0, future: 0 }); // for the undo/redo buttons
  const syncHist = () => setHistN({ past: hist.current.past.length, future: hist.current.future.length });
  const setMany = (patch: Partial<EditorSettings>) => {
    remember(hist.current, cfgRef.current);
    syncHist();
    setSaved(false);
    setCfg((c) => ({ ...c, ...patch }));
  };
  const undo = () => {
    const h = hist.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(cfgRef.current);
    h.at = 0;
    syncHist();
    setSaved(false);
    setCfg(prev);
  };
  const redo = () => {
    const h = hist.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(cfgRef.current);
    h.at = 0;
    syncHist();
    setSaved(false);
    setCfg(next);
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
          setOverrides(s.overrides ?? {});
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
      localStorage.setItem(KEY, JSON.stringify({ channel, queue, games: [...games], random, q, sort, show, tab, overrides } satisfies Saved));
    } catch {}
  }, [channel, queue, games, random, q, sort, show, tab, overrides]);

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
      setTick(Date.now());
      if (!j?.running) {
        const r = await refreshLists();
        setResults(r.results);
        setRendered(r.rendered);
        const fresh = j?.done.map((d) => d.rel) ?? [];
        setPicked(new Set(fresh));
        const fails = j?.items.filter((i) => i.status === "fail").length ?? 0;
        if (fresh.length) toast.success(`${fresh.length} video selesai dirender${fails ? `, ${fails} gagal` : ""}`, { action: { label: "Lihat hasil", onClick: () => setTab("hasil") } });
        else if (fails) toast.error(`${fails} video gagal dirender`);
      }
    }, 1500);
    return () => clearInterval(t);
  }, [running]);

  // thumbnails play (muted) while hovered
  const hoverPlay = (e: React.MouseEvent<HTMLVideoElement>) => void e.currentTarget.play().catch(() => {});
  const hoverStop = (e: React.MouseEvent<HTMLVideoElement>) => {
    e.currentTarget.pause();
    e.currentTarget.currentTime = 1;
  };

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
  const own = clip ? overrides[clip] : undefined;
  const view = withOverride(cfg, own); // what this video renders with
  const viewGame = own?.game && gameplay.some((g) => g.rel === own.game) ? own.game : sampleGame;
  const setOwn = (patch: VideoOverride | null) =>
    clip &&
    setOverrides((o) => {
      const n = { ...o };
      const v = patch ? { ...o[clip], ...patch } : {};
      const clean = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== "")) as VideoOverride;
      if (Object.keys(clean).length) n[clip] = clean;
      else delete n[clip];
      return n;
    });
  const clipLen = clip ? (lengths[clip] ?? 0) : 0;
  const gameLen = sampleGame ? (lengths[sampleGame] ?? 0) : 0;
  useEffect(() => {
    const need = [clip, viewGame, ...queue].filter((r): r is string => !!r && !(r in lengths));
    if (!need.length) return;
    let live = true;
    void clipLengths(need).then((r) => live && setLengths((l) => ({ ...l, ...r })));
    return () => {
      live = false;
    };
  }, [clip, viewGame, queue, lengths]);
  useEffect(() => {
    if (!clip || !viewGame) return;
    let live = true;
    const t = setTimeout(async () => {
      setPreview((p) => ({ ...p, busy: true, error: null }));
      const r = await previewFrame(clip, viewGame, view, at);
      if (!live) return;
      if ("error" in r) setPreview((p) => ({ ...p, busy: false, error: r.error ?? "Gagal membuat preview" }));
      else setPreview({ url: `${mediaUrl(r.ok!)}?v=${Date.now()}`, busy: false, error: null });
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [clip, viewGame, view, at]);

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
  const vidKey = JSON.stringify([clip, viewGame, view, at]);
  const showVid = !!vid.url && vid.key === vidKey;
  const playPreview = async () => {
    if (!clip || !viewGame) return;
    const key = vidKey;
    setVid({ url: null, key, busy: true });
    const r = await previewClip(clip, viewGame, view, at);
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
    const mine = Object.fromEntries(queue.filter((r0) => overrides[r0]).map((r0) => [r0, overrides[r0]]));
    const r = await renderVideos({ originals: queue, gameplay: [...games], settings: cfg, random, overrides: mine });
    if ("error" in r) return toast.error(r.error);
    setJob(r.ok ?? null);
    toast.success(`Merender ${queue.length} video`);
  };
  const retry = async () => {
    const r = await retryFailed();
    if ("error" in r) return toast.error(r.error);
    setJob(r.ok ?? null);
  };

  // ---- render summary (under the settings) ----
  const lenOf = (rel: string) => {
    const o = withOverride(cfg, overrides[rel]);
    const l = lengths[rel];
    return l == null ? null : Math.max(1, Math.min(l - o.trimStart, o.maxLen > 0 ? o.maxLen : Infinity));
  };
  const known = queue.map(lenOf).filter((x): x is number => x != null);
  const totalSecs = known.reduce((a0, b0) => a0 + b0, 0);
  const blocker = !queue.length ? "Pilih video asli di panel kiri." : !gameplay.length ? "Tambahkan video overlay dulu (tab Overlay)." : null;
  const items = job?.items ?? [];
  const doneN = items.filter((i) => i.status === "done" || i.status === "fail").length;
  const runPct = items.find((i) => i.status === "run")?.pct ?? 0;
  const progress = items.length ? (doneN + runPct / 100) / items.length : 0;
  const eta = running && progress > 0.03 && tick ? ((tick - job!.startedAt) / 1000) * ((1 - progress) / progress) : null;
  const failedN = items.filter((i) => i.status === "fail").length;
  const ownCount = queue.filter((r0) => overrides[r0]).length;
  const startMode = cfg.gameStart === -1 ? "titik acak" : cfg.gameStart === -2 ? "bersambung" : `detik ${fmt(cfg.gameStart)}`;
  const summary = (
    <div className="space-y-2 border-t bg-background/40 p-3">
      {running || items.length ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <b>{running ? "Merender" : "Render terakhir"}</b>
            <span className="tabular-nums text-muted-foreground">{doneN}/{items.length}</span>
            {eta != null && <span className="ml-auto text-muted-foreground">± {fmt(eta)} lagi</span>}
            {!running && <button type="button" onClick={() => setJob(null)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Tutup</button>}
          </div>
          {running && <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-orange-500 transition-[width]" style={{ width: `${progress * 100}%` }} /></div>}
          <ul className="no-scrollbar max-h-36 space-y-1 overflow-y-auto">
            {items.map((it) => (
              <li key={it.rel} className="flex items-center gap-2 text-xs" title={it.error ?? it.name}>
                <span className={`grid size-4 shrink-0 place-items-center rounded-full ${it.status === "done" ? "bg-emerald-500 text-white" : it.status === "fail" ? "bg-destructive text-white" : it.status === "run" ? "bg-orange-500 text-white" : "bg-muted"}`}>
                  {it.status === "done" ? <Check className="size-2.5" /> : it.status === "fail" ? <X className="size-2.5" /> : it.status === "run" ? <Loader2 className="size-2.5 animate-spin" /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{it.name}</span>
                {it.status === "run" && <span className="tabular-nums text-orange-500">{Math.round(it.pct)}%</span>}
                {it.status === "done" && it.out && <a href={mediaUrl(it.out)} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">Putar</a>}
                {it.status === "fail" && <span className="text-destructive">gagal</span>}
              </li>
            ))}
          </ul>
          {running ? (
            <button type="button" onClick={() => void stopRender()} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border text-xs font-medium hover:border-destructive/40 hover:text-destructive"><Square className="size-3.5" /> Batalkan</button>
          ) : failedN ? (
            <button type="button" onClick={() => void retry()} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border text-xs font-medium hover:bg-accent"><RefreshCw className="size-3.5" /> Ulangi {failedN} yang gagal</button>
          ) : null}
        </div>
      ) : null}
      {!running && (
        <>
          <div className="grid grid-cols-3 gap-1.5 text-center">
            {[
              ["Video", String(queue.length)],
              ["Total durasi", queue.length ? `${known.length < queue.length ? "±" : ""}${fmt(totalSecs)}` : "–"],
              ["Perkiraan", queue.length ? `± ${fmt(totalSecs * SPEED + queue.length * 2)}` : "–"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-muted/60 px-1 py-1.5">
                <p className="text-sm font-semibold tabular-nums">{v}</p>
                <p className="text-xs text-muted-foreground">{k}</p>
              </div>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {SIZES[cfg.size].label} · {{ side: "Samping", stack: "Tumpuk", pip: "Reaction" }[cfg.layout]} · overlay {random ? "acak tanpa ulang" : "bergiliran"}, mulai {startMode}
            {cfg.maxLen ? ` · maks ${cfg.maxLen} dtk` : ""}
            {ownCount ? ` · ${ownCount} video punya setelan khusus` : ""}
          </p>
          <button type="button" onClick={render} disabled={!!blocker} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-orange-500 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50">
            <Upload className="size-4" /> {queue.length ? `Render ${queue.length} video` : "Render"}
          </button>
          {blocker && <p className="text-center text-xs text-amber-600 dark:text-amber-400">{blocker}</p>}
        </>
      )}
    </div>
  );

  // ---- keyboard (ignored while typing) ----
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e: KeyboardEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest("input, textarea, select, [contenteditable=true]") || document.querySelector("[role=alertdialog]")) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const act = (f: () => void) => {
        e.preventDefault();
        f();
      };
      if (mod && k === "z") act(() => (e.shiftKey ? redo() : undo()));
      else if (mod && k === "y") act(redo);
      else if (mod && k === "s") act(() => setPresetOpen(true));
      else if (e.key === " ") act(() => (showVid ? setVid({ url: null, key: "", busy: false }) : void playPreview()));
      else if (e.key === "ArrowRight" && !mod) act(() => step(1));
      else if (e.key === "ArrowLeft" && !mod) act(() => step(-1));
      else if (e.key === "Enter" && !running && !blocker) act(() => void render());
      else if (e.key === "?") setKeysOpen((v) => !v);
    };
  });
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

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
            <Bookmark className="size-3.5" /> Gaya {presets.length > 0 && <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums">{presets.length}</span>}
            <ChevronDown className="size-3.5" />
          </button>
          {presetOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setPresetOpen(false)} />
              <div className="absolute top-11 left-0 z-50 w-72 rounded-xl border bg-popover p-2 text-popover-foreground shadow-xl">
                <p className="px-1.5 pb-1.5 text-xs font-semibold text-muted-foreground">Gaya tersimpan</p>
                <div className="no-scrollbar max-h-64 space-y-0.5 overflow-y-auto">
                  {presets.map((pr) => (
                    <div key={pr.name} className="group flex items-center gap-1 rounded-lg hover:bg-accent">
                      <button type="button" onClick={() => applyPreset(pr)} disabled={running} className="flex h-9 min-w-0 flex-1 items-center gap-2 px-2 text-left text-xs">
                        <Bookmark className="size-3.5 shrink-0 text-orange-500" />
                        <span className="truncate">{pr.name}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{SIZES[pr.settings.size]?.label} · {{ side: "Samping", stack: "Tumpuk", pip: "Reaction" }[pr.settings.layout]}</span>
                      </button>
                      <button type="button" onClick={() => void dropPreset(pr.name)} aria-label={`Hapus gaya ${pr.name}`} title="Hapus" className="mr-1 grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"><Trash2 className="size-3.5" /></button>
                    </div>
                  ))}
                  {!presets.length && <p className="px-2 py-3 text-center text-xs text-muted-foreground">Belum ada. Atur Editor, lalu simpan di bawah.</p>}
                </div>
                <div className="mt-2 flex gap-1.5 border-t pt-2">
                  <input value={presetName} onChange={(e) => setPresetName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void storePreset()} maxLength={40} placeholder="Nama gaya, mis. Reaction pojok" aria-label="Nama gaya" className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-orange-400/40" />
                  <button type="button" onClick={() => void storePreset()} className="h-8 shrink-0 rounded-md bg-orange-500 px-2.5 text-xs font-semibold text-white hover:bg-orange-600">Simpan</button>
                </div>
              </div>
            </>
          )}
        </div>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          {saved ? <Check className="size-3.5 text-amber-500" /> : <Loader2 className="size-3.5 animate-spin" />} {saved ? "Tersimpan" : "Menyimpan…"}
        </span>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={undo} disabled={!histN.past || running} title="Urungkan (Ctrl+Z)" aria-label="Urungkan" className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"><Undo2 className="size-4" /></button>
          <button type="button" onClick={redo} disabled={!histN.future || running} title="Ulangi (Ctrl+Y)" aria-label="Ulangi" className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"><Redo2 className="size-4" /></button>
          <div className="relative">
            <button type="button" onClick={() => setKeysOpen((v) => !v)} title="Pintasan keyboard (?)" aria-label="Pintasan keyboard" className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"><Keyboard className="size-4" /></button>
            {keysOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setKeysOpen(false)} />
                <div className="absolute top-11 right-0 z-50 w-64 space-y-1 rounded-xl border bg-popover p-3 text-xs text-popover-foreground shadow-xl">
                  <p className="pb-1 font-semibold">Pintasan keyboard</p>
                  {[["Spasi", "Putar / tutup preview"], ["← →", "Video sebelumnya / berikutnya"], ["Ctrl+Z", "Urungkan"], ["Ctrl+Y", "Ulangi"], ["Ctrl+S", "Simpan gaya"], ["Enter", "Render"], ["?", "Tampilkan daftar ini"]].map(([k, v]) => (
                    <p key={k} className="flex items-center gap-2"><kbd className="min-w-14 rounded border bg-muted px-1.5 py-0.5 text-center font-mono text-xs">{k}</kbd> {v}</p>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── media | monitor | settings ──────────────────────────────────────────────────────────────────────────── */}
      <div className="grid min-h-0 flex-1 p-3" style={{ gridTemplateColumns: `${panels.left}px 12px minmax(0,1fr) 12px ${panels.right}px` }}>
        {/* media */}
        <section className={`${card} flex min-h-0 flex-col overflow-hidden`}>
          <div className="grid grid-cols-3 gap-1 border-b p-1.5 text-xs font-medium">
            {([["asli", "Video asli", Video, queue.length], ["game", "Overlay", Layers, games.size], ["hasil", "Hasil", Check, results.length]] as const).map(([t, label, Icon, n]) => (
              <button key={t} type="button" onClick={() => setTab(t)} className={`flex h-8 items-center justify-center gap-1 rounded-md transition-colors ${tab === t ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="size-3.5" /> {label}
                {n > 0 && <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${tab === t ? "bg-orange-500 text-white" : "bg-muted"}`}>{n}</span>}
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
              <div className="flex items-center gap-1 text-xs">
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
                        <video src={`${mediaUrl(f.rel)}#t=1`} preload="metadata" muted onMouseEnter={hoverPlay} onMouseLeave={hoverStop} className="aspect-[9/16] w-full object-cover" />
                        <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/85 to-transparent p-1.5 pt-5 text-[10px] leading-tight text-white">{f.name}</span>
                      </button>
                      <span className={`pointer-events-none absolute top-1 left-1 grid size-5 place-items-center rounded-full text-[11px] font-bold ${on ? "bg-amber-400 text-black" : "border border-white/70 bg-black/30 text-white opacity-0 group-hover:opacity-100"}`}>{on ? n : <Plus className="size-3" />}</span>
                      {overrides[f.rel] && <span title="Punya setelan khusus" className="pointer-events-none absolute top-7 left-1 grid size-5 place-items-center rounded-full bg-black/70 text-amber-300"><PencilLine className="size-3" /></span>}
                      {f.rel === clip && <span className="pointer-events-none absolute top-1 right-1 rounded bg-amber-400 px-1 text-[9px] font-semibold text-black">Di layar</span>}
                      {rendered[f.rel] && f.rel !== clip && <span className="pointer-events-none absolute top-1 right-1 rounded bg-black/60 px-1 text-[9px] font-semibold text-emerald-300">✓ Sudah</span>}
                      <button type="button" onClick={() => setActive(f.rel)} title="Lihat di layar" className="absolute right-1 bottom-8 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100">Lihat</button>
                    </div>
                  );
                })}
                {!shown.length && <p className="col-span-full p-4 text-center text-xs text-muted-foreground">Tidak ada video yang cocok.</p>}
              </div>
              <div className="flex items-center gap-1 text-xs">
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
              <p className="text-xs text-muted-foreground">{games.size ? `${games.size} dipilih` : "Belum ada yang dipilih = semua dipakai"}</p>
              <div className="no-scrollbar -mx-1 grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2 overflow-y-auto p-1">
                {gameplay.map((f) => {
                  const on = games.has(f.rel);
                  return (
                    <button key={f.rel} type="button" onClick={() => toggleGame(f.rel)} onContextMenu={openMenu("game", f.rel, f.name)} title={f.name} className={`relative overflow-hidden rounded-lg border bg-muted text-left transition-shadow ${on ? "ring-2 ring-rose-400" : "hover:ring-2 hover:ring-border"}`}>
                      <video src={`${mediaUrl(f.rel)}#t=2`} preload="metadata" muted onMouseEnter={hoverPlay} onMouseLeave={hoverStop} className="aspect-video w-full object-cover" />
                      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 to-transparent p-1 pt-3 text-[11px] text-white">{f.name}</span>
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
              <div className="flex items-center gap-1 text-xs">
                <span className="flex-1 text-muted-foreground">{picked.size ? <><b className="text-foreground">{picked.size}</b> dipilih</> : "Klik untuk memilih, klik kanan untuk opsi"}</span>
                <button type="button" onClick={() => setPicked(new Set(results.map((r) => r.rel)))} className="flex h-7 items-center gap-1 rounded-md px-2 hover:bg-accent"><Plus className="size-3" /> Semua</button>
                {picked.size > 0 && <button type="button" onClick={() => setPicked(new Set())} className="flex h-7 items-center gap-1 rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-3" /> Hapus</button>}
                <button type="button" onClick={() => void openMediaFolder("results")} title="Buka folder hasil" aria-label="Buka folder hasil" className="grid size-7 place-items-center rounded-md hover:bg-accent"><FolderOpen className="size-3.5" /></button>
              </div>
              {job?.failed.map((f) => <p key={f} className="text-xs text-destructive">{f}</p>)}
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
                        <video src={`${mediaUrl(r.rel)}#t=1`} preload="metadata" muted onMouseEnter={hoverPlay} onMouseLeave={hoverStop} className="aspect-[9/16] w-full object-cover" />
                      </button>
                      <span className={`pointer-events-none absolute top-1 left-1 grid size-5 place-items-center rounded-full ${on ? "bg-orange-500 text-white" : "border border-white/70 bg-black/30 text-white opacity-0 group-hover:opacity-100"}`}>{on ? <Check className="size-3" /> : <Plus className="size-3" />}</span>
                      <a href={mediaUrl(r.rel)} target="_blank" rel="noreferrer" title="Putar" aria-label={`Putar ${r.name}`} className="absolute right-1 bottom-1 grid size-6 place-items-center rounded bg-black/60 text-white opacity-0 group-hover:opacity-100"><ExternalLink className="size-3" /></a>
                    </div>
                  );
                })}
                {!results.length && <p className="col-span-full p-4 text-center text-xs text-muted-foreground">Belum ada hasil render.</p>}
              </div>
              {picked.size > 0 && (
                <Link href={`/jadwal?${results.filter((r) => picked.has(r.rel)).reverse().map((r) => `video=${encodeURIComponent(r.rel)}`).join("&")}`} className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-rose-500 text-xs font-semibold text-white hover:bg-rose-600">
                  <CalendarClock className="size-4" /> Jadwalkan {picked.size} video di Kalender
                </Link>
              )}
            </div>
          )}
        </section>

        <Gutter onDrag={(dx) => resize("left", dx)} onDone={savePanels} onReset={() => (resize("left", PANELS.left - panels.left), savePanels())} />
        {/* monitor */}
        <section className="flex min-h-0 flex-col items-center gap-2 rounded-xl border p-3" style={CHECKER}>
          <div className="flex w-full items-center gap-2 text-xs text-white/70">
            <button type="button" onClick={() => step(-1)} disabled={queue.length < 2} aria-label="Video sebelumnya" className="grid size-7 place-items-center rounded-md hover:bg-white/10 disabled:opacity-30"><ChevronLeft className="size-4" /></button>
            <span className="min-w-0 flex-1 truncate text-center">
              {clip ? byRel.get(clip)?.name : "—"}
              {idx >= 0 && <span className="ml-1.5 text-white/40">({idx + 1}/{queue.length})</span>}
            </span>
            <button type="button" onClick={() => step(1)} disabled={queue.length < 2} aria-label="Video berikutnya" className="grid size-7 place-items-center rounded-md hover:bg-white/10 disabled:opacity-30"><ChevronRight className="size-4" /></button>
            {clip && inQueue.has(clip) && (
              <div className="relative">
                <button type="button" onClick={() => setOwnOpen((v) => !v)} aria-expanded={ownOpen} title="Atur teks, awal, dan overlay khusus untuk video ini" className={`flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium ${own ? "bg-amber-400 text-black" : "bg-white/10 hover:bg-white/20"}`}>
                  <PencilLine className="size-3.5" /> Khusus video ini{own ? " •" : ""}
                </button>
                {ownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setOwnOpen(false)} />
                    <div className="absolute top-9 right-0 z-50 w-72 space-y-2.5 rounded-xl border bg-popover p-3 text-xs text-popover-foreground shadow-xl">
                      <p className="font-semibold">Khusus video ini</p>
                      <p className="text-xs text-muted-foreground">Kosongkan untuk ikut setelan umum.</p>
                      <label className="block space-y-1">
                        <span className="text-xs text-muted-foreground">Teks di video</span>
                        <textarea value={own?.text ?? ""} onChange={(e) => setOwn({ text: e.target.value.slice(0, 200) })} rows={2} placeholder={cfg.textMode === "none" ? "Tanpa teks" : cfg.textMode === "title" ? "Judul Short" : cfg.textCustom || "Teks umum"} className="w-full resize-none rounded-md border bg-background px-2 py-1.5 text-xs" />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block space-y-1">
                          <span className="text-xs text-muted-foreground">Lewati awal (dtk)</span>
                          <input type="number" min={0} max={Math.max(0, Math.floor(clipLen) - 1)} value={own?.trimStart ?? ""} placeholder={String(cfg.trimStart)} onChange={(e) => setOwn({ trimStart: e.target.value === "" ? undefined : Math.max(0, Math.round(Number(e.target.value))) })} className="h-8 w-full rounded-md border bg-background px-2 text-xs tabular-nums" />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-xs text-muted-foreground">Overlay</span>
                          <select value={own?.game ?? ""} onChange={(e) => setOwn({ game: e.target.value || undefined })} className="h-8 w-full rounded-md border bg-background px-1.5 text-xs">
                            <option value="">Ikut umum</option>
                            {gameplay.map((g) => <option key={g.rel} value={g.rel}>{g.name}</option>)}
                          </select>
                        </label>
                      </div>
                      {own && <button type="button" onClick={() => setOwn(null)} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">Kembalikan ke setelan umum</button>}
                    </div>
                  </>
                )}
              </div>
            )}
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
              {preview.url && viewGame ? (
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
                  {ov && <span className="pointer-events-none absolute -top-6 left-0 rounded bg-black/70 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-white tabular-nums">{ov.size}% lebar</span>}
                </div>
              )}
              {drag != null && <span className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded bg-black/70 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-white tabular-nums">Asli {drag}% · Overlay {100 - drag}%</span>}
              {preview.busy && drag == null && <span className="pointer-events-none absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-black/60"><Loader2 className="size-4 animate-spin text-white" /></span>}
              {showVid && (
                <div className="absolute inset-0 z-10 bg-black" onPointerDown={(e) => e.stopPropagation()}>
                  <video src={vid.url!} autoPlay controls playsInline className="h-full w-full object-contain" />
                  <button type="button" onClick={() => setVid({ url: null, key: "", busy: false })} aria-label="Tutup preview video" title="Kembali ke gambar" className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/70 text-white hover:bg-black"><X className="size-4" /></button>
                </div>
              )}
            </div>
          </div>
          <div className="flex w-full max-w-xl items-center gap-2 text-xs text-white/70">
            <button type="button" onClick={playPreview} disabled={!clip || !viewGame || vid.busy} title={`Putar ${PREVIEW_SECS} detik hasil dengan suara, mulai dari waktu ini`} className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-amber-400 px-3 text-xs font-semibold text-black hover:bg-amber-300 disabled:opacity-50">
              {vid.busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 fill-current" />}
              {vid.busy ? "Menyiapkan…" : "Putar preview"}
            </button>
            <Timer className="size-3.5 shrink-0" />
            <span className="w-9 tabular-nums">{fmt(at)}</span>
            <input type="range" aria-label="Waktu preview" min={0} max={Math.max(1, Math.floor(clipLen) - 1)} step={1} value={Math.min(at, Math.max(1, Math.floor(clipLen) - 1))} onChange={(e) => setAt(Number(e.target.value))} className="h-1 flex-1 cursor-pointer accent-orange-500" />
            <span className="w-9 text-right tabular-nums">{fmt(clipLen)}</span>
          </div>
          <p className="text-center text-xs text-white/50">
            {preview.error ? <span className="text-red-400">{preview.error}</span> : cfg.layout === "pip" ? "Geser overlay untuk memindah, tarik titik merah muda untuk mengubah ukuran" : "Geser garis di layar untuk mengatur porsi"}
          </p>
        </section>

        <Gutter onDrag={(dx) => resize("right", -dx)} onDone={savePanels} onReset={() => (resize("right", PANELS.right - panels.right), savePanels())} />
        {/* settings */}
        <SettingsPanel cfg={cfg} set={set} setMany={setMany} running={running} gameLen={gameLen} random={random} initialMusic={initialMusic} footer={summary} />
      </div>
      {menu && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setMenu(null)} onContextMenu={(e) => (e.preventDefault(), setMenu(null))} />
          <div role="menu" className="fixed z-[61] w-52 rounded-xl border bg-popover p-1 text-xs text-popover-foreground shadow-xl" style={{ left: menu.x, top: menu.y }}>
            <p className="truncate px-2.5 pt-1.5 pb-1 text-[11px] text-muted-foreground">{menu.name.replace(/^\d{14}\s+/, "")}</p>
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
