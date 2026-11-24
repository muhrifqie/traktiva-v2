import "server-only";
import type { BrowserContext, Page } from "playwright-core";
import { launchProfile, newProfileKey, withProfile } from "@/lib/browser/chrome";

// Instagram and Facebook login on their own Chrome profile (one profile per account, like TikTok/YouTube). The
// profile is the stored session: later features (Reels upload, insights) reuse it.
// ⚠️ Real Meta accounts are quick to flag automation: one profile per account, one laptop per account, human pace.
// A checkpoint / "confirm it's you" screen is left to the user in the visible window; nothing here tries to pass it.

export type MetaPlatform = "instagram" | "facebook";
export type MetaIdentity = { username: string; uid: string; name: string | null; avatar: string | null };

const IG_APP_ID = "936619743392459"; // instagram.com web app id (public, sent by the site itself)
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

/** Instagram: the web app's own user-info call, from inside an instagram.com page (same headers the site sends). */
async function identifyInstagram(page: Page, uid: string): Promise<MetaIdentity | null> {
  await page.goto(SITE.instagram.home, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const u = await page.evaluate(
    async ([id, app]) => {
      const csrf = document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "";
      const get = (url: string) => fetch(url, { credentials: "include", headers: { "X-IG-App-ID": app, "X-CSRFToken": csrf, "X-Requested-With": "XMLHttpRequest" } }).then((r) => (r.ok ? r.json() : null), () => null);
      const a = await get(`/api/v1/users/${id}/info/`);
      if (a?.user) return a.user;
      const b = await get("/api/v1/accounts/current_user/?edit=true");
      return b?.user ?? null;
    },
    [uid, IG_APP_ID] as const,
  );
  if (!u?.username) return null;
  return { username: u.username, uid: String(u.pk ?? u.pk_id ?? uid), name: u.full_name || null, avatar: u.hd_profile_pic_url_info?.url ?? u.profile_pic_url ?? null };
}

/** Facebook: the profile page of the signed-in user (title = name, the final URL = vanity name, header photo). */
async function identifyFacebook(page: Page, uid: string): Promise<MetaIdentity | null> {
  await page.goto(`https://www.facebook.com/profile.php?id=${uid}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
  const vanity = page.url().match(/facebook\.com\/(?!profile\.php)([\w.]+)\/?(?:$|\?)/)?.[1] ?? null;
  const info = await page.evaluate(() => {
    const title = document.title.replace(/^\(\d+\+?\)\s*/, "").replace(/\s*\|\s*Facebook\s*$/i, "").trim();
    const og = document.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? "";
    const img = document.querySelector('[role="main"] svg image')?.getAttribute("xlink:href") ?? document.querySelector('[role="main"] svg image')?.getAttribute("href") ?? null;
    return { name: og || (title && title.toLowerCase() !== "facebook" ? title : ""), img };
  });
  return { username: vanity ?? uid, uid, name: info.name || null, avatar: info.img };
}

async function identify(ctx: BrowserContext, p: MetaPlatform): Promise<MetaIdentity | null> {
  const uid = await sessionUid(ctx, p);
  if (!uid) return null;
  const page = await ctx.newPage();
  try {
    return await (p === "instagram" ? identifyInstagram(page, uid) : identifyFacebook(page, uid));
  } catch {
    return null;
  } finally {
    await page.close().catch(() => {});
  }
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
    try {
      while (!closed && state.status === "waiting") {
        if (Date.now() > deadline) throw new Error("Waktu login habis (10 menit)");
        // still on a checkpoint / two-factor screen: wait for the user to finish it
        const url = page.url();
        const onCheck = /checkpoint|challenge|two_step|two_factor|login\/(identify|device)/i.test(url);
        if (!onCheck && (await sessionUid(ctx, platform).catch(() => null))) {
          state.status = "identifying";
          await sleep(2500); // let the site settle (Instagram's "save login info" step, Facebook's redirect)
          for (let i = 0; i < 6 && !state.result; i++) {
            state.result = (await identify(ctx, platform)) ?? undefined;
            if (!state.result) await sleep(2500);
          }
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
      await ctx.close().catch(() => {});
      state.ctx = undefined;
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
    if (/checkpoint|challenge|accounts\/login|\/login/i.test(page.url())) return { valid: false as const, checkpoint: /checkpoint|challenge/i.test(page.url()) };
    if (!(await sessionUid(ctx, platform))) return { valid: false as const, checkpoint: false };
    const who = await identify(ctx, platform);
    return who ? { valid: true as const, ...who } : { valid: false as const, checkpoint: false };
  });
}
