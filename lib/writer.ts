import "server-only";
import { askChatGPT } from "@/lib/platforms/chatgpt";
import { askGemini } from "@/lib/platforms/gemini";
import { getSettings } from "@/lib/settings";
import { API_PRESETS, askApi, askCli, detectAgents } from "@/lib/writer-agents";

// The "writer" (storyboard prompts, voice-over scripts, AI edits). Pengaturan → Penulis AI picks it: an AI agent on
// this PC (Claude Code, Codex…), an OpenAI-compatible API (Z.AI, Anthropic, Ollama…), or "auto" = ChatGPT web when an
// account is connected. Whatever fails falls back to ChatGPT, then Gemini, so production never stalls.
// Looking at images (product photos, generated frames) stays with Gemini (lib/platforms/gemini.ts).

export type WriterAnswer = { text: string; by: string };

export async function askWriter(geminiSessionKey: string, prompt: string): Promise<WriterAnswer> {
  const { writer: w, chatgpt: gpt } = getSettings();
  if (w?.mode === "cli" && w.cli) {
    const agent = (await detectAgents()).clis.find((a) => a.id === w.cli!.id);
    if (agent) {
      try {
        return { text: await askCli(agent, prompt, w.cli.model), by: agent.name };
      } catch (e) {
        console.warn(`[writer] ${agent.name} failed, falling back:`, e instanceof Error ? e.message : e);
      }
    } else console.warn(`[writer] agent "${w.cli.id}" is no longer installed, falling back`);
  }
  if (w?.mode === "api" && w.api) {
    try {
      return { text: await askApi(w.api, prompt), by: apiName(w.api.preset) };
    } catch (e) {
      console.warn("[writer] API failed, falling back:", e instanceof Error ? e.message : e);
    }
  }
  if (w?.mode !== "gemini" && gpt?.profileKey) {
    try {
      return { text: await askChatGPT(gpt.profileKey, prompt), by: "ChatGPT" };
    } catch (e) {
      console.warn("[writer] ChatGPT failed, falling back to Gemini:", e instanceof Error ? e.message : e);
    }
  }
  return { text: await askGemini(geminiSessionKey, prompt), by: "Gemini" };
}

const apiName = (preset: string) => API_PRESETS.find((p) => p.id === preset)?.name.split(" · ")[0] ?? "API";

/** Who writes now (labels in the UI). */
export function writerName() {
  const { writer: w, chatgpt } = getSettings();
  if (w?.mode === "cli" && w.cli) return w.cli.id === "claude" ? "Claude Code" : w.cli.id === "codex" ? "Codex" : w.cli.id;
  if (w?.mode === "api" && w.api) return `${apiName(w.api.preset)}${w.api.model ? ` · ${w.api.model}` : ""}`;
  if (w?.mode === "gemini") return "Gemini";
  return chatgpt?.profileKey ? "ChatGPT" : "Gemini";
}
