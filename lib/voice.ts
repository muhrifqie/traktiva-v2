// Voice-over helpers shared by the Studio (client) and the render pipeline (server).

import { spokenNumbers } from "@/lib/angka";

export type VoiceChoice = "flow" | "cartesia" | "off";

/** The spoken line in a motion prompt: Voice says: "..." (straight or curly quotes, any wording before it). */
export const voiceLine = (motion: string) => motion.match(/voice[^"“”.]{0,80}?["“]([^"”]+)["”]/i)?.[1]?.trim() ?? null;

/** Motion prompt without its voice line (what Flow gets when another engine speaks). */
export const withoutVoice = (motion: string) =>
  motion.replace(/(?:\b(?:a|an)\s+)?[\w-]*(?:\s+[\w-]+){0,3}?\s*voice[^"“”.]{0,80}?["“][^"”]+["”]\.?/gi, "").replace(/\s{2,}/g, " ").trim();

/** Text for TTS: numbers, prices ("Rp34.900"), decimals ("4,8") and "%" written out in Indonesian words. */
export const spoken = (t: string) => spokenNumbers(t);

/**
 * Which voice a project uses: its own choice (set in the storyboard) or the app default from Pengaturan AI.
 * Project options keys: voice, voiceId, voiceName, voiceSpeed.
 */
export function projectVoice(
  options: Record<string, string | undefined>,
  defaults: { provider?: string; cartesiaVoiceId?: string; cartesiaVoiceName?: string; speed?: number },
) {
  const choice = (options.voice || (defaults.provider === "cartesia" ? "cartesia" : "flow")) as VoiceChoice;
  return {
    choice,
    voiceId: options.voiceId || defaults.cartesiaVoiceId || null,
    voiceName: options.voiceName || defaults.cartesiaVoiceName || null,
    speed: Number(options.voiceSpeed) || defaults.speed || 1,
  };
}
