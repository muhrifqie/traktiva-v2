import "server-only";
import { eq } from "drizzle-orm";
import { standbyProfile, standbyStatus } from "@/lib/browser/camoufox";
import { db } from "@/lib/db";
import { googleAccounts } from "@/lib/db/schema";
import { CHAT_URL } from "@/lib/platforms/chatgpt";
import { GEMINI_URL } from "@/lib/platforms/gemini";
import { getSettings } from "@/lib/settings";

// Keep the AI browsers warm: when the app starts, the Gemini profile (first active Google account) and the ChatGPT
// profile are opened headless and parked on their page, so writing/looking costs only the request (no 5–10 s
// browser start, no full page load). A health check relaunches one that died.
// ponytail: one Gemini profile (the first active Google account); per-account pools if Gemini use grows.

const CHECK_MS = 5 * 60 * 1000;
const g = globalThis as unknown as { __aiStandby?: ReturnType<typeof setInterval> };

async function targets() {
  const out: { key: string; url: string; name: string }[] = [];
  const google = await db.select().from(googleAccounts).where(eq(googleAccounts.status, "active")).get();
  if (google) out.push({ key: google.sessionKey, url: GEMINI_URL, name: "Gemini" });
  const gpt = getSettings().chatgpt?.profileKey;
  if (gpt) out.push({ key: gpt, url: CHAT_URL, name: "ChatGPT" });
  return out;
}

/** Open (or reopen) every AI standby browser. Safe to call any time. */
export async function warmAiBrowsers() {
  for (const t of await targets()) {
    const t0 = Date.now();
    await standbyProfile(t.key, t.url).then(
      () => console.log(`[standby] ${t.name} ready in ${((Date.now() - t0) / 1000).toFixed(1)} s`),
      (e) => console.warn(`[standby] ${t.name} failed:`, e instanceof Error ? e.message : e),
    );
  }
}

/** Called once at server start (instrumentation). */
export function startAiStandby() {
  if (g.__aiStandby) return;
  setTimeout(() => void warmAiBrowsers(), 3000); // after migrations and the first request settle
  g.__aiStandby = setInterval(() => void warmAiBrowsers(), CHECK_MS);
}

export { standbyStatus };
