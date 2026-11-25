"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  AudioLines, CalendarClock, Split, ArrowLeft, Bot, Check, ChevronRight, CircleDot, LayoutDashboard, Move, Maximize2, Minimize2, Mic, Palette, Send, Bookmark, Clapperboard, Copy, Download, Film, Frame, FolderOpen, Loader2, Music, Pause, Play, Plus, Redo2, Scissors, Sparkles, Sticker, Trash2, Type, Undo2, Upload, Volume2, VolumeX, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { useSidebar } from "@/components/ui/sidebar";
import type { VideoProject } from "@/lib/db/schema";
import {
  ACCENTS, ANIM_DUR, applyTemplate, DEFAULT_CAPTION_STYLE, beatTimes, CAPTION_FONTS, CAPTION_LOOKS, FONT_MOODS, fontOf, RESEARCH_TEMPLATES, TEXT_COLORS, autoCaptions, blitCaption, CAPTION_ANIMS, CAPTION_PRESETS, clamp, drawCaption, fxAt, layersOf, normalizeEdit, OVERLAY_KINDS, round2,
  SAFE_PRESETS, exportSize, styleOf, tidyCaptions, toTemplate, TRANSITIONS, uid,
  type Box, type CaptionAnim, type CaptionFont, type FontMood, type CaptionPos, type CaptionStyle, type EditCaption, type EditFx, type EditOverlay, type EditTemplate, type Layer,
  type OverlayKind, type ProjectEdit, type SafeArea,
} from "@/lib/edit";
import { fontPreview, loadCaptionFonts } from "@/lib/caption-fonts";
import { renderOverlays } from "@/lib/render-overlays";
import { mediaUrl } from "@/lib/media-url";
import { voiceLine } from "@/lib/voice";
import {
  aiDirector, aiEditTimeline, aiHookVariants, aiMatchCaptionStyle, exportVariant, deleteEditTemplate, exportTimeline, galleryForEditor, listEditTemplates, openEditor, openProjectFolder, saveEdit, saveEditTemplate, saveProject, uploadMusic,
} from "../project-actions";
import { AudioTools } from "./audio-panel";
import { playMedia } from "@/lib/play-media";

type Project = Omit<VideoProject, "updatedAt"> & { updatedAt: number };
type Sel = { kind: "caption" | "voice" | "overlay" | "sfx"; id: string } | null;
type Tab = "ringkasan" | "teks" | "efek" | "audio" | "ai" | "posting";
type Hit = { id: string; kind: "caption" | "overlay"; box: Box };

const btn = "flex h-7 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium disabled:opacity-50";
const primary = `${btn} bg-primary text-primary-foreground hover:bg-primary/90`;
const secondary = `${btn} border bg-background hover:bg-accent`;
const icon = "grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40";
const field = "w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-ring disabled:opacity-60";
const LANE = 34;
const PANEL_TITLES: Record<Tab, string> = {
  ringkasan: "Ringkasan proyek",
  teks: "Teks, subtitle & stiker",
  efek: "Transisi, efek & gaya tersimpan",
  audio: "Audio: suara, musik, SFX",
  ai: "AI Director & asisten",
  posting: "Siap posting",
};
const HEAD = 92;

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const patchOf = (e: ProjectEdit) => ({
  clipVolume: e.clipVolume,
  voiceVolume: e.voiceVolume,
  captions: e.captions,
  captionStyle: e.captionStyle,
  safe: e.safe,
  overlays: e.overlays,
  fx: e.fx,
  voices: e.voices.map(({ id, start, speed, volume }) => ({ id, start, speed, volume })),
  bgm: e.bgm,
  sfx: e.sfx,
});

/**
 * Undo/redo history around the edit state. `set(x, false)` = live change mid-gesture (drag, slider, typing);
 * the state before the gesture is recorded once, at the next `set(x, true)` or `commit()`.
 */
function useHistory(initial: ProjectEdit | null) {
  const [state, setState] = useState(initial);
  const [version, setVersion] = useState(0); // bumps on user changes only (drives autosave)
  const ref = useRef(initial);
  const past = useRef<ProjectEdit[]>([]);
  const future = useRef<ProjectEdit[]>([]);
  const base = useRef<ProjectEdit | null>(null);
  const [counts, setCounts] = useState({ undo: 0, redo: 0 });
  const [api] = useState(() => {
    const o = {
    get: () => ref.current,
    apply(v: ProjectEdit, user = true) {
      ref.current = v;
      setState(v);
      setCounts({ undo: past.current.length, redo: future.current.length });
      if (user) setVersion((n) => n + 1);
    },
    set(next: ProjectEdit | ((e: ProjectEdit) => ProjectEdit), record = true) {
      const cur = ref.current;
      if (!cur) return;
      const v = typeof next === "function" ? next(cur) : next;
      if (record) {
        const b = base.current ?? cur;
        if (b !== v) {
          past.current = [...past.current.slice(-80), b];
          future.current = [];
        }
        base.current = null;
      } else base.current ??= cur;
      o.apply(v);
    },
    commit() {
      const changed = !!base.current && base.current !== ref.current;
      if (changed) {
        past.current = [...past.current.slice(-80), base.current!];
        future.current = [];
      }
      base.current = null;
      setCounts({ undo: past.current.length, redo: future.current.length });
      if (changed) setVersion((n) => n + 1); // a click without a drag is not an edit
    },
    reset(v: ProjectEdit) {
      past.current = [];
      future.current = [];
      o.apply(v, false);
    },
    undo() {
      const cur = ref.current;
      if (!cur || !past.current.length) return;
      future.current = [cur, ...future.current];
      o.apply(past.current.pop()!);
    },
    redo() {
      const cur = ref.current;
      if (!cur || !future.current.length) return;
      past.current = [...past.current, cur];
      o.apply(future.current.shift()!);
    },
    };
    return o;
  });
  return { edit: state, version, ...api, canUndo: counts.undo > 0, canRedo: counts.redo > 0 };
}

/** One WebAudio gain per media element so volumes can go above 100%. */
function useGains() {
  const ctx = useRef<AudioContext | null>(null);
  const nodes = useRef(new WeakMap<HTMLMediaElement, GainNode>());
  return useState(() => ({
    wake: () => {
      ctx.current ??= new AudioContext();
      if (ctx.current.state === "suspended") void ctx.current.resume();
    },
    set: (el: HTMLMediaElement | null, gain: number) => {
      if (!el) return;
      if (!ctx.current) return void (el.volume = clamp(gain, 0, 1));
      let g = nodes.current.get(el);
      if (!g) {
        g = ctx.current.createGain();
        ctx.current.createMediaElementSource(el).connect(g).connect(ctx.current.destination);
        nodes.current.set(el, g);
        el.volume = 1;
      }
      g.gain.value = clamp(gain, 0, 2);
    },
  }))[0];
}

export function TimelineEditor({ p }: { p: Project }) {
  const router = useRouter();
  const [opening, setOpening] = useState(!p.edit);
  const [openError, setOpenError] = useState<string | null>(null);
  const { edit, version, get, set, commit, reset, undo, redo, canUndo, canRedo } = useHistory(p.edit ? normalizeEdit(p.edit) : null);
  const [sel, setSel] = useState<Sel>(null);
  const [tab, setTab] = useState<Tab>("ringkasan");
  const [pro, setPro] = useLocalFlag("traktiva:editor-pro", false); // Simpel (essentials) / Pro (every control)
  const [aiCmd, setAiCmd] = useState("");
  // the editor needs the width: fold the app sidebar while it is open, restore it on leave
  const sidebar = useSidebar();
  useEffect(() => {
    const was = sidebar.open;
    sidebar.setOpen(false);
    return () => sidebar.setOpen(was);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per editor visit
  }, []);
  /** Stickers live in the Teks panel (own section); jump to it. */
  const openStiker = () => {
    setTab("teks");
    setTimeout(() => document.getElementById("editor-stiker")?.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
  };
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(0); // px per second; 0 = fit
  const [busy, setBusy] = useState<"export" | "ai" | "music" | null>(null);
  const [exportedV, setExportedV] = useState(p.edit?.exportedAt ? 0 : -1); // history version last exported
  const [hits, setHits] = useState<Hit[]>([]); // what is on screen now (drag targets)
  const [guide, setGuide] = useState(false); // centre line while dragging
  const [showSafe, setShowSafe] = useState(true);
  const [focus, setFocus] = useState(false); // full-window workspace (CapCut-like)
  const [fontsKey, setFontsKey] = useState(0); // bumps once the caption fonts are loaded
  // rendered stills, cropped to their box (a full-frame canvas per layer would eat memory with karaoke)
  const stills = useRef(new Map<string, { canvas: HTMLCanvasElement; box: Box }>());
  const layerMemo = useRef<{ e: ProjectEdit | null; layers: Layer[] }>({ e: null, layers: [] });
  const fxEl = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const voiceEls = useRef(new Map<string, HTMLAudioElement>());
  const bgmEl = useRef<HTMLAudioElement>(null);
  const sfxEls = useRef(new Map<string, HTMLAudioElement>());
  const playhead = useRef<HTMLDivElement>(null);
  const timeLabel = useRef<HTMLSpanElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [laneWidth, setLaneWidth] = useState(800);
  const gains = useGains();

  // caption fonts must be loaded before the canvas measures text; then redraw every cached still
  useEffect(() => {
    let alive = true;
    void loadCaptionFonts().then(() => {
      if (!alive) return;
      stills.current.clear();
      layerMemo.current = { e: null, layers: [] };
      setFontsKey((n) => n + 1);
    });
    return () => void (alive = false);
  }, []);
  useEffect(() => {
    if (!focus) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setFocus(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [focus]);

  // build the base video (first open, or after clips were re-rendered)
  useEffect(() => {
    let alive = true;
    openEditor(p.id)
      .then((e) => alive && (reset(e), setOpening(false)))
      .catch((err) => alive && (setOpenError(err instanceof Error ? err.message : "Gagal membuka editor"), setOpening(false)));
    return () => void (alive = false);
  }, [p.id, p.finalPath, reset]);

  // autosave (not on every keystroke)
  useEffect(() => {
    const e = get();
    if (!version || !e) return;
    const t = setTimeout(() => saveEdit(p.id, patchOf(e)).catch((err) => toast.error(err instanceof Error ? err.message : "Gagal menyimpan")), 700);
    return () => clearTimeout(t);
  }, [version, p.id, get]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLaneWidth(el.clientWidth - 24));
    ro.observe(el);
    return () => ro.disconnect();
  }, [opening]);

  const D = edit?.duration ?? 1;
  const pps = zoom || Math.max(20, laneWidth / D);
  const totalW = Math.max(laneWidth, D * pps + 24);

  // master clock = the base <video>; voices + music follow it
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const e = get();
      const v = video.current;
      if (!e || !v) return;
      const t = v.currentTime;
      const on = !v.paused && !v.ended;
      if (playhead.current) playhead.current.style.transform = `translateX(${t * pps}px)`;
      if (timeLabel.current) timeLabel.current.textContent = `${fmt(t)} / ${fmt(e.duration)}`;
      // clip effects (zoom punch / Ken Burns / flash / dip to black), same curves as the export
      const fx = fxAt(e, t);
      v.style.transform = fx.zoom === 1 ? "" : `scale(${fx.zoom})`;
      if (fxEl.current) {
        fxEl.current.style.background = fx.black > 0 ? "#000" : "#fff";
        fxEl.current.style.opacity = String(Math.max(fx.black, fx.white));
      }
      // text layers: each still rendered once (cropped), then animated per frame
      const cv = canvas.current;
      if (cv) {
        const ctx = cv.getContext("2d")!;
        ctx.clearRect(0, 0, cv.width, cv.height);
        if (layerMemo.current.e !== e) layerMemo.current = { e, layers: layersOf(e) };
        const shown: Hit[] = [];
        for (const l of layerMemo.current.layers) {
          if (t < l.start || t >= l.end) continue;
          let st = stills.current.get(l.key);
          if (!st) {
            if (stills.current.size > 300) stills.current.clear();
            const full = document.createElement("canvas");
            full.width = cv.width;
            full.height = cv.height;
            const box = l.draw(full.getContext("2d")!, cv.width, cv.height);
            const crop = document.createElement("canvas");
            crop.width = Math.max(1, box.w);
            crop.height = Math.max(1, box.h);
            crop.getContext("2d")!.drawImage(full, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
            st = { canvas: crop, box };
            stills.current.set(l.key, st);
          }
          // paused = show it fully (for editing); playing = with its entrance animation
          blitCaption(ctx, st.canvas, st.box, cv.height, l.anim, on ? t - l.start : 99, 0, 0, on && !!l.out, l.end - t);
          shown.push({ id: l.id, kind: l.kind, box: st.box });
        }
        setHits((cur) => (cur.length === shown.length && cur.every((h, i) => h.id === shown[i].id && h.box === shown[i].box) ? cur : shown));
      }
      // follow the playhead while playing
      const sc = scroller.current;
      if (on && sc && (t * pps > sc.scrollLeft + sc.clientWidth - 60 || t * pps < sc.scrollLeft)) sc.scrollLeft = t * pps - 40;

      // the base video can be longer than the edit (clips fitted to the voice): stop at the edit's end
      if (on && t >= e.duration - 0.03) v.pause();
      gains.set(v, e.clipVolume);
      let talking = false;
      for (const x of e.voices) {
        const el = voiceEls.current.get(x.id);
        if (!el) continue;
        const local = (t - x.start) * x.speed;
        const live = local >= 0 && local < x.dur;
        if (live) talking = true;
        el.playbackRate = x.speed;
        gains.set(el, x.volume * e.voiceVolume);
        sync(el, on && live, local);
      }
      const b = e.bgm;
      if (b && bgmEl.current) {
        let g = b.volume;
        if (b.fade) g *= Math.min(1, t / 0.5, Math.max(0, (e.duration - t) / 2));
        if (talking && e.voiceVolume > 0) g *= 0.4; // preview of the export's ducking
        gains.set(bgmEl.current, g);
        sync(bgmEl.current, on, (t + b.offset) % b.dur);
      }
      for (const x of e.sfx ?? []) {
        const el = sfxEls.current.get(x.id);
        if (!el) continue;
        const local = t - x.start;
        gains.set(el, x.volume);
        sync(el, on && local >= 0 && local < x.dur, local);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pps, gains, get]);

  const now = () => video.current?.currentTime ?? 0;
  const seek = (t: number) => {
    if (video.current) video.current.currentTime = clamp(t, 0, D - 0.01);
  };
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    gains.wake();
    if (v.paused) void playMedia(v);
    else v.pause();
  };

  const updCaption = (id: string, patch: Partial<EditCaption>, record = true) =>
    set((e) => ({ ...e, captions: e.captions.map((c) => (c.id === id ? { ...c, ...patch } : c)) }), record);
  const addCaption = () => {
    const t = now();
    const c = { id: uid(), start: round2(t), end: round2(Math.min(D, t + 1.5)), text: "Teks baru" };
    set((e) => ({ ...e, captions: [...e.captions, c].sort((a, b) => a.start - b.start) }));
    setSel({ kind: "caption", id: c.id });
    setTab("teks");
  };
  const removeSel = () => {
    if (sel?.kind === "caption") set((e) => ({ ...e, captions: e.captions.filter((c) => c.id !== sel.id) }));
    else if (sel?.kind === "overlay") set((e) => ({ ...e, overlays: e.overlays.filter((o) => o.id !== sel.id) }));
    else if (sel?.kind === "sfx") set((e) => ({ ...e, sfx: e.sfx.filter((x) => x.id !== sel.id) }));
    else return;
    setSel(null);
  };
  const updOverlay = (id: string, patch: Partial<EditOverlay>, record = true) =>
    set((e) => ({ ...e, overlays: e.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)) }), record);
  const addOverlay = (kind: OverlayKind) => {
    const k = OVERLAY_KINDS.find((x) => x.id === kind)!;
    const start = kind === "cta" ? Math.max(0, D - 2.5) : kind === "judul" || kind === "info" ? 0 : now();
    const price = p.product.price?.trim();
    const o: EditOverlay = {
      id: uid(), kind, start: round2(start), end: kind === "info" ? D : round2(Math.min(D, start + 2.5)), anim: kind === "info" ? "fade" : "pop", x: 0.5, y: k.y, size: k.size,
      text: kind === "harga" && price ? (price.length > 18 ? price.slice(0, 18) : price) : kind === "judul" ? p.product.name.split(/\s+/).slice(0, 3).join(" ") || k.text : k.text,
    };
    set((e) => ({ ...e, overlays: [...e.overlays, o] }));
    setSel({ kind: "overlay", id: o.id });
    openStiker();
    seek(o.start + 0.05);
  };
  const splitSel = () => {
    const t = round2(now());
    const c = edit?.captions.find((x) => (sel?.kind === "caption" ? x.id === sel.id : t > x.start && t < x.end));
    if (!c || t <= c.start + 0.1 || t >= c.end - 0.1) return toast.error("Taruh playhead di tengah caption untuk memotong.");
    const words = c.text.split(/\s+/);
    const cut = Math.max(1, Math.round((words.length * (t - c.start)) / (c.end - c.start)));
    const b = { id: uid(), start: t, end: c.end, text: words.slice(cut).join(" ") || c.text };
    set((e) => ({ ...e, captions: [...e.captions.map((x) => (x.id === c.id ? { ...x, end: t, text: words.slice(0, cut).join(" ") || x.text } : x)), b].sort((x, y) => x.start - y.start) }));
  };
  // real words for the template previews (first caption, ≤2 words)
  const sampleText = (edit?.captions[0]?.text ?? "").split(/\s+/).filter(Boolean).slice(0, 2).join(" ") || "Cek keranjang";
  const matchStyle = async () => {
    try {
      const r = await aiMatchCaptionStyle(p.id);
      set((e) => ({ ...e, captionStyle: { ...e.captionStyle, ...r.style } }));
      toast.success(r.note, {
        duration: 8000,
        action: { label: "Simpan gaya", onClick: () => void saveEditTemplate(p.id, patchOf(get()!), "Gaya video laris").then(() => toast.success("Tersimpan di Efek → Gaya tersimpan")) },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal meniru gaya");
    }
  };
  const regenCaptions = (words = 4) => {
    if (!edit) return;
    const segs = edit.voices.length
      ? edit.voices.map((v) => ({ start: v.start, dur: v.dur / v.speed, text: v.text ?? "" }))
      : edit.clips.map((c, i) => ({ start: c.start + 0.3, dur: Math.max(0.5, c.dur - 0.8), text: voiceLine(p.scenes[i]?.motionPrompt ?? "") ?? "" }));
    const next = autoCaptions(segs, words);
    if (!next.length) return toast.error("Belum ada naskah suara untuk dijadikan caption.");
    set((e) => ({ ...e, captions: next }));
    toast.success(`${next.length} caption dibuat dari naskah`);
  };

  /** Position/size edits go to the overlay, the caption's own pos when it has one, or the shared caption style. */
  const setPos = (id: string | null, patch: Partial<CaptionPos>, record = true) =>
    set((e) => {
      if (id && e.overlays.some((o) => o.id === id)) return { ...e, overlays: e.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)) };
      const c = id ? e.captions.find((x) => x.id === id) : null;
      if (c?.pos) return { ...e, captions: e.captions.map((x) => (x.id === c.id ? { ...x, pos: { ...c.pos!, ...patch } } : x)) };
      return { ...e, captionStyle: { ...e.captionStyle, ...patch } };
    }, record);

  /** Drag on the preview: pointer offset in px of the stage; one undo step per drag. */
  const dragStage = (ev: React.PointerEvent, onMove: (dx: number, dy: number, rect: DOMRect, e: PointerEvent) => void) => {
    ev.preventDefault();
    ev.stopPropagation();
    const rect = stage.current!.getBoundingClientRect();
    const x0 = ev.clientX, y0 = ev.clientY;
    const move = (e: PointerEvent) => onMove(e.clientX - x0, e.clientY - y0, rect, e);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setGuide(false);
      commit();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const moveLayer = (ev: React.PointerEvent, hit: Hit) => {
    if (!edit) return;
    const { id, box } = hit;
    setSel({ kind: hit.kind, id });
    if (hit.kind === "overlay") openStiker(); else setTab("teks");
    // start from where the text is drawn (the style may be pushed in by the safe area)
    const cx = (box.x + box.w / 2) / edit.width, cy = (box.y + box.h / 2) / edit.height;
    dragStage(ev, (dx, dy, rect) => {
      let x = clamp(cx + dx / rect.width, 0.02, 0.98);
      const centred = Math.abs(x - 0.5) < 0.015;
      if (centred) x = 0.5;
      setGuide(centred);
      setPos(id, { x: round2(x), y: round2(clamp(cy + dy / rect.height, 0.02, 0.98)) }, false);
    });
  };
  const resizeLayer = (ev: React.PointerEvent, hit: Hit) => {
    if (!edit) return;
    const { id, box } = hit;
    const c = edit.captions.find((x) => x.id === id);
    const size0 = edit.overlays.find((o) => o.id === id)?.size ?? styleOf(edit.captionStyle, c).size;
    const rect = stage.current!.getBoundingClientRect();
    const k = rect.width / edit.width;
    const ccx = rect.left + (box.x + box.w / 2) * k, ccy = rect.top + (box.y + box.h / 2) * k;
    const d0 = Math.max(8, Math.hypot(ev.clientX - ccx, ev.clientY - ccy));
    dragStage(ev, (_dx, _dy, _r, e) => setPos(id, { size: Math.round(clamp((size0 * Math.hypot(e.clientX - ccx, e.clientY - ccy)) / d0, 0.03, 0.14) * 1000) / 1000 }, false));
  };
  /** Replay the animation: jump just before the selected (or next) caption and play. */
  const previewAnim = () => {
    const c = (sel?.kind === "caption" && edit?.captions.find((x) => x.id === sel.id)) || edit?.captions.find((x) => x.end > now()) || edit?.captions[0];
    if (!c || !video.current) return;
    seek(Math.max(0, c.start - 0.15));
    gains.wake();
    void playMedia(video.current);
  };

  // keyboard: space play/pause, delete, ctrl+z / ctrl+shift+z, s = split
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (ev.target as HTMLElement)?.isContentEditable) return;
      const k = ev.key.toLowerCase();
      const mod = ev.ctrlKey || ev.metaKey;
      const act = ev.code === "Space" ? toggle : (k === "delete" || k === "backspace") && sel ? removeSel : mod && k === "z" ? (ev.shiftKey ? redo : undo) : mod && k === "y" ? redo : null;
      if (act) {
        ev.preventDefault();
        act();
      } else if (ev.key.toLowerCase() === "s" && !ev.ctrlKey && !ev.metaKey) splitSel();
      else if (ev.key === "ArrowLeft") seek(now() - (ev.shiftKey ? 1 : 0.1));
      else if (ev.key === "ArrowRight") seek(now() + (ev.shiftKey ? 1 : 0.1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /** Drag helper: calls onMove with the pointer's offset in seconds; history is recorded once on release. */
  const drag = (ev: React.PointerEvent, onMove: (dSec: number) => void) => {
    ev.preventDefault();
    ev.stopPropagation();
    const x0 = ev.clientX;
    const move = (e: PointerEvent) => onMove((e.clientX - x0) / pps);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      commit(); // the whole drag = one undo step
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const snap = (t: number) => {
    // snap to the playhead and to clip edges within 0.08 s
    const pts = [now(), ...(edit?.clips.flatMap((c) => [c.start, c.start + c.dur]) ?? [])];
    const hit = pts.find((q) => Math.abs(q - t) < 8 / pps);
    return round2(hit ?? t);
  };

  /** Hook A/B: export every variant to final-A/B/C.mp4 (the editor keeps its own edit). */
  const exportVariants = async (list: { edit: ProjectEdit; hook?: string }[]) => {
    setBusy("export");
    try {
      for (const [i, v] of list.entries()) {
        const label = "ABCD"[i];
        toast.loading(`Mengekspor varian ${label} (${i + 1}/${list.length})...`, { id: "variants" });
        await exportVariant(p.id, patchOf(v.edit), await renderOverlays(v.edit), label, v.hook ?? "");
      }
      toast.success(`${list.length} varian diekspor: final-A … final-${"ABCD"[list.length - 1]}.mp4 di folder proyek`, { id: "variants" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export varian gagal", { id: "variants" });
    } finally {
      setBusy(null);
    }
  };

  const runHooks = async () => {
    if (!edit) return;
    setBusy("ai");
    try {
      setHookVersions(await aiHookVariants(p.id, patchOf(edit)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Varian hook gagal");
    } finally {
      setBusy(null);
    }
  };

  const doExport = async () => {
    if (!edit) return;
    setBusy("export");
    try {
      const { w: W, h: H } = exportSize(edit);
      const overlays = await renderOverlays(edit);
      await saveEdit(p.id, patchOf(edit));
      await exportTimeline(p.id, patchOf(edit), overlays);
      setExportedV(version);
      toast.success(`Video diekspor ke final.mp4 (${W}×${H}, kualitas HD)`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export gagal");
    } finally {
      setBusy(null);
    }
  };

  const runAi = async (instruction: string) => {
    if (!edit) return;
    setBusy("ai");
    try {
      const r = await aiEditTimeline(p.id, patchOf(edit), instruction);
      set(r.edit);
      toast.success(r.note);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI gagal");
    } finally {
      setBusy(null);
    }
  };

  const [versions, setVersions] = useState<{ edit: ProjectEdit; note: string }[]>([]);
  const [hookVersions, setHookVersions] = useState<{ edit: ProjectEdit; note: string; hook: string }[]>([]);
  const runDirector = async (wish: string) => {
    if (!edit) return;
    setBusy("ai");
    setVersions([]);
    try {
      const r = await aiDirector(p.id, patchOf(edit), wish);
      setVersions(r);
      toast.success(`${r.length} versi siap. Pilih salah satu.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI Director gagal");
    } finally {
      setBusy(null);
    }
  };

  const addMusic = async (file: File | undefined) => {
    if (!file) return;
    setBusy("music");
    try {
      const fd = new FormData();
      fd.append("music", file);
      const bgm = await uploadMusic(p.id, fd);
      set((e) => ({ ...e, bgm, clipVolume: e.voices.length ? e.clipVolume : Math.min(e.clipVolume, 0.6) }));
      setTab("audio");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengunggah musik");
    } finally {
      setBusy(null);
    }
  };

  if (opening) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border bg-card text-xs text-muted-foreground">
        <Loader2 className="size-5 animate-spin" /> Menyiapkan editor (memisahkan suara dari klip)...
      </div>
    );
  }
  if (openError || !edit) return <div className="rounded-xl border bg-card p-5 text-xs text-destructive">{openError ?? "Editor tidak tersedia."}</div>;

  const selCap = sel?.kind === "caption" ? edit.captions.find((c) => c.id === sel.id) : undefined;
  const selVoice = sel?.kind === "voice" ? edit.voices.find((v) => v.id === sel.id) : undefined;
  const ticks = pps > 60 ? 0.5 : pps > 25 ? 1 : 2;

  return (
    <div className={focus ? "fixed inset-0 z-[60] space-y-3 overflow-auto bg-background p-3" : "space-y-3"}>
      <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)]">
        {/* preview: height-driven so preview + panel + timeline fit one screen */}
        <div className="mx-auto space-y-1.5">
          <div className={`relative ${focus ? "h-[min(62vh,720px)]" : "h-[min(50vh,560px)]"} min-h-72 overflow-hidden rounded-xl border bg-black`} style={{ aspectRatio: `${edit.width}/${edit.height}` }}>
            <video
              ref={video}
              src={mediaUrl(edit.base)}
              className="size-full"
              playsInline
              preload="auto"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
            <div ref={fxEl} className="pointer-events-none absolute inset-0 opacity-0" />
            <canvas ref={canvas} width={edit.width} height={edit.height} className="pointer-events-none absolute inset-0 size-full" />
            {/* interaction layer: click = play/pause, drag the caption to move it, corner dot = resize */}
            <div ref={stage} className="absolute inset-0" onClick={toggle}>
              {showSafe && <SafeGuides safe={edit.safe} />}
              {guide && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-fuchsia-400" />}
              {!playing &&
                hits.map((h) => (
                  <div
                    key={h.id}
                    className={`group absolute cursor-move touch-none rounded-sm border border-dashed ${sel?.id === h.id ? "border-white" : "border-transparent hover:border-white/70"}`}
                    style={{ left: `${(h.box.x / edit.width) * 100}%`, top: `${(h.box.y / edit.height) * 100}%`, width: `${(h.box.w / edit.width) * 100}%`, height: `${(h.box.h / edit.height) * 100}%` }}
                    onPointerDown={(ev) => moveLayer(ev, h)}
                    onClick={(ev) => ev.stopPropagation()}
                    title={h.kind === "overlay" ? "Seret untuk memindah stiker" : "Seret untuk memindah caption"}
                  >
                    <span
                      className={`absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize rounded-full border-2 border-primary bg-white ${sel?.id === h.id ? "" : "hidden group-hover:block"}`}
                      onPointerDown={(ev) => resizeLayer(ev, h)}
                      title="Tarik untuk mengubah ukuran"
                    />
                  </div>
                ))}
            </div>
            {edit.voices.map((v) => (
              <audio key={v.id} preload="auto" src={mediaUrl(v.src)} ref={(el) => void (el ? voiceEls.current.set(v.id, el) : voiceEls.current.delete(v.id))} />
            ))}
            {edit.bgm && <audio key={edit.bgm.src} ref={bgmEl} preload="auto" src={mediaUrl(edit.bgm.src)} />}
            {edit.sfx.map((x) => (
              <audio key={x.id} preload="auto" src={mediaUrl(x.src)} ref={(el) => void (el ? sfxEls.current.set(x.id, el) : sfxEls.current.delete(x.id))} />
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button type="button" className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90" onClick={toggle} aria-label={playing ? "Jeda" : "Putar"}>
              {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </button>
            <span ref={timeLabel} className="ml-1 font-mono text-[11px] tabular-nums text-muted-foreground">0:00.0 / {fmt(D)}</span>
            <button type="button" className={`${icon} ml-auto ${showSafe ? "bg-primary/10 text-primary" : ""}`} onClick={() => setShowSafe((v) => !v)} title="Safe area: area yang tertutup tombol & teks aplikasi">
              <Frame className="size-3.5" />
            </button>
            <button type="button" className={`${icon} ${focus ? "bg-primary/10 text-primary" : ""}`} onClick={() => setFocus((v) => !v)} title={focus ? "Keluar mode fokus (Esc)" : "Mode fokus: editor layar penuh"}>
              {focus ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>
          </div>
        </div>

        {/* inspector */}
        <div className="relative min-h-80">
        <div className="flex overflow-hidden rounded-xl border bg-card lg:absolute lg:inset-0">
          <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-1.5 border-b px-2">
            {tab !== "ringkasan" ? (
              <button type="button" className={`${icon} shrink-0`} onClick={() => setTab("ringkasan")} title="Kembali ke ringkasan"><ArrowLeft className="size-4" /></button>
            ) : (
              <LayoutDashboard className="ml-1.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate text-[13px] font-semibold">{PANEL_TITLES[tab]}</span>
            <Seg value={pro} onChange={setPro} options={[[false, "Simpel"], [true, "Pro"]]} className="ml-auto shrink-0" />
            <span className={`shrink-0 whitespace-nowrap text-[11px] ${version > exportedV ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`} title={version > exportedV ? "Ada perubahan yang belum diekspor" : "Sudah diekspor"}>{version > exportedV ? "●" : "✓"}</span>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {tab === "ringkasan" && <SummaryPanel edit={edit} p={p} pro={pro} exported={version <= exportedV} onOpen={(t) => (t === "stiker" ? openStiker() : setTab(t))} />}
            {tab === "teks" && (
              <>
              <TextPanel
                pro={pro}
                style={edit.captionStyle}
                onStyle={(s, record) => set((e) => ({ ...e, captionStyle: { ...e.captionStyle, ...s } }), record)}
                onPos={(patch, record) => setPos(selCap?.id ?? null, patch, record)}
                onAnim={(anim) => (set((e) => ({ ...e, captionStyle: { ...e.captionStyle, anim } })), previewAnim())}
                safe={edit.safe}
                onSafe={(s, record) => set((e) => ({ ...e, safe: { ...e.safe, ...s } }), record)}
                selected={selCap}
                onCaption={(patch, record) => selCap && updCaption(selCap.id, patch, record)}
                onAdd={addCaption}
                onRemove={removeSel}
                onSplit={splitSel}
                onRegen={(n) => regenCaptions(n)}
                onTidy={() => (set((e) => ({ ...e, captions: tidyCaptions(e.captions) })), toast.success("Caption dirapikan: angka jadi digit. Ctrl+Z untuk batal."))}
                fontsKey={fontsKey}
                count={edit.captions.length}
                sample={sampleText}
                onMatch={matchStyle}
              />
              <div id="editor-stiker" className="scroll-mt-2">
                <Section title="Stiker" icon={Sticker} hint="judul hook, harga, CTA, teks info">
                  <OverlayPanel
                    overlays={edit.overlays}
                    selected={sel?.kind === "overlay" ? edit.overlays.find((o) => o.id === sel.id) : undefined}
                    onAdd={addOverlay}
                    onPick={(o) => (setSel({ kind: "overlay", id: o.id }), seek(o.start + 0.05))}
                    onChange={(id, patch, record) => updOverlay(id, patch, record)}
                    onRemove={removeSel}
                  />
                </Section>
              </div>
              </>
            )}
            {tab === "audio" && (
              <div className="space-y-3">
                <Slider label="Suara klip asli" value={edit.clipVolume} onChange={(v, r) => set((e) => ({ ...e, clipVolume: v }), r)} />
                {edit.voices.length > 0 && <Slider label="Voice-over (semua)" value={edit.voiceVolume} onChange={(v, r) => set((e) => ({ ...e, voiceVolume: v }), r)} />}
                {selVoice && (
                  <div className="space-y-2 rounded-lg border bg-background p-2.5">
                    <p className="text-xs font-medium">Voice-over terpilih <span className="font-normal text-muted-foreground">· “{selVoice.text}”</span></p>
                    <Slider label="Volume" value={selVoice.volume} onChange={(v, r) => set((e) => ({ ...e, voices: e.voices.map((x) => (x.id === selVoice.id ? { ...x, volume: v } : x)) }), r)} />
                    <Slider label="Kecepatan" value={selVoice.speed} min={0.5} max={2} step={0.05} unit="×" onChange={(v, r) => set((e) => ({ ...e, voices: e.voices.map((x) => (x.id === selVoice.id ? { ...x, speed: v } : x)) }), r)} />
                  </div>
                )}
                <AudioTools projectId={p.id} edit={edit} patch={() => patchOf(get()!)} now={now} apply={(e, mode) => (mode === "reset" ? reset(e) : set(e))} />
                <div className="space-y-3 rounded-lg border bg-background p-3">
                  <div className="flex items-center gap-2">
                    <Music className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{edit.bgm ? edit.bgm.name : "Musik latar (BGM)"}</span>
                    <label className={`${secondary} cursor-pointer`}>
                      {busy === "music" ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} {edit.bgm ? "Ganti" : "Tambah musik"}
                      <input type="file" accept="audio/*" hidden onChange={(e) => (void addMusic(e.target.files?.[0]), (e.target.value = ""))} />
                    </label>
                    {edit.bgm && <button type="button" className={icon} aria-label="Hapus musik" onClick={() => set((e) => ({ ...e, bgm: null }))}><Trash2 className="size-3.5" /></button>}
                  </div>
                  {edit.bgm ? (
                    <>
                      <Slider label="Volume musik" value={edit.bgm.volume} onChange={(v, r) => set((e) => ({ ...e, bgm: e.bgm && { ...e.bgm, volume: v } }), r)} />
                      <Slider label="Mulai dari detik" value={edit.bgm.offset} min={0} max={Math.max(0, Math.floor(edit.bgm.dur - 1))} step={0.5} unit="s" onChange={(v, r) => set((e) => ({ ...e, bgm: e.bgm && { ...e.bgm, offset: v } }), r)} />
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={edit.bgm.fade} onChange={(e) => set((x) => ({ ...x, bgm: x.bgm && { ...x.bgm, fade: e.target.checked } }))} /> Fade in/out
                      </label>
                    </>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">MP3/WAV/M4A dari perangkatmu. Pakai musik bebas royalti atau dari pustaka suara TikTok agar video tidak dibisukan.</p>
                  )}
                </div>
              </div>
            )}
            {tab === "efek" && (
              <FxPanel
                fx={edit.fx}
                onFx={(patch) => set((e) => ({ ...e, fx: { ...e.fx, ...patch } }))}
                onSaveTemplate={(name) => saveEditTemplate(p.id, patchOf(edit), name)}
                onApplyTemplate={(t) => (set((e) => applyTemplate(e, t)), toast.success(`Gaya “${t.name}” dipakai`))}
                current={() => toTemplate(edit, "")}
              />
            )}
            {tab === "ai" && (
              <AiPanel
                busy={busy === "ai"}
                hasBgm={!!edit.bgm}
                onRun={runAi}
                onDirector={runDirector}
                versions={versions}
                onPick={(v) => (set(v.edit), setVersions([]), toast.success("Versi dipakai. Ctrl+Z untuk kembali."))}
                hooks={hookVersions}
                onHooks={runHooks}
                onTryHook={(v) => (set(v.edit), toast.success("Varian dipasang di editor. Ctrl+Z untuk kembali."))}
                onExportHooks={() => void exportVariants(hookVersions)}
                exporting={busy === "export"}
              />
            )}
            {tab === "posting" && <PostingPanel p={p} />}
          </div>
          </div>
        </div>
        </div>
      </div>

      {/* timeline */}
      <div className="rounded-xl border bg-card select-none">
        <div className="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
          <button type="button" className={icon} onClick={toggle} aria-label={playing ? "Jeda" : "Putar"}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}</button>
          <button type="button" className={icon} onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"><Undo2 className="size-4" /></button>
          <button type="button" className={icon} onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)"><Redo2 className="size-4" /></button>
          <span className="mx-1 h-5 w-px bg-border" />
          <button type="button" className={secondary} onClick={addCaption}><Plus className="size-3.5" /> Caption</button>
          <button type="button" className={icon} onClick={splitSel} title="Potong caption di playhead (S)"><Scissors className="size-4" /></button>
          <button type="button" className={icon} onClick={removeSel} disabled={sel?.kind !== "caption" && sel?.kind !== "overlay" && sel?.kind !== "sfx"} title="Hapus (Del)"><Trash2 className="size-4" /></button>
          <span className="mx-1 h-5 w-px bg-border" />
          {/* AI command bar: one instruction, applied to the timeline (Ctrl+Z to undo) */}
          <form
            className="flex min-w-0 flex-1 items-center gap-1 rounded-md border bg-background pr-0.5 pl-2 focus-within:border-ring sm:max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              if (aiCmd.trim() && busy !== "ai") void runAi(aiCmd.trim()).then(() => setAiCmd(""));
            }}
          >
            {busy === "ai" ? <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" /> : <Sparkles className="size-3.5 shrink-0 text-primary" />}
            <input value={aiCmd} onChange={(e) => setAiCmd(e.target.value)} disabled={busy === "ai"} placeholder="Perintah AI: kecilkan musik, caption kuning di tengah..." className="h-7 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70" aria-label="Perintah AI" />
            <button type="button" className="h-6 shrink-0 rounded px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setTab("ai")} title="AI Director: 3 variasi hook & gaya">Director</button>
          </form>
          <div className="ml-auto flex items-center gap-2">
            <input type="range" min={0} max={200} value={zoom} onChange={(e) => setZoom(Number(e.target.value) < 15 ? 0 : Number(e.target.value))} aria-label="Zoom timeline" className="w-24 accent-primary" />
            <button type="button" className={`${secondary} ${tab === "posting" ? "border-primary text-primary" : ""}`} onClick={() => setTab("posting")} title="Caption, hashtag & file siap posting"><Send className="size-3.5" /> Posting</button>
            <button type="button" className={primary} disabled={!!busy} onClick={doExport}>
              {busy === "export" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} {busy === "export" ? "Mengekspor..." : "Export video"}
            </button>
          </div>
        </div>
        <div className="flex">
          {/* track headers */}
          <div className="shrink-0 border-r text-[11px]" style={{ width: HEAD }}>
            <div className="h-5 border-b" />
            <TrackHead label="Video" icon={Film} active={tab === "efek"} onOpen={() => setTab("efek")} />
            <TrackHead label="Teks" icon={Type} active={tab === "teks"} onOpen={() => setTab("teks")} />
            <TrackHead label="Stiker" icon={Sticker} onOpen={openStiker} />
            <TrackHead label="Suara" icon={Mic} active={tab === "audio"} onOpen={() => setTab("audio")} muted={edit.voiceVolume === 0} onMute={edit.voices.length ? () => set((e) => ({ ...e, voiceVolume: e.voiceVolume ? 0 : 1 })) : undefined} />
            <TrackHead label="SFX" icon={Sparkles} onOpen={() => setTab("audio")} muted={edit.sfx.length > 0 && edit.sfx.every((x) => x.volume === 0)} onMute={edit.sfx.length ? () => set((e) => ({ ...e, sfx: e.sfx.map((x) => ({ ...x, volume: e.sfx.every((y) => y.volume === 0) ? 0.6 : 0 })) })) : undefined} />
            <TrackHead label="Musik" icon={Music} onOpen={() => setTab("audio")} muted={!!edit.bgm && edit.bgm.volume === 0} onMute={edit.bgm ? () => set((e) => ({ ...e, bgm: e.bgm && { ...e.bgm, volume: e.bgm.volume ? 0 : 0.2 } })) : undefined} />
          </div>
          {/* lanes */}
          <div ref={scroller} className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden" onPointerDown={() => setSel(null)}>
            <div className="relative" style={{ width: totalW }}>
              {/* ruler: click/drag to seek */}
              <div
                className="relative h-5 cursor-pointer border-b bg-muted/40"
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  const left = (ev.currentTarget as HTMLElement).getBoundingClientRect().left;
                  const go = (x: number) => seek((x - left) / pps);
                  go(ev.clientX);
                  const move = (e: PointerEvent) => go(e.clientX);
                  const up = () => (window.removeEventListener("pointermove", move), window.removeEventListener("pointerup", up));
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", up);
                }}
              >
                {Array.from({ length: Math.floor(D / ticks) + 1 }, (_, i) => i * ticks).map((t) => (
                  <span key={t} className="absolute top-0 h-full border-l border-border/70 pl-1 text-[9px] leading-5 text-muted-foreground" style={{ left: t * pps }}>
                    {Number.isInteger(t) ? `${t}s` : ""}
                  </span>
                ))}
              </div>
              {/* video */}
              <Lane>
                {edit.clips.map((c, i) => (
                  <div
                    key={i}
                    className="absolute top-1 bottom-1 overflow-hidden rounded-md border border-sky-500/50 bg-sky-500/15 bg-repeat-x text-[10px] leading-[24px] text-white"
                    style={{ left: c.start * pps, width: c.dur * pps - 2, backgroundImage: p.scenes[i]?.image ? `url("${mediaUrl(p.scenes[i]!.image!)}")` : undefined, backgroundSize: "auto 100%" }}
                    onPointerDown={(ev) => (ev.stopPropagation(), seek(c.start))}
                  >
                    <span className="block truncate bg-gradient-to-r from-black/70 to-transparent px-2 font-medium">{i + 1}. {c.label}</span>
                  </div>
                ))}
              </Lane>
              {/* captions */}
              <Lane>
                {edit.captions.map((c) => (
                  <Block
                    key={c.id}
                    left={c.start * pps}
                    width={(c.end - c.start) * pps}
                    selected={sel?.id === c.id}
                    tone="bg-amber-400/25 border-amber-500/50 text-amber-950 dark:text-amber-100"
                    onSelect={() => (setSel({ kind: "caption", id: c.id }), setTab("teks"))}
                    onMove={(ev) => {
                      const { start, end } = c;
                      drag(ev, (d) => {
                        const s = snap(clamp(start + d, 0, D - (end - start)));
                        updCaption(c.id, { start: s, end: round2(s + end - start) }, false);
                      });
                    }}
                    onResize={(ev, side) => {
                      const { start, end } = c;
                      drag(ev, (d) =>
                        side === "l"
                          ? updCaption(c.id, { start: snap(clamp(start + d, 0, end - 0.2)) }, false)
                          : updCaption(c.id, { end: snap(clamp(end + d, start + 0.2, D)) }, false),
                      );
                    }}
                    label={c.text}
                  />
                ))}
              </Lane>
              {/* stickers / overlays */}
              <Lane>
                {edit.overlays.length ? (
                  edit.overlays.map((o) => (
                    <Block
                      key={o.id}
                      left={o.start * pps}
                      width={(o.end - o.start) * pps}
                      selected={sel?.id === o.id}
                      tone="bg-emerald-500/20 border-emerald-500/50 text-emerald-950 dark:text-emerald-100"
                      onSelect={() => (setSel({ kind: "overlay", id: o.id }), openStiker())}
                      onMove={(ev) => {
                        const { start, end } = o;
                        drag(ev, (d) => {
                          const s = snap(clamp(start + d, 0, D - (end - start)));
                          updOverlay(o.id, { start: s, end: round2(s + end - start) }, false);
                        });
                      }}
                      onResize={(ev, side) => {
                        const { start, end } = o;
                        drag(ev, (d) =>
                          side === "l"
                            ? updOverlay(o.id, { start: snap(clamp(start + d, 0, end - 0.2)) }, false)
                            : updOverlay(o.id, { end: snap(clamp(end + d, start + 0.2, D)) }, false),
                        );
                      }}
                      label={o.text}
                    />
                  ))
                ) : (
                  <button type="button" className="absolute top-1 bottom-1 left-1 flex items-center gap-1 rounded-md border border-dashed px-2 text-[10px] text-muted-foreground hover:bg-accent" onPointerDown={(ev) => ev.stopPropagation()} onClick={() => openStiker()}>
                    <Plus className="size-3" /> Judul / harga / CTA
                  </button>
                )}
              </Lane>
              {/* voice-over */}
              <Lane>
                {edit.voices.length ? (
                  edit.voices.map((v) => (
                    <Block
                      key={v.id}
                      left={v.start * pps}
                      width={(v.dur / v.speed) * pps}
                      selected={sel?.id === v.id}
                      tone="bg-rose-500/20 border-rose-500/50 text-rose-950 dark:text-rose-100"
                      onSelect={() => (setSel({ kind: "voice", id: v.id }), setTab("audio"))}
                      onMove={(ev) => {
                        const { start } = v;
                        drag(ev, (d) => set((e) => ({ ...e, voices: e.voices.map((x) => (x.id === v.id ? { ...x, start: snap(clamp(start + d, 0, D - 0.3)) } : x)) }), false));
                      }}
                      label={v.text ?? "Voice-over"}
                    />
                  ))
                ) : (
                  <span className="absolute inset-y-0 left-2 flex items-center text-[10px] text-muted-foreground">Suara menyatu dengan klip (Bawaan Flow / tanpa suara)</span>
                )}
              </Lane>
              {/* sound effects */}
              <Lane>
                {edit.sfx.map((x) => (
                  <Block
                    key={x.id}
                    left={x.start * pps}
                    width={Math.max(x.dur, 0.3) * pps}
                    selected={sel?.id === x.id}
                    tone="bg-orange-500/20 border-orange-500/50 text-orange-950 dark:text-orange-100"
                    onSelect={() => (setSel({ kind: "sfx", id: x.id }), setTab("audio"))}
                    onMove={(ev) => {
                      const { start } = x;
                      drag(ev, (d) => set((e) => ({ ...e, sfx: e.sfx.map((y) => (y.id === x.id ? { ...y, start: snap(clamp(start + d, 0, D - 0.05)) } : y)) }), false));
                    }}
                    label={x.name}
                  />
                ))}
              </Lane>
              {/* music (with beat ticks when the tempo is known) */}
              <Lane>
                {beatTimes(edit.bgm, D).map((b) => (
                  <span key={b} className="pointer-events-none absolute bottom-0 h-1.5 w-px bg-violet-500/70" style={{ left: b * pps }} />
                ))}
                {edit.bgm ? (
                  <div className="absolute top-1 bottom-1 left-0 flex items-center gap-1.5 overflow-hidden rounded-md border border-violet-500/50 bg-violet-500/20 px-2 text-[10px] text-violet-950 dark:text-violet-100" style={{ width: D * pps - 2 }} onPointerDown={(ev) => (ev.stopPropagation(), setTab("audio"))}>
                    <Music className="size-3 shrink-0" /> <span className="truncate">{edit.bgm.name} · {Math.round(edit.bgm.volume * 100)}%</span>
                  </div>
                ) : (
                  <label className="absolute top-1 bottom-1 left-1 flex cursor-pointer items-center gap-1 rounded-md border border-dashed px-2 text-[10px] text-muted-foreground hover:bg-accent" onPointerDown={(ev) => ev.stopPropagation()}>
                    <Plus className="size-3" /> Tambah musik
                    <input type="file" accept="audio/*" hidden onChange={(e) => (void addMusic(e.target.files?.[0]), (e.target.value = ""))} />
                  </label>
                )}
              </Lane>
              <div ref={playhead} className="pointer-events-none absolute top-0 bottom-0 left-0 z-10 w-px bg-primary">
                <span className="absolute -top-0 -left-1 size-2.5 rotate-45 bg-primary" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function sync(el: HTMLMediaElement, shouldPlay: boolean, at: number) {
  if (shouldPlay) {
    if (el.paused) {
      el.currentTime = Math.max(0, at);
      void el.play().catch(() => {});
    } else if (Math.abs(el.currentTime - at) > 0.25) el.currentTime = Math.max(0, at);
  } else if (!el.paused) el.pause();
}

function Lane({ children }: { children: React.ReactNode }) {
  return <div className="relative border-b last:border-b-0" style={{ height: LANE }}>{children}</div>;
}

/** Lane title; clicking it opens that lane's panel in the inspector (the editor's navigation). */
function TrackHead({ label, icon: I, muted, onMute, onOpen, active }: { label: string; icon?: React.ComponentType<{ className?: string }>; muted?: boolean; onMute?: () => void; onOpen?: () => void; active?: boolean }) {
  return (
    <div className={`flex items-center gap-1 border-b pr-1 pl-1 font-medium last:border-b-0 ${active ? "bg-primary/8" : ""}`} style={{ height: LANE }}>
      <button type="button" onClick={onOpen} title={onOpen ? `Buka panel ${label}` : undefined} className={`flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left transition-colors hover:bg-accent ${active ? "text-primary" : ""}`}>
        {I && <I className={`size-3.5 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />}
        <span className="truncate">{label}</span>
      </button>
      {onMute && (
        <button type="button" onClick={onMute} className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={muted ? "Bunyikan" : "Bisukan"}>
          {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
        </button>
      )}
    </div>
  );
}

function Block({
  left, width, label, tone, selected, onSelect, onMove, onResize,
}: {
  left: number; width: number; label: string; tone: string; selected: boolean; onSelect: () => void;
  onMove: (ev: React.PointerEvent) => void; onResize?: (ev: React.PointerEvent, side: "l" | "r") => void;
}) {
  return (
    <div
      className={`group absolute top-1 bottom-1 cursor-grab touch-none overflow-hidden rounded-md border text-[10px] leading-[24px] select-none active:cursor-grabbing ${tone} ${selected ? "ring-2 ring-primary" : ""}`}
      style={{ left, width: Math.max(6, width - 2) }}
      onPointerDown={(ev) => {
        onSelect();
        onMove(ev);
      }}
      title={label}
    >
      <span className="block truncate px-2">{label}</span>
      {onResize && (
        <>
          <span className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-black/0 group-hover:bg-black/15" onPointerDown={(ev) => (onSelect(), onResize(ev, "l"))} />
          <span className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-black/0 group-hover:bg-black/15" onPointerDown={(ev) => (onSelect(), onResize(ev, "r"))} />
        </>
      )}
    </div>
  );
}

/**
 * Range input with a filled track, a value pill and (when `def` is given) click-the-pill to reset.
 * record=false while dragging (live preview), true on release (one undo step).
 */
function Slider({
  label, value, onChange, min = 0, max = 2, step = 0.05, unit = "%", def,
}: { label: string; value: number; onChange: (v: number, record: boolean) => void; min?: number; max?: number; step?: number; unit?: "%" | "×" | "s"; def?: number }) {
  const shown = unit === "%" ? `${Math.round(value * 100)}%` : `${value}${unit}`;
  const pct = ((clamp(value, min, max) - min) / (max - min || 1)) * 100;
  const changed = def != null && Math.abs(value - def) > step / 2;
  return (
    <div className="grid grid-cols-[minmax(68px,auto)_1fr_auto] items-center gap-2.5 text-xs">
      <span className="truncate text-muted-foreground">{label}</span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(round2(Number(e.target.value)), false)}
        onPointerUp={(e) => onChange(round2(Number((e.target as HTMLInputElement).value)), true)}
        onKeyUp={(e) => onChange(round2(Number((e.target as HTMLInputElement).value)), true)}
        style={{ background: `linear-gradient(to right, var(--primary) ${pct}%, color-mix(in oklab, var(--foreground) 14%, transparent) ${pct}%)` }}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-125"
      />
      <button
        type="button"
        disabled={!changed}
        onClick={() => def != null && onChange(def, true)}
        title={changed ? "Klik untuk kembali ke bawaan" : undefined}
        className={`min-w-11 rounded-md px-1.5 py-0.5 text-right font-mono text-[11px] tabular-nums ${changed ? "bg-primary/12 text-primary hover:bg-primary/20" : "bg-muted text-foreground"}`}
      >
        {shown}
      </button>
    </div>
  );
}

const chip = (on: boolean) =>
  `h-7 rounded-md border px-2.5 text-[11px] transition-colors disabled:pointer-events-none disabled:opacity-40 ${on ? "border-primary bg-primary/12 font-medium text-primary" : "bg-background text-muted-foreground hover:border-ring/50 hover:text-foreground"}`;

/** Segmented control for a small set of exclusive options. */
function Seg<T extends string | boolean>({ value, options, onChange, className = "" }: { value: T; options: [T, string, string?][]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={`inline-flex rounded-md bg-muted p-0.5 ${className}`}>
      {options.map(([v, label, disabledReason]) => (
        <button
          key={String(v)}
          type="button"
          disabled={!!disabledReason}
          title={disabledReason}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`h-6 flex-1 rounded px-2.5 text-[11px] font-medium whitespace-nowrap transition-colors disabled:opacity-40 ${value === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Round colour swatch (rounded square for box colours) with a clear selected ring. */
function Swatch({ color, on, onClick, label, square = false }: { color: string; on: boolean; onClick: () => void; label: string; square?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={`size-6 shrink-0 border border-black/20 transition-transform hover:scale-110 ${square ? "rounded-md" : "rounded-full"} ${on ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""}`}
      style={{ background: color }}
    />
  );
}

/** Custom colour (native picker) shown as a rainbow swatch. */
function ColorPick({ value, onChange, label, square = false }: { value: string; onChange: (v: string, record: boolean) => void; label: string; square?: boolean }) {
  return (
    <label className={`relative size-6 shrink-0 cursor-pointer overflow-hidden border border-black/20 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] transition-transform hover:scale-110 ${square ? "rounded-md" : "rounded-full"}`} title={label}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value, false)} onBlur={(e) => onChange(e.target.value, true)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={label} />
    </label>
  );
}

const POS_X = [0.28, 0.5, 0.72];
const POS_Y = [0.2, 0.5, 0.72];

/** 3×3 phone-shaped grid: click a cell to place the text there; the nearest cell to the current spot is lit. */
function PosGrid({ x, y, onPick }: { x: number; y: number; onPick: (p: { x: number; y: number }) => void }) {
  const near = (v: number, list: number[]) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const nx = near(x, POS_X), ny = near(y, POS_Y);
  return (
    <div className="grid h-[92px] w-[54px] shrink-0 grid-cols-3 grid-rows-3 gap-0.5 rounded-lg border-2 border-foreground/25 bg-muted p-1" role="group" aria-label="Posisi cepat">
      {POS_Y.flatMap((py) =>
        POS_X.map((px) => (
          <button
            key={`${px}-${py}`}
            type="button"
            onClick={() => onPick({ x: px, y: py })}
            aria-label={`Taruh di ${py < 0.4 ? "atas" : py > 0.6 ? "bawah" : "tengah"} ${px < 0.4 ? "kiri" : px > 0.6 ? "kanan" : "tengah"}`}
            className={`rounded-sm transition-colors ${px === nx && py === ny ? "bg-primary" : "bg-foreground/10 hover:bg-foreground/30"}`}
          />
        )),
      )}
    </div>
  );
}

function TextPanel({
  style, onStyle, onPos, onAnim, safe, onSafe, selected, onCaption, onAdd, onRemove, onSplit, onRegen, onTidy, count, fontsKey = 0, sample, onMatch, pro = true,
}: {
  pro?: boolean; // false = Simpel: templates, font, colour, position & animation only
  onTidy: () => void;
  fontsKey?: number;
  sample: string; // real caption text for the template previews
  onMatch: () => Promise<void>; // "Tiru gaya video laris"
  style: CaptionStyle; onStyle: (s: Partial<CaptionStyle>, record?: boolean) => void; onPos: (p: Partial<CaptionPos>, record?: boolean) => void;
  onAnim: (a: CaptionAnim) => void; safe: SafeArea; onSafe: (s: Partial<SafeArea>, record?: boolean) => void; selected?: EditCaption;
  onCaption: (p: Partial<EditCaption>, record?: boolean) => void; onAdd: () => void; onRemove: () => void; onSplit: () => void; onRegen: (words?: number) => void; count: number;
}) {
  const own = !!selected?.pos;
  const pos = styleOf(style, selected);
  const safePreset = SAFE_PRESETS.find((x) => (Object.keys(x.safe) as (keyof SafeArea)[]).every((k) => Math.abs(x.safe[k] - safe[k]) < 0.001))?.id ?? "custom";
  const font = fontOf(style.font);
  return (
    <div className="@container space-y-3">
      {/* selected caption (or how to pick one) */}
      {selected ? (
        <div className="space-y-1.5 rounded-xl border bg-background p-2">
          <div className="flex items-center gap-1">
            <textarea className={`${field} resize-none`} rows={2} value={selected.text} maxLength={200} onChange={(e) => onCaption({ text: e.target.value }, false)} onBlur={(e) => onCaption({ text: e.target.value }, true)} />
            <div className="flex flex-col">
              <button type="button" className={icon} onClick={onSplit} title="Potong di playhead (S)"><Scissors className="size-3.5" /></button>
              <button type="button" className={icon} onClick={onRemove} title="Hapus (Del)"><Trash2 className="size-3.5" /></button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <input type="number" step={0.1} min={0} className={`${field.replace("w-full", "w-16")}`} value={selected.start} onChange={(e) => onCaption({ start: round2(Number(e.target.value)) })} aria-label="Mulai (detik)" />
            <span>→</span>
            <input type="number" step={0.1} min={0} className={`${field.replace("w-full", "w-16")}`} value={selected.end} onChange={(e) => onCaption({ end: round2(Number(e.target.value)) })} aria-label="Selesai (detik)" />
            <span>dtk</span>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Klik caption di timeline atau di video untuk mengedit teksnya. {count} caption.</p>
      )}

      <MatchButton onMatch={onMatch} />
      <Section title="Template siap pakai" icon={Sparkles} hint="Satu klik: font, warna, outline, animasi & posisi">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-1.5">
          {CAPTION_LOOKS.map((l, i) => {
            const on = style.preset === l.style.preset && style.font === l.style.font;
            return (
              <button key={l.id} type="button" title={l.use} aria-pressed={on} onClick={() => onStyle(l.style)} className={`relative overflow-hidden rounded-lg border text-left transition-colors ${on ? "border-primary ring-1 ring-primary" : "hover:border-ring/60"}`}>
                <LookSwatch style={{ ...style, ...l.style }} text={sample} fontsKey={fontsKey} delay={(i % 4) * 0.35} />
                {on && <Check className="absolute top-1 right-1 size-4 rounded-full bg-primary p-0.5 text-primary-foreground" />}
                <span className="block truncate px-1.5 py-1 text-[11px] font-medium">{l.label}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <div className="grid gap-3 @2xl:grid-cols-2">
        <div className="space-y-3">
          <Section title="Font" icon={Type} hint={font.label}>
            <FontPicker value={style.font} onPick={(f) => onStyle({ font: f })} />
          </Section>
          {pro && (
          <Section title="Bentuk teks" icon={Palette}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1">
              {CAPTION_PRESETS.map((x) => (
                <button key={x.id} type="button" title={x.label} aria-pressed={style.preset === x.id} onClick={() => onStyle({ preset: x.id })} className={`overflow-hidden rounded-md border text-[9px] ${style.preset === x.id ? "border-primary text-primary ring-1 ring-primary" : "text-muted-foreground hover:border-ring/60"}`}>
                  <PresetSwatch style={{ ...style, preset: x.id, color: null, box: null }} fontsKey={fontsKey} />
                  <span className="block py-0.5">{x.label}</span>
                </button>
              ))}
            </div>
          </Section>
          )}
          <Section title="Warna" icon={Palette}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-11 text-[11px] text-muted-foreground">Teks</span>
              <button type="button" className={chip(!style.color)} onClick={() => onStyle({ color: null })}>Auto</button>
              {TEXT_COLORS.map((c) => <Swatch key={c} color={c} on={style.color === c} onClick={() => onStyle({ color: c })} label={`Warna teks ${c}`} />)}
              <ColorPick value={style.color ?? "#ffffff"} onChange={(c, r) => onStyle({ color: c }, r)} label="Warna teks lain" />
            </div>
            {["kotak", "bubble", "merah"].includes(style.preset) && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-11 text-[11px] text-muted-foreground">Kotak</span>
                <button type="button" className={chip(!style.box)} onClick={() => onStyle({ box: null })}>Auto</button>
                {["#ffffff", "#111111", "#e11d2e", "#7c3aed", "#16a34a", "#ffe03d", "#0ea5e9"].map((c) => <Swatch key={c} square color={c} on={style.box === c} onClick={() => onStyle({ box: c })} label={`Warna kotak ${c}`} />)}
                <ColorPick square value={style.box ?? "#ffffff"} onChange={(c, r) => onStyle({ box: c }, r)} label="Warna kotak lain" />
              </div>
            )}
          </Section>
          {pro && (
          <Section
            title="Detail teks"
            icon={Type}
            action={<button type="button" className="text-[11px] font-medium text-primary hover:underline" onClick={() => onStyle({ stroke: null, shadow: null, spacing: null, lineHeight: null, light: false })}>Reset</button>}
          >
            <div className="flex flex-wrap gap-1.5">
              <Seg value={!!style.light} onChange={(v) => onStyle({ light: v })} options={[[false, "Tebal"], [true, "Tipis", font.light ? undefined : "Font ini cuma punya satu ketebalan"]]} />
              <Seg value={style.upper} onChange={(v) => onStyle({ upper: v })} options={[[false, "Aa"], [true, "AA"]]} />
            </div>
            <Slider label="Outline" value={style.stroke ?? DEFAULT_STROKE[style.preset] ?? 0} def={DEFAULT_STROKE[style.preset] ?? 0} min={0} max={0.3} step={0.01} onChange={(v, r) => onStyle({ stroke: v }, r)} />
            <Slider label="Bayangan" value={style.shadow ?? 0} def={0} min={0} max={1} step={0.05} onChange={(v, r) => onStyle({ shadow: v }, r)} />
            <Slider label="Jarak huruf" value={style.spacing ?? 0} def={0} min={-0.05} max={0.3} step={0.01} onChange={(v, r) => onStyle({ spacing: v }, r)} />
            <Slider label="Jarak baris" value={style.lineHeight ?? 1.22} def={1.22} min={0.9} max={1.6} step={0.02} unit="×" onChange={(v, r) => onStyle({ lineHeight: v }, r)} />
          </Section>
          )}
        </div>

        <div className="space-y-3">
          <Section
            title={own ? "Posisi · caption ini" : "Posisi & ukuran"}
            icon={Move}
            action={
              selected && (
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title="Posisi & ukuran caption ini tidak ikut caption lain (mis. judul hook di atas)">
                  <input type="checkbox" className="accent-primary" checked={own} onChange={(e) => onCaption({ pos: e.target.checked ? { x: style.x, y: style.y, size: style.size } : null })} />
                  Posisi sendiri
                </label>
              )
            }
          >
            <div className="flex items-center gap-3">
              <PosGrid x={pos.x} y={pos.y} onPick={(p) => onPos(p)} />
              <div className="min-w-0 flex-1 space-y-2">
                <Slider label="Ukuran" value={pos.size} def={DEFAULT_CAPTION_STYLE.size} min={0.03} max={0.12} step={0.002} onChange={(v, r) => onPos({ size: v }, r)} />
                {pro && <Slider label="Horizontal" value={pos.x} def={0.5} min={0.05} max={0.95} step={0.01} onChange={(v, r) => onPos({ x: v }, r)} />}
                {pro && <Slider label="Vertikal" value={pos.y} def={DEFAULT_CAPTION_STYLE.y} min={0.05} max={0.95} step={0.01} onChange={(v, r) => onPos({ y: v }, r)} />}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">Bisa juga diseret langsung di video; titik di sudut untuk ukuran.</p>
          </Section>
          {pro && (
          <Section title="Safe area" icon={Frame} hint="area yang tertutup tombol aplikasi">
            <Seg value={safePreset} onChange={(id) => { const x = SAFE_PRESETS.find((p) => p.id === id); if (x) onSafe(x.safe); }} options={[...SAFE_PRESETS.map((x) => [x.id, x.label] as [string, string]), ...(safePreset === "custom" ? [["custom", "Kustom"] as [string, string]] : [])]} className="w-full" />
            <div className="grid gap-x-4 gap-y-2 @md:grid-cols-2">
              <Slider label="Atas" value={safe.top} min={0} max={0.35} step={0.01} onChange={(v, r) => onSafe({ top: v }, r)} />
              <Slider label="Bawah" value={safe.bottom} min={0} max={0.35} step={0.01} onChange={(v, r) => onSafe({ bottom: v }, r)} />
              <Slider label="Kiri" value={safe.left} min={0} max={0.35} step={0.01} onChange={(v, r) => onSafe({ left: v }, r)} />
              <Slider label="Kanan" value={safe.right} min={0} max={0.35} step={0.01} onChange={(v, r) => onSafe({ right: v }, r)} />
            </div>
          </Section>
          )}
          <Section title="Animasi" icon={Sparkles}>
            <div className="grid grid-cols-4 gap-1">
              {CAPTION_ANIMS.map((x) => (
                <button key={x.id} type="button" aria-pressed={style.anim === x.id} onClick={() => onAnim(x.id)} className={chip(style.anim === x.id)}>{x.label}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-11 text-[11px] text-muted-foreground">Keluar</span>
              <Seg value={style.out} onChange={(v) => onStyle({ out: v })} options={[[false, "Potong"], [true, "Fade keluar"]]} />
            </div>
          </Section>
          {pro && (
          <Section title="Karaoke" icon={Mic} hint="kata yang diucapkan menyala">
            <div className="flex flex-wrap items-center gap-1.5">
              <Seg value={style.karaoke} onChange={(v) => onStyle({ karaoke: v })} options={[[false, "Mati"], [true, "Nyala"]]} />
              {style.karaoke && ACCENTS.map((c) => <Swatch key={c} color={c} on={style.accent === c} onClick={() => onStyle({ accent: c })} label={`Warna karaoke ${c}`} />)}
            </div>
          </Section>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t pt-2.5">
        <button type="button" className={secondary} onClick={onAdd}><Plus className="size-3.5" /> Caption</button>
        <button type="button" className={secondary} onClick={onTidy} title="Angka jadi digit (Rp34.900, 4,8, 50%), potongan caption dirapikan, tanpa titik/koma di akhir. Timing tetap."><Sparkles className="size-3.5" /> Rapikan angka & potongan</button>
        <span className="ml-1 flex items-center gap-1 text-[11px] text-muted-foreground"><Wand2 className="size-3.5" /> Buat ulang dari naskah:</span>
        {[1, 2, 4].map((n) => (
          <button key={n} type="button" className={chip(false)} onClick={() => onRegen(n)} title={n < 4 ? "Subtitle pendek seperti video laris" : "Caption kalimat"}>{n} kata</button>
        ))}
      </div>
    </div>
  );
}

/** Dim the margins the app UI covers (top bar, side buttons, description) and outline the safe box. */
function SafeGuides({ safe }: { safe: SafeArea }) {
  const pct = (n: number) => `${n * 100}%`;
  const dim = "absolute bg-black/45";
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className={`${dim} inset-x-0 top-0`} style={{ height: pct(safe.top) }} />
      <div className={`${dim} inset-x-0 bottom-0`} style={{ height: pct(safe.bottom) }} />
      <div className={`${dim} left-0`} style={{ top: pct(safe.top), bottom: pct(safe.bottom), width: pct(safe.left) }} />
      <div className={`${dim} right-0`} style={{ top: pct(safe.top), bottom: pct(safe.bottom), width: pct(safe.right) }} />
      <div className="absolute border border-dashed border-white/60" style={{ top: pct(safe.top), bottom: pct(safe.bottom), left: pct(safe.left), right: pct(safe.right) }} />
    </div>
  );
}

function PresetSwatch({ style, fontsKey = 0 }: { style: CaptionStyle; fontsKey?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    drawCaption(ctx, c.width, c.height, "Promo", { ...style, x: 0.5, y: 0.5, size: 0.2, karaoke: false }, { top: 0, bottom: 0, left: 0, right: 0 });
  }, [style, fontsKey]);
  return <canvas ref={ref} width={240} height={128} className="aspect-[15/8] w-full bg-[linear-gradient(135deg,#5b6b7a,#2a3440)]" />;
}

/** Outline each preset draws when the user hasn't set one (for the slider's starting point). */
const DEFAULT_STROKE: Partial<Record<CaptionStyle["preset"], number>> = { tiktok: 0.16, kuning: 0.16, merah: 0, komik: 0.24, gradasi: 0.14, minimal: 0.09 };

/**
 * Template tile: the look drawn with the project's real caption text, playing its entrance animation on a loop
 * (karaoke looks also step the highlighted word). `delay` staggers the tiles so they don't pulse in sync.
 * Still frame when the viewer prefers reduced motion or the tile is off-screen.
 */
function LookSwatch({ style, text, fontsKey = 0, delay = 0 }: { style: CaptionStyle; text: string; fontsKey?: number; delay?: number }) {
  const W = 200, H = 112;
  const ref = useRef<HTMLCanvasElement>(null);
  const look = useMemo(() => ({ ...style, x: 0.5, y: 0.5, size: clamp(style.size * 2.6, 0.12, 0.18), karaoke: false }), [style]);
  // one pre-rendered still per highlighted word (karaoke) or a single still
  const frames = useMemo(() => {
    if (typeof document === "undefined") return [];
    const words = text.split(/\s+/).filter(Boolean).length;
    return (style.karaoke ? [...Array(words).keys()] : [-1]).map((hl) => {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const box = drawCaption(c.getContext("2d")!, W, H, text, look, { top: 0.06, bottom: 0.06, left: 0.05, right: 0.05 }, hl);
      return { c, box };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw once the fonts load
  }, [look, text, style.karaoke, fontsKey]);
  useEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx || !frames.length) return;
    const paint = (t: number) => {
      const f = frames[Math.floor(Math.max(0, t) / 0.45) % frames.length];
      ctx.clearRect(0, 0, W, H);
      blitCaption(ctx, f.c, f.box, H, style.anim, t);
    };
    paint(99);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cycle = ANIM_DUR[style.anim] + 1.4;
    let raf = 0, visible = false;
    const t0 = performance.now() + delay * 1000;
    const loop = (now: number) => {
      paint(((now - t0) / 1000 + cycle * 10) % cycle);
      raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting === visible) return;
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(loop);
    });
    io.observe(el);
    return () => (io.disconnect(), cancelAnimationFrame(raf));
  }, [frames, style.anim, delay]);
  return <canvas ref={ref} width={W} height={H} className="aspect-[25/14] w-full bg-[linear-gradient(135deg,#6b7c8c,#2a3440)]" />;
}

const RECENT_KEY = "traktiva:recent-fonts";
// last fonts used, per viewer (localStorage; empty on the server and when storage is blocked)
const recentStore = {
  get: () => {
    try {
      return localStorage.getItem(RECENT_KEY) ?? "[]";
    } catch {
      return "[]";
    }
  },
  set: (v: CaptionFont[]) => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(v));
    } catch {}
    window.dispatchEvent(new Event(RECENT_KEY));
  },
  subscribe: (cb: () => void) => (window.addEventListener(RECENT_KEY, cb), () => window.removeEventListener(RECENT_KEY, cb)),
};

/** Font list grouped by mood, plus the last fonts used; every name is shown in its own face. */
function FontPicker({ value, onPick }: { value: CaptionFont; onPick: (f: CaptionFont) => void }) {
  // tab follows the active font (e.g. after a template) until the user picks a tab
  const [tab, setMood] = useState<FontMood | "baru" | null>(null);
  const mood = tab ?? fontOf(value).mood;
  const raw = useSyncExternalStore(recentStore.subscribe, recentStore.get, () => "[]");
  const recent = useMemo<CaptionFont[]>(() => {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }, [raw]);
  const pick = (f: CaptionFont) => {
    onPick(f);
    recentStore.set([f, ...recent.filter((x) => x !== f)].slice(0, 6));
  };
  const list = mood === "baru" ? recent.map((id) => fontOf(id)).filter((f) => !f.hidden) : CAPTION_FONTS.filter((f) => f.mood === mood && !f.hidden);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {recent.length > 0 && <button type="button" className={chip(mood === "baru")} onClick={() => setMood("baru")}>Terakhir</button>}
        {FONT_MOODS.map((m) => (
          <button key={m.id} type="button" className={chip(mood === m.id)} onClick={() => setMood(m.id)}>{m.label}</button>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-1">
        {list.map((f) => (
          <button key={f.id} type="button" onClick={() => pick(f.id)} className={`h-9 truncate rounded-md border px-2 text-left text-[15px] leading-none ${value === f.id ? "border-primary bg-primary/10" : "hover:bg-accent"}`} style={fontPreview(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      {fontOf(value).hidden && <p className="text-[10px] text-muted-foreground">Font lama ({fontOf(value).label}) masih dipakai proyek ini; pilih font baru di atas.</p>}
    </div>
  );
}

/** Gemini copies the caption look of the project's reference (best-selling) video. */
function MatchButton({ onMatch }: { onMatch: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => (setBusy(true), onMatch().finally(() => setBusy(false)))}
      className="flex w-full items-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-2 text-left hover:bg-primary/10 disabled:opacity-60"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-black dark:text-white">{busy ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}</span>
      <span className="min-w-0">
        <span className="block text-xs font-medium">{busy ? "Gemini melihat video laris..." : "Tiru gaya teks video laris"}</span>
        <span className="block truncate text-[10px] text-muted-foreground">Font, warna & posisi disalin dari video referensi KaloData</span>
      </span>
    </button>
  );
}

/** Per-viewer on/off preference in localStorage (false on the server and when storage is blocked). */
function useLocalFlag(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const raw = useSyncExternalStore(
    (cb) => (window.addEventListener(key, cb), () => window.removeEventListener(key, cb)),
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const set = (v: boolean) => {
    try {
      localStorage.setItem(key, v ? "1" : "0");
    } catch {}
    window.dispatchEvent(new Event(key));
  };
  return [raw == null ? fallback : raw === "1", set];
}

/** What the inspector shows when nothing is open: one row per part of the video, each opens its panel. */
function SummaryPanel({ edit, p, pro, exported, onOpen }: { edit: ProjectEdit; p: Project; pro: boolean; exported: boolean; onOpen: (t: Tab | "stiker") => void }) {
  const st = edit.captionStyle;
  const look = CAPTION_LOOKS.find((l) => l.style.preset === st.preset && l.style.font === st.font);
  const voice = edit.voices.length === 1 && edit.voices[0].dur > 8 ? "Voice-over utuh" : edit.voices.length ? `${edit.voices.length} suara scene` : "Tanpa voice-over";
  const rows: { t: Tab | "stiker"; icon: React.ComponentType<{ className?: string }>; color: string; title: string; info: string; hide?: boolean }[] = [
    { t: "teks", icon: Type, color: "#f2c94c", title: "Teks & subtitle", info: `${edit.captions.length} caption · ${look ? look.label : fontOf(st.font).label}${st.karaoke ? " · karaoke" : ""}` },
    { t: "stiker", icon: Sticker, color: "#2fa868", title: "Stiker", info: edit.overlays.length ? edit.overlays.map((o) => `“${o.text.split("\n")[0]}”`).join(" · ") : "Belum ada (video laris jarang pakai stiker)" },
    { t: "audio", icon: AudioLines, color: "#ff3b6b", title: "Audio", info: `${voice} · ${edit.bgm ? edit.bgm.name : "tanpa musik"}${edit.sfx.length ? ` · ${edit.sfx.length} SFX` : ""}` },
    { t: "efek", icon: Wand2, color: "#4ea7fc", title: "Transisi & efek", info: `${TRANSITIONS.find((x) => x.id === edit.fx.transition)?.label ?? "Potong"}${edit.fx.kenburns ? " · zoom pelan" : ""} · format laris & gaya tersimpan`, hide: !pro },
    { t: "ai", icon: Bot, color: "#a78bfa", title: "AI Director", info: "3 variasi hook & gaya untuk dites" },
    { t: "posting", icon: Send, color: "#26b5ce", title: "Siap posting", info: p.caption ? "Caption & hashtag siap" : "Tulis caption & hashtag" },
  ];
  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-2 rounded-xl border p-3 text-xs ${exported ? "border-status-ok/30 bg-status-ok/5" : "border-amber-500/30 bg-amber-500/5"}`}>
        {exported ? <Check className="size-4 text-status-ok" /> : <CircleDot className="size-4 text-amber-500" />}
        <span className="flex-1">{exported ? "Video terbaru sudah diekspor." : "Ada perubahan yang belum diekspor. Tekan Export video kalau sudah pas."}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{fmt(edit.duration)}</span>
      </div>
      {rows.filter((r) => !r.hide).map((r) => (
        <button key={r.t} type="button" onClick={() => onOpen(r.t)} className="group flex w-full items-center gap-3 rounded-xl border bg-background/40 p-3 text-left transition-colors hover:border-ring/50 hover:bg-accent/40">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-black dark:text-white"><r.icon className="size-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium">{r.title}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{r.info}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </button>
      ))}
      <p className="px-1 text-[11px] text-muted-foreground">Tip: klik nama lajur di timeline (Video, Teks, Suara…) atau klik blok di timeline untuk langsung membuka panelnya.{pro ? "" : " Mode Simpel menyembunyikan kontrol detail; pilih Pro di atas untuk semua kontrol."}</p>
    </div>
  );
}

/** Titled group inside an inspector panel. */
function Section({ title, icon: I, hint, action, children }: { title: string; icon: React.ComponentType<{ className?: string }>; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5 rounded-xl border bg-background/40 p-3">
      <header className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        <I className="size-3.5 shrink-0" /> <span className="shrink-0">{title}</span>
        {hint && <span className="truncate font-normal tracking-normal normal-case">· {hint}</span>}
        {action && <span className="ml-auto shrink-0 tracking-normal normal-case">{action}</span>}
      </header>
      {children}
    </section>
  );
}

const AI_CHIPS = [
  "Bikin caption lebih catchy & singkat, gaya anak TikTok",
  "Rapikan timing caption supaya pas dengan suara",
  "Caption kuning huruf besar di tengah layar",
  "Kecilkan musik saat ada suara, keraskan di akhir",
  "Tambah caption ajakan 'cek keranjang di bawah' di 2 detik terakhir",
  "Animasi pop, caption agak ke atas di tengah",
];

function AiPanel({
  busy, hasBgm, onRun, onDirector, versions, onPick, hooks, onHooks, onTryHook, onExportHooks, exporting,
}: {
  busy: boolean; hasBgm: boolean; onRun: (s: string) => void; onDirector: (wish: string) => void;
  versions: { edit: ProjectEdit; note: string }[]; onPick: (v: { edit: ProjectEdit; note: string }) => void;
  hooks: { edit: ProjectEdit; note: string; hook: string }[]; onHooks: () => void; onTryHook: (v: { edit: ProjectEdit }) => void; onExportHooks: () => void; exporting: boolean;
}) {
  const [text, setText] = useState("");
  const chips = useMemo(() => (hasBgm ? AI_CHIPS : AI_CHIPS.filter((c) => !/musik/i.test(c))), [hasBgm]);
  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
        <p className="flex items-center gap-1.5 text-xs font-medium"><Split className="size-3.5" /> Varian hook A/B</p>
        <p className="text-[11px] text-muted-foreground">3 versi yang cuma beda kalimat pembuka (3 detik pertama). Isi video, gaya & musik sama, jadi yang dites benar-benar hook-nya. Posting di jam berbeda, lihat mana yang paling ditonton. Butuh voice-over utuh (Cartesia).</p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={primary} disabled={busy || exporting} onClick={onHooks}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Split className="size-3.5" />} {hooks.length ? "Buat ulang varian" : "Buat 3 varian hook"}
          </button>
          {hooks.length > 0 && (
            <button type="button" className={secondary} disabled={busy || exporting} onClick={onExportHooks}>
              {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Export {hooks.length} varian
            </button>
          )}
        </div>
        {hooks.map((v, i) => (
          <div key={i} className="flex items-start gap-2 rounded-md border bg-background p-2">
            <span className="grid size-6 shrink-0 place-items-center rounded bg-amber-500/15 text-[11px] font-bold text-amber-600 dark:text-amber-400">{"ABCD"[i]}</span>
            <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">{v.note}</p>
            <button type="button" className={secondary} disabled={busy || exporting} onClick={() => onTryHook(v)}>Coba</button>
          </div>
        ))}
      </div>
      <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
        <p className="flex items-center gap-1.5 text-xs font-medium"><Clapperboard className="size-3.5" /> AI Director</p>
        <p className="text-[11px] text-muted-foreground">Buat 3 versi siap posting (hook, harga, CTA, gaya caption, karaoke, transisi) dengan sudut pandang berbeda, lalu pilih satu. Butuh ±1–2 menit.</p>
        <button type="button" className={primary} disabled={busy} onClick={() => onDirector(text)}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Clapperboard className="size-3.5" />} {busy ? "AI sedang menyutradarai..." : "Buat 3 versi"}
        </button>
        {versions.length > 0 && (
          <div className="grid gap-1.5">
            {versions.map((v, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md border bg-background p-2">
                <div className="min-w-0 flex-1 text-[11px]">
                  <p className="font-medium">Versi {i + 1}</p>
                  <p className="text-muted-foreground">{v.note}</p>
                  <p className="mt-0.5 truncate text-muted-foreground">
                    {v.edit.overlays.map((o) => `“${o.text}”`).join(" · ") || "tanpa stiker"} · {v.edit.captionStyle.karaoke ? "karaoke" : v.edit.captionStyle.anim} · {v.edit.fx.transition}
                  </p>
                </div>
                <button type="button" className={secondary} onClick={() => onPick(v)}>Pakai</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Atau suruh AI mengubah bagian tertentu. Hasilnya bisa di-undo (Ctrl+Z). Teks di bawah juga dipakai sebagai keinginan tambahan untuk AI Director.</p>
      <textarea className={field} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Contoh: caption lebih heboh, voice-over sedikit lebih cepat, musik 15%" disabled={busy} />
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button key={c} type="button" disabled={busy} onClick={() => setText(c)} className="rounded-full border bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground">
            {c}
          </button>
        ))}
      </div>
      <button type="button" className={secondary} disabled={busy || !text.trim()} onClick={() => onRun(text)}>
        <Sparkles className="size-3.5" /> Atur dengan AI
      </button>
    </div>
  );
}

/** Stickers on their own track: hook title, price badge, call to action. */
function OverlayPanel({
  overlays, selected, onAdd, onPick, onChange, onRemove,
}: {
  overlays: EditOverlay[]; selected?: EditOverlay; onAdd: (k: OverlayKind) => void; onPick: (o: EditOverlay) => void;
  onChange: (id: string, patch: Partial<EditOverlay>, record?: boolean) => void; onRemove: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {OVERLAY_KINDS.map((k) => (
          <button key={k.id} type="button" className={secondary} onClick={() => onAdd(k.id)}><Plus className="size-3.5" /> {k.label}</button>
        ))}
      </div>
      {selected ? (
        <div className="space-y-2 rounded-lg border bg-background p-2">
          <div className="flex items-center gap-1">
            <textarea className={`${field} resize-none`} rows={selected.kind === "info" ? 2 : 1} value={selected.text} maxLength={80} onChange={(e) => onChange(selected.id, { text: e.target.value }, false)} onBlur={(e) => onChange(selected.id, { text: e.target.value })} />
            <button type="button" className={icon} onClick={onRemove} title="Hapus (Del)"><Trash2 className="size-3.5" /></button>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {OVERLAY_KINDS.map((k) => (
              <button key={k.id} type="button" className={chip(selected.kind === k.id)} onClick={() => onChange(selected.id, { kind: k.id })}>{k.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <input type="number" step={0.1} min={0} className={field.replace("w-full", "w-16")} value={selected.start} onChange={(e) => onChange(selected.id, { start: round2(Number(e.target.value)) })} aria-label="Mulai (detik)" />
            <span>→</span>
            <input type="number" step={0.1} min={0} className={field.replace("w-full", "w-16")} value={selected.end} onChange={(e) => onChange(selected.id, { end: round2(Number(e.target.value)) })} aria-label="Selesai (detik)" />
            <span>dtk</span>
          </div>
          <Slider label="Ukuran" value={selected.size} min={0.03} max={0.14} step={0.002} onChange={(v, r) => onChange(selected.id, { size: v }, r)} />
          <div className="flex flex-wrap items-center gap-1">
            <span className="w-14 text-xs text-muted-foreground">Animasi</span>
            {CAPTION_ANIMS.map((x) => (
              <button key={x.id} type="button" onClick={() => onChange(selected.id, { anim: x.id })} className={chip(selected.anim === x.id)}>{x.label}</button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">{overlays.length ? "Klik stiker di timeline atau di video untuk mengedit." : "Belum ada stiker. Tambahkan judul hook di awal, badge harga, dan CTA di akhir."}</p>
      )}
      {overlays.length > 0 && (
        <div className="grid gap-1">
          {overlays.map((o) => (
            <button key={o.id} type="button" onClick={() => onPick(o)} className={`flex items-center gap-2 rounded-md border px-2 py-1 text-left text-[11px] ${selected?.id === o.id ? "border-primary bg-primary/5" : "hover:bg-accent"}`}>
              <span className="w-16 shrink-0 text-muted-foreground">{OVERLAY_KINDS.find((k) => k.id === o.kind)?.label}</span>
              <span className="min-w-0 flex-1 truncate">{o.text}</span>
              <span className="font-mono text-muted-foreground">{o.start.toFixed(1)}s</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Clip transitions / Ken Burns, plus saved "brand looks" (templates). */
function FxPanel({
  fx, onFx, onSaveTemplate, onApplyTemplate, current,
}: {
  fx: EditFx; onFx: (p: Partial<EditFx>) => void; onSaveTemplate: (name: string) => Promise<EditTemplate[]>; onApplyTemplate: (t: EditTemplate) => void; current: () => EditTemplate;
}) {
  const [templates, setTemplates] = useState<EditTemplate[] | null>(null);
  const [name, setName] = useState("");
  // Galeri template (server): new styles without an app update; admins can copy this project's style for the panel
  const [gallery, setGallery] = useState<{ styles: (EditTemplate & { fresh: boolean })[]; admin: boolean }>({ styles: [], admin: false });
  useEffect(() => {
    let alive = true;
    listEditTemplates().then((t) => alive && setTemplates(t), () => alive && setTemplates([]));
    galleryForEditor().then((g) => alive && setGallery(g), () => {});
    return () => void (alive = false);
  }, []);
  const copyStyle = () => {
    const { captionStyle, fx: f, overlays } = current();
    const json = JSON.stringify({ captionStyle, fx: f, overlays, captions: "keep", note: "" }, null, 2);
    navigator.clipboard.writeText(json).then(() => toast.success("JSON gaya disalin. Tempel di Panel admin → Template → Gaya editor."), () => toast.error("Gagal menyalin"));
  };
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-20 text-xs text-muted-foreground">Transisi</span>
          {TRANSITIONS.map((x) => (
            <button key={x.id} type="button" className={chip(fx.transition === x.id)} onClick={() => onFx({ transition: x.id })}>{x.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-20 text-xs text-muted-foreground">Zoom pelan</span>
          <button type="button" className={chip(!fx.kenburns)} onClick={() => onFx({ kenburns: false })}>Mati</button>
          <button type="button" className={chip(fx.kenburns)} onClick={() => onFx({ kenburns: true })}>Ken Burns</button>
        </div>
        <p className="text-[11px] text-muted-foreground">Transisi dipasang di setiap pergantian scene; durasi video tidak berubah.</p>
      </div>
      <div className="space-y-2 border-t pt-2.5">
        <p className="flex items-center gap-1.5 text-xs font-medium"><Sparkles className="size-3.5" /> Format video laris</p>
        <p className="text-[11px] text-muted-foreground">Dari analisa 30 video terlaris KaloData. Mengatur caption, stiker, dan efek; bisa di-undo (Ctrl+Z).</p>
        <div className="grid gap-1">
          {[...gallery.styles, ...RESEARCH_TEMPLATES].map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11px]">
              <span className="min-w-0 flex-1">
                <b className="font-medium">{t.name}</b>
                {"fresh" in t && t.fresh === true && <span className="ml-1.5 rounded-full bg-primary/90 px-1.5 text-[9px] font-semibold text-primary-foreground">Baru</span>}
                <span className="block text-muted-foreground">{t.note}</span>
              </span>
              <button type="button" className={secondary} onClick={() => onApplyTemplate(t)}>Pakai</button>
            </div>
          ))}
        </div>
        {gallery.admin && (
          <button type="button" className={secondary} onClick={copyStyle} title="Untuk Panel admin → Template → Gaya editor">Salin JSON gaya (admin)</button>
        )}
      </div>
      <div className="space-y-2 border-t pt-2.5">
        <p className="flex items-center gap-1.5 text-xs font-medium"><Bookmark className="size-3.5" /> Gaya brand</p>
        <p className="text-[11px] text-muted-foreground">Simpan gaya caption, karaoke, safe area, efek, dan stiker proyek ini, lalu pakai di proyek lain dengan 1 klik.</p>
        <div className="flex gap-1">
          <input className={field} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Nama gaya, mis. Toko Sepatu" />
          <button
            type="button"
            className={secondary}
            disabled={!name.trim()}
            onClick={() =>
              onSaveTemplate(name).then(
                (t) => (setTemplates(t), setName(""), toast.success("Gaya disimpan")),
                (e) => toast.error(e instanceof Error ? e.message : "Gagal menyimpan"),
              )
            }
          >
            Simpan
          </button>
        </div>
        {templates === null ? (
          <p className="text-[11px] text-muted-foreground">Memuat...</p>
        ) : templates.length ? (
          <div className="grid gap-1">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-[11px]">
                <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                <span className="text-muted-foreground">{t.captionStyle.preset}{t.captionStyle.karaoke ? " · karaoke" : ""} · {t.overlays.length} stiker</span>
                <button type="button" className={secondary} onClick={() => onApplyTemplate(t)}>Pakai</button>
                <button type="button" className={icon} aria-label="Hapus gaya" onClick={() => deleteEditTemplate(t.id).then(setTemplates)}><Trash2 className="size-3.5" /></button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Belum ada gaya tersimpan.</p>
        )}
      </div>
    </div>
  );
}

function PostingPanel({ p }: { p: Project }) {
  const [caption, setCaption] = useState(p.caption ?? "");
  const url = p.finalPath ? mediaUrl(p.finalPath) : null;
  return (
    <div className="space-y-3">
      <label className="block space-y-1.5">
        <span className="flex items-center justify-between text-xs font-medium">
          Caption postingan
          <button type="button" className="flex items-center gap-1 text-[11px] font-normal text-muted-foreground hover:text-foreground" onClick={() => (void navigator.clipboard.writeText(caption), toast.success("Caption disalin"))}>
            <Copy className="size-3" /> Salin
          </button>
        </span>
        <textarea className={field} rows={5} value={caption} maxLength={2200} onChange={(e) => setCaption(e.target.value)} onBlur={() => caption !== (p.caption ?? "") && saveProject(p.id, { caption }).catch(() => toast.error("Gagal menyimpan caption"))} />
      </label>
      <p className="text-[11px] text-muted-foreground">File: {p.finalPath}</p>
      <div className="flex flex-wrap gap-2">
        {url && <a href={`${url}?download`} className={primary}><Download className="size-3.5" /> Unduh final.mp4</a>}
        <button type="button" className={secondary} onClick={() => openProjectFolder(p.id).catch(() => toast.error("Gagal membuka folder"))}><FolderOpen className="size-3.5" /> Buka folder</button>
        {url && <a href={`/jadwal?project=${p.id}`} className={secondary}><CalendarClock className="size-3.5" /> Jadwalkan upload</a>}
      </div>
      <p className="text-[11px] text-muted-foreground">Jadwal Upload mengunggah video ini (dan varian A/B-nya) ke TikTok sendiri, lengkap dengan caption dan produk keranjang.</p>
    </div>
  );
}

