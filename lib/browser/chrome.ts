import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { DATA_DIR } from "@/lib/db";

// One account = one Chrome profile folder (its own cookies & logins), driven over CDP.
// Chrome is started as a normal process (no Playwright launch flags, so no "controlled by automated software"
// banner or navigator.webdriver) with a private --user-data-dir, then attached with connectOverCDP.
// Uses the Chrome already installed on the PC (falls back to Edge); nothing to download.

const PROFILES_DIR = path.join(/* turbopackIgnore: true */ DATA_DIR, "profiles");
// ponytail: the "cfx_" prefix is kept from the Camoufox days so saved account keys stay valid
const KEY_RE = /^cfx_[0-9a-f-]{36}$/; // keeps profile paths inside PROFILES_DIR
const WINDOW = "1280,860";

export const newProfileKey = () => `cfx_${randomUUID()}`;
export const isProfileKey = (k: unknown): k is string => typeof k === "string" && KEY_RE.test(k);

function profileDir(key: string) {
  if (!isProfileKey(key)) throw new Error("Profil browser tidak valid");
  return path.join(/* turbopackIgnore: true */ PROFILES_DIR, key);
}

// ---------------------------------------------------------------- find Chrome

const g = globalThis as unknown as { __chromePath?: string | null };

/** chrome.exe (or Edge) on this PC; TRAKTIVA_CHROME overrides. */
export function chromePath(): string {
  if (g.__chromePath) return g.__chromePath;
  const env = process.env;
  const win = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(Boolean) as string[];
  const candidates = [
    env.TRAKTIVA_CHROME,
    ...win.map((d) => path.join(d, "Google", "Chrome", "Application", "chrome.exe")),
    ...win.map((d) => path.join(d, "Microsoft", "Edge", "Application", "msedge.exe")),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean) as string[];
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found) throw new Error("Google Chrome tidak ditemukan di PC ini. Pasang Chrome (atau Edge), lalu coba lagi.");
  g.__chromePath = found;
  return found;
}

/** "Chrome/141.0.0.0" style UA for headless runs (headless Chrome otherwise says "HeadlessChrome"). */
function desktopUserAgent(exe: string) {
  // Windows installs keep a "<version>" folder next to chrome.exe
  const ver = (() => {
    try {
      return fs.readdirSync(path.dirname(exe)).find((d) => /^\d+\.\d+\.\d+\.\d+$/.test(d)) ?? "";
    } catch {
      return "";
    }
  })();
  const major = ver.split(".")[0] || "141";
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

// ---------------------------------------------------------------- profile lock

// In-process lock (fast path) + a cross-process lock file: the dev server, Electron and dev scripts can all open
// profiles, and one Chrome profile can only be driven by one process at a time.
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
  await fsp.mkdir(dir, { recursive: true });
  const until = Date.now() + waitMs;
  for (;;) {
    try {
      await fsp.writeFile(file, String(process.pid), { flag: "wx" });
      return async () => {
        if ((await fsp.readFile(file, "utf8").catch(() => "")) === String(process.pid)) await fsp.rm(file, { force: true });
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const pid = Number(await fsp.readFile(file, "utf8").catch(() => "0"));
      if (!pid || pid === process.pid || !alive(pid)) {
        await fsp.rm(file, { force: true }); // left behind by a crashed/killed process (or a dev reload)
        continue;
      }
      if (Date.now() > until) throw new Error("Akun ini sedang dipakai proses lain (aplikasi atau script). Tunggu sebentar lalu coba lagi.");
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

// ---------------------------------------------------------------- launch

/** Kill Chrome and all its helper processes (Windows keeps renderers alive otherwise). */
function killTree(child: ChildProcess) {
  if (child.exitCode != null || !child.pid) return;
  if (process.platform === "win32") execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], () => {});
  else child.kill("SIGKILL");
}

/** Port Chrome wrote to <user-data-dir>/DevToolsActivePort once its debugger listens. */
async function devtoolsPort(userDir: string, child: ChildProcess, timeoutMs = 30_000) {
  const file = path.join(userDir, "DevToolsActivePort");
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const port = Number((await fsp.readFile(file, "utf8").catch(() => "")).split("\n")[0]);
    if (port > 0) return port;
    if (child.exitCode != null && !fs.existsSync(file)) throw new Error("Chrome langsung tertutup saat dibuka. Tutup Chrome yang memakai profil ini lalu coba lagi.");
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Chrome tidak merespons (debugger tidak aktif).");
}

/**
 * Open the account's Chrome profile. Caller must close the returned context (use withProfile when possible):
 * closing it quits that Chrome. The context also emits "close" when the user closes the window.
 */
export async function launchProfile(key: string, { headless = false }: { headless?: boolean } = {}): Promise<BrowserContext> {
  const dir = profileDir(key);
  // a standby browser holds this profile: close it first (e.g. a visible login window for the same account)
  if (standby.has(key)) await stopStandby(key);
  if (busy.has(key)) throw new Error("Akun ini sedang dipakai proses lain. Tunggu sebentar.");
  busy.add(key);
  let unlock: (() => Promise<void>) | null = null;
  let child: ChildProcess | null = null;
  try {
    unlock = await lockProfile(dir);
    const exe = chromePath();
    const userDir = path.join(dir, "chrome");
    await fsp.mkdir(userDir, { recursive: true });
    await fsp.rm(path.join(userDir, "DevToolsActivePort"), { force: true });
    const args = [
      `--user-data-dir=${userDir}`,
      "--remote-debugging-port=0",
      "--remote-allow-origins=*",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-search-engine-choice-screen",
      "--disable-blink-features=AutomationControlled", // navigator.webdriver stays false (headless sets it otherwise)
      "--disable-features=Translate,MediaRouter,OptimizationHints",
      "--lang=id-ID",
      `--window-size=${WINDOW}`,
      ...(headless ? ["--headless=new", `--user-agent=${desktopUserAgent(exe)}`, "--mute-audio"] : []),
      "about:blank",
    ];
    child = spawn(exe, args, { stdio: "ignore", windowsHide: headless, detached: false });
    const port = await devtoolsPort(userDir, child);
    // isLocal: same PC, so setInputFiles passes the path (as a "remote" browser, uploads over 50 MB failed)
    const browser: Browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 30_000, isLocal: true });
    const ctx = browser.contexts()[0];
    if (!ctx) throw new Error("Chrome terbuka tanpa jendela.");

    let done = false;
    const proc = child;
    const release = unlock;
    const finish = () => {
      if (done) return;
      done = true;
      busy.delete(key);
      void release?.();
      killTree(proc);
      // the default CDP context never closes by itself: tell listeners (login flows, standby) it is gone
      (ctx as unknown as { emit: (e: string, x: unknown) => void }).emit("close", ctx);
    };
    // the user closed the window, or Chrome crashed
    browser.on("disconnected", finish);
    proc.on("exit", finish);
    // ctx.close() on a CDP context would only drop our connection: quit Chrome itself
    ctx.close = async () => {
      if (done) return;
      try {
        const s = await browser.newBrowserCDPSession();
        await Promise.race([s.send("Browser.close"), new Promise((r) => setTimeout(r, 3000))]);
      } catch {
        // already gone
      }
      // let Chrome exit by itself so cookies/logins are flushed to disk; force-kill only if it hangs
      if (proc.exitCode == null) await new Promise((r) => { proc.once("exit", r); setTimeout(r, 8000); });
      finish();
    };
    return ctx;
  } catch (e) {
    busy.delete(key);
    if (child) killTree(child);
    await unlock?.();
    throw e;
  }
}

export async function withProfile<T>(key: string, opts: { headless?: boolean }, fn: (ctx: BrowserContext) => Promise<T>): Promise<T> {
  // standby browser for this profile: reuse it (no launch wait), one job at a time
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
  await fsp.rm(profileDir(key), { recursive: true, force: true });
}
