import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DATA_DIR } from "@/lib/db";

// Small app preferences in DATA_DIR/settings.json (not worth a DB table).

export const VOICE_PROVIDERS = ["flow", "cartesia", "elevenlabs"] as const;
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];
type VoiceSettings = {
  provider: VoiceProvider; // who speaks the voice-over: Flow's own audio, Cartesia, or ElevenLabs (soon)
  cartesiaKey?: string; // secret: stays in the local settings file, never sent to the browser
  cartesiaVoiceId?: string;
  cartesiaVoiceName?: string;
  speed?: number; // 0.6–1.5
};
/** How Flow images/videos are made: flow2api's API, the account's own browser, or API with browser fallback. */
export const FLOW_ENGINES = ["auto", "api", "browser"] as const;
export type FlowEngine = (typeof FLOW_ENGINES)[number];
type Settings = {
  videoWorkers?: number; // batch: how many finished videos are made at the same time (last choice)
  flowEngine?: FlowEngine;
  showcaseSyncMinutes: number /* 0 = off */;
  voice: VoiceSettings;
};
const DEFAULTS: Settings = { showcaseSyncMinutes: 60, voice: { provider: "flow" } };
export const SYNC_CHOICES = [0, 15, 30, 60, 180, 360] as const;
const FILE = path.join(/* turbopackIgnore: true */ DATA_DIR, "settings.json");

const g = globalThis as unknown as { __settings?: Settings; __settingsMtime?: number };

/** Cached, but re-read when the file changed (another process/script, or a manual edit). */
export function getSettings(): Settings {
  let mtime = 0;
  try {
    mtime = fs.statSync(FILE).mtimeMs;
  } catch {}
  if (!g.__settings || mtime !== g.__settingsMtime) {
    try {
      const saved = JSON.parse(fs.readFileSync(FILE, "utf8")) as Partial<Settings>;
      g.__settings = { ...DEFAULTS, ...saved, voice: { ...DEFAULTS.voice, ...saved.voice } };
    } catch {
      g.__settings = { ...DEFAULTS };
    }
    g.__settingsMtime = mtime;
  }
  return g.__settings!;
}

export function updateSettings(patch: Partial<Settings>) {
  const next = { ...getSettings(), ...patch };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  g.__settings = next;
  g.__settingsMtime = fs.statSync(FILE).mtimeMs;
  return next;
}

/** Batch: at most this many videos are made at the same time (1 worker = 1 finished video). */
export const MAX_VIDEO_WORKERS = 10;

// ---------- how many Flow generations run at once: automatic, per device ----------
// No setting to pick: the limit follows this PC (RAM/CPU: each running job keeps captcha browsers and
// downloads busy) and the number of active Google Flow accounts (more jobs per account = limits/captcha).

const PER_ACCOUNT = 4; // jobs per active Flow account that stay clear of rate limits
const MAX_PARALLEL = 20; // flow2api caps its captcha browser pool at 20
const ga = globalThis as unknown as { __flowAccounts?: number };

/** Kept current by the slot queue and the status poll (lib/video, app/api/status). */
export const setActiveFlowAccounts = (n: number) => void (ga.__flowAccounts = n);
export const activeFlowAccounts = () => ga.__flowAccounts ?? 1;

/** What this PC can carry: ~1 job per GB of RAM above 4 GB for the OS and apps, never more than CPU threads. */
export function deviceCapacity() {
  const ramGb = os.totalmem() / 2 ** 30;
  const cores = os.cpus().length || 2;
  return { ramGb, cores, jobs: Math.max(2, Math.min(MAX_PARALLEL, Math.floor(ramGb - 4), cores)) };
}

/**
 * How many different videos one product may get in one go on this device (Gaya "Jumlah video", batch
 * "Video per produk"): the variants of a product are made at the same time, so a PC that can only run 2
 * jobs at once is offered 2. Capped at 4 (the number of variants that exist).
 */
export const maxVideosPerProduct = () => Math.max(1, Math.min(4, parallelLimit()));

/** How many Flow generations (scene images/clips, across all videos) may run at the same time. */
export const parallelLimit = () => Math.max(2, Math.min(deviceCapacity().jobs, PER_ACCOUNT * Math.max(1, activeFlowAccounts())));

export const flowEngine = (): FlowEngine => getSettings().flowEngine ?? "auto";

/**
 * Captcha browsers flow2api should keep: a captcha takes seconds while a generation takes minutes,
 * so one browser serves ~2 running jobs. flow2api caps this at 20.
 */
export const captchaBrowsersFor = (parallel: number) => Math.min(20, Math.max(2, Math.ceil(parallel / 2)));
