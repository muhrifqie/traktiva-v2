"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bookmark, Clapperboard, Copy, Download, Film, Frame, FolderOpen, Loader2, Music, Pause, Play, Plus, Redo2, Scissors, Sparkles, Sticker, Trash2, Type, Undo2, Upload, Volume2, VolumeX, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import type { VideoProject } from "@/lib/db/schema";
import {
  ACCENTS, applyTemplate, beatTimes, RESEARCH_TEMPLATES, autoCaptions, blitCaption, CAPTION_ANIMS, CAPTION_PRESETS, clamp, drawCaption, fxAt, layersOf, normalizeEdit, OVERLAY_KINDS, round2,
  SAFE_PRESETS, styleOf, TRANSITIONS, uid,
  type Box, type CaptionAnim, type CaptionPos, type CaptionStyle, type EditCaption, type EditFx, type EditOverlay, type EditTemplate, type Layer,
  type OverlayKind, type ProjectEdit, type SafeArea,
} from "@/lib/edit";
import { mediaUrl } from "@/lib/media-url";
import { voiceLine } from "@/lib/voice";
import {
  aiDirector, aiEditTimeline, deleteEditTemplate, exportTimeline, listEditTemplates, openEditor, openProjectFolder, saveEdit, saveEditTemplate, saveProject, uploadMusic,
} from "../project-actions";
import { AudioTools } from "./audio-panel";

type Project = Omit<VideoProject, "updatedAt"> & { updatedAt: number };
type Sel = { kind: "caption" | "voice" | "overlay" | "sfx"; id: string } | null;
type Tab = "teks" | "stiker" | "efek" | "audio" | "ai" | "posting";
type Hit = { id: string; kind: "caption" | "overlay"; box: Box };

const btn = "flex h-7 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium disabled:opacity-50";
const primary = `${btn} bg-primary text-primary-foreground hover:bg-primary/90`;
const secondary = `${btn} border bg-background hover:bg-accent`;
const icon = "grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40";
const field = "w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-ring disabled:opacity-60";
const LANE = 34;
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
  const [tab, setTab] = useState<Tab>("teks");
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(0); // px per second; 0 = fit
  const [busy, setBusy] = useState<"export" | "ai" | "music" | null>(null);
  const [exportedV, setExportedV] = useState(p.edit?.exportedAt ? 0 : -1); // history version last exported
  const [hits, setHits] = useState<Hit[]>([]); // what is on screen now (drag targets)
  const [guide, setGuide] = useState(false); // centre line while dragging
  const [showSafe, setShowSafe] = useState(true);
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
          blitCaption(ctx, st.canvas, st.box, cv.height, l.anim, on ? t - l.start : 99, 0, 0);
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
    if (v.paused) void v.play();
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
    setTab("stiker");
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
    setTab(hit.kind === "overlay" ? "stiker" : "teks");
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
    void video.current.play();
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

  const doExport = async () => {
    if (!edit) return;
    setBusy("export");
    try {
      const W = edit.width, H = edit.height;
      const full = document.createElement("canvas");
      full.width = W;
      full.height = H;
      const fctx = full.getContext("2d")!;
      const overlays = layersOf(edit).map((l) => {
        fctx.clearRect(0, 0, W, H);
        const box = l.draw(fctx, W, H);
        const crop = document.createElement("canvas");
        crop.width = Math.max(1, box.w);
        crop.height = Math.max(1, box.h);
        crop.getContext("2d")!.drawImage(full, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
        return { start: round2(l.start), end: round2(l.end), x: box.x, y: box.y, w: box.w, h: box.h, anim: l.anim, png: crop.toDataURL("image/png") };
      });
      await saveEdit(p.id, patchOf(edit));
      await exportTimeline(p.id, patchOf(edit), overlays);
      setExportedV(version);
      toast.success("Video diekspor ke final.mp4");
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
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)]">
        {/* preview: height-driven so preview + panel + timeline fit one screen */}
        <div className="mx-auto space-y-1.5">
          <div className="relative h-[min(50vh,560px)] min-h-72 overflow-hidden rounded-xl border bg-black" style={{ aspectRatio: `${edit.width}/${edit.height}` }}>
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
          </div>
        </div>

        {/* inspector */}
        <div className="relative min-h-80">
        <div className="flex flex-col rounded-xl border bg-card lg:absolute lg:inset-0">
          <div className="flex items-center gap-0.5 border-b p-1">
            {([["teks", "Teks", Type], ["stiker", "Stiker", Sticker], ["efek", "Efek", Film], ["audio", "Audio", Volume2], ["ai", "AI", Sparkles], ["posting", "Posting", Upload]] as const).map(([id, label, I]) => (
              <button key={id} type="button" onClick={() => setTab(id)} className={`flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium ${tab === id ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <I className="size-3.5" /> {label}
              </button>
            ))}
            <span className={`ml-auto whitespace-nowrap pr-2 text-[11px] ${version > exportedV ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>{version > exportedV ? "● Belum diekspor" : "✓ Diekspor"}</span>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {tab === "teks" && (
              <TextPanel
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
                count={edit.captions.length}
              />
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
            {tab === "stiker" && (
              <OverlayPanel
                overlays={edit.overlays}
                selected={sel?.kind === "overlay" ? edit.overlays.find((o) => o.id === sel.id) : undefined}
                onAdd={addOverlay}
                onPick={(o) => (setSel({ kind: "overlay", id: o.id }), seek(o.start + 0.05))}
                onChange={(id, patch, record) => updOverlay(id, patch, record)}
                onRemove={removeSel}
              />
            )}
            {tab === "efek" && (
              <FxPanel
                fx={edit.fx}
                onFx={(patch) => set((e) => ({ ...e, fx: { ...e.fx, ...patch } }))}
                onSaveTemplate={(name) => saveEditTemplate(p.id, patchOf(edit), name)}
                onApplyTemplate={(t) => (set((e) => applyTemplate(e, t)), toast.success(`Gaya “${t.name}” dipakai`))}
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
              />
            )}
            {tab === "posting" && <PostingPanel p={p} />}
          </div>
        </div>
        </div>
      </div>

      {/* timeline */}
      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
          <button type="button" className={icon} onClick={toggle} aria-label={playing ? "Jeda" : "Putar"}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}</button>
          <button type="button" className={icon} onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"><Undo2 className="size-4" /></button>
          <button type="button" className={icon} onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)"><Redo2 className="size-4" /></button>
          <span className="mx-1 h-5 w-px bg-border" />
          <button type="button" className={secondary} onClick={addCaption}><Plus className="size-3.5" /> Caption</button>
          <button type="button" className={icon} onClick={splitSel} title="Potong caption di playhead (S)"><Scissors className="size-4" /></button>
          <button type="button" className={icon} onClick={removeSel} disabled={sel?.kind !== "caption" && sel?.kind !== "overlay" && sel?.kind !== "sfx"} title="Hapus (Del)"><Trash2 className="size-4" /></button>
          <span className="ml-2 hidden text-[10px] text-muted-foreground xl:inline">Spasi putar · S potong · Del hapus · ←/→ geser</span>
          <div className="ml-auto flex items-center gap-2">
            <input type="range" min={0} max={200} value={zoom} onChange={(e) => setZoom(Number(e.target.value) < 15 ? 0 : Number(e.target.value))} aria-label="Zoom timeline" className="w-24 accent-primary" />
            <button type="button" className={primary} disabled={!!busy} onClick={doExport}>
              {busy === "export" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} {busy === "export" ? "Mengekspor..." : "Export video"}
            </button>
          </div>
        </div>
        <div className="flex">
          {/* track headers */}
          <div className="shrink-0 border-r text-[11px]" style={{ width: HEAD }}>
            <div className="h-5 border-b" />
            <TrackHead label="Video" />
            <TrackHead label="Teks" />
            <TrackHead label="Stiker" />
            <TrackHead label="Suara" muted={edit.voiceVolume === 0} onMute={edit.voices.length ? () => set((e) => ({ ...e, voiceVolume: e.voiceVolume ? 0 : 1 })) : undefined} />
            <TrackHead label="SFX" muted={edit.sfx.length > 0 && edit.sfx.every((x) => x.volume === 0)} onMute={edit.sfx.length ? () => set((e) => ({ ...e, sfx: e.sfx.map((x) => ({ ...x, volume: e.sfx.every((y) => y.volume === 0) ? 0.6 : 0 })) })) : undefined} />
            <TrackHead label="Musik" muted={!!edit.bgm && edit.bgm.volume === 0} onMute={edit.bgm ? () => set((e) => ({ ...e, bgm: e.bgm && { ...e.bgm, volume: e.bgm.volume ? 0 : 0.2 } })) : undefined} />
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
                  <div key={i} className="absolute top-1 bottom-1 overflow-hidden rounded-md border border-sky-500/40 bg-sky-500/15 px-2 text-[10px] leading-[24px] text-sky-900 dark:text-sky-100" style={{ left: c.start * pps, width: c.dur * pps - 2 }} onPointerDown={(ev) => (ev.stopPropagation(), seek(c.start))}>
                    <span className="truncate">{i + 1}. {c.label}</span>
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
                      onSelect={() => (setSel({ kind: "overlay", id: o.id }), setTab("stiker"))}
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
                  <button type="button" className="absolute top-1 bottom-1 left-1 flex items-center gap-1 rounded-md border border-dashed px-2 text-[10px] text-muted-foreground hover:bg-accent" onPointerDown={(ev) => ev.stopPropagation()} onClick={() => setTab("stiker")}>
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

function TrackHead({ label, muted, onMute }: { label: string; muted?: boolean; onMute?: () => void }) {
  return (
    <div className="flex items-center gap-1 border-b px-2 font-medium last:border-b-0" style={{ height: LANE }}>
      <span className="flex-1">{label}</span>
      {onMute && (
        <button type="button" onClick={onMute} className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={muted ? "Bunyikan" : "Bisukan"}>
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

function Slider({
  label, value, onChange, min = 0, max = 2, step = 0.05, unit = "%",
}: { label: string; value: number; onChange: (v: number, record: boolean) => void; min?: number; max?: number; step?: number; unit?: "%" | "×" | "s" }) {
  const shown = unit === "%" ? `${Math.round(value * 100)}%` : `${value}${unit}`;
  return (
    <label className="grid grid-cols-[minmax(64px,auto)_1fr_38px] items-center gap-2 text-xs">
      <span className="truncate text-muted-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(round2(Number(e.target.value)), false)}
        onPointerUp={(e) => onChange(round2(Number((e.target as HTMLInputElement).value)), true)}
        className="h-4 w-full accent-primary"
      />
      <span className="text-right font-mono text-[11px] tabular-nums">{shown}</span>
    </label>
  );
}

const chip = (on: boolean) =>
  `h-6 rounded-full border px-2.5 text-[11px] ${on ? "border-primary bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`;

function TextPanel({
  style, onStyle, onPos, onAnim, safe, onSafe, selected, onCaption, onAdd, onRemove, onSplit, onRegen, count,
}: {
  style: CaptionStyle; onStyle: (s: Partial<CaptionStyle>, record?: boolean) => void; onPos: (p: Partial<CaptionPos>, record?: boolean) => void;
  onAnim: (a: CaptionAnim) => void; safe: SafeArea; onSafe: (s: Partial<SafeArea>, record?: boolean) => void; selected?: EditCaption;
  onCaption: (p: Partial<EditCaption>, record?: boolean) => void; onAdd: () => void; onRemove: () => void; onSplit: () => void; onRegen: (words?: number) => void; count: number;
}) {
  const [sub, setSub] = useState<"gaya" | "posisi" | "safe">("gaya");
  const own = !!selected?.pos;
  const pos = styleOf(style, selected);
  const safePreset = SAFE_PRESETS.find((x) => (Object.keys(x.safe) as (keyof SafeArea)[]).every((k) => Math.abs(x.safe[k] - safe[k]) < 0.001))?.id;
  return (
    <div className="space-y-3">
      {/* selected caption (or how to pick one) */}
      {selected ? (
        <div className="space-y-1.5 rounded-lg border bg-background p-2">
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
            <label className="ml-auto flex items-center gap-1.5" title="Posisi & ukuran caption ini tidak ikut caption lain (mis. judul hook di atas)">
              <input type="checkbox" checked={own} onChange={(e) => onCaption({ pos: e.target.checked ? { x: style.x, y: style.y, size: style.size } : null })} />
              Posisi sendiri
            </label>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Klik caption di timeline atau di video untuk mengedit teksnya. {count} caption.</p>
      )}

      <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
        {([["gaya", "Gaya"], ["posisi", own ? "Posisi (caption ini)" : "Posisi"], ["safe", "Safe area"]] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setSub(id)} className={`h-6 flex-1 rounded-md text-[11px] font-medium ${sub === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {label}
          </button>
        ))}
      </div>

      {sub === "gaya" && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-4 gap-1">
            {CAPTION_PRESETS.map((x) => (
              <button key={x.id} type="button" title={x.label} onClick={() => onStyle({ preset: x.id })} className={`rounded-md border p-0.5 ${style.preset === x.id ? "border-primary ring-1 ring-primary" : "hover:bg-accent"}`}>
                <PresetSwatch style={{ ...style, preset: x.id }} />
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="w-14 text-xs text-muted-foreground">Animasi</span>
            {CAPTION_ANIMS.map((x) => (
              <button key={x.id} type="button" onClick={() => onAnim(x.id)} className={chip(style.anim === x.id)}>{x.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="w-14 text-xs text-muted-foreground">Karaoke</span>
            <button type="button" className={chip(!style.karaoke)} onClick={() => onStyle({ karaoke: false })}>Mati</button>
            <button type="button" className={chip(style.karaoke)} onClick={() => onStyle({ karaoke: true })}>Kata menyala</button>
            {style.karaoke &&
              ACCENTS.map((c) => (
                <button key={c} type="button" onClick={() => onStyle({ accent: c })} className={`size-5 rounded-full border-2 ${style.accent === c ? "border-foreground" : "border-transparent"}`} style={{ background: c }} aria-label={`Warna ${c}`} />
              ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="w-14 text-xs text-muted-foreground">Huruf</span>
            <button type="button" className={chip(!style.upper)} onClick={() => onStyle({ upper: false })}>Aa</button>
            <button type="button" className={chip(style.upper)} onClick={() => onStyle({ upper: true })}>AA</button>
          </div>
        </div>
      )}

      {sub === "posisi" && (
        <div className="space-y-2">
          <Slider label="Ukuran" value={pos.size} min={0.03} max={0.12} step={0.002} onChange={(v, r) => onPos({ size: v }, r)} />
          <Slider label="Horizontal" value={pos.x} min={0.05} max={0.95} step={0.01} onChange={(v, r) => onPos({ x: v }, r)} />
          <Slider label="Vertikal" value={pos.y} min={0.05} max={0.95} step={0.01} onChange={(v, r) => onPos({ y: v }, r)} />
          <div className="flex flex-wrap gap-1">
            <button type="button" className={chip(false)} onClick={() => onPos({ x: 0.5 })}>↔ Tengahkan</button>
            <button type="button" className={chip(false)} onClick={() => onPos({ y: 0.2 })}>Atas</button>
            <button type="button" className={chip(false)} onClick={() => onPos({ y: 0.5 })}>Tengah</button>
            <button type="button" className={chip(false)} onClick={() => onPos({ y: 0.72 })}>Bawah</button>
          </div>
          <p className="text-[11px] text-muted-foreground">Bisa juga diseret langsung di video; titik di sudut untuk ukuran.</p>
        </div>
      )}

      {sub === "safe" && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {SAFE_PRESETS.map((x) => (
              <button key={x.id} type="button" onClick={() => onSafe(x.safe)} className={chip(safePreset === x.id)}>{x.label}</button>
            ))}
          </div>
          <div className="grid gap-x-4 gap-y-2 xl:grid-cols-2">
            <Slider label="Atas" value={safe.top} min={0} max={0.35} step={0.01} onChange={(v, r) => onSafe({ top: v }, r)} />
            <Slider label="Bawah" value={safe.bottom} min={0} max={0.35} step={0.01} onChange={(v, r) => onSafe({ bottom: v }, r)} />
            <Slider label="Kiri" value={safe.left} min={0} max={0.35} step={0.01} onChange={(v, r) => onSafe({ left: v }, r)} />
            <Slider label="Kanan" value={safe.right} min={0} max={0.35} step={0.01} onChange={(v, r) => onSafe({ right: v }, r)} />
          </div>
          <p className="text-[11px] text-muted-foreground">Teks tidak akan keluar dari kotak putus-putus di video.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-t pt-2.5">
        <button type="button" className={secondary} onClick={onAdd}><Plus className="size-3.5" /> Caption</button>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Wand2 className="size-3.5" /> Buat ulang dari naskah:
          {[1, 2, 4].map((n) => (
            <button key={n} type="button" className={chip(false)} onClick={() => onRegen(n)} title={n < 4 ? "Subtitle pendek seperti video laris" : "Caption kalimat"}>{n} kata</button>
          ))}
        </span>
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

function PresetSwatch({ style }: { style: CaptionStyle }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    drawCaption(ctx, c.width, c.height, "Aa Promo", { ...style, x: 0.5, y: 0.5, size: 0.17 }, { top: 0, bottom: 0, left: 0, right: 0 });
  }, [style]);
  return <canvas ref={ref} width={160} height={70} className="h-8 w-full rounded bg-[linear-gradient(135deg,#5b6b7a,#2a3440)]" />;
}

const AI_CHIPS = [
  "Bikin caption lebih catchy & singkat, gaya anak TikTok",
  "Rapikan timing caption supaya pas dengan suara",
  "Caption kuning huruf besar di tengah layar",
  "Kecilkan musik saat ada suara, keraskan di akhir",
  "Tambah caption ajakan 'cek keranjang kuning' di 2 detik terakhir",
  "Animasi pop, caption agak ke atas di tengah",
];

function AiPanel({
  busy, hasBgm, onRun, onDirector, versions, onPick,
}: {
  busy: boolean; hasBgm: boolean; onRun: (s: string) => void; onDirector: (wish: string) => void;
  versions: { edit: ProjectEdit; note: string }[]; onPick: (v: { edit: ProjectEdit; note: string }) => void;
}) {
  const [text, setText] = useState("");
  const chips = useMemo(() => (hasBgm ? AI_CHIPS : AI_CHIPS.filter((c) => !/musik/i.test(c))), [hasBgm]);
  return (
    <div className="space-y-3">
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
  fx, onFx, onSaveTemplate, onApplyTemplate,
}: {
  fx: EditFx; onFx: (p: Partial<EditFx>) => void; onSaveTemplate: (name: string) => Promise<EditTemplate[]>; onApplyTemplate: (t: EditTemplate) => void;
}) {
  const [templates, setTemplates] = useState<EditTemplate[] | null>(null);
  const [name, setName] = useState("");
  useEffect(() => {
    let alive = true;
    listEditTemplates().then((t) => alive && setTemplates(t), () => alive && setTemplates([]));
    return () => void (alive = false);
  }, []);
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
        <p className="text-[11px] text-muted-foreground">Transisi dipasang di setiap pergantian adegan; durasi video tidak berubah.</p>
      </div>
      <div className="space-y-2 border-t pt-2.5">
        <p className="flex items-center gap-1.5 text-xs font-medium"><Sparkles className="size-3.5" /> Format video laris</p>
        <p className="text-[11px] text-muted-foreground">Dari analisa 30 video terlaris KaloData. Mengatur caption, stiker, dan efek; bisa di-undo (Ctrl+Z).</p>
        <div className="grid gap-1">
          {RESEARCH_TEMPLATES.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11px]">
              <span className="min-w-0 flex-1">
                <b className="font-medium">{t.name}</b>
                <span className="block text-muted-foreground">{t.note}</span>
              </span>
              <button type="button" className={secondary} onClick={() => onApplyTemplate(t)}>Pakai</button>
            </div>
          ))}
        </div>
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
      </div>
    </div>
  );
}

