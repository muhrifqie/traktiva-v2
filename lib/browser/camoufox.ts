import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BrowserContext } from "playwright-core";
import { chromium } from "playwright-core";
import { Camoufox } from "camoufox-js";
import { generateFingerprint } from "camoufox-js/dist/fingerprints.js";
import { sampleWebGL } from "camoufox-js/dist/webgl/sample.js";
import { DATA_DIR } from "@/lib/db";
import { camoufoxInstalled, camoufoxStatus, installCamoufox } from "@/lib/browser/camoufox-install";
import { findChromium } from "@/lib/browser/chromium";

// One account = one Camoufox profile folder + one frozen fingerprint (+ optional proxy later).
// Freezing the identity matters: an account that looks like a different machine every launch is a red flag.
//
// Fallback: while Camoufox is not installed yet (first run downloads ~500 MB), NEW profiles use the
// Chrome/Edge already on the PC. A profile keeps the engine it was created with (engine.json): the
// cookie stores are not interchangeable, so switching would silently log the account out.

export type BrowserEngine = "camoufox" | "chromium";

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

// ---------- profile lock ----------
// One browser per profile folder at a time. The lock remembers who holds it and how long that may take,
// so a stuck holder (hung launch, window that never closed, browser left over from a previous run) is
// force-released instead of blocking the account forever ("Akun ini sedang dipakai proses lain").
// ponytail: in-process (one Next server per app); move to the jobs table if a second worker process appears

type Hold = { ctx: BrowserContext | null; since: number; maxMs: number; what: string };
const gl = globalThis as unknown as { __profileHolds?: Map<string, Hold> };
const holds = (gl.__profileHolds ??= new Map());
const execFileP = promisify(execFile);
const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PROFILE_LOCKS = ["parent.lock", ".parentlock", "lock", "SingletonLock", "SingletonCookie", "SingletonSocket", "lockfile"];

export type LaunchOpts = {
  headless?: boolean;
  /** take the profile over right away (user-initiated: login, "Buka Flow"). Default: true for visible windows */
  force?: boolean;
  /** when held by a healthy holder: wait this long for it before giving up. Default 45 s (0 = fail at once) */
  waitMs?: number;
  /** how long this use may legitimately last; past that the hold counts as stuck. Default 10 min (visible: 25 min) */
  maxMs?: number;
  what?: string;
};

const holdDead = (h: Hold) =>
  Date.now() - h.since > h.maxMs || // overran its own budget
  (!h.ctx && Date.now() - h.since > 3 * 60_000) || // launch never finished
  (!!h.ctx && h.ctx.browser()?.isConnected() === false); // browser already gone

async function clearLocks(dir: string) {
  for (const sub of ["browser", "chromium"]) {
    for (const f of PROFILE_LOCKS) await fs.rm(path.join(dir, sub, f), { force: true }).catch(() => {});
  }
}

/** Close whatever holds the profile, kill browser processes still using its folder, remove lock files. */
export async function forceReleaseProfile(key: string) {
  const dir = profileDir(key);
  const h = holds.get(key);
  holds.delete(key);
  if (h?.ctx) await Promise.race([h.ctx.close().catch(() => {}), sleepMs(5000)]);
  await killProfileProcesses(dir);
  await clearLocks(dir);
}

async function killProfileProcesses(dir: string) {
  if (process.platform !== "win32") return;
  // the folder can appear with either slash style in a command line
  const back = dir.replace(/\//g, "\\").replace(/'/g, "''");
  const fwd = back.replace(/\\/g, "/");
  const ps =
    `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and ($_.CommandLine.Contains('${back}') -or $_.CommandLine.Contains('${fwd}')) -and $_.ProcessId -ne ${process.pid} } | ` +
    "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
  await execFileP("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(ps, "utf16le").toString("base64")], { windowsHide: true, timeout: 30_000 }).catch(() => {});
  await sleepMs(500);
}

async function acquire(key: string, o: Required<Pick<LaunchOpts, "force" | "waitMs" | "maxMs" | "what">>) {
  const end = Date.now() + o.waitMs;
  for (;;) {
    const h = holds.get(key);
    if (!h) break;
    if (o.force || holdDead(h)) {
      await forceReleaseProfile(key);
      break;
    }
    if (Date.now() >= end) throw new Error(`Akun ini sedang dipakai proses lain (${h.what}). Tunggu sebentar.`);
    await sleepMs(1000);
  }
  const hold: Hold = { ctx: null, since: Date.now(), maxMs: o.maxMs, what: o.what };
  holds.set(key, hold);
  return hold;
}

function release(key: string, hold: Hold) {
  if (holds.get(key) === hold) holds.delete(key);
}

async function readEngine(dir: string): Promise<BrowserEngine | null> {
  try {
    const e = JSON.parse(await fs.readFile(path.join(dir, "engine.json"), "utf8")).engine;
    if (e === "camoufox" || e === "chromium") return e;
  } catch {}
  // Profiles from before the fallback existed are Camoufox profiles.
  const legacy = await fs.stat(path.join(dir, "browser")).then(() => true, () => false);
  return legacy ? "camoufox" : null;
}

/** Engine an existing profile uses, or the one a new profile would get right now. */
export async function profileEngine(key: string): Promise<BrowserEngine> {
  return (await readEngine(profileDir(key))) ?? (camoufoxInstalled() || !findChromium() ? "camoufox" : "chromium");
}

function camoufoxNotReady(): Error {
  const s = camoufoxStatus();
  const pct = s.total ? ` ${Math.floor((s.received / s.total) * 100)}%` : "";
  return new Error(
    s.state === "failed"
      ? `Browser Camoufox gagal diunduh: ${s.error}. Coba unduh lagi di Pengaturan.`
      : `Browser Camoufox sedang disiapkan${pct}. Tunggu sampai selesai (lihat progres di Pengaturan), lalu coba lagi.`,
  );
}

/**
 * Launch the account's persistent browser profile. Caller must close the context (use withProfile when possible).
 * Note: TikTok renders headless only for logged-in profiles; the login page itself must use headless:false.
 */
export async function launchProfile(key: string, opts: LaunchOpts = {}): Promise<BrowserContext> {
  const headless = opts.headless ?? false;
  const dir = profileDir(key);
  const hold = await acquire(key, {
    force: opts.force ?? !headless,
    waitMs: opts.waitMs ?? 45_000,
    maxMs: opts.maxMs ?? (headless ? 10 * 60_000 : 25 * 60_000),
    what: opts.what ?? (headless ? "proses latar" : "jendela browser"),
  });
  try {
    const ready = camoufoxInstalled();
    if (!ready) void installCamoufox().catch(() => {}); // keep preparing it in the background either way
    let engine = await readEngine(dir);
    if (!engine) {
      engine = ready || !findChromium() ? "camoufox" : "chromium";
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "engine.json"), JSON.stringify({ engine }));
    }
    if (engine === "camoufox" && !ready) throw camoufoxNotReady();
    const launch = () => (engine === "camoufox" ? launchCamoufox(dir, headless) : launchChromium(dir, headless));
    let ctx: BrowserContext;
    try {
      ctx = await launch();
    } catch (e) {
      // usually a browser left over from an earlier run still holds the folder: clear it and try once more
      await killProfileProcesses(dir);
      await clearLocks(dir);
      try {
        ctx = await launch();
      } catch {
        throw e;
      }
    }
    hold.ctx = ctx;
    ctx.on("close", () => release(key, hold));
    return ctx;
  } catch (e) {
    release(key, hold);
    throw e;
  }
}

async function launchCamoufox(dir: string, headless: boolean): Promise<BrowserContext> {
  const id = await loadIdentity(dir);
  return (await Camoufox({
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
}

async function launchChromium(dir: string, headless: boolean): Promise<BrowserContext> {
  const browser = findChromium();
  if (!browser) throw camoufoxNotReady();
  return chromium.launchPersistentContext(path.join(dir, "chromium"), {
    executablePath: browser.path,
    headless,
    locale: "id-ID",
    viewport: headless ? { width: WINDOW[0], height: WINDOW[1] } : null,
    // Look like a normal browser window: Google refuses sign-in in visibly automated browsers.
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      "--disable-blink-features=AutomationControlled",
      `--window-size=${WINDOW[0]},${WINDOW[1]}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
}

export async function withProfile<T>(key: string, opts: LaunchOpts, fn: (ctx: BrowserContext) => Promise<T>): Promise<T> {
  const ctx = await launchProfile(key, opts);
  try {
    return await fn(ctx);
  } finally {
    await ctx.close().catch(() => {});
  }
}

export async function deleteProfile(key: string) {
  await forceReleaseProfile(key); // the account is being removed: whatever still uses it goes too
  await fs.rm(profileDir(key), { recursive: true, force: true });
}
