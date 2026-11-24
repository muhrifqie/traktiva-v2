import "server-only";
import type { Page } from "playwright-core";
import { withProfile } from "@/lib/browser/chrome";

// Gemini (gemini.google.com) through a Google account already logged in to a Chrome profile.
// No API key: the page's own session tokens are read from WIZ_global_data and the chat endpoint is
// called from inside the page, exactly like the Gemini web app does.

const APP = "https://gemini.google.com/app";
export const GEMINI_URL = APP;
const ENDPOINT = "/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate";

export type GeminiImage = { name: string; mime: string; base64: string };

/**
 * Ask Gemini one question (fresh chat), optionally with images it should look at. Returns the answer text.
 * ~10–25 s incl. browser start. Images go through Gemini's own upload service (content-push) like the web app.
 */
export async function askGemini(sessionKey: string, prompt: string, images: GeminiImage[] = []): Promise<string> {
  const t0 = Date.now();
  let tLock = 0;
  try {
    return await askGeminiTimed(sessionKey, prompt, images, () => (tLock = Date.now() - t0));
  } finally {
    // timing per question: waiting for the browser profile (other jobs) vs. Gemini answering
    console.log(`[gemini] ${prompt.length} chars${images.length ? ` + ${images.length} img` : ""}: antre ${(tLock / 1000).toFixed(1)} s, total ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}

async function askGeminiTimed(sessionKey: string, prompt: string, images: GeminiImage[], locked: () => void): Promise<string> {
  return withProfile(sessionKey, { headless: true }, async (ctx) => {
    locked();
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    // A standby browser is already on Gemini with fresh session tokens: ask right away, no page load.
    const cached = tokens.get(sessionKey);
    let wiz = cached && Date.now() - cached.at < TOKEN_TTL && page.url().startsWith(APP) ? cached.wiz : await openGemini(page, sessionKey);
    let result = await send(page, prompt, wiz, images);
    if (result.status !== 200 && cached && wiz === cached.wiz) {
      // tokens went stale while parked: reload once and retry
      wiz = await openGemini(page, sessionKey);
      result = await send(page, prompt, wiz, images);
    }
    if (result.status !== 200) throw new Error(`Gemini menolak permintaan (${result.status}).`);
    const answer = parseAnswer(result.text);
    if (!answer) throw new Error("Gemini tidak memberi jawaban. Coba lagi sebentar.");
    return answer;
  });
}

type Wiz = { SNlM0e: string; cfb2h: string; FdrFJe: string };
const TOKEN_TTL = 15 * 60 * 1000;
const gt = globalThis as unknown as { __geminiTokens?: Map<string, { wiz: Wiz; at: number }> };
const tokens = (gt.__geminiTokens ??= new Map());

/** Load the Gemini app and read the session tokens from its HTML (works whatever world page scripts run in).
 * Cached per profile for TOKEN_TTL. */
async function openGemini(page: Page, sessionKey: string): Promise<Wiz> {
  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (/accounts\.google\.com/.test(page.url())) throw new Error("Akun Google ini belum login ke Gemini. Login ulang di Pengaturan.");
  const html = await page.content();
  const tok = (k: string) => html.match(new RegExp(`"${k}":"([^"]+)"`))?.[1] ?? "";
  const wiz = { SNlM0e: tok("SNlM0e"), cfb2h: tok("cfb2h"), FdrFJe: tok("FdrFJe") };
  if (!wiz.SNlM0e) throw new Error("Token Gemini tidak ditemukan (belum login / halaman berubah).");
  tokens.set(sessionKey, { wiz, at: Date.now() });
  return wiz;
}

function send(page: Page, prompt: string, wiz: Wiz, images: GeminiImage[]) {
  return page.evaluate(
      async ({ endpoint, prompt, wiz, images }) => {
        const at = wiz.SNlM0e;
        const q = new URLSearchParams({ bl: wiz.cfb2h ?? "", "f.sid": wiz.FdrFJe ?? "", hl: "id", _reqid: String(Math.floor(Math.random() * 900000) + 100000), rt: "c" });
        // upload each image → an opaque file reference the chat request can point at
        const files: [[string, number], string][] = [];
        for (const img of images) {
          const bytes = Uint8Array.from(atob(img.base64), (c) => c.charCodeAt(0));
          const form = new FormData();
          form.append("file", new Blob([bytes], { type: img.mime }), img.name);
          const up = await fetch("https://content-push.googleapis.com/upload", {
            method: "POST",
            headers: { "Push-ID": "feeds/mcudyrk2a4khkz", "X-Tenant-Id": "bard-storage" },
            body: form,
            signal: AbortSignal.timeout(60_000),
          });
          if (!up.ok) return { status: up.status, text: `upload ${up.status}` };
          files.push([[(await up.text()).trim(), 1], img.name]);
        }
        const first = files.length ? [prompt, 0, null, files, null, null, 0] : [prompt, 0, null, null, null, null, 0];
        const freq = JSON.stringify([null, JSON.stringify([first, ["id"], ["", "", ""]])]);
        const res = await fetch(`${endpoint}?${q}`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "x-same-domain": "1" },
          body: new URLSearchParams({ "f.req": freq, at }).toString(),
          signal: AbortSignal.timeout(120_000), // a stalled stream would otherwise hold the browser profile forever
        });
        return { status: res.status, text: await res.text() };
      },
      { endpoint: ENDPOINT, prompt, wiz, images },
  );
}

/** The stream holds several JSON frames; the answer text sits in the last "wrb.fr" frame at [4][0][1][0]. */
function parseAnswer(raw: string): string | null {
  let best: string | null = null;
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("[")) continue;
    try {
      const frames = JSON.parse(t) as unknown[][];
      for (const f of frames) {
        if (f?.[0] !== "wrb.fr" || typeof f[2] !== "string") continue;
        const inner = JSON.parse(f[2]) as unknown[];
        const cand = (inner?.[4] as unknown[][] | undefined)?.[0]?.[1] as string[] | undefined;
        if (cand?.[0]) best = cand[0];
      }
    } catch {}
  }
  return best;
}

/** Pull the first JSON object/array out of a model answer (handles ```json fences and chatter around it). */
export function extractJson<T>(answer: string): T {
  const fenced = answer.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? answer;
  const start = fenced.search(/[[{]/);
  const end = Math.max(fenced.lastIndexOf("}"), fenced.lastIndexOf("]"));
  if (start < 0 || end < start) throw new Error("Jawaban AI bukan JSON.");
  return JSON.parse(fenced.slice(start, end + 1)) as T;
}
