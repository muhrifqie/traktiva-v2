import "server-only";
import type { BrowserContext, Page } from "playwright-core";
import { launchProfile, newProfileKey, withProfile } from "@/lib/browser/camoufox";

// TikTok automation on Camoufox profiles: login, session check, profile + video sync.
// ⚠️ Every action here touches a real TikTok account: keep it human-paced, one profile per account.

const SESSION_COOKIES = new Set(["sessionid", "sessionid_ss", "sid_tt"]);
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type TikTokIdentity = { username: string; uid: string | null; nickname: string | null; avatar: string | null };

async function hasSession(ctx: BrowserContext) {
  const cookies = await ctx.cookies("https://www.tiktok.com");
  return cookies.some((c) => SESSION_COOKIES.has(c.name) && c.value);
}

/** Who is logged in on this profile? JSON API first (passes TikTok's WAF), page data as fallback. */
async function identify(ctx: BrowserContext): Promise<TikTokIdentity | null> {
  for (const aid of ["1459", "1988"]) {
    try {
      const res = await ctx.request.get(`https://www.tiktok.com/passport/web/account/info/?aid=${aid}`, { timeout: 10000 });
      const d = (await res.json().catch(() => null))?.data;
      const username = d?.username || d?.unique_id;
      if (username) {
        return {
          username: String(username),
          uid: d.user_id_str || (d.user_id != null ? String(d.user_id) : null),
          nickname: d.screen_name || d.nickname || null,
          avatar: d.avatar_url || null,
        };
      }
    } catch {}
  }
  return null;
}

// ---------- login (long-running, polled by the UI) ----------

type LoginState = {
  status: "waiting" | "identifying" | "done" | "failed" | "cancelled";
  sessionKey: string;
  result?: TikTokIdentity;
  error?: string;
  ctx?: BrowserContext;
};

// Survives Next dev hot reloads.
const g = globalThis as unknown as { __tiktokLogins?: Map<string, LoginState> };
const logins = (g.__tiktokLogins ??= new Map());

/** Opens a visible Camoufox window on the TikTok login page. Returns a login id to poll. */
export async function startLogin(sessionKey?: string) {
  const key = sessionKey ?? newProfileKey();
  const id = crypto.randomUUID();
  const state: LoginState = { status: "waiting", sessionKey: key };
  logins.set(id, state);

  const ctx = await launchProfile(key, { headless: false });
  state.ctx = ctx;
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto("https://www.tiktok.com/login", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});

  void (async () => {
    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    let closed = false;
    ctx.on("close", () => (closed = true));
    try {
      while (!closed && state.status === "waiting") {
        if (Date.now() > deadline) throw new Error("Waktu login habis (10 menit)");
        if (ctx.pages().length === 0) {
          state.status = "cancelled";
          state.error = "Login dibatalkan (jendela ditutup)";
          break;
        }
        if (await hasSession(ctx).catch(() => false)) {
          state.status = "identifying";
          for (let i = 0; i < 15 && !state.result; i++) {
            state.result = (await identify(ctx)) ?? undefined;
            if (!state.result) await sleep(2000);
          }
          if (!state.result) throw new Error("Login terdeteksi, tapi akun TikTok belum bisa dikenali. Coba lagi.");
          state.status = "done";
          break;
        }
        await sleep(1500);
      }
      if (closed && state.status === "waiting") {
        state.status = "cancelled";
        state.error = "Login dibatalkan (jendela ditutup)";
      }
    } catch (e) {
      state.status = "failed";
      state.error = e instanceof Error ? e.message : String(e);
    } finally {
      await ctx.close().catch(() => {});
      state.ctx = undefined;
      setTimeout(() => logins.delete(id), 5 * 60 * 1000); // forget finished logins after a while
    }
  })();

  return { loginId: id, sessionKey: key };
}

export function getLogin(id: string) {
  const s = logins.get(id);
  if (!s) return null;
  return { status: s.status, sessionKey: s.sessionKey, result: s.result, error: s.error };
}

export async function cancelLogin(id: string) {
  const s = logins.get(id);
  if (s?.ctx) await s.ctx.close().catch(() => {});
}

// ---------- session check (headless, no window) ----------

export async function checkSession(sessionKey: string) {
  return withProfile(sessionKey, { headless: true }, async (ctx) => {
    if (!(await hasSession(ctx))) return { valid: false as const };
    const who = await identify(ctx);
    return who ? { valid: true as const, ...who } : { valid: false as const };
  });
}

// ---------- profile sync ----------

export type TikTokVideo = {
  id: string;
  caption: string;
  cover: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  durationSec: number | null;
  postedAt: number | null; // unix seconds
  isPinned: boolean;
  isPrivate: boolean;
};

export type TikTokProfile = {
  uid: string | null;
  username: string;
  nickname: string | null;
  avatar: string | null;
  bio: string | null;
  bioLink: string | null;
  verified: boolean;
  isPrivate: boolean;
  followers: number;
  following: number;
  likes: number;
  videoCount: number;
  videos: TikTokVideo[];
  playlists: { id: string; name: string; videoCount: number; cover: string | null }[];
  /** cover image bytes per video id, fetched inside the session (TikTok's signed cover links only work there and expire) */
  coverData: Map<string, { data: Buffer; type: string }>;
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw TikTok payloads
function mapVideo(it: any): TikTokVideo {
  const s = it.statsV2 ?? it.stats ?? {};
  return {
    id: String(it.id),
    caption: it.desc ?? "",
    cover: it.video?.cover || it.video?.originCover || null,
    views: num(s.playCount),
    likes: num(s.diggCount),
    comments: num(s.commentCount),
    shares: num(s.shareCount),
    saves: num(s.collectCount),
    durationSec: it.video?.duration ?? null,
    postedAt: it.createTime ? Number(it.createTime) : null,
    isPinned: !!it.isPinnedItem,
    isPrivate: !!it.privateItem || !!it.secret,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

async function readUserDetail(page: Page) {
  for (let i = 0; i < 30; i++) {
    const raw = await withTimeout(
      page.evaluate(() => document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__")?.textContent ?? null),
      5000,
    ).catch(() => null);
    const ud = raw && JSON.parse(raw)?.__DEFAULT_SCOPE__?.["webapp.user-detail"];
    if (ud?.userInfo?.user) return ud.userInfo;
    await sleep(1000);
  }
  throw new Error("Data profil TikTok tidak terbaca (mungkin diminta verifikasi). Coba lagi nanti.");
}

/**
 * Opens the account's profile page in its own Camoufox profile (headless, no window) and captures
 * profile + video + playlist data. Headless renders fine once the profile is logged in; an anonymous
 * profile gets a blank page, which is why only logged-in accounts can sync.
 */
export async function syncProfile(sessionKey: string, username: string, { maxVideos = 200 } = {}): Promise<TikTokProfile> {
  return withProfile(sessionKey, { headless: true }, async (ctx) => {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    const videos = new Map<string, TikTokVideo>();
    let hasMore = true;
    let pages = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw TikTok payloads
    let playlists: any[] = [];

    // covers: keep the images the page itself loads (signed CDN links only answer this session)
    const coverData = new Map<string, { data: Buffer; type: string }>();
    // same image is served with different size/format suffixes ("<id>~tplv-…"): match on the image id
    const coverKey = (u: string) => (u.split("?")[0].split("/").pop() ?? "").split("~")[0];
    const wanted = new Map<string, string>(); // cover link without query → video id
    page.on("response", async (res) => {
      const key = coverKey(res.url());
      const vid = wanted.get(key);
      if (vid && !coverData.has(vid) && res.ok()) {
        const type = res.headers()["content-type"] ?? "";
        if (/^image\//.test(type)) {
          const data = await res.body().catch(() => null);
          if (data?.length) coverData.set(vid, { data, type });
        }
      }
    });

    page.on("response", async (res) => {
      const url = res.url();
      if (!/\/api\/(post\/item_list|user\/playlist)\//.test(url)) return;
      const j = await res.json().catch(() => null);
      if (!j) return;
      if (url.includes("/post/item_list/")) {
        for (const it of j.itemList ?? []) {
          const v = mapVideo(it);
          videos.set(v.id, v);
          if (v.cover) wanted.set(coverKey(v.cover), v.id);
        }
        hasMore = !!j.hasMore;
        pages++;
      } else {
        playlists = j.playList ?? j.playlists ?? [];
      }
    });

    // Headless gotchas (verified): waiting for "domcontentloaded" and page.mouse.wheel can both hang,
    // so navigate on "commit", poll for data, and scroll from inside the page with a time cap.
    await page.goto(`https://www.tiktok.com/@${encodeURIComponent(username)}`, { waitUntil: "commit", timeout: 45000 });
    const info = await readUserDetail(page);

    // Wait for the first video page, then scroll (human-ish pace) while TikTok says there is more.
    for (let i = 0; i < 30 && pages === 0; i++) await sleep(500);
    for (let i = 0; i < 40 && hasMore && videos.size < maxVideos; i++) {
      const before = pages;
      await withTimeout(page.evaluate((dy) => window.scrollBy(0, dy), 1800 + Math.random() * 900), 5000).catch(() => {});
      for (let w = 0; w < 10 && pages === before; w++) await sleep(400 + Math.random() * 300);
      if (pages === before) break; // nothing new loaded
    }

    // still missing: fetch through the same logged-in session
    for (const v of videos.values()) {
      if (coverData.has(v.id) || !v.cover) continue;
      const res = await ctx.request.get(v.cover, { headers: { referer: "https://www.tiktok.com/" }, timeout: 15_000 }).catch(() => null);
      const type = res?.headers()["content-type"] ?? "";
      if (res?.ok() && /^image\//.test(type)) coverData.set(v.id, { data: await res.body(), type });
    }
    // last resort that always works: screenshot each cover as the page shows it (grid item → /video/<id>)
    if ([...videos.keys()].some((id) => !coverData.has(id))) {
      await withTimeout(page.evaluate(() => window.scrollTo(0, 0)), 5000).catch(() => {});
      const items = page.locator('[data-e2e="user-post-item"]');
      const n = await items.count().catch(() => 0);
      for (let i = 0; i < n; i++) {
        const item = items.nth(i);
        const href = (await item.locator('a[href*="/video/"], a[href*="/photo/"]').first().getAttribute("href").catch(() => null)) ?? "";
        const id = href.match(/\/(?:video|photo)\/(\d+)/)?.[1];
        if (!id || coverData.has(id)) continue;
        const img = item.locator("img").first();
        if (!(await img.count())) continue;
        await img.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        await img.evaluate((el) => new Promise<void>((r) => ((el as HTMLImageElement).complete ? r() : ((el as HTMLImageElement).onload = () => r(), setTimeout(r, 4000))))).catch(() => {});
        const shot = await img.screenshot({ type: "jpeg", quality: 90, timeout: 8000 }).catch(() => null);
        if (shot?.length) coverData.set(id, { data: shot, type: "image/jpeg" });
      }
    }

    const u = info.user;
    const st = info.statsV2 ?? info.stats ?? {};
    return {
      uid: u.id ? String(u.id) : null,
      username: u.uniqueId || username,
      nickname: u.nickname || null,
      avatar: u.avatarLarger || u.avatarMedium || u.avatarThumb || null,
      bio: u.signature || null,
      bioLink: u.bioLink?.link || null,
      verified: !!u.verified,
      isPrivate: !!u.privateAccount,
      followers: num(st.followerCount),
      following: num(st.followingCount),
      likes: num(st.heartCount ?? st.heart),
      videoCount: num(st.videoCount),
      videos: [...videos.values()],
      playlists: playlists.map((p) => ({
        id: String(p.mixId ?? p.id ?? ""),
        name: String(p.name ?? p.mixName ?? ""),
        videoCount: num(p.videoCount ?? p.itemCount),
        cover: p.cover ?? null,
      })),
      coverData,
    };
  });
}
