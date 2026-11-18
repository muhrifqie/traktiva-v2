import "server-only";
import { withProfile } from "@/lib/browser/camoufox";

// Gemini (gemini.google.com) through a Google account already logged in to a Camoufox profile.
// No API key: the page's own session tokens are read from WIZ_global_data and the chat endpoint is
// called from inside the page, exactly like the Gemini web app does.

const APP = "https://gemini.google.com/app";
const ENDPOINT = "/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate";

/** Ask Gemini one question (fresh chat). Returns the answer text. ~10–25 s incl. browser start. */
export async function askGemini(sessionKey: string, prompt: string): Promise<string> {
  return withProfile(sessionKey, { headless: true }, async (ctx) => {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (/accounts\.google\.com/.test(page.url())) throw new Error("Akun Google ini belum login ke Gemini. Login ulang di Pengaturan AI.");

    // Camoufox runs scripts in an isolated world (page globals are invisible), so read the session
    // tokens from the served HTML instead of window.WIZ_global_data.
    const html = await page.content();
    const tok = (k: string) => html.match(new RegExp(`"${k}":"([^"]+)"`))?.[1] ?? "";
    const wiz = { SNlM0e: tok("SNlM0e"), cfb2h: tok("cfb2h"), FdrFJe: tok("FdrFJe") };
    if (!wiz.SNlM0e) throw new Error("Token Gemini tidak ditemukan (belum login / halaman berubah).");

    const result = await page.evaluate(
      async ({ endpoint, prompt, wiz }) => {
        const at = wiz.SNlM0e;
        const q = new URLSearchParams({ bl: wiz.cfb2h ?? "", "f.sid": wiz.FdrFJe ?? "", hl: "id", _reqid: String(Math.floor(Math.random() * 900000) + 100000), rt: "c" });
        const freq = JSON.stringify([null, JSON.stringify([[prompt, 0, null, null, null, null, 0], ["id"], ["", "", ""]])]);
        const res = await fetch(`${endpoint}?${q}`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "x-same-domain": "1" },
          body: new URLSearchParams({ "f.req": freq, at }).toString(),
          signal: AbortSignal.timeout(120_000), // a stalled stream would otherwise hold the browser profile forever
        });
        return { status: res.status, text: await res.text() };
      },
      { endpoint: ENDPOINT, prompt, wiz },
    );
    if (result.status !== 200) throw new Error(`Gemini menolak permintaan (${result.status}).`);
    const answer = parseAnswer(result.text);
    if (!answer) throw new Error("Gemini tidak memberi jawaban. Coba lagi sebentar.");
    return answer;
  });
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
