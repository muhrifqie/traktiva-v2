import "server-only";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
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

import type { EditorSettings, Fit, Flip } from "@/lib/youtube-editor-config";
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
  return list(OUT()).slice(0, 30).map((f) => ({ rel: toRel(path.join(OUT(), f)), name: f.replace(/\.\w+$/, "") }));
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
function markRendered(source: string, result: string) {
  fs.writeFileSync(RENDERED(), JSON.stringify({ ...listRendered(), [source]: result }));
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

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
    // reaction: one video fills the frame, the other sits small in a corner with a thin white frame
    const main = o.pipMain === "original" ? 0 : 1;
    const small = 1 - main;
    const sw = even((W * Math.min(Math.max(o.pipSize, 20), 50)) / 100);
    const m = Math.round(Math.min(W, H) * 0.035);
    const x = o.pipCorner.endsWith("l") ? `${m}` : `main_w-overlay_w-${m}`;
    const y = o.pipCorner.startsWith("t") ? `${m}` : `main_h-overlay_h-${m}`;
    return (
      `${fit(main, "m", W, H, fitOf(main))};` +
      `${src(small)}scale=${sw}:-2,setsar=1,fps=30,pad=iw+8:ih+8:4:4:color=white[s];` +
      `[m][s]overlay=x=${x}:y=${y}:shortest=1[v]`
    );
  }

  const side = o.layout === "side";
  const r = Math.min(Math.max(o.ratio, 20), 80);
  const a = side ? even((W * r) / 100) : even((H * r) / 100); // the original's share
  const parts: [number, number][] = side ? [[a, H], [W - a, H]] : [[W, a], [W, H - a]];
  const join = `${fit(0, "a", ...parts[0], o.fitOriginal)};${fit(1, "b", ...parts[1], o.fitGame)};[a][b]${side ? "hstack" : "vstack"}=inputs=2:shortest=1`;
  if (!o.seam) return `${join}[v]`;
  // soften the seam: blur a band across it and lay it back on top, so the two videos melt into each other
  const band = even(o.seam);
  const at = Math.max(0, a - band / 2);
  const crop = side ? `crop=${band}:${H}:${at}:0` : `crop=${W}:${band}:0:${at}`;
  const pos = side ? `${at}:0` : `0:${at}`;
  return `${join}[j];[j]split[j1][j2];[j2]${crop},boxblur=${Math.floor(band / 3)}:2:${Math.max(1, Math.floor(band / 4) - 1)}:2[sb];[j1][sb]overlay=${pos}[v]`;
}

/** ffmpeg audio filter → [aout] mixing both sounds at their volumes, or null when nothing is heard. */
export function audioFilter(o: EditorSettings, has: { original: boolean; game: boolean }) {
  const parts: string[] = [];
  if (has.original && o.volOriginal > 0) parts.push(`[0:a]volume=${(o.volOriginal / 100).toFixed(2)}`);
  if (has.game && o.volGame > 0) parts.push(`[1:a]volume=${(o.volGame / 100).toFixed(2)}`);
  if (!parts.length) return null;
  if (parts.length === 1) return `${parts[0]}[aout]`;
  return `${parts[0]}[a0];${parts[1]}[a1];[a0][a1]amix=inputs=2:duration=first:normalize=0[aout]`;
}

/** One still of the result at `at` seconds (gameplay 5 s further in) with these settings: the Editor's live preview. */
export async function renderPreview(original: string, gameplay: string, o: EditorSettings, at = 2) {
  if (!ffmpegPath) throw new Error("ffmpeg tidak tersedia di perangkat ini.");
  const dir = path.join(OUT(), ".preview");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "preview.jpg");
  await run(
    ffmpegPath,
    ["-y", "-hide_banner", "-loglevel", "error", "-ss", at.toFixed(2), "-i", original, "-ss", (at + 5).toFixed(2), "-i", gameplay, "-filter_complex", layoutFilter(o), "-map", "[v]", "-frames:v", "1", "-q:v", "4", out],
    { windowsHide: true },
  );
  return toRel(out);
}

// One render queue at a time, kept on globalThis so page polls and dev reloads see the same job.
export type EditorJob = { total: number; done: { name: string; rel: string }[]; failed: string[]; current: string | null; running: boolean; cancelled: boolean };
const g = globalThis as { __ytEditor?: EditorJob; __ytEditorProc?: ReturnType<typeof spawn> };
export const editorJob = () => g.__ytEditor ?? null;

async function renderOne(original: string, gameplay: string, o: EditorSettings, out: string, title: string) {
  const [a, b] = await Promise.all([probe(original), probe(gameplay)]);
  const len = a.len;
  // start the gameplay somewhere random (it loops), so two renders with the same clip still look different
  const offset = b.len > len + 5 ? Math.random() * (b.len - len - 2) : 0;
  const sound = audioFilter(o, { original: a.audio, game: b.audio });
  const args = [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", original,
    "-stream_loop", "-1", "-ss", offset.toFixed(2), "-i", gameplay,
    "-filter_complex", sound ? `${layoutFilter(o)};${sound}` : layoutFilter(o),
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
  });
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
  void (async () => {
    for (const [i, rel] of c.originals.entries()) {
      if (job.cancelled) break;
      const name = pretty(path.basename(rel));
      job.current = name;
      const game = c.random ? pool[Math.floor(Math.random() * pool.length)] : pool[i % pool.length];
      const stamp = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 19).replace(/[-:T]/g, ""); // WIB wall clock
      const out = path.join(OUT(), `${stamp} ${name.replace(/[<>:"/\\|?*]+/g, "").slice(0, 60)}.mp4`);
      try {
        await renderOne(abs(rel), abs(game), c.settings, out, name);
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
