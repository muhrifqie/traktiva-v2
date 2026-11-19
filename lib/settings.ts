import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/db";
import type { EditTemplate } from "@/lib/edit";
import { DEFAULT_WRITING, type WritingRules } from "@/lib/writing";

// Small app preferences in DATA_DIR/settings.json (not worth a DB table).

export const SPEEDS = [
  { id: "hemat", parallel: 2, label: "Hemat", hint: "Paling aman untuk 1 akun Google. Ringan di PC." },
  { id: "normal", parallel: 4, label: "Normal", hint: "Seimbang. Cocok untuk 1–2 akun Google." },
  { id: "kencang", parallel: 10, label: "Kencang", hint: "Butuh ±3 akun Google aktif dan RAM 8 GB+." },
  { id: "maksimal", parallel: 50, label: "Maksimal", hint: "Untuk banyak akun Google. PC berat, risiko limit akun lebih tinggi." },
] as const;
export type SpeedId = (typeof SPEEDS)[number]["id"];

export const VOICE_PROVIDERS = ["flow", "cartesia", "elevenlabs"] as const;
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];
type VoiceSettings = {
  provider: VoiceProvider; // who speaks the voice-over: Flow's own audio, Cartesia, or ElevenLabs (soon)
  cartesiaKey?: string; // secret: stays in the local settings file, never sent to the browser
  cartesiaVoiceId?: string;
  cartesiaVoiceName?: string;
  speed?: number; // 0.6–1.5
};
/** ChatGPT web account (its own Chrome profile) used as the writer; null = Gemini writes. */
export type ChatgptSettings = { profileKey: string; email: string | null; connectedAt: number };
type Settings = { speed: SpeedId; showcaseSyncMinutes: number /* 0 = off */; voice: VoiceSettings; editTemplates?: EditTemplate[]; chatgpt?: ChatgptSettings | null; writing?: WritingRules };
const DEFAULTS: Settings = { speed: "normal", showcaseSyncMinutes: 60, voice: { provider: "flow" } };
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

/** Owner's writing rules (CTA, banned words, extra notes) with defaults filled in. */
export const writingRules = (): WritingRules => ({ ...DEFAULT_WRITING, ...getSettings().writing });

/** How many Flow generations may run at the same time. */
export const parallelLimit = () => SPEEDS.find((s) => s.id === getSettings().speed)?.parallel ?? 4;

/**
 * Captcha browsers flow2api should keep: a captcha takes seconds while a generation takes minutes,
 * so one browser serves ~2 running jobs. flow2api caps this at 20.
 */
export const captchaBrowsersFor = (parallel: number) => Math.min(20, Math.max(2, Math.ceil(parallel / 2)));
