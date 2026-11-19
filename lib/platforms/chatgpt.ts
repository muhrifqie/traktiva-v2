import "server-only";
import type { BrowserContext, Page } from "playwright-core";
import { launchProfile, newProfileKey, withProfile } from "@/lib/browser/chrome";

// ChatGPT (chatgpt.com) through an account signed in to its own Chrome profile — the writer in the
// ChatGPT + Gemini + Flow combo (Gemini looks, ChatGPT writes, Flow generates). No API key: the page is driven like
// a person would (type, send, read the answer). The internal backend API is avoided on purpose: it needs rotating
// anti-bot tokens. Owner's own account; automation is against OpenAI's terms and may get it limited.

const APP = "https://chatgpt.com/";
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Signed-in email of the profile, or null (reads the page's own session endpoint). */
async function sessionEmail(page: Page): Promise<string | null> {
  return page
    .evaluate(async () => {
      const r = await fetch("/api/auth/session", { credentials: "include" });
      if (!r.ok) return null;
      const j = (await r.json().catch(() => ({}))) as { user?: { email?: string } };
      return j.user?.email ?? null;
    })
    .catch(() => null);
}

type LoginState = { status: "waiting" | "done" | "failed" | "cancelled"; email: string | null; profileKey: string; error?: string; ctx?: BrowserContext };
const g = globalThis as unknown as { __chatgptLogins?: Map<string, LoginState> };
const logins = (g.__chatgptLogins ??= new Map());

/** Visible Chrome window on chatgpt.com: the owner signs in (any method). Poll with getChatgptLogin(id). */
export async function startChatgptLogin(profileKey?: string) {
  const key = profileKey ?? newProfileKey();
  const id = crypto.randomUUID();
  const state: LoginState = { status: "waiting", email: null, profileKey: key };
  logins.set(id, state);
  const ctx = await launchProfile(key, { headless: false });
  state.ctx = ctx;
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(`${APP}auth/login`, { waitUntil: "commit", timeout: 60_000 }).catch(() => {});

  void (async () => {
    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    let closed = false;
    ctx.on("close", () => (closed = true));
    try {
      while (!closed && state.status === "waiting") {
        if (Date.now() > deadline) throw new Error("Waktu login habis (10 menit)");
        const current = ctx.pages().find((x) => !x.isClosed());
        if (!current) break;
        if (/chatgpt\.com/.test(current.url())) {
          const email = await sessionEmail(current);
          if (email) {
            state.email = email;
            await sleep(1500); // let the session cookies settle before the profile is closed
            state.status = "done";
            break;
          }
        }
        await sleep(2000);
      }
      if (state.status === "waiting") {
        state.status = "cancelled";
        state.error = "Login dibatalkan (jendela ditutup)";
      }
    } catch (e) {
      state.status = "failed";
      state.error = e instanceof Error ? e.message : String(e);
    } finally {
      await ctx.close().catch(() => {});
      state.ctx = undefined;
      setTimeout(() => logins.delete(id), 5 * 60 * 1000);
    }
  })();
  return { loginId: id, profileKey: key };
}

export function getChatgptLogin(id: string) {
  const s = logins.get(id);
  return s ? { status: s.status, email: s.email, profileKey: s.profileKey, error: s.error } : null;
}

export async function cancelChatgptLogin(id: string) {
  await logins.get(id)?.ctx?.close().catch(() => {});
}

/**
 * Ask ChatGPT one question in a temporary chat (not saved to the owner's history) and return the answer text.
 * When the answer is a code block (JSON), its raw code is returned. ~20–60 s incl. browser start.
 */
export async function askChatGPT(profileKey: string, prompt: string, timeoutMs = 240_000): Promise<string> {
  return withProfile(profileKey, { headless: true }, async (ctx) => {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(CHAT_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    // the composer: ProseMirror editor (older UI: #prompt-textarea); UI language varies (Kirim / Send)
    const box = page.locator(EDITOR).first();
    await box.waitFor({ state: "attached", timeout: 45_000 }).catch(async () => {
      const title = await page.title().catch(() => "");
      throw new Error(/moment|verify|cloudflare|just a/i.test(title) ? "ChatGPT minta verifikasi browser. Login ulang ChatGPT di Pengaturan AI." : "Halaman ChatGPT tidak siap (belum login?). Hubungkan ulang di Pengaturan AI.");
    });
    await dismissDialogs(page);
    const before = await page.locator(ASSISTANT).count();
    await box.click({ timeout: 10_000 }).catch(() => box.focus());
    await box.fill(prompt);
    await sleep(300);
    // Enter sends from the editor; the button is only a fallback (a hidden "Kirim" can match first)
    await box.press("Enter");
    await sleep(800);
    if (!(await page.locator(STOP).count()) && (await page.locator(ASSISTANT).count()) <= before) {
      const send = page.locator(SEND).filter({ visible: true }).first();
      await send.click({ timeout: 5000 }).catch(() => {});
    }

    // done = a new assistant message exists, no stop button, and its text stopped changing
    const deadline = Date.now() + timeoutMs;
    let last = "";
    let stable = 0;
    while (Date.now() < deadline) {
      await sleep(500);
      const msgs = page.locator(ASSISTANT);
      if ((await msgs.count()) <= before) continue;
      const generating = await page.locator(STOP).count();
      const { text, complete } = await msgs.last().evaluate((el) => {
        const code = el.querySelector("pre code");
        return {
          text: (code?.textContent ?? (el as HTMLElement).innerText ?? "").trim(),
          // the turn is marked complete when the answer has fully streamed (2026 UI)
          complete: el.closest("[data-talvt-turn-state]")?.getAttribute("data-talvt-turn-state") === "complete",
        };
      });
      if (!generating && text && complete) return text;
      if (!generating && text && text === last) {
        if (++stable >= 2) return text;
      } else stable = 0;
      last = text;
    }
    if (last) return last;
    throw new Error("ChatGPT tidak menjawab dalam batas waktu.");
  });
}

export const CHAT_URL = `${APP}?temporary-chat=true`;
const EDITOR = 'div.ProseMirror[contenteditable="true"], #prompt-textarea, [contenteditable="true"][role="textbox"]';
const SEND = 'button[data-testid="send-button"], #composer-submit-button, button[aria-label="Kirim"], button[aria-label="Send prompt"], button[aria-label="Send"]';
const STOP = 'button[data-testid="stop-button"], button[aria-label*="Hentikan"], button[aria-label*="Stop"]';
// 2026 UI: the answer renders in a markdown root tagged assistant-message (older UI: data-message-author-role)
const ASSISTANT = '[data-markdown-text-style="assistant-message"], [data-message-author-role="assistant"]';

/** Close one-off dialogs that cover the composer ("Obrolan sementara → Lanjutkan", "Okay, let's go", etc.). */
async function dismissDialogs(page: Page) {
  for (const name of [/^Lanjutkan$/i, /^Continue$/i, /^Oke/i, /^Okay/i, /^Mengerti/i, /^Got it/i]) {
    const b = page.getByRole("button", { name }).first();
    if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
  }
}
