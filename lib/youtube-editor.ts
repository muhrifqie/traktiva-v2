import "server-only";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { MEDIA_DIR, toRel } from "@/lib/media";

const run = promisify(execFile);

// YouTube → Editor: one vertical Short (1080×1920) from two videos side by side: the original on the left, gameplay
// on the right (or top/bottom). The original's sound only; the gameplay loops from a random point so every render
// differs. Sources: Shorts from the downloader (YouTube Shorts/<channel>/), gameplay clips the user drops into
// Gameplay/. Results go to YouTube Editor/ and show in the Kalender video list later.

const SHORTS = () => path.join(MEDIA_DIR, "YouTube Shorts");
export const GAMEPLAY_DIR = () => path.join(MEDIA_DIR, "Gameplay");
const OUT = () => path.join(MEDIA_DIR, "YouTube Editor");
const VIDEO = /\.(mp4|mov|webm|mkv)$/i;

import type { EditorSettings, Fit } from "@/lib/youtube-editor-config";
export { DEFAULT_SETTINGS, SIZES, type EditorSettings, type Fill, type Fit, type Layout, type Size } from "@/lib/youtube-editor-config";
export type SourceFile = { rel: string; name: string };

const list = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => VIDEO.test(f)).sort().reverse() : []);
const pretty = (f: string) => f.replace(/^\d{8}\s+/, "").replace(/\s*\[[\w-]+\]\.\w+$/, "").replace(/\.\w+$/, "");

/** Downloaded Shorts per channel folder, newest first. */
export function listOriginals(): { channel: string; files: SourceFile[] }[] {
  if (!fs.existsSync(SHORTS())) return [];
  return fs
    .readdirSync(SHORTS(), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ channel: d.name, files: list(path.join(SHORTS(), d.name)).map((f) => ({ rel: toRel(path.join(SHORTS(), d.name, f)), name: pretty(f) })) }))
    .filter((c) => c.files.length);
}

export function listGameplay(): SourceFile[] {
  fs.mkdirSync(GAMEPLAY_DIR(), { recursive: true });
  return list(GAMEPLAY_DIR()).map((f) => ({ rel: toRel(path.join(GAMEPLAY_DIR(), f)), name: f.replace(/\.\w+$/, "") }));
}

export function listResults(): SourceFile[] {
  return list(OUT()).slice(0, 30).map((f) => ({ rel: toRel(path.join(OUT(), f)), name: f.replace(/\.\w+$/, "") }));
}

async function duration(file: string) {
  const r = await run(ffmpegPath!, ["-hide_banner", "-i", file], { windowsHide: true }).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }));
  const m = String(r.stderr).match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** ffmpeg filter: each video fills (or fits into) its part of the frame, original first (left/top), then joined. */
export function layoutFilter(o: EditorSettings) {
  const [W, H] = o.size.split("x").map(Number);
  const side = o.layout === "side";
  const a = side ? even((W * o.ratio) / 100) : even((H * o.ratio) / 100); // the original's share
  const parts: [number, number][] = side ? [[a, H], [W - a, H]] : [[W, a], [W, H - a]];
  const fit = (i: number, tag: string, mode: Fit) => {
    const [w, h] = parts[i];
    const cover = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
    if (mode === "cover") return `[${i}:v]${cover},setsar=1,fps=30[${tag}]`;
    // whole video on a plain color
    if (o.fill !== "blur") return `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=${o.fill},setsar=1,fps=30[${tag}]`;
    // whole video on a blurred, cropped copy of itself
    return (
      `[${i}:v]split[${tag}bg][${tag}fg];[${tag}bg]${cover},boxblur=20:2[${tag}b];` +
      `[${tag}fg]scale=${w}:${h}:force_original_aspect_ratio=decrease[${tag}f];` +
      `[${tag}b][${tag}f]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2,setsar=1,fps=30[${tag}]`
    );
  };
  return `${fit(0, "a", o.fitOriginal)};${fit(1, "b", o.fitGame)};[a][b]${side ? "hstack" : "vstack"}=inputs=2:shortest=1[v]`;
}

/** One still of the result (original at 2 s, gameplay at 5 s) with these settings: the Editor's live preview. */
export async function renderPreview(original: string, gameplay: string, o: EditorSettings) {
  if (!ffmpegPath) throw new Error("ffmpeg tidak tersedia di perangkat ini.");
  const dir = path.join(OUT(), ".preview");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "preview.jpg");
  await run(
    ffmpegPath,
    ["-y", "-hide_banner", "-loglevel", "error", "-ss", "2", "-i", original, "-ss", "5", "-i", gameplay, "-filter_complex", layoutFilter(o), "-map", "[v]", "-frames:v", "1", "-q:v", "4", out],
    { windowsHide: true },
  );
  return toRel(out);
}

// One render queue at a time, kept on globalThis so page polls and dev reloads see the same job.
export type EditorJob = { total: number; done: { name: string; rel: string }[]; failed: string[]; current: string | null; running: boolean; cancelled: boolean };
const g = globalThis as { __ytEditor?: EditorJob; __ytEditorProc?: ReturnType<typeof spawn> };
export const editorJob = () => g.__ytEditor ?? null;

async function renderOne(original: string, gameplay: string, o: EditorSettings, out: string) {
  const len = await duration(original);
  const gameLen = await duration(gameplay);
  // start the gameplay somewhere random (it loops), so two renders with the same clip still look different
  const offset = gameLen > len + 5 ? Math.random() * (gameLen - len - 2) : 0;
  const args = [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", original,
    "-stream_loop", "-1", "-ss", offset.toFixed(2), "-i", gameplay,
    "-filter_complex", layoutFilter(o),
    "-map", "[v]", "-map", "0:a?",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k",
    ...(len ? ["-t", len.toFixed(2)] : []),
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
        await renderOne(abs(rel), abs(game), c.settings, out);
        job.done.push({ name, rel: toRel(out) });
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
