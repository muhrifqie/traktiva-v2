import "server-only";
import type { BrowserContext } from "playwright-core";
import { deleteProfile, launchProfile, newProfileKey, withProfile } from "@/lib/browser/chrome";

// Instagram and Facebook login on their own Chrome profile (one profile per account, like TikTok/YouTube). The
// profile is the stored session: later features (Reels upload, insights) reuse it.
// ⚠️ Real Meta accounts are quick to flag automation: one profile per account, one laptop per account, human pace.
// A checkpoint / "confirm it's you" screen is left to the user in the visible window; nothing here tries to pass it.
// While the user is in such a flow nothing here navigates or opens pages (that restarts Instagram's auth_platform
// flow in a loop): the account is read with background requests on the same cookies (like the Social Media
// Uploader bot, which only watches the session cookie and the login wall).

export type MetaPlatform = "instagram" | "facebook";
export type MetaIdentity = { username: string; uid: string; name: string | null; avatar: string | null };

const IG_APP_ID = "936619743392459"; // instagram.com web app id (public, sent by the site itself)
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Pages where the user is still signing in / proving it's them: never interrupt them. */
const IN_FLOW = /\/(accounts\/login|login|auth_platform|challenge|checkpoint|two_factor|two_step_verification|recover|confirmemail|suspended|consent)(\/|\?|$)|login\.php/i;

const SITE: Record<MetaPlatform, { home: string; login: string; cookies: string[]; uidCookie: string; label: string }> = {
  instagram: { home: "https://www.instagram.com/", login: "https://www.instagram.com/accounts/login/", cookies: ["sessionid", "ds_user_id"], uidCookie: "ds_user_id", label: "Instagram" },
  facebook: { home: "https://www.facebook.com/", login: "https://www.facebook.com/login/", cookies: ["c_user", "xs"], uidCookie: "c_user", label: "Facebook" },
};

/** Signed in = the site's session cookies are set; returns the user id they carry. */
async function sessionUid(ctx: BrowserContext, p: MetaPlatform) {
  const jar = (await ctx.cookies(SITE[p].home)).filter((c) => c.value);
  const names = new Set(jar.map((c) => c.name));
  return SITE[p].cookies.every((n) => names.has(n)) ? (jar.find((c) => c.name === SITE[p].uidCookie)?.value ?? null) : null;
}

/** Instagram: the web app's own user-info call, as a background request on the profile's cookies (no page). */
async function identifyInstagram(ctx: BrowserContext, uid: string): Promise<MetaIdentity | null> {
  const csrf = (await ctx.cookies(SITE.instagram.home)).find((c) => c.name === "csrftoken")?.value ?? "";
  const headers = { "X-IG-App-ID": IG_APP_ID, "X-CSRFToken": csrf, "X-Requested-With": "XMLHttpRequest", Referer: SITE.instagram.home };
  for (const url of [`https://www.instagram.com/api/v1/users/${uid}/info/`, "https://www.instagram.com/api/v1/accounts/current_user/?edit=true"]) {
    const res = await ctx.request.get(url, { headers, timeout: 20_000, maxRedirects: 0 }).catch(() => null);
    const u = res?.ok() ? ((await res.json().catch(() => null)) as { user?: Record<string, unknown> } | null)?.user : null;
    if (u?.username) {
      const hd = u.hd_profile_pic_url_info as { url?: string } | undefined;
      return { username: String(u.username), uid: String(u.pk ?? u.pk_id ?? uid), name: (u.full_name as string) || null, avatar: hd?.url ?? (u.profile_pic_url as string) ?? null };
    }
  }
  return null;
}

/** Facebook: the user's profile page fetched in the background (title = name, final URL = vanity name). */
async function identifyFacebook(ctx: BrowserContext, uid: string): Promise<MetaIdentity | null> {
  const res = await ctx.request.get(`https://www.facebook.com/profile.php?id=${uid}`, { timeout: 25_000 }).catch(() => null);
  if (!res?.ok()) return null;
  const html = await res.text();
  if (IN_FLOW.test(new URL(res.url()).pathname)) return null;
  const vanity = res.url().match(/facebook\.com\/(?!profile\.php)([\w.]+)\/?(?:$|\?)/)?.[1] ?? null;
  const decode = (t: string) => t.replace(/&amp;/g, "&").replace(/&#039;|&#x27;/g, "'").replace(/&quot;/g, '"');
  const title = decode(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "").replace(/^\(\d+\+?\)\s*/, "").replace(/\s*\|\s*Facebook\s*$/i, "").trim();
  return { username: vanity ?? uid, uid, name: title && title.toLowerCase() !== "facebook" ? title : null, avatar: null };
}

/** Who is signed in. Without a readable profile the session's own user id is enough (filled in on the next check). */
async function identify(ctx: BrowserContext, p: MetaPlatform): Promise<MetaIdentity | null> {
  const uid = await sessionUid(ctx, p);
  if (!uid) return null;
  const who = await (p === "instagram" ? identifyInstagram(ctx, uid) : identifyFacebook(ctx, uid)).catch(() => null);
  return who ?? { username: uid, uid, name: null, avatar: null };
}

// ---------- login (long-running, polled by the UI) ----------

type LoginState = { platform: MetaPlatform; status: "waiting" | "identifying" | "done" | "failed" | "cancelled"; sessionKey: string; result?: MetaIdentity; error?: string; ctx?: BrowserContext };
const g = globalThis as unknown as { __metaLogins?: Map<string, LoginState> };
const logins = (g.__metaLogins ??= new Map());

/** Opens a visible Chrome window on the Instagram / Facebook login. Returns a login id to poll. */
export async function startLogin(platform: MetaPlatform, sessionKey?: string) {
  const key = sessionKey ?? newProfileKey();
  const id = crypto.randomUUID();
  const state: LoginState = { platform, status: "waiting", sessionKey: key };
  logins.set(id, state);

  const ctx = await launchProfile(key, { headless: false });
  state.ctx = ctx;
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  // already signed in on this profile (re-login of a live session): straight to identifying
  await page.goto((await sessionUid(ctx, platform)) ? SITE[platform].home : SITE[platform].login, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});

  void (async () => {
    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    let closed = false;
    ctx.on("close", () => (closed = true));
    let lastLog = 0;
    let stable = 0; // signed in and out of any flow, checks in a row
    try {
      while (!closed && state.status === "waiting") {
        if (Date.now() > deadline) throw new Error("Waktu login habis (10 menit)");
        // still signing in / on a security check in any tab: wait for the user to finish it
        if (Date.now() - lastLog > 10_000) {
          lastLog = Date.now();
          const names = (await ctx.cookies(SITE[platform].home).catch(() => [])).map((c) => c.name).join(",");
          console.log(`[${platform} login] ${ctx.pages().map((p) => p.url().split("?")[0]).join(" | ")} · cookies: ${names}`); // names only, never values (debug, remove once stable)
        }
        const inFlow = ctx.pages().some((p) => IN_FLOW.test(new URL(p.url() || "about:blank", "https://x").pathname + new URL(p.url() || "about:blank", "https://x").search));
        const uid = inFlow ? null : await sessionUid(ctx, platform).catch(() => null);
        stable = uid ? stable + 1 : 0;
        if (stable >= 2) {
          state.status = "identifying";
          state.result = (await identify(ctx, platform)) ?? undefined;
          if (!state.result) throw new Error(`Login terdeteksi, tapi akun ${SITE[platform].label} belum bisa dikenali. Coba lagi.`);
          state.status = "done";
          break;
        }
        await sleep(1500);
      }
      if (closed && state.status === "waiting") Object.assign(state, { status: "cancelled", error: "Login dibatalkan (jendela ditutup)" });
    } catch (e) {
      Object.assign(state, { status: "failed", error: e instanceof Error ? e.message : String(e) });
    } finally {
      console.log(`[${platform} login] ${state.status}${state.error ? `: ${state.error}` : ""}${state.result ? ` as ${state.result.username}` : ""}`);
      await ctx.close().catch(() => {});
      state.ctx = undefined;
      // a new profile that never became an account: remove it (a re-login keeps the account's own profile)
      if (!sessionKey && state.status !== "done") await deleteProfile(key).catch(() => {});
      setTimeout(() => logins.delete(id), 5 * 60 * 1000);
    }
  })();

  return { loginId: id, sessionKey: key };
}

export function getLogin(id: string) {
  const s = logins.get(id);
  return s ? { platform: s.platform, status: s.status, sessionKey: s.sessionKey, result: s.result, error: s.error } : null;
}

export async function cancelLogin(id: string) {
  await logins.get(id)?.ctx?.close().catch(() => {});
}

/** Headless check: still signed in, and as whom. A checkpoint page counts as signed out (needs the user). */
export async function checkSession(platform: MetaPlatform, sessionKey: string) {
  return withProfile(sessionKey, { headless: true }, async (ctx) => {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(SITE[platform].home, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => {});
    await sleep(3000);
    const path = new URL(page.url()).pathname;
    if (IN_FLOW.test(path)) return { valid: false as const, checkpoint: /checkpoint|challenge|auth_platform|two_/i.test(path) };
    if (await page.locator("input[type=password]").first().isVisible().catch(() => false)) return { valid: false as const, checkpoint: false };
    if (!(await sessionUid(ctx, platform))) return { valid: false as const, checkpoint: false };
    const who = await identify(ctx, platform);
    return who ? { valid: true as const, ...who } : { valid: false as const, checkpoint: false };
  });
}
