import "server-only";
import type { BrowserContext, Page } from "playwright-core";
import { launchProfile, newProfileKey, profileEngine, withProfile } from "@/lib/browser/camoufox";
import type { BrowserCookie } from "@/lib/flow2api";

// Google account login on its own Camoufox profile (one browser profile per account). That profile is the
// single source of the account's session: Flow cookies (video) now, Gemini cookies (text) later. The
// browser is only used to log in and refresh cookies; all generation goes through APIs.
//
// Login is detected in stages, each backed by a hard signal rather than "some cookie exists":
//   1. google  — Google's ListAccounts returns a signed-in email AND account cookies (SID/SAPISID/1PSID…) exist
//   2. flow    — flow.google.com issued its own session cookie (OSID / __Secure-OSID)
//   3. done    — (caller) flow2api accepts the cookie set and returns the account + credits
// Note: the old Labs next-auth endpoints (labs.google/fx/api/auth/*) answer 410 "deprecated" since late 2026.

const FLOW_URL = "https://flow.google.com/";
const LOGIN_URL = `https://accounts.google.com/ServiceLogin?continue=${encodeURIComponent(FLOW_URL)}&hl=id`;
const LIST_ACCOUNTS_URL = "https://accounts.google.com/ListAccounts?gpsia=1&source=ChromiumBrowser&json=standard";
const ACCOUNT_COOKIES = new Set(["SID", "HSID", "SSID", "APISID", "SAPISID", "__Secure-1PSID", "__Secure-3PSID"]);
const FLOW_COOKIES = new Set(["OSID", "__Secure-OSID"]);
const LEGACY_SESSION_COOKIE = "__Secure-next-auth.session-token";
const COOKIE_URLS = [
  "https://flow.google.com",
  "https://labs.google",
  "https://gemini.google.com",
  "https://accounts.google.com",
  "https://www.google.com",
  "https://google.com",
];
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type FlowSession = { st: string; cookies: BrowserCookie[]; email: string };
export type LoginStage = "google" | "flow";

const allCookies = async (ctx: BrowserContext) => (await ctx.cookies(COOKIE_URLS)) as BrowserCookie[];
const hasAny = (cookies: BrowserCookie[], names: Set<string>, domainRe: RegExp) =>
  cookies.some((c) => names.has(c.name) && !!c.value && domainRe.test(c.domain));

/** Email of the signed-in Google account, straight from Google (null when signed out). */
async function signedInEmail(ctx: BrowserContext): Promise<string | null> {
  try {
    const res = await ctx.request.post(LIST_ACCOUNTS_URL, { data: "", timeout: 10_000 });
    const text = await res.text();
    // Shape: ["gaia.l.a.r",[["gaia.l.a",1,"Name","email@x.com",…,isValid…],…]] — empty list when signed out.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Google's untyped array
    const list: any[] = JSON.parse(text)?.[1] ?? [];
    for (const entry of list) {
      const email = Array.isArray(entry) ? entry.find((v: unknown) => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) : null;
      if (email) return String(email).toLowerCase();
    }
  } catch {}
  return null;
}

type Probe = { stage: LoginStage; email: string | null; session: FlowSession | null };

/** Where is this profile in the login funnel? */
async function probe(ctx: BrowserContext): Promise<Probe> {
  const cookies = await allCookies(ctx);
  const googleCookies = hasAny(cookies, ACCOUNT_COOKIES, /google\.com$/);
  const email = googleCookies ? await signedInEmail(ctx) : null;
  if (!email) return { stage: "google", email: null, session: null };
  if (!hasAny(cookies, FLOW_COOKIES, /flow\.google\.com$/)) return { stage: "flow", email, session: null };
  const st = cookies.find((c) => c.name === LEGACY_SESSION_COOKIE && c.value)?.value ?? "";
  return { stage: "flow", email, session: { st, cookies, email } };
}

/** Once Google is signed in, make sure the page actually lands on Flow so it issues its OSID cookie. */
async function nudgeToFlow(page: Page) {
  if (!/^https:\/\/flow\.google\.com/.test(page.url())) {
    await page.goto(FLOW_URL, { waitUntil: "commit", timeout: 45_000 }).catch(() => {});
  }
}

type LoginState = {
  status: "waiting" | "done" | "failed" | "cancelled";
  stage: LoginStage;
  email: string | null;
  sessionKey: string;
  result?: FlowSession;
  error?: string;
  ctx?: BrowserContext;
};

const g = globalThis as unknown as { __googleLogins?: Map<string, LoginState> };
const logins = (g.__googleLogins ??= new Map());

/** Visible browser window (Camoufox, or Chrome/Edge fallback) straight on Google's sign-in page (continues to Flow). Poll with getGoogleLogin(id). */
export async function startGoogleLogin(sessionKey?: string) {
  const key = sessionKey ?? newProfileKey();
  const id = crypto.randomUUID();
  const state: LoginState = { status: "waiting", stage: "google", email: null, sessionKey: key };
  const ctx = await launchProfile(key, { headless: false });
  logins.set(id, state);
  state.ctx = ctx;
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(LOGIN_URL, { waitUntil: "commit", timeout: 60_000 }).catch(() => {});

  void (async () => {
    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    let closed = false;
    let lastNudge = 0;
    ctx.on("close", () => (closed = true));
    try {
      while (!closed && state.status === "waiting") {
        if (Date.now() > deadline) throw new Error("Waktu login habis (10 menit)");
        if (ctx.pages().length === 0) break;
        const p = await probe(ctx).catch(() => null);
        if (p) {
          state.stage = p.stage;
          state.email = p.email;
          if (p.session) {
            await sleep(2000); // let Google finish rotating cookies before we copy them
            state.result = (await probe(ctx).catch(() => null))?.session ?? p.session;
            state.status = "done";
            break;
          }
          // Signed in to Google but no Flow session yet (user wandered off, or continue= was dropped).
          if (p.stage === "flow" && Date.now() - lastNudge > 15_000) {
            lastNudge = Date.now();
            const current = ctx.pages().find((x) => !x.isClosed());
            if (current) await nudgeToFlow(current);
          }
        }
        await sleep(1500);
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

  return { loginId: id, sessionKey: key, engine: await profileEngine(key) };
}

export function getGoogleLogin(id: string) {
  const s = logins.get(id);
  return s ? { status: s.status, stage: s.stage, email: s.email, sessionKey: s.sessionKey, result: s.result, error: s.error } : null;
}

export async function cancelGoogleLogin(id: string) {
  await logins.get(id)?.ctx?.close().catch(() => {});
}

/**
 * Headless: reopen Flow on the saved profile so Google rotates cookies, then re-check every stage.
 * Returns null when the Google account is no longer signed in (user must log in again).
 */
export async function refreshGoogleSession(sessionKey: string): Promise<FlowSession | null> {
  return withProfile(sessionKey, { headless: true }, async (ctx) => {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(FLOW_URL, { waitUntil: "commit", timeout: 45_000 }).catch(() => {});
    for (let i = 0; i < 14; i++) {
      await sleep(1500);
      const p = await probe(ctx).catch(() => null);
      if (p?.session) return p.session;
      if (p && p.stage === "google" && i >= 4) return null; // definitely signed out
    }
    return null;
  });
}
