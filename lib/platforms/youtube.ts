import "server-only";
import type { BrowserContext } from "playwright-core";
import { launchProfile, newProfileKey, withProfile } from "@/lib/browser/chrome";

// YouTube login on its own Chrome profile (one profile per channel, like TikTok). The profile is the stored session:
// later YouTube features (Shorts upload, studio stats, downloads that need a signed-in browser) reuse it.
// ⚠️ A real Google account: keep actions human-paced, one profile per account, one laptop per account.

const LOGIN_URL = `https://accounts.google.com/ServiceLogin?service=youtube&continue=${encodeURIComponent("https://www.youtube.com/signin?action_handle_signin=true&next=%2F")}&hl=id`;
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type YouTubeIdentity = { username: string; channelId: string | null; name: string | null; avatar: string | null; email: string | null };

/** Signed in on youtube.com itself (LOGIN_INFO is set only after the Google → YouTube hand-off). */
async function hasSession(ctx: BrowserContext) {
  const names = new Set((await ctx.cookies("https://www.youtube.com")).filter((c) => c.value).map((c) => c.name));
  return names.has("LOGIN_INFO") && (names.has("SAPISID") || names.has("__Secure-3PAPISID"));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- YouTube's untyped renderer tree
const text = (t: any): string | null => t?.simpleText ?? t?.runs?.map((r: { text: string }) => r.text).join("") ?? null;

/** Which channel is this profile on? YouTube's account switcher (cookies only), the Google email as fallback. */
async function identify(ctx: BrowserContext): Promise<YouTubeIdentity | null> {
  let email: string | null = null;
  try {
    const res = await ctx.request.post("https://accounts.google.com/ListAccounts?gpsia=1&source=ChromiumBrowser&json=standard", { data: "", timeout: 10_000 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Google's untyped array
    const first: any[] = JSON.parse(await res.text())?.[1]?.[0] ?? [];
    email = first.find((v) => typeof v === "string" && /^[^\s@]+@[^\s@]+$/.test(v))?.toLowerCase() ?? null;
  } catch {}
  // inside a youtube.com page: the bare request (no page context) times out
  const page = await ctx.newPage();
  try {
    await page.goto("https://www.youtube.com/", { waitUntil: "domcontentloaded", timeout: 45_000 });
    const body = await page.evaluate(async () => (await fetch("/getAccountSwitcherEndpoint", { credentials: "include" })).text());
    const json = JSON.parse(body.replace(/^\)\]\}'\s*/, ""));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const found: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const walk = (o: any) => {
      if (!o || typeof o !== "object") return;
      if (o.accountItem) found.push(o.accountItem);
      for (const v of Object.values(o)) walk(v);
    };
    walk(json);
    const a = found.find((x) => x.isSelected) ?? found[0];
    if (a) {
      const handle = text(a.channelHandle)?.replace(/^@/, "") ?? null;
      // the switcher carries no channel id; Studio redirects to /channel/UC… of the active channel
      let channelId: string | null = null;
      if (a.hasChannel !== false) {
        await page.goto("https://studio.youtube.com/", { waitUntil: "commit", timeout: 45_000 }).catch(() => {});
        await page.waitForURL(/\/channel\/UC[\w-]{22}/, { timeout: 20_000 }).catch(() => {});
        channelId = page.url().match(/\/channel\/(UC[\w-]{22})/)?.[1] ?? null;
      }
      const name = text(a.accountName);
      return { username: handle ?? email ?? name ?? "youtube", channelId, name, avatar: a.accountPhoto?.thumbnails?.at(-1)?.url ?? null, email };
    }
  } catch {
  } finally {
    await page.close().catch(() => {});
  }
  return email ? { username: email, channelId: null, name: null, avatar: null, email } : null;
}

// ---------- login (long-running, polled by the UI) ----------

type LoginState = { status: "waiting" | "identifying" | "done" | "failed" | "cancelled"; sessionKey: string; result?: YouTubeIdentity; error?: string; ctx?: BrowserContext };
const g = globalThis as unknown as { __ytLogins?: Map<string, LoginState> };
const logins = (g.__ytLogins ??= new Map());

/** Opens a visible Chrome window on the Google → YouTube sign-in. Returns a login id to poll. */
export async function startLogin(sessionKey?: string) {
  const key = sessionKey ?? newProfileKey();
  const id = crypto.randomUUID();
  const state: LoginState = { status: "waiting", sessionKey: key };
  logins.set(id, state);

  const ctx = await launchProfile(key, { headless: false });
  state.ctx = ctx;
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});

  void (async () => {
    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    let closed = false;
    ctx.on("close", () => (closed = true));
    try {
      while (!closed && state.status === "waiting") {
        if (Date.now() > deadline) throw new Error("Waktu login habis (10 menit)");
        if (await hasSession(ctx).catch(() => false)) {
          state.status = "identifying";
          for (let i = 0; i < 10 && !state.result; i++) {
            state.result = (await identify(ctx)) ?? undefined;
            if (!state.result) await sleep(2000);
          }
          if (!state.result) throw new Error("Login terdeteksi, tapi akun YouTube belum bisa dikenali. Coba lagi.");
          state.status = "done";
          break;
        }
        await sleep(1500);
      }
      if (closed && state.status === "waiting") Object.assign(state, { status: "cancelled", error: "Login dibatalkan (jendela ditutup)" });
    } catch (e) {
      Object.assign(state, { status: "failed", error: e instanceof Error ? e.message : String(e) });
    } finally {
      await ctx.close().catch(() => {});
      state.ctx = undefined;
      setTimeout(() => logins.delete(id), 5 * 60 * 1000);
    }
  })();

  return { loginId: id, sessionKey: key };
}

export function getLogin(id: string) {
  const s = logins.get(id);
  return s ? { status: s.status, sessionKey: s.sessionKey, result: s.result, error: s.error } : null;
}

export async function cancelLogin(id: string) {
  await logins.get(id)?.ctx?.close().catch(() => {});
}

/** Headless check: still signed in, and as which channel. */
export async function checkSession(sessionKey: string) {
  return withProfile(sessionKey, { headless: true }, async (ctx) => {
    // visit once so YouTube refreshes its rotating cookies (__Secure-*PSIDTS) before reading them
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto("https://www.youtube.com/", { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => {});
    if (!(await hasSession(ctx))) return { valid: false as const };
    const who = await identify(ctx);
    return who ? { valid: true as const, ...who } : { valid: false as const };
  });
}
