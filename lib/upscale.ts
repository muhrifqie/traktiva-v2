import "server-only";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

// 1080p copy for posting. Flow renders 720×1280; TikTok re-compresses every upload and 720p sources come
// out noticeably softer than 1080p ones. The library keeps the lossless 720p original; this makes a
// 1080×1920 version next to it (cached: built once, reused for every account it is posted to).

const run = promisify(execFile);
const TARGET = { w: 1080, h: 1920 };

/** Width × height of a video's first video stream (null when ffmpeg can't tell). */
export async function videoSize(file: string): Promise<{ w: number; h: number } | null> {
  if (!ffmpegPath) return null;
  const err = await run(ffmpegPath, ["-hide_banner", "-i", file], { windowsHide: true }).then(
    () => "",
    (e: { stderr?: string }) => String(e.stderr ?? ""), // ffmpeg -i without output "fails" but prints the info
  );
  const m = err.match(/Video:.*?\s(\d{2,5})x(\d{2,5})[\s,]/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

/**
 * Path of a 1080p (or larger) version of `file`, building it when needed. Videos that are already
 * 1080p+ are returned as they are. Portrait stays portrait (short side → 1080).
 */
export async function ensure1080(file: string, onStage?: (line: string) => void): Promise<{ file: string; upscaled: boolean; from?: string }> {
  const size = await videoSize(file);
  if (!size || Math.min(size.w, size.h) >= TARGET.w) return { file, upscaled: false };
  const out = file.replace(/\.mp4$/i, "") + "-1080p.mp4";
  const [src, cached] = await Promise.all([fs.stat(file), fs.stat(out).catch(() => null)]);
  if (cached && cached.size > 0 && cached.mtimeMs >= src.mtimeMs) return { file: out, upscaled: true, from: `${size.w}x${size.h}` };

  if (!ffmpegPath) throw new Error("ffmpeg tidak tersedia di perangkat ini.");
  onStage?.(`Membuat versi 1080p dari ${size.w}x${size.h}...`);
  const portrait = size.h >= size.w;
  const scale = portrait ? `scale=${TARGET.w}:-2:flags=lanczos` : `scale=-2:${TARGET.w}:flags=lanczos`;
  const tmp = `${out}.tmp.mp4`;
  await run(ffmpegPath, [
    "-y", "-i", file,
    "-map", "0:v:0", "-map", "0:a:0?",
    // Lanczos upscale + a light unsharp so detail survives TikTok's own compression
    "-vf", `${scale},unsharp=5:5:0.5:5:5:0.0`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-c:a", "copy", // audio untouched
    "-map_metadata", "-1", "-map_chapters", "-1",
    "-metadata:s:v:0", "handler_name=VideoHandler",
    "-movflags", "+faststart", tmp,
  ], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  await fs.rename(tmp, out);
  return { file: out, upscaled: true, from: `${size.w}x${size.h}` };
}
