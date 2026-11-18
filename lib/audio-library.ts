import "server-only";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { BUILTIN_SFX, round2, sfxSrc } from "@/lib/edit";
import { probeMedia, resolveMedia, writeMedia } from "@/lib/media";

// Audio library (Pustaka): music the user added once and reuses in every project, plus built-in sound effects.
// Files live in MEDIA_DIR/pustaka/{musik,sfx}; music metadata (duration, tempo, first beat) in pustaka/audio.json.

const run = promisify(execFile);
const MUSIC_DIR = "pustaka/musik";
const META = "pustaka/audio.json";
export type LibraryMusic = { src: string; name: string; dur: number; bpm: number | null; beat: number | null; addedAt: number };

const exists = (rel: string) => fs.stat(resolveMedia(rel)).then(() => true, () => false);

// ponytail: effects are synthesised with ffmpeg expressions (no downloads, no licences); swap for recorded packs later
const SFX_EXPR: Record<(typeof BUILTIN_SFX)[number]["id"], string> = {
  whoosh: "anoisesrc=d=0.5:c=pink:a=0.9,lowpass=f=2500,highpass=f=300,afade=t=in:d=0.3,afade=t=out:st=0.3:d=0.2,volume=0.8",
  pop: "aevalsrc='0.9*sin(2*PI*(500+1800*exp(-40*t))*t)*exp(-28*t)':d=0.18",
  ding: "aevalsrc='0.55*sin(2*PI*1320*t)*exp(-5*t)+0.3*sin(2*PI*2640*t)*exp(-8*t)+0.15*sin(2*PI*3960*t)*exp(-11*t)':d=1",
  click: "aevalsrc='0.8*sin(2*PI*2400*t)*exp(-140*t)':d=0.06",
  rise: "aevalsrc='0.35*sin(2*PI*(180*t+380*t*t))*(t/1.2)':d=1.2,afade=t=out:st=1.05:d=0.15",
  boom: "aevalsrc='0.95*sin(2*PI*(55+140*exp(-9*t))*t)*exp(-3.5*t)':d=0.8",
};

/** Make sure the built-in effects exist on disk (created on first use). */
export async function ensureSfx() {
  if (!ffmpegPath) throw new Error("ffmpeg tidak tersedia di perangkat ini.");
  for (const s of BUILTIN_SFX) {
    const rel = sfxSrc(s.id);
    if (await exists(rel)) continue;
    await fs.mkdir(path.dirname(resolveMedia(rel)), { recursive: true });
    await run(ffmpegPath, ["-y", "-f", "lavfi", "-i", SFX_EXPR[s.id], "-ac", "2", "-ar", "44100", resolveMedia(rel)], { windowsHide: true });
  }
  return BUILTIN_SFX.map((s) => ({ ...s, src: sfxSrc(s.id) }));
}

async function readMeta(): Promise<LibraryMusic[]> {
  try {
    return JSON.parse(await fs.readFile(resolveMedia(META), "utf8")) as LibraryMusic[];
  } catch {
    return [];
  }
}
const writeMeta = (list: LibraryMusic[]) => writeMedia(META, Buffer.from(JSON.stringify(list, null, 2)));

export async function listMusic() {
  const list = await readMeta();
  const alive = (await Promise.all(list.map(async (m) => ((await exists(m.src)) ? m : null)))).filter(Boolean) as LibraryMusic[];
  return alive.sort((a, b) => b.addedAt - a.addedAt);
}

/** Store an uploaded track in the library (tempo detected once, here). */
export async function addMusic(data: Buffer, name: string, ext: string) {
  const slug = name.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "musik";
  const src = await writeMedia(`${MUSIC_DIR}/${slug}-${Date.now().toString(36)}${ext}`, data);
  const { seconds } = await probeMedia(src);
  if (!seconds) throw new Error("File musik tidak bisa dibaca.");
  const tempo = await detectTempo(src).catch(() => ({ bpm: null, beat: null }));
  const item: LibraryMusic = { src, name: name.slice(0, 120), dur: round2(seconds), ...tempo, addedAt: Date.now() };
  await writeMeta([item, ...(await readMeta())]);
  return item;
}

export async function removeMusic(src: string) {
  if (!src.startsWith(`${MUSIC_DIR}/`)) throw new Error("File musik tidak valid.");
  await fs.rm(resolveMedia(src), { force: true });
  await writeMeta((await readMeta()).filter((m) => m.src !== src));
}

/** Copy a library track into the project (so the project folder stays self-contained). */
export async function copyMusicToProject(src: string, folder: string) {
  const m = (await readMeta()).find((x) => x.src === src);
  if (!m) throw new Error("Musik tidak ada di pustaka.");
  const rel = `${folder}/musik/${path.basename(src)}`;
  if (!(await exists(rel))) {
    await fs.mkdir(path.dirname(resolveMedia(rel)), { recursive: true });
    await fs.copyFile(resolveMedia(src), resolveMedia(rel));
  }
  return { ...m, src: rel };
}

/**
 * Tempo + first beat of a track: onset strength (energy rises) → autocorrelation over 70–180 BPM (weighted toward
 * ~120) → beat phase with the strongest pulse. ponytail: good enough for snapping edits to the beat; a real beat
 * tracker (e.g. aubio) if tempo changes mid-song matter.
 */
export async function detectTempo(rel: string): Promise<{ bpm: number | null; beat: number | null }> {
  if (!ffmpegPath) return { bpm: null, beat: null };
  const SR = 11025, HOP = 256, WIN = 512;
  const { stdout } = await run(ffmpegPath, ["-i", resolveMedia(rel), "-t", "90", "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  const buf = stdout as unknown as Buffer;
  const x = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
  const n = Math.floor((x.length - WIN) / HOP);
  if (n < 200) return { bpm: null, beat: null };
  const env = new Float64Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let j = 0; j < WIN; j++) e += x[i * HOP + j] ** 2;
    const l = Math.log(1e-9 + e);
    env[i] = i ? Math.max(0, l - prev) : 0;
    prev = l;
  }
  const mean = env.reduce((a, b) => a + b, 0) / n;
  for (let i = 0; i < n; i++) env[i] -= mean;
  const fps = SR / HOP;
  const ac = (lag: number) => {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += env[i] * env[i + lag];
    return s;
  };
  const lo = Math.floor((fps * 60) / 180), hi = Math.ceil((fps * 60) / 70);
  const score = new Map<number, number>();
  let bestLag = 0, best = 0;
  for (let lag = lo - 1; lag <= hi + 1; lag++) score.set(lag, ac(lag));
  for (let lag = lo; lag <= hi; lag++) {
    const w = Math.exp(-0.5 * (Math.log2((60 * fps) / lag / 120) / 0.9) ** 2);
    if (score.get(lag)! * w > best) {
      best = score.get(lag)! * w;
      bestLag = lag;
    }
  }
  if (!bestLag) return { bpm: null, beat: null };
  // sub-frame period: parabola through the three autocorrelation values around the peak
  const [a0, a1, a2] = [score.get(bestLag - 1)!, score.get(bestLag)!, score.get(bestLag + 1)!];
  const den = a0 - 2 * a1 + a2;
  let raw = bestLag + (den < 0 ? (0.5 * (a0 - a2)) / den : 0);
  // sharper estimate: the peak 4 beats away, measured the same way, divided by 4
  const far = Math.round(raw * 4);
  if (far + 2 < n / 2) {
    let pk = far;
    for (let l = far - 2; l <= far + 2; l++) if (ac(l) > ac(pk)) pk = l;
    const [b0, b1, b2] = [ac(pk - 1), ac(pk), ac(pk + 1)];
    const d4 = b0 - 2 * b1 + b2;
    raw = (pk + (d4 < 0 ? (0.5 * (b0 - b2)) / d4 : 0)) / 4;
  }
  // most music sits on a whole BPM: snapping to it keeps the beat grid from drifting over a long track
  const whole = Math.round((60 * fps) / raw);
  const period = Math.abs((60 * fps) / raw - whole) < 1 ? (60 * fps) / whole : raw;
  // phase: the offset whose pulse train (fractional period) lands on the strongest onsets
  let phase = 0, top = -Infinity;
  for (let ph = 0; ph < period; ph += 0.25) {
    let s = 0;
    for (let t = ph; t < n - 1; t += period) {
      const i = Math.floor(t), f = t - i;
      s += env[i] * (1 - f) + env[i + 1] * f;
    }
    if (s > top) {
      top = s;
      phase = ph;
    }
  }
  return { bpm: round2((60 * fps) / period), beat: round2((phase * HOP + WIN) / SR) }; // an onset shows once the window has passed it
}
