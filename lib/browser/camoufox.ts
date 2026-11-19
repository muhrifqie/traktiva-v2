import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { BrowserContext } from "playwright-core";
import { Camoufox } from "camoufox-js";
import { generateFingerprint } from "camoufox-js/dist/fingerprints.js";
import { sampleWebGL } from "camoufox-js/dist/webgl/sample.js";
import { DATA_DIR } from "@/lib/db";

// One account = one Camoufox profile folder + one frozen fingerprint (+ optional proxy later).
// Freezing the identity matters: an account that looks like a different machine every launch is a red flag.

const PROFILES_DIR = path.join(/* turbopackIgnore: true */ DATA_DIR, "profiles");
const KEY_RE = /^cfx_[0-9a-f-]{36}$/; // keeps profile paths inside PROFILES_DIR
const WINDOW: [number, number] = [1280, 860];

type Identity = {
  fingerprint: ReturnType<typeof generateFingerprint>;
  webgl: [string, string]; // vendor, renderer
  config: Record<string, number>; // per-identity seeds Camoufox would otherwise re-roll every launch
};

export const newProfileKey = () => `cfx_${randomUUID()}`;
export const isProfileKey = (k: unknown): k is string => typeof k === "string" && KEY_RE.test(k);

function profileDir(key: string) {
  if (!isProfileKey(key)) throw new Error("Profil browser tidak valid");
  return path.join(/* turbopackIgnore: true */ PROFILES_DIR, key);
}

const rand32 = () => Math.floor(Math.random() * 4_294_967_294) + 1;

async function loadIdentity(dir: string): Promise<Identity> {
  const file = path.join(dir, "identity.json");
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    // runtime shape uses "webGl:*" keys (the .d.ts says vendor/renderer; verified against 0.13.0)
    const webgl = (await sampleWebGL("win")) as unknown as Record<string, string>;
    const identity: Identity = {
      fingerprint: generateFingerprint(WINDOW, { operatingSystems: ["windows"] }),
      webgl: [webgl["webGl:vendor"], webgl["webGl:renderer"]],
      config: {
        "fonts:spacing_seed": rand32(),
        "audio:seed": rand32(),
        "canvas:seed": rand32(),
        "canvas:aaOffset": Math.floor(Math.random() * 101) - 50,
        "window.history.length": Math.floor(Math.random() * 5) + 1,
      },
    };
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(identity));
    return identity;
  }
}

// In-process lock (fast path) + a cross-process lock file: the dev server, Electron and dev scripts can all open
// profiles, and two Camoufox instances on one profile end in Firefox's "already running, not responding" dialog.
const busy = new Set<string>();
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM"; // exists but not ours
  }
};

/** Take <profile>/traktiva.lock (our PID). Waits while another live process holds it; stale locks are removed. */
async function lockProfile(dir: string, waitMs = 90_000) {
  const file = path.join(dir, "traktiva.lock");
  await fs.mkdir(dir, { recursive: true });
  const until = Date.now() + waitMs;
  for (;;) {
    try {
      await fs.writeFile(file, String(process.pid), { flag: "wx" });
      return async () => {
        if ((await fs.readFile(file, "utf8").catch(() => "")) === String(process.pid)) await fs.rm(file, { force: true });
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const pid = Number(await fs.readFile(file, "utf8").catch(() => "0"));
      if (!pid || pid === process.pid || !alive(pid)) {
        // left behind by a crashed/killed process (or by us in a previous dev reload)
        await fs.rm(file, { force: true });
        await fs.rm(path.join(dir, "browser", "parent.lock"), { force: true }).catch(() => {});
        continue;
      }
      if (Date.now() > until) throw new Error("Akun ini sedang dipakai proses lain (aplikasi atau script). Tunggu sebentar lalu coba lagi.");
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

/**
 * Launch the account's persistent Camoufox profile. Caller must close the context (use withProfile when possible).
 * Note: TikTok renders headless only for logged-in profiles; the login page itself must use headless:false.
 */
export async function launchProfile(key: string, { headless = false }: { headless?: boolean } = {}): Promise<BrowserContext> {
  const dir = profileDir(key);
  // a standby browser holds this profile: close it first (e.g. a visible login window for the same account)
  if (standby.has(key)) await stopStandby(key);
  if (busy.has(key)) throw new Error("Akun ini sedang dipakai proses lain. Tunggu sebentar.");
  busy.add(key);
  let unlock: (() => Promise<void>) | null = null;
  try {
    unlock = await lockProfile(dir);
    const id = await loadIdentity(dir);
    const ctx = (await Camoufox({
      user_data_dir: path.join(dir, "browser"),
      headless,
      os: "windows",
      locale: ["id-ID", "en-US"], // region-less "id" intermittently crashes camoufox-js 0.13 (territory data race)
      window: WINDOW,
      fingerprint: id.fingerprint,
      webgl_config: id.webgl,
      config: { ...id.config },
      // We pass our own (frozen) fingerprint on purpose; it is generated by Camoufox's own BrowserForge
      // generator for Firefox/Windows, so the "custom fingerprint" leak warning does not apply.
      i_know_what_im_doing: true,
    } as Parameters<typeof Camoufox>[0] & { user_data_dir: string })) as BrowserContext;
    const release = unlock;
    ctx.on("close", () => {
      busy.delete(key);
      void release?.();
    });
    return ctx;
  } catch (e) {
    busy.delete(key);
    await unlock?.();
    throw e;
  }
}

export async function withProfile<T>(key: string, opts: { headless?: boolean }, fn: (ctx: BrowserContext) => Promise<T>): Promise<T> {
  // standby browser for this profile: reuse it (no 5–10 s launch), one job at a time
  const w = standby.get(key);
  if (w && opts.headless !== false) {
    const job = w.queue.then(() => fn(w.ctx));
    w.queue = job.catch(() => {});
    return job;
  }
  const ctx = await launchProfile(key, opts);
  try {
    return await fn(ctx);
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ---------------------------------------------------------------- standby browsers
// The AI profiles (Gemini, ChatGPT) are opened headless when the app starts and stay parked on their page, so a
// question costs only the request itself. Heavy, useless resources are blocked to keep them light.

type Standby = { ctx: BrowserContext; url: string; queue: Promise<unknown> };
const gs = globalThis as unknown as { __standby?: Map<string, Standby> };
const standby = (gs.__standby ??= new Map());

/** Analytics, ads and telemetry the AI pages load but never need. */
const TRACKERS = /googletagmanager|google-analytics|doubleclick|googlesyndication|sentry\.io|datadoghq|segment\.(io|com)|intercom|statsig|featuregates|clarity\.ms|hotjar|facebook\.net|bat\.bing|cdn\.oaistatic\.com\/assets\/.*\.(woff2?|ttf)$/i;

/** Skip images, media, fonts and trackers (pages still work: scripts, styles and API calls go through). */
export async function lightenProfile(ctx: BrowserContext) {
  await ctx.route("**/*", (route) => {
    const req = route.request();
    const type = req.resourceType();
    if (type === "image" || type === "media" || type === "font" || TRACKERS.test(req.url())) return route.abort();
    return route.continue();
  });
}

/** Open a profile headless and keep it parked on `url` (idempotent; relaunches if it died). */
export async function standbyProfile(key: string, url: string) {
  const cur = standby.get(key);
  if (cur && cur.ctx.pages().length) return cur.ctx;
  const ctx = await launchProfile(key, { headless: true });
  await lightenProfile(ctx);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
  const entry: Standby = { ctx, url, queue: Promise.resolve() };
  standby.set(key, entry);
  ctx.on("close", () => standby.get(key) === entry && standby.delete(key));
  return ctx;
}

export async function stopStandby(key: string) {
  const w = standby.get(key);
  if (!w) return;
  standby.delete(key);
  await w.queue.catch(() => {});
  await w.ctx.close().catch(() => {});
}

export const standbyStatus = () => [...standby.entries()].map(([key, w]) => ({ key, url: w.url, pages: w.ctx.pages().length }));

export async function deleteProfile(key: string) {
  if (busy.has(key)) throw new Error("Profil sedang dipakai, coba lagi nanti.");
  await fs.rm(profileDir(key), { recursive: true, force: true });
}
