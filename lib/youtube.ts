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
export type ChannelShorts = {
  url: string;
  channel: string;
  handle: string;
  avatar: string | null;
  subscribers: number | null;
  shorts: Short[];
  /** ids already in the folder, per format */
  downloaded: { video: string[]; audio: string[] };
  folder: string;
};

export type DownloadOptions = {
  quality: "best" | "1080" | "720" | "480";
  format: "video" | "audio";
  thumbnail: boolean;
  description: boolean;
};

const ROOT = () => path.join(MEDIA_DIR, "YouTube Shorts");
const folderOf = (handle: string) => path.join(ROOT(), handle.replace(/[^\w.@-]+/g, "_").replace(/^\.+$/, "_")); // "." / ".." never leave the folder
// one archive per format: an id downloaded as video can still be fetched as audio (and the other way round)
const archiveOf = (dir: string, format: DownloadOptions["format"] = "video") => path.join(dir, format === "audio" ? ".unduhan-audio.txt" : ".unduhan.txt");
/** ids already downloaded into this channel's folder (yt-dlp's download archive: "youtube <id>" per line) */
const downloadedIds = (dir: string, format: DownloadOptions["format"] = "video") => {
  const f = archiveOf(dir, format);
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").map((l) => l.split(" ")[1]?.trim()).filter(Boolean) : [];
};

/** Every Short of a channel (flat list: one request, no per-video calls), newest first. */
export async function listChannelShorts(input: string): Promise<ChannelShorts> {
  const url = shortsUrl(input);
  const { stdout } = await run(await ytdlp(), ["--flat-playlist", "-J", "--no-warnings", url], { maxBuffer: 256 * 1024 * 1024, windowsHide: true }).catch((e) => {
    const msg = String(e.stderr || e.message);
    throw new Error(/does not have a shorts tab|This channel does not have/i.test(msg) ? "Channel ini belum punya Shorts." : /404|not exist|Unable to recognize/i.test(msg) ? "Channel tidak ditemukan." : `Gagal membaca channel: ${msg.split("\n").find((l) => l.includes("ERROR")) ?? msg.slice(0, 200)}`);
  });
  const d = JSON.parse(stdout) as {
    channel?: string;
    uploader_id?: string;
    channel_id?: string;
    channel_follower_count?: number;
    thumbnails?: { id?: string; url: string; width?: number; height?: number }[];
    entries?: { id: string; title?: string; view_count?: number; thumbnails?: { url: string }[] }[];
  };
  const handle = d.uploader_id || d.channel_id || "channel";
  const folder = folderOf(handle);
  const avatar = d.thumbnails?.find((t) => t.id === "avatar_uncropped") ?? d.thumbnails?.find((t) => t.width && t.width === t.height);
  return {
    url,
    channel: d.channel || handle,
    handle,
    avatar: avatar?.url ?? null,
    subscribers: d.channel_follower_count ?? null,
    folder: toRel(folder),
    downloaded: { video: downloadedIds(folder, "video"), audio: downloadedIds(folder, "audio") },
    shorts: (d.entries ?? []).map((e) => ({ id: e.id, title: e.title ?? e.id, views: e.view_count ?? null, thumb: e.thumbnails?.at(-1)?.url ?? null })),
  };
}

/** Channels downloaded before (folders under YouTube Shorts), most recent first, for one-click reopen. */
export function downloadHistory() {
  if (!fs.existsSync(ROOT())) return [];
  return fs
    .readdirSync(ROOT(), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const dir = path.join(ROOT(), e.name);
      const files = fs.readdirSync(dir).filter((f) => /\.(mp4|m4a|webm)$/i.test(f));
      return { handle: e.name, files: files.length, at: fs.statSync(dir).mtimeMs };
    })
    .filter((h) => h.files > 0)
    .sort((a, b) => b.at - a.at)
    .slice(0, 12);
}

// The request of the running download is written to DATA_DIR: if the app closes mid-way, the next start offers to
// continue it (the download archive already skips the finished ones).
export type PendingDownload = { handle: string; ids: string[]; options: DownloadOptions };
const PENDING = () => path.join(/* turbopackIgnore: true */ DATA_DIR, "youtube-download.json");
const clearPending = () => fs.rmSync(PENDING(), { force: true });

/** The unfinished download of a previous run (remaining ids only), or null. */
export function pendingDownload(): PendingDownload | null {
  if (g.__ytJob?.running) return null;
  try {
    const p = JSON.parse(fs.readFileSync(PENDING(), "utf8")) as PendingDownload;
    const have = new Set(downloadedIds(folderOf(p.handle), p.options.format));
    const ids = p.ids.filter((id) => !have.has(id));
    if (ids.length) return { ...p, ids };
  } catch {
    return null;
  }
  clearPending();
  return null;
}
export const discardPendingDownload = clearPending;

// One download at a time, kept on globalThis so dev hot-reloads and page polls see the same job.
// ponytail: single global job; a queue per channel if users need several channels at once.
export type DownloadJob = {
  handle: string;
  format: DownloadOptions["format"];
  total: number;
  done: string[];
  failed: number;
  current: string | null;
  percent: number | null; // of the current item
  running: boolean;
  cancelled: boolean;
  error: string | null;
  folder: string;
};
const g = globalThis as { __ytJob?: DownloadJob; __ytProc?: ReturnType<typeof spawn> };
export const downloadJob = () => g.__ytJob ?? null;

/** Download the given Shorts (already downloaded ones are skipped) in the background; poll downloadJob(). */
export async function startDownload(c: { handle: string; ids: string[]; options: DownloadOptions }) {
  if (g.__ytJob?.running) throw new Error("Masih ada unduhan yang berjalan, tunggu selesai atau batalkan dulu.");
  const o = c.options;
  const dir = folderOf(c.handle);
  fs.mkdirSync(dir, { recursive: true });
  const have = new Set(downloadedIds(dir, o.format));
  const ids = c.ids.filter((id) => !have.has(id));
  const job: DownloadJob = { handle: c.handle, format: o.format, total: ids.length, done: [], failed: 0, current: null, percent: null, running: ids.length > 0, cancelled: false, error: null, folder: toRel(dir) };
  g.__ytJob = job;
  if (!ids.length) return job;

  const res = o.quality === "best" ? "" : `,res:${o.quality}`; // res:N = the largest stream up to N
  const args = [
    ...(o.format === "audio"
      ? ["-f", "ba[ext=m4a]/ba", "-x", "--audio-format", "m4a"]
      : ["-S", `vcodec:h264${res},acodec:m4a`, "--merge-output-format", "mp4"]), // h264 mp4 plays everywhere and uploads to TikTok as is
    ...(ffmpegPath ? ["--ffmpeg-location", ffmpegPath] : []),
    ...(o.thumbnail ? ["--write-thumbnail", "--convert-thumbnails", "jpg"] : []),
    ...(o.description ? ["--write-description"] : []),
    "--download-archive", archiveOf(dir, o.format),
    "-o", path.join(dir, "%(upload_date)s %(title).70B [%(id)s].%(ext)s"),
    "--no-overwrites", "--ignore-errors", "--no-warnings", "--newline",
    "--progress", "--progress-template", "download:PROG %(info.id)s %(progress._percent_str)s",
    "--print", "before_dl:START %(id)s",
    "--print", "after_move:DONE %(id)s",
    ...ids.map((id) => `https://www.youtube.com/shorts/${id}`),
  ];
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PENDING(), JSON.stringify({ handle: c.handle, ids, options: o } satisfies PendingDownload));
  const p = spawn(await ytdlp(), args, { windowsHide: true });
  g.__ytProc = p;
  let buf = "";
  p.stdout.on("data", (chunk: Buffer) => {
    buf += chunk.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? "";
    for (const l of lines) {
      const [tag, id, pct] = l.trim().split(/\s+/);
      if (tag === "START") {
        job.current = id;
        job.percent = 0;
      } else if (tag === "PROG" && id === job.current) job.percent = Number.parseFloat(pct) || job.percent;
      else if (tag === "DONE") {
        job.done.push(id);
        job.current = null;
        job.percent = null;
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
    job.percent = null;
    g.__ytProc = undefined;
    clearPending(); // finished or cancelled on purpose: nothing to resume
    if (!job.cancelled && !job.done.length && job.total) job.error = err.split("\n").find((l) => l.startsWith("ERROR"))?.slice(0, 200) ?? "Unduhan gagal.";
  });
  p.on("error", (e) => ((job.running = false), (job.error = e.message)));
  return job;
}

/** Stop the running download (yt-dlp and its ffmpeg child); finished files stay. */
export function cancelDownload() {
  const p = g.__ytProc;
  if (!p?.pid || !g.__ytJob?.running) return;
  g.__ytJob.cancelled = true;
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(p.pid), "/t", "/f"], { windowsHide: true });
  else p.kill("SIGTERM");
}

/** Update yt-dlp in place (YouTube changes often break older versions). */
export async function updateYtdlp() {
  const { stdout } = await run(await ytdlp(), ["-U"], { windowsHide: true });
  return stdout.trim().split("\n").pop() ?? "";
}
