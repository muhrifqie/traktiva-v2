// Timeline editor model (Studio → Hasil), shared by the browser editor and the ffmpeg export.
// Times are seconds on the final video's timeline. Volumes are gains (1 = original, max 2).

export type CaptionPreset = "tiktok" | "kotak" | "kuning" | "bersih";
export type CaptionAnim = "none" | "fade" | "pop" | "naik" | "sapu";
// x/y: center of the text block as 0-1 of width/height, size: font px / video width
export type CaptionStyle = {
  preset: CaptionPreset;
  x: number;
  y: number;
  size: number;
  upper: boolean;
  anim: CaptionAnim;
  karaoke: boolean; // highlight the word being spoken
  accent: string; // karaoke highlight colour (#rrggbb)
};
export type CaptionPos = { x: number; y: number; size: number };
export type EditCaption = { id: string; start: number; end: number; text: string; pos?: CaptionPos | null }; // pos: own position/size
export type EditVoice = { id: string; src: string; start: number; dur: number; speed: number; volume: number; text?: string | null };
export type EditClip = { src: string; start: number; dur: number; label: string };
export type EditBgm = { src: string; name: string; dur: number; volume: number; offset: number; fade: boolean };
export type SafeArea = { top: number; bottom: number; left: number; right: number }; // margins, 0-1 of height/width
export type OverlayKind = "judul" | "harga" | "cta";
/** Free text / sticker on its own track (hook title, price badge, call to action). */
export type EditOverlay = { id: string; kind: OverlayKind; start: number; end: number; text: string; x: number; y: number; size: number; anim: CaptionAnim };
export type Transition = "none" | "zoom" | "flash" | "gelap";
export type EditFx = { transition: Transition; kenburns: boolean };

export type ProjectEdit = {
  base: string; // MEDIA_DIR-relative: raw clips joined (no voice-over, no captions)
  baseKey: string; // clip list the base was built from (rebuilt when clips change)
  duration: number;
  width: number;
  height: number;
  baseAudio: boolean;
  clips: EditClip[];
  clipVolume: number;
  captions: EditCaption[];
  captionStyle: CaptionStyle;
  safe: SafeArea;
  overlays: EditOverlay[];
  fx: EditFx;
  voices: EditVoice[];
  voiceVolume: number;
  bgm: EditBgm | null;
  exportedAt?: number | null;
};

export const DEFAULT_CAPTION_STYLE: CaptionStyle = { preset: "tiktok", x: 0.5, y: 0.7, size: 0.062, upper: false, anim: "pop", karaoke: false, accent: "#ffe03d" };
export const CAPTION_PRESETS: { id: CaptionPreset; label: string }[] = [
  { id: "tiktok", label: "TikTok" },
  { id: "kotak", label: "Kotak" },
  { id: "kuning", label: "Kuning" },
  { id: "bersih", label: "Bersih" },
];
export const CAPTION_ANIMS: { id: CaptionAnim; label: string }[] = [
  { id: "none", label: "Tanpa" },
  { id: "pop", label: "Pop" },
  { id: "fade", label: "Fade" },
  { id: "naik", label: "Naik" },
  { id: "sapu", label: "Sapu" },
];
export const ACCENTS = ["#ffe03d", "#39ff88", "#ff4d8d", "#38bdf8", "#ff7a1a"];
/** Entrance length (seconds) per animation. The ffmpeg export mirrors animState() with the same numbers. */
export const ANIM_DUR: Record<CaptionAnim, number> = { none: 0, fade: 0.25, pop: 0.3, naik: 0.3, sapu: 0.45 };

export const OVERLAY_KINDS: { id: OverlayKind; label: string; text: string; y: number; size: number }[] = [
  { id: "judul", label: "Judul hook", text: "Wajib punya!", y: 0.22, size: 0.085 },
  { id: "harga", label: "Harga", text: "Rp99rb", y: 0.42, size: 0.07 },
  { id: "cta", label: "CTA", text: "Cek keranjang kuning 👇", y: 0.62, size: 0.055 },
];
export const TRANSITIONS: { id: Transition; label: string }[] = [
  { id: "none", label: "Potong" },
  { id: "zoom", label: "Zoom" },
  { id: "flash", label: "Flash" },
  { id: "gelap", label: "Gelap" },
];
export const DEFAULT_FX: EditFx = { transition: "none", kenburns: false };

// Areas covered by each app's UI (top bar, right-side buttons, bottom caption/description).
export const SAFE_PRESETS: { id: string; label: string; safe: SafeArea }[] = [
  { id: "tiktok", label: "TikTok", safe: { top: 0.09, bottom: 0.2, left: 0.05, right: 0.15 } },
  { id: "reels", label: "Reels", safe: { top: 0.1, bottom: 0.22, left: 0.05, right: 0.13 } },
  { id: "shorts", label: "Shorts", safe: { top: 0.08, bottom: 0.18, left: 0.05, right: 0.14 } },
  { id: "bebas", label: "Bebas", safe: { top: 0.03, bottom: 0.03, left: 0.03, right: 0.03 } },
];
export const DEFAULT_SAFE = SAFE_PRESETS[0].safe;

/** Fill fields added after an edit was saved (older projects). */
export const normalizeEdit = (e: ProjectEdit): ProjectEdit => ({
  ...e,
  captionStyle: { ...DEFAULT_CAPTION_STYLE, ...e.captionStyle },
  safe: e.safe ?? DEFAULT_SAFE,
  overlays: e.overlays ?? [],
  fx: { ...DEFAULT_FX, ...e.fx },
});
export const needsNormalize = (e: ProjectEdit) => !e.safe || !e.overlays || !e.fx || e.captionStyle.karaoke == null;

/** Style one caption is drawn with: the shared style, or its own position/size. */
export const styleOf = (s: CaptionStyle, c?: EditCaption | null): CaptionStyle => (c?.pos ? { ...s, ...c.pos } : s);

export const uid = () => Math.random().toString(36).slice(2, 9);
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** CapCut-style auto captions: each spoken segment split into chunks of ≤4 words, timed by text length. */
export function autoCaptions(segments: { start: number; dur: number; text: string }[]): EditCaption[] {
  const out: EditCaption[] = [];
  for (const seg of segments) {
    const words = seg.text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    if (!words.length) continue;
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += 4) chunks.push(words.slice(i, i + 4).join(" "));
    const total = chunks.reduce((n, c) => n + c.length, 0);
    let t = seg.start;
    for (const c of chunks) {
      const d = (seg.dur * c.length) / total;
      out.push({ id: uid(), start: round2(t), end: round2(t + d), text: c });
      t += d;
    }
  }
  return out;
}

/** Word start times inside a caption (karaoke), spread by word length. Last entry = caption end. */
export function wordTimes(c: { start: number; end: number; text: string }) {
  const words = c.text.split(/\s+/).filter(Boolean);
  const weight = words.map((w) => w.length + 1);
  const total = weight.reduce((a, b) => a + b, 0) || 1;
  const out = [c.start];
  let t = c.start;
  for (const w of weight) out.push((t += ((c.end - c.start) * w) / total));
  return out;
}

const FONT = '"Segoe UI", "Segoe UI Emoji", "Helvetica Neue", Arial, sans-serif';

function wrap(ctx: CanvasRenderingContext2D, words: string[], max: number) {
  const lines: string[][] = [];
  let line: string[] = [];
  for (const w of words) {
    if (line.length && ctx.measureText([...line, w].join(" ")).width > max) {
      lines.push(line);
      line = [w];
    } else line.push(w);
  }
  if (line.length) lines.push(line);
  return lines;
}

export type Box = { x: number; y: number; w: number; h: number };
const fit = (c: number, half: number, lo: number, hi: number) => (hi - lo < half * 2 ? (lo + hi) / 2 : clamp(c, lo + half, hi - half));

/**
 * Draw one caption onto a canvas sized like the video (W×H). The same function draws the live preview and the
 * PNGs burned in on export, so what you see is what gets rendered. Lines wrap to the safe-area width and the
 * block is pushed inside the safe area. `hl` = index of the word to highlight (karaoke). Returns the painted box.
 */
export function drawCaption(ctx: CanvasRenderingContext2D, W: number, H: number, raw: string, style: CaptionStyle, safe: SafeArea = DEFAULT_SAFE, hl = -1): Box {
  const text = style.upper ? raw.toUpperCase() : raw;
  const px = Math.round(style.size * W);
  const bold = style.preset === "bersih" ? 600 : 800;
  ctx.font = `${bold} ${px}px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const sl = safe.left * W, sr = W - safe.right * W, st = safe.top * H, sb = H - safe.bottom * H;
  const lines = wrap(ctx, text.split(/\s+/).filter(Boolean), Math.max(px * 3, (sr - sl) * 0.96));
  const lh = px * 1.22;
  const space = ctx.measureText(" ").width;
  const widths = lines.map((l) => ctx.measureText(l.join(" ")).width);
  const bw = Math.max(0, ...widths) + px * 0.6;
  const bh = lh * lines.length;
  const cx = fit(style.x * W, bw / 2, sl, sr);
  const cy = fit(style.y * H, bh / 2, st, sb);
  const top = cy - bh / 2;
  const accent = style.accent || DEFAULT_CAPTION_STYLE.accent;
  let minX = W, maxX = 0, wi = 0;
  lines.forEach((l, i) => {
    const y = top + lh * (i + 0.5);
    const w = widths[i];
    const x0 = cx - w / 2;
    minX = Math.min(minX, x0);
    maxX = Math.max(maxX, x0 + w);
    if (style.preset === "kotak") {
      const pad = px * 0.28;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(x0 - pad, y - lh / 2, w + pad * 2, lh, px * 0.22);
      ctx.fill();
    }
    let x = x0;
    for (const word of l) {
      const ww = ctx.measureText(word).width;
      const on = wi++ === hl;
      if (style.preset === "kotak") {
        if (on) {
          ctx.fillStyle = accent;
          ctx.beginPath();
          ctx.roundRect(x - px * 0.1, y - lh / 2 + px * 0.08, ww + px * 0.2, lh - px * 0.16, px * 0.15);
          ctx.fill();
        }
        ctx.fillStyle = "#111111";
        ctx.fillText(word, x, y + px * 0.03);
      } else if (style.preset === "bersih") {
        ctx.shadowColor = "rgba(0,0,0,.75)";
        ctx.shadowBlur = px * 0.25;
        ctx.shadowOffsetY = px * 0.05;
        ctx.fillStyle = on ? accent : "#ffffff";
        ctx.fillText(word, x, y);
        ctx.shadowColor = "transparent";
      } else {
        ctx.lineWidth = px * 0.16;
        ctx.strokeStyle = "#000000";
        ctx.strokeText(word, x, y);
        const base = style.preset === "kuning" ? "#ffe03d" : "#ffffff";
        ctx.fillStyle = on ? (accent.toLowerCase() === base ? "#ffffff" : accent) : base;
        ctx.fillText(word, x, y);
      }
      x += ww + space;
    }
  });
  const pad = px * 0.45;
  const x0 = Math.max(0, Math.floor(minX - pad)), y0 = Math.max(0, Math.floor(top - pad));
  return { x: x0, y: y0, w: Math.min(W, Math.ceil(maxX + pad)) - x0, h: Math.min(H, Math.ceil(top + bh + pad)) - y0 };
}

/** Overlay sticker: hook title (big outlined text), price badge (red pill) or CTA (yellow pill). */
export function drawOverlay(ctx: CanvasRenderingContext2D, W: number, H: number, o: EditOverlay, safe: SafeArea = DEFAULT_SAFE): Box {
  if (o.kind === "judul")
    return drawCaption(ctx, W, H, o.text, { ...DEFAULT_CAPTION_STYLE, preset: "tiktok", upper: true, x: o.x, y: o.y, size: o.size }, safe);
  const px = Math.round(o.size * W);
  ctx.font = `800 ${px}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tw = Math.min(ctx.measureText(o.text).width, W * (1 - safe.left - safe.right) - px);
  const bw = tw + px * 1.2, bh = px * 1.6;
  const cx = fit(o.x * W, bw / 2, safe.left * W, W - safe.right * W);
  const cy = fit(o.y * H, bh / 2, safe.top * H, H - safe.bottom * H);
  const [bg, fg] = o.kind === "harga" ? ["#ff2d55", "#ffffff"] : ["#ffd400", "#111111"];
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.35)";
  ctx.shadowBlur = px * 0.35;
  ctx.shadowOffsetY = px * 0.12;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, bh / 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = fg;
  ctx.fillText(o.text, cx, cy + px * 0.04, tw);
  const pad = px * 0.5;
  const x0 = Math.max(0, Math.floor(cx - bw / 2 - pad)), y0 = Math.max(0, Math.floor(cy - bh / 2 - pad));
  return { x: x0, y: y0, w: Math.min(W, Math.ceil(cx + bw / 2 + pad)) - x0, h: Math.min(H, Math.ceil(cy + bh / 2 + pad)) - y0 };
}

/** One still drawn on top of the video for [start, end): a caption (or one karaoke word state) or an overlay. */
export type Layer = { id: string; kind: "caption" | "overlay"; start: number; end: number; anim: CaptionAnim; key: string; draw: (ctx: CanvasRenderingContext2D, W: number, H: number) => Box };

/** Everything drawn over the video, in paint order (captions, then overlays on top). Used by preview and export. */
export function layersOf(e: ProjectEdit): Layer[] {
  const out: Layer[] = [];
  const cs = e.captionStyle;
  for (const c of e.captions) {
    if (!c.text.trim()) continue;
    const st = styleOf(cs, c);
    const base = JSON.stringify([c.text, st, e.safe]);
    if (!cs.karaoke) {
      out.push({ id: c.id, kind: "caption", start: c.start, end: c.end, anim: st.anim, key: base, draw: (ctx, W, H) => drawCaption(ctx, W, H, c.text, st, e.safe) });
      continue;
    }
    const t = wordTimes(c);
    for (let i = 0; i < t.length - 1; i++)
      out.push({ id: c.id, kind: "caption", start: t[i], end: t[i + 1], anim: i === 0 ? st.anim : "none", key: `${base}#${i}`, draw: (ctx, W, H) => drawCaption(ctx, W, H, c.text, st, e.safe, i) });
  }
  for (const o of e.overlays ?? [])
    if (o.text.trim()) out.push({ id: o.id, kind: "overlay", start: o.start, end: o.end, anim: o.anim, key: JSON.stringify([o, e.safe]), draw: (ctx, W, H) => drawOverlay(ctx, W, H, o, e.safe) });
  return out;
}

const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const easeOutBack = (p: number) => 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2);

/** Entrance animation at progress p (0-1). dy is a fraction of the video height. Mirrored by lib/editor.ts. */
export function animState(anim: CaptionAnim, p: number) {
  const q = clamp(p, 0, 1);
  switch (anim) {
    case "fade": return { alpha: q, scale: 1, dy: 0, reveal: 1 };
    case "pop": return { alpha: Math.min(1, q * 4), scale: 0.6 + 0.4 * easeOutBack(q), dy: 0, reveal: 1 };
    case "naik": return { alpha: q, scale: 1, dy: (1 - easeOutCubic(q)) * 0.05, reveal: 1 };
    case "sapu": return { alpha: 1, scale: 1, dy: 0, reveal: q };
    default: return { alpha: 1, scale: 1, dy: 0, reveal: 1 };
  }
}

/** Paint a pre-rendered still (src = full-frame canvas, box = its painted area) at time t into its life. */
export function blitCaption(ctx: CanvasRenderingContext2D, src: CanvasImageSource, box: Box, H: number, anim: CaptionAnim, t: number, sx = box.x, sy = box.y) {
  const a = animState(anim, ANIM_DUR[anim] ? t / ANIM_DUR[anim] : 1);
  if (a.alpha <= 0 || a.reveal <= 0) return;
  const w = box.w * a.scale, h = box.h * a.scale;
  ctx.save();
  ctx.globalAlpha = a.alpha;
  ctx.drawImage(src, sx, sy, box.w * a.reveal, box.h, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2 + a.dy * H, w * a.reveal, h);
  ctx.restore();
}

// ---- clip effects (applied to the video under the captions). Mirrored by fxFilter() in lib/editor.ts. ----
export const FX = { punch: 0.12, punchDur: 0.35, flash: 0.7, flashDur: 0.25, darkDur: 0.15, kenburns: 0.06 };
export const cutsOf = (e: ProjectEdit) => e.clips.slice(1).map((c) => c.start);

/** Zoom factor and white/black flash strength at time t. */
export function fxAt(e: ProjectEdit, t: number) {
  const fx = e.fx ?? DEFAULT_FX;
  let zoom = 1, white = 0, black = 0;
  if (fx.kenburns) {
    const c = e.clips.find((x) => t >= x.start && t < x.start + x.dur);
    if (c) zoom *= 1 + (FX.kenburns * (t - c.start)) / c.dur;
  }
  for (const c of cutsOf(e)) {
    if (fx.transition === "zoom" && t >= c) zoom *= 1 + FX.punch * Math.pow(Math.max(0, 1 - (t - c) / FX.punchDur), 2);
    if (fx.transition === "flash" && t >= c) white = Math.max(white, FX.flash * Math.max(0, 1 - (t - c) / FX.flashDur));
    if (fx.transition === "gelap") black = Math.max(black, Math.max(0, 1 - Math.abs(t - c) / FX.darkDur));
  }
  return { zoom, white, black };
}

/** Reusable "brand look": caption style, safe area, effects and overlays (times as fractions of the video). */
export type EditTemplate = {
  id: string;
  name: string;
  captionStyle: CaptionStyle;
  safe: SafeArea;
  fx: EditFx;
  overlays: (Omit<EditOverlay, "id" | "start" | "end"> & { from: number; to: number })[];
};
export function toTemplate(e: ProjectEdit, name: string): EditTemplate {
  const D = e.duration || 1;
  return {
    id: uid(),
    name,
    captionStyle: e.captionStyle,
    safe: e.safe,
    fx: e.fx,
    overlays: e.overlays.map((o) => ({ kind: o.kind, text: o.text, x: o.x, y: o.y, size: o.size, anim: o.anim, from: round2(o.start / D), to: round2(o.end / D) })),
  };
}
export function applyTemplate(e: ProjectEdit, t: EditTemplate): ProjectEdit {
  const D = e.duration;
  return {
    ...e,
    captionStyle: { ...DEFAULT_CAPTION_STYLE, ...t.captionStyle },
    safe: t.safe,
    fx: { ...DEFAULT_FX, ...t.fx },
    overlays: t.overlays.map(({ from, to, ...o }) => ({ ...o, id: uid(), start: round2(from * D), end: round2(Math.max(from * D + 0.3, to * D)) })),
  };
}
