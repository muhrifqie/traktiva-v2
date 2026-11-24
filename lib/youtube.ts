import "server-only";
import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { DATA_DIR } from "@/lib/db";
import { MEDIA_DIR, toRel } from "@/lib/media";

const run = promisify(execFile);

// YouTube Shorts downloader on top of yt-dlp. The binary is fetched once from the official yt-dlp release into
// DATA_DIR/bin (and self-updates when YouTube changes break it); ffmpeg-static merges video + audio into one mp4.
const ASSET = process.platform === "win32" ? "yt-dlp.exe" : process.platform === "darwin" ? "yt-dlp_macos" : "yt-dlp_linux";
const BIN = path.join(/* turbopackIgnore: true */ DATA_DIR, "bin", ASSET);

async function ytdlp() {
  if (fs.existsSync(BIN)) return BIN;
  fs.mkdirSync(path.dirname(BIN), { recursive: true });
  const res = await fetch(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ASSET}`);
  if (!res.ok) throw new Error(`Gagal mengunduh yt-dlp (${res.status}). Cek koneksi internet.`);
  const tmp = `${BIN}.part`;
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  fs.chmodSync(tmp, 0o755);
  fs.renameSync(tmp, BIN);
  return BIN;
}

/** "@handle", "handle", or any channel / shorts URL → the channel's Shorts tab URL. */
export function shortsUrl(input: string) {
  const s = input.trim();
  if (!s) throw new Error("Isi link atau @nama channel YouTube.");
  if (/^[\w.-]+$/.test(s)) return `https://www.youtube.com/@${s}/shorts`;
  if (/^@[\w.-]+$/.test(s)) return `https://www.youtube.com/${s}/shorts`;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//.test(s) ? s : `https://${s}`);
  } catch {
    throw new Error("Link channel tidak dikenali.");
  }
  if (!/(^|\.)youtube\.com$/.test(u.hostname)) throw new Error("Pakai link channel youtube.com (bukan link satu video).");
  const m = u.pathname.match(/^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)/);
  if (!m) throw new Error("Pakai link channel, contoh youtube.com/@namachannel.");
  return `https://www.youtube.com/${m[1]}/shorts`;
}

export type Short = { id: string; title: string; views: number | null; thumb: string | null };
export type ChannelShorts = { url: string; channel: string; handle: string; shorts: Short[]; downloaded: string[]; folder: string };

const folderOf = (handle: string) => path.join(MEDIA_DIR, "YouTube Shorts", handle.replace(/[^\w.@-]+/g, "_"));
const archiveOf = (dir: string) => path.join(dir, ".unduhan.txt");
/** ids already downloaded into this channel's folder (yt-dlp's download archive: "youtube <id>" per line) */
const downloadedIds = (dir: string) =>
  fs.existsSync(archiveOf(dir)) ? fs.readFileSync(archiveOf(dir), "utf8").split("\n").map((l) => l.split(" ")[1]?.trim()).filter(Boolean) : [];

/** Every Short of a channel (flat list: one request, no per-video calls), newest first. */
export async function listChannelShorts(input: string): Promise<ChannelShorts> {
  const url = shortsUrl(input);
  const { stdout } = await run(await ytdlp(), ["--flat-playlist", "-J", "--no-warnings", url], { maxBuffer: 256 * 1024 * 1024, windowsHide: true }).catch((e) => {
    const msg = String(e.stderr || e.message);
    throw new Error(/does not have a shorts tab|This channel does not have/i.test(msg) ? "Channel ini belum punya Shorts." : /404|not exist|Unable to recognize/i.test(msg) ? "Channel tidak ditemukan." : `Gagal membaca channel: ${msg.split("\n").find((l) => l.includes("ERROR")) ?? msg.slice(0, 200)}`);
  });
  const d = JSON.parse(stdout) as { channel?: string; uploader_id?: string; channel_id?: string; entries?: { id: string; title?: string; view_count?: number; thumbnails?: { url: string }[] }[] };
  const handle = d.uploader_id || d.channel_id || "channel";
  const folder = folderOf(handle);
  return {
    url,
    channel: d.channel || handle,
    handle,
    folder: toRel(folder),
    downloaded: downloadedIds(folder),
    shorts: (d.entries ?? []).map((e) => ({ id: e.id, title: e.title ?? e.id, views: e.view_count ?? null, thumb: e.thumbnails?.at(-1)?.url ?? null })),
  };
}

// One download at a time, kept on globalThis so dev hot-reloads and page polls see the same job.
// ponytail: single global job; a queue per channel if users need several channels at once.
export type DownloadJob = { handle: string; total: number; done: string[]; failed: number; current: string | null; running: boolean; error: string | null; folder: string };
const g = globalThis as { __ytJob?: DownloadJob };
export const downloadJob = () => g.__ytJob ?? null;

/** Download the given Shorts (already downloaded ones are skipped) in the background; poll downloadJob(). */
export async function startDownload(c: { handle: string; ids: string[] }) {
  if (g.__ytJob?.running) throw new Error("Masih ada unduhan yang berjalan, tunggu selesai dulu.");
  const dir = folderOf(c.handle);
  fs.mkdirSync(dir, { recursive: true });
  const have = new Set(downloadedIds(dir));
  const ids = c.ids.filter((id) => !have.has(id));
  const job: DownloadJob = { handle: c.handle, total: ids.length, done: [], failed: 0, current: null, running: ids.length > 0, error: null, folder: toRel(dir) };
  g.__ytJob = job;
  if (!ids.length) return job;

  const bin = await ytdlp();
  const args = [
    "-S", "vcodec:h264,res:1080,acodec:m4a", // h264 mp4 plays everywhere and uploads to TikTok as is
    "--merge-output-format", "mp4",
    ...(ffmpegPath ? ["--ffmpeg-location", ffmpegPath] : []),
    "--download-archive", archiveOf(dir),
    "-o", path.join(dir, "%(upload_date)s %(title).70B [%(id)s].%(ext)s"),
    "--no-overwrites", "--ignore-errors", "--no-warnings", "--newline", "--no-progress",
    "--print", "before_dl:START %(id)s",
    "--print", "after_move:DONE %(id)s",
    ...ids.map((id) => `https://www.youtube.com/shorts/${id}`),
  ];
  const p = spawn(bin, args, { windowsHide: true });
  let buf = "";
  p.stdout.on("data", (chunk: Buffer) => {
    buf += chunk.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? "";
    for (const l of lines) {
      const [tag, id] = l.trim().split(" ");
      if (tag === "START") job.current = id;
      if (tag === "DONE") {
        job.done.push(id);
        job.current = null;
      }
    }
  });
  let err = "";
  p.stderr.on("data", (chunk: Buffer) => {
    const s = chunk.toString();
    job.failed += (s.match(/^ERROR/gm) ?? []).length;
    err = s;
  });
  p.on("close", () => {
    job.running = false;
    job.current = null;
    if (!job.done.length && job.total) job.error = err.split("\n").find((l) => l.startsWith("ERROR"))?.slice(0, 200) ?? "Unduhan gagal.";
  });
  p.on("error", (e) => ((job.running = false), (job.error = e.message)));
  return job;
}

/** Update yt-dlp in place (YouTube changes often break older versions). */
export async function updateYtdlp() {
  const { stdout } = await run(await ytdlp(), ["-U"], { windowsHide: true });
  return stdout.trim().split("\n").pop() ?? "";
}
