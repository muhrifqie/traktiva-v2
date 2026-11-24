import "server-only";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { listMusic } from "@/lib/audio-library";
import { MEDIA_DIR, toRel } from "@/lib/media";

const run = promisify(execFile);

// YouTube → Editor: one video from two: the original and a gameplay clip, side by side, stacked, or "reaction"
// (one fills the frame, the other small in a corner). Both sounds can be mixed at their own volume; the gameplay
// loops from a random point so every render differs. Sources: Shorts from the downloader (YouTube Shorts/<channel>/),
// gameplay clips the user drops into Gameplay/. Results go to YouTube Editor/ (.rendered.json remembers which
// originals were already used).

const SHORTS = () => path.join(MEDIA_DIR, "YouTube Shorts");
export const GAMEPLAY_DIR = () => path.join(MEDIA_DIR, "Gameplay");
const OUT = () => path.join(MEDIA_DIR, "YouTube Editor");
const VIDEO = /\.(mp4|mov|webm|mkv)$/i;

import { even, pipBox, type EditorSettings, type Fit, type Flip } from "@/lib/youtube-editor-config";
export { DEFAULT_SETTINGS, SIZES, type EditorSettings, type Fill, type Fit, type Layout, type Size } from "@/lib/youtube-editor-config";
export type SourceFile = { rel: string; name: string; date?: string };

const list = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => VIDEO.test(f)).sort().reverse() : []);
const pretty = (f: string) => f.replace(/^\d{8}\s+/, "").replace(/\s*\[[\w-]+\]\.\w+$/, "").replace(/\.\w+$/, "");

/** Downloaded Shorts per channel folder, newest first. */
export function listOriginals(): { channel: string; files: SourceFile[] }[] {
  if (!fs.existsSync(SHORTS())) return [];
  return fs
    .readdirSync(SHORTS(), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ channel: d.name, files: list(path.join(SHORTS(), d.name)).map((f) => ({ rel: toRel(path.join(SHORTS(), d.name, f)), name: pretty(f), date: f.match(/^(\d{8})\s/)?.[1] })) }))
    .filter((c) => c.files.length);
}

export function listGameplay(): SourceFile[] {
  fs.mkdirSync(GAMEPLAY_DIR(), { recursive: true });
  return list(GAMEPLAY_DIR()).map((f) => ({ rel: toRel(path.join(GAMEPLAY_DIR(), f)), name: f.replace(/\.\w+$/, "") }));
}

export function listResults(): SourceFile[] {
  return list(OUT()).slice(0, 200).map((f) => ({ rel: toRel(path.join(OUT(), f)), name: f.replace(/\.\w+$/, "") }));
}

/** Length (s) and whether the file has a sound track. */
export async function probe(file: string) {
  const r = await run(ffmpegPath!, ["-hide_banner", "-i", file], { windowsHide: true }).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }));
  const t = String(r.stderr);
  const m = t.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  return { len: m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0, audio: /Stream #\d+:\d+.*Audio:/.test(t) };
}

// originals already rendered (source rel → newest result rel), for the "sudah/belum dirender" filter
const RENDERED = () => path.join(OUT(), ".rendered.json");
export function listRendered(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(RENDERED(), "utf8"));
  } catch {
    return {};
  }
}
/** The Short title behind a result file: from its source (full name), else from the file name. */
export function resultTitle(resultRel: string) {
  const src = Object.entries(listRendered()).find(([, r]) => r === resultRel)?.[0];
  return pretty(path.basename(src ?? resultRel.replace(/^.*\/\d{14}\s+/, "")));
}
/** A video the Editor manages (absolute): a result in YouTube Editor/, an original under YouTube Shorts/, or an
 *  overlay under Gameplay/. Anything else is refused. */
function editorFile(rel: string) {
  const abs = path.resolve(MEDIA_DIR, rel);
  const inside = (root: string) => abs.startsWith(path.resolve(root) + path.sep);
  const ok = path.dirname(abs) === path.resolve(OUT()) || inside(SHORTS()) || inside(GAMEPLAY_DIR());
  if (!ok || !VIDEO.test(abs) || !fs.existsSync(abs)) throw new Error("File tidak ditemukan.");
  return abs;
}

const toRecycleBin = async (abs: string) => {
  if (process.platform !== "win32") return fs.rmSync(abs, { force: true });
  // a preview may still be reading the file for a moment: try a few times before giving up
  for (let i = 0; ; i++) {
    try {
      await run(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:TRK_FILE, 'OnlyErrorDialogs', 'SendToRecycleBin')"],
        { windowsHide: true, env: { ...process.env, TRK_FILE: abs } },
      );
      return;
    } catch (e) {
      const busy = /being used by another process|sedang digunakan/i.test(String((e as { stderr?: string }).stderr ?? e));
      if (!busy) throw new Error("Gagal memindahkan ke Recycle Bin.");
      if (i >= 3) throw new Error("File sedang dipakai (preview atau render). Tunggu sebentar lalu coba lagi.");
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
};

/** Move an Editor video to the Recycle Bin (Windows; deleted elsewhere). An original takes its downloaded
 *  thumbnail/description along; the "sudah dirender" list forgets it either way. */
export async function deleteEditorFile(rel: string) {
  const abs = editorFile(rel);
  await toRecycleBin(abs);
  if (abs.startsWith(path.resolve(SHORTS()) + path.sep)) {
    const base = path.basename(abs).replace(/\.\w+$/, "");
    for (const f of fs.readdirSync(path.dirname(abs))) if (f !== path.basename(abs) && f.replace(/\.[\w.]+$/, "") === base) await toRecycleBin(path.join(path.dirname(abs), f)).catch(() => {});
  }
  const map = listRendered();
  const kept = Object.fromEntries(Object.entries(map).filter(([src, r]) => r !== rel && src !== rel));
  if (Object.keys(kept).length !== Object.keys(map).length) fs.writeFileSync(RENDERED(), JSON.stringify(kept));
}

/** Every result (newest first), for the Galeri. */
export const allResults = () => list(OUT()).map((f) => ({ rel: toRel(path.join(OUT(), f)), file: path.join(OUT(), f) }));

/** Open the OS file manager with the video selected. */
export function revealEditorFile(rel: string) {
  const abs = editorFile(rel);
  if (process.platform === "win32") spawn("explorer.exe", [`/select,${abs}`], { detached: true, stdio: "ignore" }).unref();
  else if (process.platform === "darwin") spawn("open", ["-R", abs], { detached: true, stdio: "ignore" }).unref();
  else spawn("xdg-open", [path.dirname(abs)], { detached: true, stdio: "ignore" }).unref();
}

function markRendered(source: string, result: string) {
  fs.writeFileSync(RENDERED(), JSON.stringify({ ...listRendered(), [source]: result }));
}

/** Gray mask (white = visible) of a w×h box with rounded corners of radius r; one frame, repeated forever. */
const mask = (w: number, h: number, r: number, tag: string) =>
  `color=c=black:s=${w}x${h}:r=30:d=1,format=gray,` +
  `geq=lum='255*lte(pow(max(0,abs(X-${w / 2})-${w / 2 - r}),2)+pow(max(0,abs(Y-${h / 2})-${h / 2 - r}),2),${r * r})',loop=loop=-1:size=1[${tag}]`;

/** ffmpeg video filter → [v]. Input 0 = original, 1 = gameplay. */
export function layoutFilter(o: EditorSettings) {
  const [W, H] = o.size.split("x").map(Number);
  const fitOf = (i: number) => (i === 0 ? o.fitOriginal : o.fitGame);
  // mirror/flip each input first, so every layout below sees it already turned
  const FLIP: Record<Flip, string> = { none: "", h: "hflip,", v: "vflip,", hv: "hflip,vflip," };
  const src = (i: number) => `[${i}:v]${FLIP[i === 0 ? o.flipOriginal : o.flipGame] || "null,"}`;
  const fit = (i: number, tag: string, w: number, h: number, mode: Fit) => {
    const cover = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
    if (mode === "cover") return `${src(i)}${cover},setsar=1,fps=30[${tag}]`;
    // whole video on a plain color
    if (o.fill !== "blur") return `${src(i)}scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=${o.fill},setsar=1,fps=30[${tag}]`;
    // whole video on a blurred, cropped copy of itself
    return (
      `${src(i)}split[${tag}bg][${tag}fg];[${tag}bg]${cover},boxblur=20:2[${tag}b];` +
      `[${tag}fg]scale=${w}:${h}:force_original_aspect_ratio=decrease[${tag}f];` +
      `[${tag}b][${tag}f]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2,setsar=1,fps=30[${tag}]`
    );
  };

  if (o.layout === "pip") {
    // reaction: one video fills the frame, the other is a free overlay: cropped (aspect, zoom, focus), shaped, framed, placed
    const main = o.pipMain === "original" ? 0 : 1;
    const small = 1 - main;
    const p = pipBox(o, W, H);
    const z = Math.min(Math.max(o.pipZoom, 100), 300) / 100;
    const cw = `min(iw,ih*${p.a.toFixed(5)})/${z}`;
    const crop = `crop=w='${cw}':h='${cw}/${p.a.toFixed(5)}':x='(iw-ow)*${o.pipFocusX / 100}':y='(ih-oh)*${o.pipFocusY / 100}'`;
    let f = `${fit(main, "m", W, H, fitOf(main))};${src(small)}${crop},scale=${p.w}:${p.h},setsar=1,fps=30`;
    if (p.r > 0) f += `,format=yuva420p[sv];${mask(p.w, p.h, p.r, "sm")};[sv][sm]alphamerge[s0]`;
    else f += "[s0]";
    if (p.b > 0) {
      const color = o.pipBorderColor === "black" ? "black" : "white";
      f += `;color=c=${color}:s=${p.tw}x${p.th}:r=30,format=yuva420p`;
      f += p.r > 0 ? `[pc];${mask(p.tw, p.th, p.r + p.b, "pm")};[pc][pm]alphamerge[pl]` : "[pl]";
      f += `;[pl][s0]overlay=${p.b}:${p.b}:shortest=1[s]`;
    } else f += ";[s0]null[s]";
    return `${f};[m][s]overlay=x=${p.x}:y=${p.y}:shortest=1[v]`;
  }

  const side = o.layout === "side";
  const r = Math.min(Math.max(o.ratio, 20), 80);
  const a = side ? even((W * r) / 100) : even((H * r) / 100); // the original's share
  const parts: [number, number][] = side ? [[a, H], [W - a, H]] : [[W, a], [W, H - a]];
  const join = `${fit(0, "a", ...parts[0], o.fitOriginal)};${fit(1, "b", ...parts[1], o.fitGame)};[a][b]${side ? "hstack" : "vstack"}=inputs=2:shortest=1`;
  if (!o.seam) return `${join}[v]`;
  // soften the seam: blur a band across it and lay it back on top with an alpha that fades out to both sides
  // (full blur on the seam, sharp video at the band's edges), so the two videos melt into each other
  const band = even(o.seam * 2.5);
  const at = Math.max(0, a - band / 2);
  const [bw, bh] = side ? [band, H] : [W, band];
  const crop = `crop=${bw}:${bh}:${side ? at : 0}:${side ? 0 : at}`;
  const pos = side ? `${at}:0` : `0:${at}`;
  const c = band / 2;
  const fade =
    `color=c=black:s=${bw}x${bh}:r=30:d=1,format=gray,` +
    `geq=lum='255*(0.5+0.5*cos(PI*min(1,abs(${side ? "X" : "Y"}-${c})/${c})))',loop=loop=-1:size=1[fm]`;
  return (
    `${join}[j];[j]split[j1][j2];` +
    `[j2]${crop},boxblur=${Math.floor(band / 3)}:2:${Math.max(1, Math.floor(band / 4) - 1)}:2,format=yuva420p[sb];${fade};[sb][fm]alphamerge[sf];` +
    `[j1][sf]overlay=${pos}[v]`
  );
}

/** ffmpeg audio filter → [aout] mixing the sounds at their volumes (music = input 2, fading out over the last 2 s of
 *  `len` when given), or null when nothing is heard. */
export function audioFilter(o: EditorSettings, has: { original: boolean; game: boolean; music?: boolean }, len = 0) {
  const parts: string[] = [];
  if (has.original && o.volOriginal > 0) parts.push(`[0:a]volume=${(o.volOriginal / 100).toFixed(2)}`);
  if (has.game && o.volGame > 0) parts.push(`[1:a]volume=${(o.volGame / 100).toFixed(2)}`);
  if (has.music && o.volMusic > 0) parts.push(`[2:a]volume=${(o.volMusic / 100).toFixed(2)}${len > 4 ? `,afade=t=out:st=${(len - 2).toFixed(2)}:d=2` : ""}`);
  if (!parts.length) return null;
  if (parts.length === 1) return `${parts[0]}[aout]`;
  // the mix ends with the first sound (the original, or the overlay when the original is silent); music loops under it
  const tags = parts.map((_, i) => `[x${i}]`);
  return `${parts.map((p, i) => `${p}${tags[i]}`).join(";")};${tags.join("")}amix=inputs=${parts.length}:duration=first:normalize=0[aout]`;
}

/** The track behind "*" / a picked one: a media path, or null for no music. */
export async function resolveMusic(choice: string) {
  if (!choice) return null;
  const list = await listMusic();
  if (choice === "*") return list.length ? list[Math.floor(Math.random() * list.length)].src : null;
  return list.some((m) => m.src === choice) ? choice : null;
}
const musicInput = (rel: string | null) => (rel ? ["-stream_loop", "-1", "-i", path.resolve(MEDIA_DIR, rel)] : []);

// ---- on-screen text ----------------------------------------------------------------------------------------------
const FONTS = ["C:/Windows/Fonts/arialbd.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"];
const fontFile = () => FONTS.find((f) => fs.existsSync(f)) ?? null;
const escPath = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "");
/** Short title for on-screen text: the Short's name without the channel suffix, hashtags and emoji. */
export const cleanTitle = (name: string) =>
  name
    .split(/\s*[｜|]\s*/)[0]
    .replace(/#\S+/g, "")
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
const wrap = (text: string, max: number) =>
  text.split(/\n/).flatMap((para) => {
    const out: string[] = [];
    let line = "";
    for (const w of para.split(/\s+/).filter(Boolean)) {
      if (line && (line + " " + w).length > max) {
        out.push(line);
        line = w;
      } else line = line ? `${line} ${w}` : w;
    }
    return line ? [...out, line] : out;
  });
/** The text to draw for this video ("" = none). */
export const overlayText = (o: EditorSettings, title: string) =>
  o.textMode === "title" ? cleanTitle(title) : o.textMode === "custom" ? o.textCustom.replace(/\{judul\}/g, cleanTitle(title)).trim() : "";
/** The filter with the text drawn on [v] (still ends in [v]). The text goes through a temp file (no escaping);
 *  its path is pushed to `tmp` for the caller to delete. */
function withText(filter: string, o: EditorSettings, title: string, tmp: string[]) {
  const text = overlayText(o, title);
  const font = fontFile();
  if (!text || !font) return filter;
  const [W, H] = o.size.split("x").map(Number);
  const size = Math.round(Math.min(W, H * 0.5625) * { s: 0.05, m: 0.065, l: 0.085 }[o.textSize]);
  const lines = wrap(text, Math.max(8, Math.floor((W * 0.86) / (size * 0.56))));
  const shown = lines.slice(0, 3);
  if (lines.length > 3) shown[2] = `${shown[2].replace(/\s*\S*$/, "")}…`;
  const dir = path.join(OUT(), ".preview");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `text-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
  fs.writeFileSync(file, shown.join("\n"));
  tmp.push(file);
  const style = {
    box: `fontcolor=white:box=1:boxcolor=black@0.62:boxborderw=${Math.round(size * 0.35)}`,
    outline: `fontcolor=white:borderw=${Math.max(3, Math.round(size * 0.09))}:bordercolor=black`,
    yellow: `fontcolor=0xFFD93D:borderw=${Math.max(3, Math.round(size * 0.09))}:bordercolor=black`,
  }[o.textStyle];
  const y = { top: `${Math.round(H * 0.09)}`, middle: "(h-text_h)/2", bottom: `h-text_h-${Math.round(H * 0.13)}` }[o.textPos];
  return `${filter.replace(/\[v\]$/, "[v0]")};[v0]drawtext=fontfile='${escPath(font)}':textfile='${escPath(file)}':fontsize=${size}:line_spacing=${Math.round(size * 0.22)}:text_align=C:x=(w-text_w)/2:y=${y}:${style}[v]`;
}
const cleanup = (tmp: string[]) => tmp.forEach((f) => fs.rmSync(f, { force: true }));
/** Where the overlay starts in a preview at `at` s of the original. */
const previewGameAt = (o: EditorSettings, at: number) => (o.gameStart >= 0 ? o.gameStart + at : o.gameStart === -2 ? at : at + 5);

/** One still of the result at `at` seconds (overlay at its start + at, or 5 s further in) with these settings: the Editor's live preview. */
export async function renderPreview(original: string, gameplay: string, o: EditorSettings, at = 2) {
  if (!ffmpegPath) throw new Error("ffmpeg tidak tersedia di perangkat ini.");
  const dir = path.join(OUT(), ".preview");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "preview.jpg");
  const tmp: string[] = [];
  // seek inside both clips (the overlay loops, like in a render): a seek past the end gives no frame, and with the
  // endless mask sources in the filter ffmpeg would then wait forever and block every later Editor action
  const [a, b] = await Promise.all([probe(original), probe(gameplay)]);
  const t = a.len ? Math.min(at, Math.max(0, a.len - 0.5)) : at;
  const gameAt = b.len ? previewGameAt(o, t) % b.len : 0;
  try {
    await run(
      ffmpegPath,
      ["-y", "-hide_banner", "-loglevel", "error", "-ss", t.toFixed(2), "-i", original, "-stream_loop", "-1", "-ss", gameAt.toFixed(2), "-i", gameplay, "-filter_complex", withText(layoutFilter(o), o, pretty(path.basename(original)), tmp), "-map", "[v]", "-frames:v", "1", "-q:v", "4", out],
      { windowsHide: true, timeout: 30_000 },
    );
  } finally {
    cleanup(tmp);
  }
  return toRel(out);
}

/** A short playable clip (with sound) of the result from `at`: the Editor's "Putar preview". */
export async function renderPreviewClip(original: string, gameplay: string, o: EditorSettings, at = 0, secs = 6) {
  if (!ffmpegPath) throw new Error("ffmpeg tidak tersedia di perangkat ini.");
  const [a, b] = await Promise.all([probe(original), probe(gameplay)]);
  const dir = path.join(OUT(), ".preview");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `preview-${Date.now()}.mp4`);
  for (const f of fs.readdirSync(dir)) if (/^preview-\d+\.mp4$/.test(f)) fs.rmSync(path.join(dir, f), { force: true }); // keep only the newest
  const music = await resolveMusic(o.music);
  const sound = audioFilter(o, { original: a.audio, game: b.audio, music: !!music });
  const start = Math.max(0, Math.min(at, a.len - 1));
  const gameAt = previewGameAt(o, start);
  const tmp: string[] = [];
  await run(
    ffmpegPath,
    [
      "-y", "-hide_banner", "-loglevel", "error",
      "-ss", start.toFixed(2), "-i", original,
      "-stream_loop", "-1", "-ss", (b.len ? gameAt % b.len : 0).toFixed(2), "-i", gameplay,
      ...musicInput(music),
      "-filter_complex", `${withText(layoutFilter(o), o, pretty(path.basename(original)), tmp)}${sound ? `;${sound}` : ""}`,
      "-map", "[v]", ...(sound ? ["-map", "[aout]", "-c:a", "aac", "-b:a", "128k"] : ["-an"]),
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26", "-pix_fmt", "yuv420p", "-t", String(secs), "-movflags", "+faststart",
      out,
    ],
    { windowsHide: true, timeout: 120_000 },
  ).finally(() => cleanup(tmp));
  return toRel(out);
}

// One render queue at a time, kept on globalThis so page polls and dev reloads see the same job.
export type EditorJob = { total: number; done: { name: string; rel: string }[]; failed: string[]; current: string | null; running: boolean; cancelled: boolean };
const g = globalThis as { __ytEditor?: EditorJob; __ytEditorProc?: ReturnType<typeof spawn> };
export const editorJob = () => g.__ytEditor ?? null;

/** Render one video; `cursor` = where the overlay should start in "bersambung" mode. Returns the overlay span used. */
async function renderOne(original: string, gameplay: string, o: EditorSettings, out: string, title: string, music: string | null, cursor = 0) {
  const [a, b] = await Promise.all([probe(original), probe(gameplay)]);
  const start = Math.max(0, Math.min(o.trimStart, a.len - 1));
  const len = Math.max(1, Math.min(a.len - start, o.maxLen > 0 ? o.maxLen : Infinity));
  // overlay start: the chosen second, where the previous video stopped ("bersambung"), or a random point (it loops)
  const offset =
    o.gameStart >= 0 ? Math.min(o.gameStart, Math.max(0, b.len - 1)) : o.gameStart === -2 ? (b.len ? cursor % b.len : 0) : b.len > len + 5 ? Math.random() * (b.len - len - 2) : 0;
  const sound = audioFilter(o, { original: a.audio, game: b.audio, music: !!music }, len);
  const tmp: string[] = [];
  const video = withText(layoutFilter(o), o, title, tmp);
  const args = [
    "-y", "-hide_banner", "-loglevel", "error",
    ...(start > 0 ? ["-ss", start.toFixed(2)] : []), "-i", original,
    "-stream_loop", "-1", "-ss", offset.toFixed(2), "-i", gameplay,
    ...musicInput(music),
    "-filter_complex", sound ? `${video};${sound}` : video,
    "-map", "[v]", ...(sound ? ["-map", "[aout]", "-c:a", "aac", "-b:a", "160k"] : ["-an"]),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    ...(len ? ["-t", len.toFixed(2)] : []),
    // tidy metadata: the video's own title and creation time, without ffmpeg's encoder and handler tags
    "-map_metadata", "-1", "-map_chapters", "-1", "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact",
    "-metadata", `title=${title}`, "-metadata", `creation_time=${new Date().toISOString()}`,
    "-metadata:s:v", "handler_name=VideoHandler", "-metadata:s:a", "handler_name=SoundHandler", "-metadata:s:v", "encoder=", "-metadata:s:a", "encoder=",
    "-movflags", "+faststart",
    out,
  ];
  await new Promise<void>((resolve, reject) => {
    const p = spawn(ffmpegPath!, args, { windowsHide: true });
    g.__ytEditorProc = p;
    let err = "";
    p.stderr.on("data", (c: Buffer) => (err += c.toString()));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.split("\n").filter(Boolean).pop() ?? `ffmpeg keluar dengan kode ${code}`))));
    p.on("error", reject);
  }).finally(() => cleanup(tmp));
  return offset + len;
}

/** Shuffled deck: every clip once before any repeats, a new order each round. */
function deck<T>(items: T[]) {
  let pile: T[] = [];
  return () => {
    if (!pile.length) {
      pile = [...items];
      for (let i = pile.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pile[i], pile[j]] = [pile[j], pile[i]];
      }
    }
    return pile.pop()!;
  };
}

/** Render every original with a gameplay clip (picked in turn from the chosen ones, or at random). */
export async function startRender(c: { originals: string[]; gameplay: string[]; settings: EditorSettings; random: boolean }) {
  if (!ffmpegPath) throw new Error("ffmpeg tidak tersedia di perangkat ini.");
  if (g.__ytEditor?.running) throw new Error("Masih ada video yang sedang dirender, tunggu selesai dulu.");
  const pool = c.gameplay.length ? c.gameplay : listGameplay().map((x) => x.rel);
  if (!pool.length) throw new Error("Belum ada video gameplay. Taruh klip gameplay di folder Gameplay dulu.");
  fs.mkdirSync(OUT(), { recursive: true });
  const job: EditorJob = { total: c.originals.length, done: [], failed: [], current: null, running: true, cancelled: false };
  g.__ytEditor = job;
  const abs = (rel: string) => path.resolve(MEDIA_DIR, rel);
  const draw = deck(pool);
  const cursors = new Map<string, number>(); // "bersambung": where each overlay clip stopped
  void (async () => {
    for (const [i, rel] of c.originals.entries()) {
      if (job.cancelled) break;
      const name = pretty(path.basename(rel));
      job.current = name;
      const game = c.random ? draw() : pool[i % pool.length];
      const stamp = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 19).replace(/[-:T]/g, ""); // WIB wall clock
      const out = path.join(OUT(), `${stamp} ${name.replace(/[<>:"/\\|?*]+/g, "").slice(0, 60)}.mp4`);
      try {
        cursors.set(game, await renderOne(abs(rel), abs(game), c.settings, out, name, await resolveMusic(c.settings.music), cursors.get(game) ?? 0));
        job.done.push({ name, rel: toRel(out) });
        markRendered(rel, toRel(out));
      } catch (e) {
        if (!job.cancelled) job.failed.push(`${name}: ${e instanceof Error ? e.message.slice(0, 160) : e}`);
        fs.rmSync(out, { force: true });
      }
    }
    job.current = null;
    job.running = false;
  })();
  return job;
}

export function cancelRender() {
  if (!g.__ytEditor?.running) return;
  g.__ytEditor.cancelled = true;
  g.__ytEditorProc?.kill();
}
