// Voice-over helpers shared by the Studio (client) and the render pipeline (server).

import { spokenNumbers } from "@/lib/angka";

export type VoiceChoice = "flow" | "cartesia" | "off";

/** The spoken line in a motion prompt: Voice says: "..." (straight or curly quotes, any wording before it). */
export const voiceLine = (motion: string) => motion.match(/voice[^"“”.]{0,80}?["“]([^"”]+)["”]/i)?.[1]?.trim() ?? null;

/** Motion prompt without its voice line (what Flow gets when another engine speaks). */
export const withoutVoice = (motion: string) =>
  motion.replace(/(?:\b(?:a|an)\s+)?[\w-]*(?:\s+[\w-]+){0,3}?\s*voice[^"“”.]{0,80}?["“][^"”]+["”]\.?/gi, "").replace(/\s{2,}/g, " ").trim();

/** Motion prompt with its spoken line set to `text` (added at the end when it has none). */
export function withVoiceLine(motion: string, text: string) {
  const t = text.replace(/["“”]/g, "'").replace(/\s+/g, " ").trim();
  const m = motion.match(/(voice[^"“”.]{0,80}?)["“][^"”]*["”]/i);
  return m ? motion.replace(m[0], `${m[1]}"${t}"`) : `${motion.trim()} Voice says: "${t}"`;
}

/**
 * The owner's voice-over script cut into `n` consecutive lines, one per scene, word for word: whole sentences where
 * possible, each scene getting about the same number of words.
 */
export function splitScript(script: string, n: number): string[] {
  const text = script.replace(/\s+/g, " ").trim();
  if (n <= 1 || !text) return [text];
  const words = text.split(" ");
  if (words.length <= n) return Array.from({ length: n }, (_, i) => words[i] ?? ""); // a word per scene, the rest silent
  const target = words.length / n;
  // sentence ends (after . ! ?) are preferred cut points
  const out: string[] = [];
  let start = 0;
  for (let k = 1; k < n; k++) {
    const ideal = Math.round(target * k);
    let cut = ideal;
    for (let d = 0; d <= Math.ceil(target / 2); d++) {
      if (ideal - d > start && /[.!?]$/.test(words[ideal - d - 1] ?? "")) { cut = ideal - d; break; }
      if (ideal + d < words.length && /[.!?]$/.test(words[ideal + d - 1] ?? "")) { cut = ideal + d; break; }
    }
    cut = Math.min(Math.max(cut, start + 1), words.length - (n - k));
    out.push(words.slice(start, cut).join(" "));
    start = cut;
  }
  out.push(words.slice(start).join(" "));
  return out;
}

/** Text for TTS: numbers, prices ("Rp34.900"), decimals ("4,8") and "%" written out in Indonesian words. */
export const spoken = (t: string) => spokenNumbers(t);

/**
 * Which voice a project uses: its own choice (set in the storyboard) or the app default from Pengaturan.
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
