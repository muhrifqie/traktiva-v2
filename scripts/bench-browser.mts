// Dev check: how long Gemini (and ChatGPT when connected) take for 3 tiny questions in one process.
// The first call pays the browser start; later ones show what a warm profile saves.
// Usage: npx tsx --conditions=react-server scripts/bench-browser.mts
import { askGemini } from "@/lib/platforms/gemini";
import { askChatGPT } from "@/lib/platforms/chatgpt";
import { geminiAccount } from "@/lib/prompt-writer";
import { getSettings } from "@/lib/settings";

const g = await geminiAccount();
if (process.argv[2] === "warm") {
  const t0 = Date.now();
  await (await import("@/lib/ai-standby")).warmAiBrowsers();
  console.log(`standby start: ${((Date.now() - t0) / 1000).toFixed(1)} s (done once when the app opens)`);
}
for (let i = 1; i <= 3; i++) {
  const t0 = Date.now();
  const a = await askGemini(g.sessionKey, `Reply ONLY with JSON: {"n":${i}}`).catch((e) => "ERR " + (e as Error).message);
  console.log(`gemini #${i}: ${((Date.now() - t0) / 1000).toFixed(1)} s`, a.slice(0, 40));
}
const gpt = getSettings().chatgpt?.profileKey;
if (gpt) {
  for (let i = 1; i <= 2; i++) {
    const t0 = Date.now();
    const a = await askChatGPT(gpt, `Balas HANYA JSON: {"n":${i}}`).catch((e) => "ERR " + (e as Error).message);
    console.log(`chatgpt #${i}: ${((Date.now() - t0) / 1000).toFixed(1)} s`, a.slice(0, 40));
  }
} else console.log("chatgpt: not connected");
process.exit(0);
