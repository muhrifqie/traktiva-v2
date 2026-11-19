import "server-only";
import { askChatGPT } from "@/lib/platforms/chatgpt";
import { askGemini } from "@/lib/platforms/gemini";
import { getSettings } from "@/lib/settings";

// The "writer" of the ChatGPT + Gemini + Flow combo: ChatGPT writes (storyboard prompts, voice-over scripts, AI
// edits) when an account is connected — it follows instructions and returns JSON more reliably than Gemini's web
// app, which sometimes answers with a canned refusal. Gemini stays the fallback so production never stalls.
// Looking at images (product photos, generated frames) stays with Gemini (lib/platforms/gemini.ts).

export type WriterAnswer = { text: string; by: "chatgpt" | "gemini" };

export async function askWriter(geminiSessionKey: string, prompt: string): Promise<WriterAnswer> {
  const gpt = getSettings().chatgpt;
  if (gpt?.profileKey) {
    try {
      return { text: await askChatGPT(gpt.profileKey, prompt), by: "chatgpt" };
    } catch (e) {
      console.warn("[writer] ChatGPT failed, falling back to Gemini:", e instanceof Error ? e.message : e);
    }
  }
  return { text: await askGemini(geminiSessionKey, prompt), by: "gemini" };
}

/** Is ChatGPT the active writer? (for labels in the UI) */
export const writerName = () => (getSettings().chatgpt?.profileKey ? "ChatGPT" : "Gemini");
