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

/** An open tab already on the site and past any sign-in flow: fetch() from it carries the site's own cookies and
 *  headers, without navigating (background requests from outside a page get turned away by Instagram). */
function sitePage(ctx: BrowserContext, p: MetaPlatform) {
  const host = new URL(SITE[p].home).host;
  return ctx.pages().find((pg) => {
    try {
      const u = new URL(pg.url());
      return u.host === host && !IN_FLOW.test(u.pathname);
    } catch {
      return false;
    }
  });
}

/** Instagram: read from the signed-in page itself: the viewer's data embedded in the HTML next to their id (works
 *  in any UI language), else the sidebar "Profil" link. No API call: /api/v1/users/…/info answers 429 to scripts. */
async function identifyInstagram(ctx: BrowserContext, uid: string): Promise<MetaIdentity | null> {
  const page = sitePage(ctx, "instagram");
  if (!page) return null;
  await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
  const u = await page.evaluate((id) => {
    const html = document.documentElement.innerHTML;
    const near = (key: string, value: string) =>
      html.match(new RegExp(`"${key}":"(${value})"[^{}]{0,300}?"(?:pk|id|pk_id)":"${id}"`))?.[1] ?? html.match(new RegExp(`"(?:pk|id|pk_id)":"${id}"[^{}]{0,300}?"${key}":"(${value})"`))?.[1] ?? null;
    const nav = [...document.querySelectorAll("a[href^='/']")].find((x) => /^(Profile|Profil)$/i.test((x.textContent ?? "").trim()))?.getAttribute("href");
    return {
      username: near("username", "[A-Za-z0-9._]+") ?? nav?.match(/^\/([A-Za-z0-9._]+)\/?$/)?.[1] ?? null,
      name: near("full_name", '[^"]*'),
      avatar: near("profile_pic_url", '[^"]+'),
    };
  }, uid);
  if (!u.username) return null;
  const unescape = (t: string | null) => {
    try {
      return t ? (JSON.parse(`"${t}"`) as string) : null; // JSON escapes in the page data (\u00e9, \/ …)
    } catch {
      return t;
    }
  };
  return { username: u.username, uid, name: unescape(u.name) || null, avatar: unescape(u.avatar) };
}

/** Facebook: the user's profile page, fetched from inside a facebook.com tab (title = name, final URL = vanity). */
async function identifyFacebook(ctx: BrowserContext, uid: string): Promise<MetaIdentity | null> {
  const page = sitePage(ctx, "facebook");
  if (!page) return null;
  const r = await page.evaluate(async (id) => {
    const res = await fetch(`/profile.php?id=${id}`, { credentials: "include" }).catch(() => null);
    return res?.ok ? { url: res.url, html: await res.text(), me: document.documentElement.innerHTML.match(/"NAME":"([^"]+)"/)?.[1] ?? null } : null;
  }, uid);
  if (!r || IN_FLOW.test(new URL(r.url).pathname)) return null;
  const vanity = r.url.match(/facebook\.com\/(?!profile\.php)([\w.]+)\/?(?:$|\?)/)?.[1] ?? null;
  const decode = (t: string) => t.replace(/&amp;/g, "&").replace(/&#039;|&#x27;/g, "'").replace(/&quot;/g, '"');
  const title = decode(r.html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "").replace(/^\(\d+\+?\)\s*/, "").replace(/\s*\|\s*Facebook\s*$/i, "").trim();
  const me = r.me ? (JSON.parse(`"${r.me}"`) as string) : null;
  return { username: vanity ?? uid, uid, name: me ?? (title && title.toLowerCase() !== "facebook" ? title : null), avatar: null };
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
    let stable = 0; // signed in and out of any flow, checks in a row
    try {
      while (!closed && state.status === "waiting") {
        if (Date.now() > deadline) throw new Error("Waktu login habis (10 menit)");
        // still signing in / on a security check in any tab: wait for the user to finish it
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

// ---------- Facebook: who to post as (the personal profile or a Page this account manages) ----------

/** One identity the account can post as. id = the profile id Facebook switches to (cookie i_user for a Page). */
export type FacebookIdentity = { kind: "user" | "page"; id: string; name: string; url: string; pageId: string | null };
export const FB_IDENTITIES = "fb-identities"; // shopCache key: { list, target }
export type FacebookIdentities = { list: FacebookIdentity[]; target: string | null };

/** The personal profile plus every Page on "Halaman Anda" (facebook.com/pages/?category=your_pages). */
export async function listFacebookIdentities(sessionKey: string): Promise<FacebookIdentity[]> {
  return withProfile(sessionKey, { headless: true }, async (ctx) => {
    const uid = await sessionUid(ctx, "facebook");
    if (!uid) throw new Error("Sesi Facebook habis. Login ulang dulu.");
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto("https://www.facebook.com/pages/?category=your_pages", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("load", { timeout: 20_000 }).catch(() => {});
    await sleep(5000);
    if (IN_FLOW.test(new URL(page.url()).pathname)) throw new Error("Facebook meminta verifikasi. Klik Login lalu selesaikan di jendela yang terbuka.");
    const found = await page.evaluate(() => {
      const html = document.documentElement.innerHTML;
      const me = html.match(/"NAME":"([^"]+)"/)?.[1] ?? null;
      const main = document.querySelector("[role=main]") ?? document.body;
      const pages: { name: string; url: string; id: string | null; pageId: string | null }[] = [];
      for (const a of main.querySelectorAll("a[href]")) {
        const href = (a as HTMLAnchorElement).href;
        const name = (a.textContent ?? "").trim();
        const m = href.match(/^https:\/\/www\.facebook\.com\/(?:profile\.php\?id=(\d+)|([A-Za-z0-9.]{3,})\/?$)/);
        if (!m || !name || name.length > 80) continue;
        // the Page card around it carries the business page id in its other links (Pesan / Promosikan)
        let box: Element | null = a;
        let pageId: string | null = null;
        for (let i = 0; i < 10 && box && !pageId; i++) {
          box = box.parentElement;
          pageId = box?.innerHTML.match(/(?:asset_id|page_id)=(\d+)/)?.[1] ?? null;
        }
        if (!pageId) continue; // not a Page card (menus, own profile links)
        if (!pages.some((p) => p.url === href)) pages.push({ name, url: href, id: m[1] ?? null, pageId });
      }
      return { me, pages };
    });
    const user: FacebookIdentity = { kind: "user", id: uid, name: found.me ? JSON.parse(`"${found.me}"`) : "Profil pribadi", url: `https://www.facebook.com/profile.php?id=${uid}`, pageId: null };
    return [user, ...found.pages.map((p) => ({ kind: "page" as const, id: p.id ?? p.pageId!, name: p.name, url: p.url, pageId: p.pageId }))];
  });
}
