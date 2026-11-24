import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DATA_DIR } from "@/lib/db";
import { remoteFlag } from "@/lib/server-info";
import type { EditTemplate } from "@/lib/edit";
import { DEFAULT_WRITING, type WritingRules } from "@/lib/writing";

// Small app preferences in DATA_DIR/settings.json (not worth a DB table).

export const VOICE_PROVIDERS = ["flow", "cartesia"] as const;
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];
type VoiceSettings = {
  provider: VoiceProvider; // who speaks the voice-over: Flow's own audio (default) or Cartesia
  cartesiaKey?: string; // secret: stays in the local settings file, never sent to the browser
  cartesiaVoiceId?: string;
  cartesiaVoiceName?: string;
  speed?: number; // 0.6–1.5
};
/** A concept the owner made with "+ Buat konsep sendiri" (Buat Video Reels); runs on the free-form preset. */
export type MyConcept = {
  id: string; name: string; idea: string; scenes: number; background: string; audio: "on" | "off"; createdAt: number;
  // added later (older concepts don't have them): who is on screen, mood, voice, opening hook
  cast?: string; mood?: string; voice?: string; hook?: string;
};
/** ChatGPT web account (its own Chrome profile) used as the writer; null = Gemini writes. */
export type ChatgptSettings = { profileKey: string; email: string | null; connectedAt: number };
/**
 * Defaults for every YouTube upload (menu YouTube → Pengaturan upload), filled into the Kalender form.
 * Templates take {judul} (video/project name) and {produk} (product name).
 */
export type YouTubeUploadDefaults = {
  title: string;
  description: string;
  tags: string; // comma separated
  visibility: "public" | "unlisted" | "private";
  madeForKids: boolean;
  aiContent: boolean; // "altered or synthetic content": realistic AI video must say yes
};
export const YOUTUBE_UPLOAD_DEFAULTS: YouTubeUploadDefaults = {
  title: "{judul} #shorts",
  description: "{judul}\n\n#shorts",
  tags: "shorts",
  visibility: "public",
  madeForKids: false,
  aiContent: true,
};
type Settings = { activeAccountId?: number | null /* social account shown in the sidebar */; myConcepts?: MyConcept[]; voice: VoiceSettings; editTemplates?: EditTemplate[]; chatgpt?: ChatgptSettings | null; writing?: WritingRules; youtubeUpload?: Partial<YouTubeUploadDefaults> };
const DEFAULTS: Settings = { voice: { provider: "flow" } };
const FILE = path.join(/* turbopackIgnore: true */ DATA_DIR, "settings.json");

const g = globalThis as unknown as { __settings?: Settings; __settingsMtime?: number; __activeGoogle?: number };

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

export const youtubeUploadDefaults = (): YouTubeUploadDefaults => ({ ...YOUTUBE_UPLOAD_DEFAULTS, ...getSettings().youtubeUpload });

/** Owner's writing rules (CTA, banned words, extra notes) with defaults filled in. */
export const writingRules = (): WritingRules => ({ ...DEFAULT_WRITING, ...getSettings().writing });

// ---------------------------------------------------------------- generation speed (automatic)
// No user setting: the limit follows this PC's hardware, capped by how many Google accounts can share the load
// (Flow rate limits are per account, so a strong PC with one account still runs gently).

/** What this PC can carry: RAM decides (each pair of jobs keeps a captcha browser open), a weak CPU caps it. */
function hardwareLimit() {
  const ramGb = os.totalmem() / 2 ** 30; // an "8 GB" laptop reports ~7.4, a "16 GB" one ~15.2
  if (ramGb < 6 || os.cpus().length < 4) return 2;
  if (ramGb < 12) return 4;
  if (ramGb < 24) return 10;
  return 20;
}

/** What the active Google accounts can carry without hitting Flow limits (unknown yet = treat as one account). */
function accountLimit(active = g.__activeGoogle ?? 1) {
  if (active < 3) return 4;
  if (active < 10) return 10;
  return Infinity;
}

/** Called whenever the number of active Google accounts is read, so the limit follows logins/removals. */
export function noteActiveGoogleAccounts(n: number) {
  g.__activeGoogle = n;
}

/**
 * How many Flow generations may run at the same time. Flow slots: automatic from the PC (RAM/CPU) and the active Google accounts, then capped by the admin's remote
 * flag `maxParallel` (license panel → Setelan app) when it is set.
 */
export const parallelLimit = () => {
  const auto = Math.max(2, Math.min(hardwareLimit(), accountLimit()));
  const cap = remoteFlag("maxParallel", 0);
  return cap > 0 ? Math.min(auto, cap) : auto;
};

/**
 * Captcha browsers flow2api should keep (each is a window on the desktop): a captcha takes seconds while a
 * generation takes minutes, so one browser serves up to ~4 running jobs; a normal laptop keeps just one.
 * flow2api caps this at 20.
 */
export const captchaBrowsersFor = (parallel: number) =>
  // 4+ jobs share the browsers: keep a second one, so one stuck captcha window does not hold every job
  Math.min(20, Math.max(parallel >= 4 ? 2 : 1, Math.ceil(parallel / 4)));

/** The account a page shows: the one in the URL (?akun=<id>), else the first logged-in one, else any. */
export function pickActive<T extends { id: number; status: string }>(list: T[], wanted?: string | string[] | null): T | null {
  const id = Number(Array.isArray(wanted) ? wanted[0] : wanted);
  return list.find((a) => a.id === id) ?? list.find((a) => a.status === "active") ?? list[0] ?? null;
}
