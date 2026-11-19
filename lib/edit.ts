// Timeline editor model (Studio → Hasil), shared by the browser editor and the ffmpeg export.
// Times are seconds on the final video's timeline. Volumes are gains (1 = original, max 2).

import { numberize, type Tok } from "./angka";

export type CaptionPreset = "tiktok" | "kotak" | "kuning" | "bersih" | "minimal" | "neon" | "komik" | "gradasi" | "bubble" | "merah";
export type CaptionAnim = "none" | "fade" | "pop" | "naik" | "sapu" | "zoom" | "kiri" | "pantul";
export type CaptionFont =
  | "tiktok" | "jakarta" | "montserrat" | "archivo" | "anton" | "bebas"
  | "instrument" | "dmserif" | "playfair"
  | "bricolage" | "poppins" | "caveat" | "lilita"
  | "unbounded" | "dela" | "oswald"
  | "segoe" | "bangers" | "pacifico" | "marker"; // last row: older fonts, hidden from the picker (old projects still render)
export type FontMood = "jualan" | "estetik" | "santai" | "display";
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
  font: CaptionFont;
  color?: string | null; // text colour override (#rrggbb)
  box?: string | null; // box colour override for kotak / bubble / merah
  out: boolean; // fade out at the end of each caption
  // fine-tuning (null/undefined = the preset's own look)
  light?: boolean; // thinner weight of the font (when it has one)
  spacing?: number | null; // letter spacing, em (-0.05 … 0.3)
  stroke?: number | null; // outline width, fraction of the font size (0 … 0.3)
  shadow?: number | null; // soft drop shadow strength (0 … 1)
  lineHeight?: number | null; // line height, × font size (0.9 … 1.6)
};
export type CaptionPos = { x: number; y: number; size: number };
export type EditCaption = { id: string; start: number; end: number; text: string; pos?: CaptionPos | null }; // pos: own position/size
export type EditVoice = { id: string; src: string; start: number; dur: number; speed: number; volume: number; text?: string | null };
export type EditClip = { src: string; start: number; dur: number; label: string };
export type EditBgm = { src: string; name: string; dur: number; volume: number; offset: number; fade: boolean; bpm?: number | null; beat?: number | null }; // beat: first beat (s) in the music file
/** One sound effect on the SFX track. auto = placed by "SFX otomatis" (replaced when re-run). */
export type EditSfx = { id: string; src: string; name: string; start: number; dur: number; volume: number; auto?: boolean };
export type SafeArea = { top: number; bottom: number; left: number; right: number }; // margins, 0-1 of height/width
export type OverlayKind = "judul" | "harga" | "cta" | "info";
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
  sfx: EditSfx[];
  beforeFit?: Omit<ProjectEdit, "beforeFit"> | null; // state before "Pas-kan klip ke suara" (to undo it)
  exportedAt?: number | null;
};

export const DEFAULT_CAPTION_STYLE: CaptionStyle = { preset: "tiktok", x: 0.5, y: 0.7, size: 0.062, upper: false, anim: "pop", karaoke: false, accent: "#ffe03d", font: "tiktok", color: null, box: null, out: false };
export const CAPTION_PRESETS: { id: CaptionPreset; label: string }[] = [
  { id: "tiktok", label: "TikTok" },
  { id: "kotak", label: "Kotak" },
  { id: "kuning", label: "Kuning" },
  { id: "bersih", label: "Bersih" },
  { id: "minimal", label: "Minimal" },
  { id: "neon", label: "Neon" },
  { id: "komik", label: "Komik" },
  { id: "gradasi", label: "Gradasi" },
  { id: "bubble", label: "Bubble" },
  { id: "merah", label: "Berita" },
];
/**
 * Ready-made caption looks for a job (font + colours + outline + animation + position in one click).
 * Position/size are part of the look; per-caption positions are kept.
 */
export const CAPTION_LOOKS: { id: string; label: string; use: string; style: Partial<CaptionStyle> }[] = [
  { id: "hook", label: "Hook jualan", use: "Kalimat pembuka besar di tengah", style: { preset: "tiktok", font: "archivo", upper: true, size: 0.072, y: 0.45, anim: "pop", karaoke: true, accent: "#ffe03d", color: null, box: null, stroke: 0.14, shadow: 0.5, spacing: 0, lineHeight: 1.1, light: false } },
  { id: "review", label: "Review jujur", use: "Subtitle kecil 1–2 kata (paling sering di video laris)", style: { preset: "minimal", font: "tiktok", upper: false, size: 0.048, y: 0.66, anim: "none", karaoke: true, accent: "#ffe03d", color: null, box: null, stroke: null, shadow: 0.4, spacing: 0, lineHeight: null, light: false } },
  { id: "estetik", label: "Estetik soft", use: "Video musik, fashion & beauty", style: { preset: "bersih", font: "instrument", upper: false, size: 0.07, y: 0.62, anim: "fade", karaoke: false, color: "#ffffff", box: null, stroke: null, shadow: 0.7, spacing: 0, lineHeight: 1.05, light: false, out: true } },
  { id: "promo", label: "Harga / promo", use: "Sorot harga atau diskon", style: { preset: "kotak", font: "anton", upper: true, size: 0.07, y: 0.5, anim: "pantul", karaoke: false, color: "#111111", box: "#ffe03d", stroke: null, shadow: 0.5, spacing: 0.02, lineHeight: 1.15, light: false } },
  { id: "testi", label: "Testimoni", use: "Kutipan pembeli dalam bubble", style: { preset: "bubble", font: "jakarta", upper: false, size: 0.05, y: 0.7, anim: "naik", karaoke: false, color: "#111111", box: "#ffffff", stroke: null, shadow: 0.4, spacing: 0, lineHeight: 1.25, light: false } },
  { id: "karaoke", label: "Karaoke kuning", use: "Kata yang diucapkan menyala", style: { preset: "tiktok", font: "montserrat", upper: true, size: 0.062, y: 0.68, anim: "pop", karaoke: true, accent: "#ffe03d", color: "#ffffff", box: null, stroke: 0.16, shadow: 0.3, spacing: 0, lineHeight: null, light: false } },
  { id: "elegan", label: "Elegan", use: "Produk premium, skincare, parfum", style: { preset: "bersih", font: "dmserif", upper: false, size: 0.064, y: 0.6, anim: "sapu", karaoke: false, color: "#fff7e6", box: null, stroke: null, shadow: 0.6, spacing: 0.03, lineHeight: 1.1, light: false, out: true } },
  { id: "urgent", label: "Urgent / berita", use: "Flash sale, stok terbatas", style: { preset: "merah", font: "oswald", upper: true, size: 0.058, y: 0.3, anim: "kiri", karaoke: false, color: "#ffffff", box: "#e11d2e", stroke: null, shadow: 0.3, spacing: 0.04, lineHeight: 1.2, light: false } },
  { id: "malam", label: "Neon malam", use: "Gadget, gaming, lampu", style: { preset: "neon", font: "unbounded", upper: true, size: 0.054, y: 0.5, anim: "zoom", karaoke: false, color: "#ff4d8d", box: null, stroke: null, shadow: 0, spacing: 0.02, lineHeight: 1.2, light: false } },
  { id: "santai", label: "Coretan santai", use: "Gaya ngobrol, tulisan tangan", style: { preset: "minimal", font: "caveat", upper: false, size: 0.085, y: 0.64, anim: "pantul", karaoke: false, color: "#ffe03d", box: null, stroke: 0.06, shadow: 0.5, spacing: 0, lineHeight: 1, light: false } },
  { id: "bersih", label: "Clean modern", use: "Teks rapi tanpa outline", style: { preset: "bersih", font: "bricolage", upper: false, size: 0.058, y: 0.68, anim: "naik", karaoke: false, color: "#ffffff", box: null, stroke: null, shadow: 0.8, spacing: -0.01, lineHeight: 1.1, light: false } },
  { id: "bold", label: "Display tebal", use: "Satu kata besar yang nendang", style: { preset: "komik", font: "dela", upper: true, size: 0.07, y: 0.48, anim: "zoom", karaoke: false, color: "#ffffff", box: null, stroke: 0.18, shadow: 0, spacing: 0, lineHeight: 1.05, light: false } },
];

export const CAPTION_ANIMS: { id: CaptionAnim; label: string }[] = [
  { id: "none", label: "Tanpa" },
  { id: "pop", label: "Pop" },
  { id: "fade", label: "Fade" },
  { id: "naik", label: "Naik" },
  { id: "sapu", label: "Sapu" },
  { id: "zoom", label: "Zoom" },
  { id: "kiri", label: "Geser" },
  { id: "pantul", label: "Pantul" },
];

/**
 * Caption fonts. `css` is the CSS font-family the canvas draws with; the editor replaces it with the self-hosted
 * next/font family (registerCaptionFonts) so the export never depends on fonts installed on the PC.
 */
export type FontInfo = { id: CaptionFont; label: string; css: string; weight: number; light?: number; italic?: boolean; mood: FontMood; hidden?: boolean };
export const CAPTION_FONTS: FontInfo[] = [
  { id: "tiktok", label: "TikTok Sans", css: '"TikTok Sans"', weight: 800, light: 500, mood: "jualan" },
  { id: "jakarta", label: "Plus Jakarta", css: '"Plus Jakarta Sans"', weight: 800, light: 600, mood: "jualan" },
  { id: "montserrat", label: "Montserrat", css: "Montserrat", weight: 900, light: 600, mood: "jualan" },
  { id: "archivo", label: "Archivo Black", css: '"Archivo Black"', weight: 400, mood: "jualan" },
  { id: "anton", label: "Anton", css: "Anton", weight: 400, mood: "jualan" },
  { id: "bebas", label: "Bebas Neue", css: '"Bebas Neue"', weight: 400, mood: "jualan" },
  { id: "instrument", label: "Instrument", css: '"Instrument Serif"', weight: 400, italic: true, mood: "estetik" },
  { id: "dmserif", label: "DM Serif", css: '"DM Serif Display"', weight: 400, mood: "estetik" },
  { id: "playfair", label: "Playfair", css: '"Playfair Display"', weight: 800, light: 500, mood: "estetik" },
  { id: "bricolage", label: "Bricolage", css: '"Bricolage Grotesque"', weight: 800, light: 500, mood: "santai" },
  { id: "poppins", label: "Poppins", css: "Poppins", weight: 800, light: 600, mood: "santai" },
  { id: "caveat", label: "Caveat", css: "Caveat", weight: 700, light: 500, mood: "santai" },
  { id: "lilita", label: "Lilita One", css: '"Lilita One"', weight: 400, mood: "santai" },
  { id: "unbounded", label: "Unbounded", css: "Unbounded", weight: 800, light: 500, mood: "display" },
  { id: "dela", label: "Dela Gothic", css: '"Dela Gothic One"', weight: 400, mood: "display" },
  { id: "oswald", label: "Oswald", css: "Oswald", weight: 700, light: 500, mood: "display" },
  { id: "segoe", label: "Segoe UI", css: '"Segoe UI", "Helvetica Neue", Arial', weight: 800, light: 600, mood: "jualan", hidden: true },
  { id: "bangers", label: "Bangers", css: "Bangers", weight: 400, mood: "display", hidden: true },
  { id: "pacifico", label: "Pacifico", css: "Pacifico", weight: 400, mood: "santai", hidden: true },
  { id: "marker", label: "Marker", css: '"Permanent Marker"', weight: 400, mood: "santai", hidden: true },
];
export const FONT_MOODS: { id: FontMood; label: string }[] = [
  { id: "jualan", label: "Jualan" },
  { id: "estetik", label: "Estetik" },
  { id: "santai", label: "Santai" },
  { id: "display", label: "Display" },
];
const fontCss: Partial<Record<CaptionFont, string>> = {};
export const registerCaptionFonts = (map: Partial<Record<CaptionFont, string>>) => Object.assign(fontCss, map);
export const fontOf = (id: CaptionFont | undefined) => CAPTION_FONTS.find((f) => f.id === id) ?? CAPTION_FONTS[0];
/** CSS font shorthand prefix (style + weight) of a caption style. */
export const fontFace = (s: Pick<CaptionStyle, "font" | "light" | "preset">) => {
  const f = fontOf(s.font);
  const w = s.light && f.light ? f.light : f.id === "segoe" ? (s.preset === "bersih" ? 600 : s.preset === "minimal" ? 700 : 800) : f.weight;
  return `${f.italic ? "italic " : ""}${w}`;
};
export const fontFamily = (id: CaptionFont | undefined) => `${fontCss[fontOf(id).id] ?? fontOf(id).css}, "Segoe UI Emoji", sans-serif`;
export const TEXT_COLORS = ["#ffffff", "#ffe03d", "#39ff88", "#ff4d8d", "#38bdf8", "#ff7a1a", "#111111"];
export const ACCENTS = ["#ffe03d", "#39ff88", "#ff4d8d", "#38bdf8", "#ff7a1a"];
/** Entrance length (seconds) per animation. The ffmpeg export mirrors animState() with the same numbers. */
export const ANIM_DUR: Record<CaptionAnim, number> = { none: 0, fade: 0.25, pop: 0.3, naik: 0.3, sapu: 0.45, zoom: 0.3, kiri: 0.35, pantul: 0.6 };
export const OUT_DUR = 0.2; // exit fade

export const OVERLAY_KINDS: { id: OverlayKind; label: string; text: string; y: number; size: number }[] = [
  { id: "judul", label: "Judul hook", text: "Wajib punya!", y: 0.22, size: 0.085 },
  { id: "harga", label: "Harga", text: "Rp99rb", y: 0.42, size: 0.07 },
  { id: "cta", label: "CTA", text: "Cek keranjang di bawah 👇", y: 0.62, size: 0.055 },
  // the quiet two-line text best-selling "aesthetic" videos keep at the top for the whole video
  { id: "info", label: "Teks info", text: "Sepatu cakep poll\nEmpuk, nyaman di kaki ✨", y: 0.15, size: 0.042 },
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
  { id: "tiktok", label: "TikTok", safe: { top: 0.09, bottom: 0.25, left: 0.05, right: 0.15 } },
  // TikTok Shop videos also show the product anchor above the caption: keep text higher
  { id: "tiktokshop", label: "TikTok Shop", safe: { top: 0.12, bottom: 0.33, left: 0.06, right: 0.16 } },
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
  sfx: e.sfx ?? [],
});
export const needsNormalize = (e: ProjectEdit) => !e.safe || !e.overlays || !e.fx || !e.sfx || e.captionStyle.karaoke == null;

/** Style one caption is drawn with: the shared style, or its own position/size. */
export const styleOf = (s: CaptionStyle, c?: EditCaption | null): CaptionStyle => (c?.pos ? { ...s, ...c.pos } : s);

/**
 * Size of the exported video: at least 1080 px wide (TikTok only keeps a 1080p quality tier for 1080p uploads;
 * a 720p upload is re-compressed into a blurry low tier). Captions are drawn at this size, so text stays sharp.
 */
export function exportSize(e: { width: number; height: number }) {
  const k = e.width >= 1080 ? 1 : 1080 / e.width;
  const even = (n: number) => Math.round(n / 2) * 2;
  return { w: even(e.width * k), h: even(e.height * k) };
}

export const uid = () => Math.random().toString(36).slice(2, 9);
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
export const round2 = (n: number) => Math.round(n * 100) / 100;

// words a subtitle chunk should not end on (they belong with the next word)
const WEAK = /^(yang|di|ke|dari|dan|atau|buat|untuk|sama|dengan|kalau|kalo|karena|tapi|si|para|lagi|udah|mau|bisa|jadi|cuma|cuman|harganya|harga)$/i;

/**
 * Split tokens into subtitle chunks of ≤n words: numbers are already one token ("Rp34 ribuan"), a chunk ends at
 * sentence punctuation, and never on a weak word ("yang", "di", "cuma") when the next one can take it.
 */
export function chunkTokens<T extends Tok>(toks: T[], n: number): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  for (let i = 0; i < toks.length; i++) {
    cur.push(toks[i]);
    const end = /[.!?,;:]["”')]*$/.test(toks[i].text) || i === toks.length - 1;
    if (cur.length >= n || end) {
      if (!end && cur.length > 1 && WEAK.test(cur[cur.length - 1].text)) {
        const carry = cur.pop()!;
        out.push(cur);
        cur = [carry];
        continue;
      }
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Subtitle text: no trailing comma/period (TikTok style); ! and ? stay. */
const tidy = (t: string) => t.replace(/[.,;:]+$/, "").trim();

/** CapCut-style auto captions: spoken text split into chunks of ≤maxWords (numbers as digits), timed by text length. */
export function autoCaptions(segments: { start: number; dur: number; text: string }[], maxWords = 4): EditCaption[] {
  const out: EditCaption[] = [];
  for (const seg of segments) {
    const toks = numberize(seg.text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean).map((text) => ({ text })));
    if (!toks.length) continue;
    const chunks = chunkTokens(toks, maxWords).map((c) => tidy(c.map((t) => t.text).join(" "))).filter(Boolean);
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

/** Split every caption into smaller ones of ≤n words, keeping their timing (1–2 words = the subtitle style of best sellers). */
export const rechunk = (captions: EditCaption[], n: number) =>
  autoCaptions(captions.map((c) => ({ start: c.start, dur: c.end - c.start, text: c.text })), n).map((c, i, all) => (i < all.length - 1 && c.end > all[i + 1].start ? { ...c, end: all[i + 1].start } : c));

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
  ctx.font = `${fontFace(style)} ${px}px ${fontFamily(style.font)}`;
  ctx.letterSpacing = `${Math.round((style.spacing ?? 0) * px)}px`;
  const shadow = style.shadow ?? 0;
  // outline width: the user's value, or the preset's own (k = fraction of the font size)
  const sw = (k: number) => Math.max(0.01, px * (style.stroke ?? k)); // canvas ignores lineWidth 0
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const sl = safe.left * W, sr = W - safe.right * W, st = safe.top * H, sb = H - safe.bottom * H;
  const lines = text.split("\n").flatMap((par) => wrap(ctx, par.split(/\s+/).filter(Boolean), Math.max(px * 3, (sr - sl) * 0.96)));
  const lh = px * (style.lineHeight ?? 1.22);
  const space = ctx.measureText(" ").width;
  const widths = lines.map((l) => ctx.measureText(l.join(" ")).width);
  const bw = Math.max(0, ...widths) + px * 0.6;
  const bh = lh * lines.length;
  const cx = fit(style.x * W, bw / 2, sl, sr);
  const cy = fit(style.y * H, bh / 2, st, sb);
  const top = cy - bh / 2;
  const accent = style.accent || DEFAULT_CAPTION_STYLE.accent;
  const fill = (fallback: string) => style.color || fallback;
  const boxFill = style.box || (style.preset === "merah" ? "#e11d2e" : style.preset === "bubble" ? "#7c3aed" : "#ffffff");
  let minX = W, maxX = 0, wi = 0;
  lines.forEach((l, i) => {
    const y = top + lh * (i + 0.5);
    const w = widths[i];
    const x0 = cx - w / 2;
    minX = Math.min(minX, x0);
    maxX = Math.max(maxX, x0 + w);
    if (style.preset === "kotak" || style.preset === "bubble" || style.preset === "merah") {
      const pad = px * (style.preset === "bubble" ? 0.4 : 0.28);
      ctx.fillStyle = boxFill;
      ctx.beginPath();
      ctx.roundRect(x0 - pad, y - lh / 2, w + pad * 2, lh, style.preset === "bubble" ? lh / 2 : style.preset === "merah" ? px * 0.06 : px * 0.22);
      ctx.fill();
    }
    let x = x0;
    for (const word of l) {
      const ww = ctx.measureText(word).width;
      const on = wi++ === hl;
      if (shadow > 0) {
        // soft drop shadow under the word (blurred dark copy), drawn before the preset paints it
        ctx.save();
        ctx.filter = `blur(${(px * 0.07 * shadow).toFixed(1)}px)`;
        ctx.fillStyle = `rgba(0,0,0,${(0.35 + 0.5 * shadow).toFixed(2)})`;
        ctx.fillText(word, x + px * 0.04 * shadow, y + px * 0.09 * shadow);
        ctx.restore();
      }
      if (style.stroke && ["kotak", "bubble", "merah", "neon", "bersih"].includes(style.preset)) {
        ctx.lineWidth = sw(0);
        ctx.strokeStyle = "#000000";
        ctx.strokeText(word, x, y);
      }
      if (style.preset === "kotak") {
        if (on) {
          ctx.fillStyle = accent;
          ctx.beginPath();
          ctx.roundRect(x - px * 0.1, y - lh / 2 + px * 0.08, ww + px * 0.2, lh - px * 0.16, px * 0.15);
          ctx.fill();
        }
        ctx.fillStyle = fill("#111111");
        ctx.fillText(word, x, y + px * 0.03);
      } else if (style.preset === "bubble" || style.preset === "merah") {
        ctx.fillStyle = on ? accent : fill("#ffffff");
        ctx.fillText(word, x, y + px * 0.03);
      } else if (style.preset === "neon") {
        // glow: the same word drawn with a wide coloured blur, then a crisp core
        const glow = style.color || "#22d3ee";
        ctx.shadowColor = on ? accent : glow;
        ctx.shadowBlur = px * 0.6;
        ctx.fillStyle = on ? accent : glow;
        ctx.fillText(word, x, y);
        ctx.shadowBlur = px * 0.2;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(word, x, y);
        ctx.shadowColor = "transparent";
      } else if (style.preset === "komik") {
        // thick outline with a hard drop shadow
        ctx.lineWidth = sw(0.24);
        ctx.strokeStyle = "#000000";
        ctx.strokeText(word, x + px * 0.08, y + px * 0.08);
        ctx.fillStyle = "#000000";
        ctx.fillText(word, x + px * 0.08, y + px * 0.08);
        ctx.strokeText(word, x, y);
        ctx.fillStyle = on ? accent : fill("#ffe03d");
        ctx.fillText(word, x, y);
      } else if (style.preset === "gradasi") {
        const g = ctx.createLinearGradient(x, y - px / 2, x, y + px / 2);
        g.addColorStop(0, on ? accent : "#ffd23f");
        g.addColorStop(1, on ? accent : "#ff3d7f");
        ctx.lineWidth = sw(0.14);
        ctx.strokeStyle = "#1a0b1f";
        ctx.strokeText(word, x, y);
        ctx.fillStyle = g;
        ctx.fillText(word, x, y);
      } else if (style.preset === "minimal") {
        // small white text, thin outline + soft shadow: what most best-selling affiliate videos use
        ctx.shadowColor = "rgba(0,0,0,.55)";
        ctx.shadowBlur = px * 0.18;
        ctx.lineWidth = sw(0.09);
        ctx.strokeStyle = "rgba(0,0,0,.85)";
        ctx.strokeText(word, x, y);
        ctx.shadowColor = "transparent";
        ctx.fillStyle = on ? accent : fill("#ffffff");
        ctx.fillText(word, x, y);
      } else if (style.preset === "bersih") {
        ctx.shadowColor = "rgba(0,0,0,.75)";
        ctx.shadowBlur = px * 0.25;
        ctx.shadowOffsetY = px * 0.05;
        ctx.fillStyle = on ? accent : fill("#ffffff");
        ctx.fillText(word, x, y);
        ctx.shadowColor = "transparent";
      } else {
        ctx.lineWidth = sw(0.16);
        ctx.strokeStyle = "#000000";
        ctx.strokeText(word, x, y);
        const base = fill(style.preset === "kuning" ? "#ffe03d" : "#ffffff");
        ctx.fillStyle = on ? (accent.toLowerCase() === base ? "#ffffff" : accent) : base;
        ctx.fillText(word, x, y);
      }
      x += ww + space;
    }
  });
  ctx.letterSpacing = "0px";
  const pad = px * ((style.preset === "neon" ? 0.8 : style.preset === "bubble" ? 0.6 : 0.45) + 0.15 * shadow + Math.max(0, (style.stroke ?? 0) - 0.16));
  const x0 = Math.max(0, Math.floor(minX - pad)), y0 = Math.max(0, Math.floor(top - pad));
  return { x: x0, y: y0, w: Math.min(W, Math.ceil(maxX + pad)) - x0, h: Math.min(H, Math.ceil(top + bh + pad)) - y0 };
}

/** Overlay sticker: hook title (big outlined text), price badge (red pill) or CTA (yellow pill). */
export function drawOverlay(ctx: CanvasRenderingContext2D, W: number, H: number, o: EditOverlay, safe: SafeArea = DEFAULT_SAFE): Box {
  if (o.kind === "info")
    return drawCaption(ctx, W, H, o.text, { ...DEFAULT_CAPTION_STYLE, preset: "minimal", x: o.x, y: o.y, size: o.size }, safe);
  if (o.kind === "judul")
    return drawCaption(ctx, W, H, o.text, { ...DEFAULT_CAPTION_STYLE, preset: "tiktok", upper: true, x: o.x, y: o.y, size: o.size }, safe);
  const px = Math.round(o.size * W);
  ctx.font = `800 ${px}px ${fontFamily("tiktok")}`;
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
export type Layer = { id: string; kind: "caption" | "overlay"; start: number; end: number; anim: CaptionAnim; out?: boolean; key: string; draw: (ctx: CanvasRenderingContext2D, W: number, H: number) => Box };

/** Everything drawn over the video, in paint order (captions, then overlays on top). Used by preview and export. */
export function layersOf(e: ProjectEdit): Layer[] {
  const out: Layer[] = [];
  const cs = e.captionStyle;
  for (const c of e.captions) {
    if (!c.text.trim()) continue;
    const st = styleOf(cs, c);
    const base = JSON.stringify([c.text, st, e.safe]);
    if (!cs.karaoke) {
      out.push({ id: c.id, kind: "caption", start: c.start, end: c.end, anim: st.anim, out: st.out, key: base, draw: (ctx, W, H) => drawCaption(ctx, W, H, c.text, st, e.safe) });
      continue;
    }
    const t = wordTimes(c);
    for (let i = 0; i < t.length - 1; i++)
      out.push({ id: c.id, kind: "caption", start: t[i], end: t[i + 1], anim: i === 0 ? st.anim : "none", out: st.out && i === t.length - 2, key: `${base}#${i}`, draw: (ctx, W, H) => drawCaption(ctx, W, H, c.text, st, e.safe, i) });
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
    case "fade": return { alpha: q, scale: 1, dy: 0, reveal: 1 } as { alpha: number; scale: number; dy: number; dx?: number; reveal: number };
    case "pop": return { alpha: Math.min(1, q * 4), scale: 0.6 + 0.4 * easeOutBack(q), dy: 0, reveal: 1 };
    case "naik": return { alpha: q, scale: 1, dy: (1 - easeOutCubic(q)) * 0.05, reveal: 1 };
    case "sapu": return { alpha: 1, scale: 1, dy: 0, reveal: q };
    case "zoom": return { alpha: Math.min(1, q * 4), scale: 1.5 - 0.5 * easeOutCubic(q), dy: 0, reveal: 1 };
    case "kiri": return { alpha: q, scale: 1, dy: 0, dx: -0.25 * Math.pow(1 - q, 3), reveal: 1 };
    case "pantul": return { alpha: Math.min(1, q * 5), scale: 1, dy: -0.08 * Math.exp(-5 * q) * Math.cos(10.5 * q) * (1 - q), reveal: 1 };
    default: return { alpha: 1, scale: 1, dy: 0, reveal: 1 };
  }
}

/**
 * Paint a pre-rendered still (src = full-frame canvas, box = its painted area) at time t into its life.
 * `left` = seconds until it ends (exit fade over the last OUT_DUR when `out`). dx/dy are fractions of the height.
 */
export function blitCaption(ctx: CanvasRenderingContext2D, src: CanvasImageSource, box: Box, H: number, anim: CaptionAnim, t: number, sx = box.x, sy = box.y, out = false, left = Infinity) {
  const a = animState(anim, ANIM_DUR[anim] ? t / ANIM_DUR[anim] : 1);
  const alpha = a.alpha * (out ? clamp(left / OUT_DUR, 0, 1) : 1);
  if (alpha <= 0 || a.reveal <= 0) return;
  const w = box.w * a.scale, h = box.h * a.scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(src, sx, sy, box.w * a.reveal, box.h, box.x + (box.w - w) / 2 + (a.dx ?? 0) * H, box.y + (box.h - h) / 2 + a.dy * H, w * a.reveal, h);
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
  captions?: "keep" | "none" | number; // number = re-split captions into chunks of ≤n words
  note?: string;
};

/** Formats measured on 30 best-selling KaloData videos (docs/edit-style-kalodata.md). */
export const RESEARCH_TEMPLATES: EditTemplate[] = [
  {
    id: "riset-review",
    name: "Review (ngobrol)",
    note: "18/30 video laris: ngomong dari detik 0, subtitle 1–2 kata kecil, CTA diucapkan, tanpa stiker/efek.",
    captionStyle: { ...DEFAULT_CAPTION_STYLE, preset: "minimal", upper: true, size: 0.045, y: 0.66, anim: "none", karaoke: true, accent: "#ffe03d" },
    safe: SAFE_PRESETS[0].safe,
    fx: DEFAULT_FX,
    overlays: [],
    captions: 2,
  },
  {
    id: "riset-estetik",
    name: "Estetik (musik)",
    note: "12/30 video laris: 15–20 dtk, musik saja, 2 baris teks kecil di atas sepanjang video.",
    captionStyle: { ...DEFAULT_CAPTION_STYLE, preset: "minimal", anim: "none" },
    safe: SAFE_PRESETS[0].safe,
    fx: DEFAULT_FX,
    overlays: [{ kind: "info", text: "Cakep poll\nNyaman banget dipakai ✨", x: 0.5, y: 0.15, size: 0.042, anim: "fade", from: 0, to: 1 }],
    captions: "none",
  },
  {
    id: "riset-demo",
    name: "Demo cepat (gadget)",
    note: "Gadget laris: potongan ±3 dtk, demo hasil, subtitle 1 kata kecil di bawah.",
    captionStyle: { ...DEFAULT_CAPTION_STYLE, preset: "minimal", upper: false, size: 0.04, y: 0.78, anim: "none", karaoke: false },
    safe: SAFE_PRESETS[0].safe,
    fx: DEFAULT_FX,
    overlays: [],
    captions: 1,
  },
];
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
    captions: t.captions === "none" ? [] : typeof t.captions === "number" ? rechunk(e.captions, t.captions) : e.captions,
    captionStyle: { ...DEFAULT_CAPTION_STYLE, ...t.captionStyle },
    safe: t.safe,
    fx: { ...DEFAULT_FX, ...t.fx },
    overlays: t.overlays.map(({ from, to, ...o }) => ({ ...o, id: uid(), start: round2(from * D), end: round2(Math.max(from * D + 0.3, to * D)) })),
  };
}

// ---- one-take voice-over, sound effects, beats ----

/** Subtitles from real word timings (Cartesia timestamps): chunks of ≤n words, shifted by the voice start and speed. */
export function captionsFromWords(words: { word: string; start: number; end: number }[], at: number, speed: number, n = 2): EditCaption[] {
  const chunks = chunkTokens(numberize(words.map((w) => ({ text: w.word, start: w.start, end: w.end }))), n);
  return chunks.map((g, i) => {
    const next = chunks[i + 1]?.[0];
    const start = at + g[0].start! / speed;
    // hold the text until the next chunk starts (no flicker in short pauses), at most +0.6 s after the last word
    const end = at + Math.min(next ? next.start! : Infinity, g[g.length - 1].end! + 0.6) / speed;
    return { id: uid(), start: round2(start), end: round2(Math.max(start + 0.2, end)), text: tidy(g.map((w) => w.text).join(" ")) };
  });
}

/**
 * "Rapikan teks": existing captions re-cut with the same chunk size, numbers turned into digits ("tiga puluh empat
 * ribu" → "Rp34.000" even when it was split over two captions). Word times inside a caption are estimated.
 */
export function tidyCaptions(captions: EditCaption[]): EditCaption[] {
  const sorted = [...captions].filter((c) => !c.pos).sort((a, b) => a.start - b.start);
  if (!sorted.length) return captions;
  const n = Math.max(1, Math.min(6, Math.max(...sorted.map((c) => c.text.split(/\s+/).filter(Boolean).length))));
  const words = sorted.flatMap((c) => {
    const ws = c.text.split(/\s+/).filter(Boolean);
    const t = wordTimes(c);
    return ws.map((text, i) => ({ text, start: t[i], end: t[i + 1] }));
  });
  const recut = captionsFromWords(words.map((w) => ({ word: w.text, start: w.start, end: w.end })), 0, 1, n);
  return [...captions.filter((c) => c.pos), ...recut].sort((a, b) => a.start - b.start);
}

/** Built-in sound effects (synthesised once into MEDIA_DIR/pustaka/sfx by lib/audio-library.ts). */
export const SFX_DIR = "pustaka/sfx";
export const BUILTIN_SFX = [
  { id: "whoosh", name: "Whoosh", dur: 0.5 },
  { id: "pop", name: "Pop", dur: 0.18 },
  { id: "ding", name: "Ding", dur: 1 },
  { id: "click", name: "Klik", dur: 0.06 },
  { id: "rise", name: "Riser", dur: 1.2 },
  { id: "boom", name: "Boom", dur: 0.8 },
] as const;
export const sfxSrc = (id: string) => `${SFX_DIR}/${id}.wav`;

/** "SFX otomatis": whoosh just before every cut, pop when a sticker appears, ding on a price badge. */
export function autoSfx(e: ProjectEdit): EditSfx[] {
  const mk = (id: (typeof BUILTIN_SFX)[number]["id"], start: number, volume: number): EditSfx => {
    const b = BUILTIN_SFX.find((x) => x.id === id)!;
    return { id: uid(), src: sfxSrc(id), name: b.name, start: round2(clamp(start, 0, e.duration - 0.05)), dur: b.dur, volume, auto: true };
  };
  const out = [
    ...e.clips.slice(1).map((c) => mk("whoosh", c.start - 0.2, 0.5)),
    ...e.overlays.map((o) => mk(o.kind === "harga" ? "ding" : "pop", o.start, o.kind === "harga" ? 0.45 : 0.55)),
  ];
  return [...e.sfx.filter((x) => !x.auto), ...out].sort((a, b) => a.start - b.start);
}

/** Beat times on the video timeline for the chosen music (empty when its tempo is unknown). */
export function beatTimes(bgm: EditBgm | null, duration: number) {
  if (!bgm?.bpm || bgm.beat == null) return [];
  const p = 60 / bgm.bpm;
  let t = (((bgm.beat - bgm.offset) % p) + p) % p;
  const out: number[] = [];
  for (; t < duration; t += p) out.push(round2(t));
  return out;
}

/** Move a time to the nearest beat when it is within `tol` seconds. */
export const snapToBeat = (t: number, beats: number[], tol = 0.2) => {
  const near = beats.reduce((m, b) => (Math.abs(b - t) < Math.abs(m - t) ? b : m), Infinity);
  return Math.abs(near - t) <= tol ? near : t;
};
