import "server-only";
import { jobSignal, throwIfCancelled } from "@/lib/jobs";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { DATA_DIR, db } from "@/lib/db";
import { googleAccounts } from "@/lib/db/schema";
import { captchaBrowsersFor, noteActiveGoogleAccounts, parallelLimit } from "@/lib/settings";

// Client for a local flow2api instance (https://github.com/TheSmallHanCat/flow2api, MIT):
// admin API to register Google/Flow sessions, OpenAI-compatible API to generate.
// Users never configure it: Traktiva sets it up, starts it when needed and talks to it on 127.0.0.1.

export type Flow2ApiConfig = { baseUrl: string; apiKey: string; adminUser: string; adminPass: string };

/**
 * Where flow2api lives and how to start it:
 * - "sidecar": the PyInstaller build shipped with the app (sidecar/flow2api/build.ps1). The bundle is copied into
 *   DATA_DIR/flow2api once per version, because flow2api keeps config/, data/ and tmp/ next to its own code.
 * - "source": a flow2api checkout with its own Python venv (dev; FLOW2API_DIR or the legacy C:\BOT\flow2api).
 */
type Runtime = { mode: "sidecar" | "source"; root: string; config: string; exe: string; args: string[]; bundle?: string };

const LEGACY_SOURCE = "C:\\BOT\\flow2api";
const SIDECAR_PORT = 38127; // fixed local port of Traktiva's own flow2api (the dev source install keeps 8000)

function runtime(): Runtime | null {
  // pythonw.exe has no console: with python.exe, Windows Terminal (the Windows 11 default) ignores windowsHide
  // and leaves a terminal window open for as long as flow2api runs
  const python = (dir: string) => {
    const scripts = path.join(/* turbopackIgnore: true */ dir, ".venv", "Scripts");
    return [path.join(scripts, "pythonw.exe"), path.join(scripts, "python.exe")].find((p) => fs.existsSync(p)) ?? path.join(scripts, "python.exe");
  };
  const source = (dir: string): Runtime => ({ mode: "source", root: dir, config: path.join(/* turbopackIgnore: true */ dir, "config", "setting.toml"), exe: python(dir), args: ["main.py"] });
  if (process.env.FLOW2API_DIR) return source(process.env.FLOW2API_DIR);
  const devBuild = path.join(/* turbopackIgnore: true */ process.cwd(), "dist-sidecar", "flow2api");
  const bundle = process.env.TRAKTIVA_FLOW2API_BUNDLE || (fs.existsSync(path.join(devBuild, "flow2api.exe")) ? devBuild : null);
  if (bundle) {
    const root = path.join(/* turbopackIgnore: true */ DATA_DIR, "flow2api");
    return { mode: "sidecar", root, bundle, config: path.join(root, "_internal", "config", "setting.toml"), exe: path.join(root, "flow2api.exe"), args: [] };
  }
  if (fs.existsSync(path.join(/* turbopackIgnore: true */ LEGACY_SOURCE, ".venv"))) return source(LEGACY_SOURCE);
  return null;
}

const readText = (file: string) => {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
};

/** Sidecar: copy a new bundle version into the data folder (its data/ and setting.toml are never in the bundle, so they survive). */
function syncSidecar(rt: Runtime) {
  if (rt.mode !== "sidecar" || !rt.bundle) return;
  const want = readText(path.join(rt.bundle, "VERSION")) || "dev";
  if (fs.existsSync(rt.exe) && readText(path.join(rt.root, "VERSION")) === want) return;
  fs.mkdirSync(rt.root, { recursive: true });
  fs.cpSync(rt.bundle, rt.root, { recursive: true, force: true });
}

/** Sidecar: first run writes setting.toml from flow2api's own example with a random API key / admin login. */
function ensureSidecarConfig(rt: Runtime) {
  if (rt.mode !== "sidecar" || fs.existsSync(rt.config)) return;
  const example = readText(path.join(path.dirname(rt.config), "setting_example.toml"));
  if (!example) throw new Error("Mesin video rusak (config contoh tidak ada). Pasang ulang aplikasi.");
  const set = (toml: string, key: string, value: string) => toml.replace(new RegExp(`^(${key}\\s*=\\s*)[^#\\n]*`, "m"), `$1${value} `);
  const secret = () => randomBytes(18).toString("base64url");
  let toml = example;
  toml = set(toml, "api_key", `"${secret()}"`);
  toml = set(toml, "admin_username", `"traktiva"`);
  toml = set(toml, "admin_password", `"${secret()}"`);
  toml = set(toml, "host", `"127.0.0.1"`); // local only, never on the LAN
  toml = set(toml, "port", String(SIDECAR_PORT));
  toml = set(toml, "captcha_method", `"browser"`);
  toml = set(toml, "browser_headless", "true");
  fs.writeFileSync(rt.config, toml);
}

/** Read connection details from env (overrides) or flow2api's config/setting.toml (created for the sidecar). */
export function loadFlow2ApiConfig(): Flow2ApiConfig | null {
  const rt = runtime();
  if (rt) {
    try {
      syncSidecar(rt);
      ensureSidecarConfig(rt);
    } catch (e) {
      console.warn("[flow2api] sidecar setup failed:", e instanceof Error ? e.message : e);
    }
  }
  const toml = rt ? readText(rt.config) : "";
  const val = (key: string) => toml.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m"))?.[1];
  const port = toml.match(/^\s*port\s*=\s*(\d+)/m)?.[1] ?? "8000";
  const host = val("host") === "0.0.0.0" || !val("host") ? "127.0.0.1" : val("host");
  const cfg = {
    baseUrl: (process.env.FLOW2API_URL || `http://${host}:${port}`).replace(/\/+$/, ""),
    apiKey: process.env.FLOW2API_API_KEY || val("api_key") || "",
    adminUser: process.env.FLOW2API_ADMIN_USER || val("admin_username") || "",
    adminPass: process.env.FLOW2API_ADMIN_PASS || val("admin_password") || "",
  };
  return cfg.apiKey && cfg.adminUser && cfg.adminPass ? cfg : null;
}

const healthy = (cfg: Flow2ApiConfig) =>
  fetch(`${cfg.baseUrl}/health`, { signal: AbortSignal.timeout(3000) }).then((r) => r.ok, () => false);

// One start attempt at a time across concurrent callers.
const gs = globalThis as unknown as { __flowStart?: Promise<void> | null; __flowCapacity?: { want: number; done: Promise<void> }; __flowHeadedUntil?: number };

/**
 * Captcha browsers run hidden (headless) so no Chrome windows sit on the desktop. When Google turns the hidden
 * browser down (reCAPTCHA failure), flow2api is restarted with visible Chrome for HEADED_FALLBACK_MIN as a
 * fallback, then goes back to hidden once no generation is running.
 */
const HEADED_FALLBACK_MIN = 60;
const inHeadedFallback = () => (gs.__flowHeadedUntil ?? 0) > Date.now();

/** Write flow2api's browser_headless setting (read at its start). Returns true when it changed. */
function writeHeadless(on: boolean) {
  const rt = runtime();
  if (!rt) return false;
  let toml = "";
  try {
    toml = fs.readFileSync(rt.config, "utf8");
  } catch {
    return false;
  }
  const next = toml.replace(/^(\s*browser_headless\s*=\s*)(true|false)/m, `$1${on}`);
  if (next === toml) return false;
  fs.writeFileSync(rt.config, next);
  return true;
}

/** Start flow2api if it isn't answering yet (detached, logs to flow2api.log next to it). */
async function ensureRunning(cfg: Flow2ApiConfig) {
  if (await healthy(cfg)) return;
  gs.__flowStart ??= (async () => {
    const rt = runtime();
    if (!rt || !fs.existsSync(rt.exe)) throw new Error("Mesin video belum terpasang di perangkat ini.");
    writeHeadless(!inHeadedFallback()); // hidden captcha browsers unless a fallback to visible Chrome is on
    // the captcha browser is the PC's Chrome (flow2api's own Chromium is not shipped)
    const browser = await import("@/lib/browser/chrome").then((m) => m.chromePath()).catch(() => "");
    const log = fs.openSync(path.join(rt.root, "flow2api.log"), "a");
    const child = spawn(rt.exe, rt.args, {
      cwd: rt.root,
      detached: true,
      windowsHide: true,
      stdio: ["ignore", log, log],
      env: { ...process.env, PYTHONIOENCODING: "utf-8", ...(browser ? { BROWSER_EXECUTABLE_PATH: browser } : {}) },
    });
    child.unref();
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await healthy(cfg)) return;
    }
    throw new Error("Mesin video tidak bisa dinyalakan. Coba lagi sebentar.");
  })().finally(() => (gs.__flowStart = null));
  await gs.__flowStart;
}

/**
 * The automatic speed is capped by the active Google accounts: recount them and let queued jobs start at once when
 * the limit went up (called on every generation and right after a Google login/removal).
 */
export async function refreshFlowLimit() {
  const [{ n }] = await db.select({ n: count() }).from(googleAccounts).where(eq(googleAccounts.status, "active"));
  noteActiveGoogleAccounts(n);
  const { drainSlots } = await import("@/lib/video"); // lazy: lib/video imports settings, keep this module light
  drainSlots();
}

export async function requireFlow2Api() {
  const cfg = loadFlow2ApiConfig();
  if (!cfg) throw new Error("Mesin video belum terpasang di perangkat ini.");
  await ensureRunning(cfg);
  await refreshFlowLimit();
  const want = captchaBrowsersFor(parallelLimit());
  if (gs.__flowCapacity?.want !== want) {
    gs.__flowCapacity = {
      want,
      done: ensureCaptchaCapacity(cfg, want).catch(() => {
        gs.__flowCapacity = undefined; // try again on the next request
      }),
    };
  }
  await gs.__flowCapacity?.done;
  return cfg;
}

/** Browser-captcha mode solves one captcha at a time per browser; size flow2api's pool to the speed setting (kept in its DB). */
async function ensureCaptchaCapacity(cfg: Flow2ApiConfig, want: number) {
  const conf = await admin(cfg, "/api/captcha/config");
  if (conf.captcha_method !== "browser" || Number(conf.browser_count) === want) return;
  await admin(cfg, "/api/captcha/config", { method: "POST", body: JSON.stringify({ ...conf, browser_count: want }) });
}

async function req(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 30_000) });
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- flow2api JSON
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (!res.ok) throw new Error(`flow2api ${res.status}: ${json?.detail ?? json?.error?.message ?? text.slice(0, 200)}`);
  return json;
}

// Admin session token, cached per process (flow2api keeps it in memory until it restarts).
const g = globalThis as unknown as { __flowAdmin?: { base: string; token: string } };

async function adminToken(cfg: Flow2ApiConfig, fresh = false) {
  if (!fresh && g.__flowAdmin?.base === cfg.baseUrl) return g.__flowAdmin.token;
  const j = await req(`${cfg.baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: cfg.adminUser, password: cfg.adminPass }),
  });
  g.__flowAdmin = { base: cfg.baseUrl, token: j.token };
  return j.token as string;
}

/** Admin call with one automatic re-login (flow2api forgets admin sessions on restart). */
async function admin(cfg: Flow2ApiConfig, path: string, init: RequestInit = {}) {
  const call = async (fresh: boolean) =>
    req(`${cfg.baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", authorization: `Bearer ${await adminToken(cfg, fresh)}`, ...(init.headers ?? {}) },
    });
  try {
    return await call(false);
  } catch (e) {
    if (e instanceof Error && /flow2api 401/.test(e.message)) return call(true);
    throw e;
  }
}

/** Connectivity + credentials check used by the settings page. */
export async function checkFlow2Api(cfg: Flow2ApiConfig) {
  const health = await req(`${cfg.baseUrl}/health`, { timeoutMs: 8000 });
  await adminToken(cfg, true); // validates admin user/pass
  const models = await req(`${cfg.baseUrl}/v1/models`, { headers: { authorization: `Bearer ${cfg.apiKey}` } }); // validates API key
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- flow2api JSON
  const videoModels = (models.data ?? []).map((m: any) => String(m.id)).filter((id: string) => /^(veo|omni)-/.test(id));
  return { activeTokens: Number(health.active_tokens ?? 0), captcha: String(health.captcha_method ?? ""), videoModels: videoModels.length };
}

export type BrowserCookie = { name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite?: string };

/** Register (or refresh) a Google/Flow session in flow2api. Returns the flow2api token id, email and credits. */
export async function upsertFlowSession(input: { tokenId?: number | null; st: string; cookies: BrowserCookie[]; remark: string }) {
  const cfg = await requireFlow2Api();
  const body = JSON.stringify({ st: input.st, google_cookies: JSON.stringify(input.cookies), remark: input.remark, video_enabled: true, image_enabled: true });
  if (input.tokenId) {
    await admin(cfg, `/api/tokens/${input.tokenId}`, { method: "PUT", body });
    const credits = await refreshFlowCredits(input.tokenId).catch(() => null);
    return { id: input.tokenId, email: null as string | null, credits };
  }
  const j = await admin(cfg, "/api/tokens", { method: "POST", body });
  return { id: Number(j.token.id), email: (j.token.email as string) ?? null, credits: j.token.credits != null ? Number(j.token.credits) : null };
}

/**
 * Remove flow2api sessions that no Google account in this app owns (e.g. deleted in Pengaturan while flow2api was
 * off). flow2api picks any session it has for each generation, so a leftover one (another laptop's account) would
 * be used silently: its credits drop unseen and the same account runs on two laptops at once.
 * Sessions younger than 5 minutes are kept: a login that is still being saved has no account row yet.
 * Only for the bundled sidecar (see the guard): an external flow2api is left alone.
 */
export async function pruneOrphanFlowSessions() {
  // only the app's own bundled flow2api: a source install (C:\BOT\flow2api) or FLOW2API_URL may serve other tools
  if (runtime()?.mode !== "sidecar" || process.env.FLOW2API_URL) return [];
  const cfg = await requireFlow2Api();
  const owned = new Set((await db.select({ t: googleAccounts.flowTokenId }).from(googleAccounts)).map((a) => a.t).filter((t): t is number => t != null));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- flow2api JSON
  const tokens: any[] = await admin(cfg, "/api/tokens");
  const removed: string[] = [];
  for (const t of Array.isArray(tokens) ? tokens : []) {
    const id = Number(t.id);
    const age = t.created_at ? Date.now() - Date.parse(t.created_at) : Infinity;
    if (!id || owned.has(id) || age < 5 * 60_000) continue;
    await admin(cfg, `/api/tokens/${id}`, { method: "DELETE" });
    removed.push(String(t.email ?? id));
  }
  if (removed.length) console.log(`[flow2api] sesi tanpa akun di app dihapus: ${removed.join(", ")}`);
  return removed;
}

/** Re-read the Flow credits of every active Google account (after a render used some). */
export async function syncAllFlowCredits() {
  await pruneOrphanFlowSessions().catch((e) => console.error("[flow2api] gagal membersihkan sesi:", e));
  const list = await db.select().from(googleAccounts).where(eq(googleAccounts.status, "active"));
  for (const a of list) {
    if (!a.flowTokenId) continue;
    const credits = await refreshFlowCredits(a.flowTokenId).catch(() => null);
    if (credits != null) await db.update(googleAccounts).set({ credits, lastSyncAt: new Date() }).where(eq(googleAccounts.id, a.id));
  }
}

export async function refreshFlowCredits(tokenId: number) {
  const cfg = await requireFlow2Api();
  const j = await admin(cfg, `/api/tokens/${tokenId}/refresh-credits`, { method: "POST" });
  return j.credits != null ? Number(j.credits) : null;
}

export async function deleteFlowSession(tokenId: number) {
  const cfg = await requireFlow2Api();
  await admin(cfg, `/api/tokens/${tokenId}`, { method: "DELETE" });
}

// flow2api streams Chinese status lines; show Indonesian for the common ones, drop the rest.
const CJK = /[㐀-鿿]/;
function humanize(line: string) {
  // order matters: specific, known flow2api messages first (see flow2api src for the raw strings)
  if (/queue wait timeout/i.test(line)) return "Antrean Flow penuh, dicoba lagi otomatis.";
  if (/recaptcha/i.test(line)) return "Captcha Flow gagal (skor rendah), dicoba lagi otomatis.";
  if (/没有可用的token|无可用|并发已满|concurren|No available (projects|token)/i.test(line)) return "Semua akun Flow sedang sibuk (slot penuh), dicoba lagi otomatis.";
  if (/浏览器启动冷却|没有可用的浏览器|标签页不可用|cooldown/i.test(line)) return "Browser verifikasi Flow belum siap, dicoba lagi otomatis.";
  if (/AT无效|刷新失败|Token validation failed/i.test(line)) return "Token Flow sedang diperbarui, dicoba lagi otomatis.";
  if (/请重新同步|未返回已登录账号|login required|unauthori[sz]ed|\b401\b|Token not found/i.test(line)) return "Sesi akun Google habis. Sinkron atau login ulang akunnya.";
  if (/credit|余额|insufficient/i.test(line)) return "Kredit Flow tidak cukup.";
  if (/429|quota|rate limit/i.test(line)) return "Kuota/limit akun Flow tercapai, dicoba lagi otomatis.";
  return CJK.test(line) ? null : line;
}

export type ChatContent = string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];

/** Streamed chat completion against flow2api (generation takes minutes). Returns the full assistant text. */
/** The request's own timeout, plus the project's "Batalkan" when it runs inside a job. */
function cancelOr(timeout: AbortSignal) {
  const job = jobSignal();
  return job ? AbortSignal.any([timeout, job]) : timeout;
}

async function flowChat(model: string, content: ChatContent, onProgress?: Progress) {
  const cfg = await requireFlow2Api();
  const res = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content }], stream: true }),
    signal: cancelOr(AbortSignal.timeout(30 * 60_000)),
  });
  if (!res.ok || !res.body) throw new Error(`flow2api ${res.status}: ${(await res.text()).slice(0, 300)}`);

  let out = "";
  let buffer = "";
  const decoder = new TextDecoder();
  // Flow is silent between "submitted" and "done" (images ~30-60 s, videos report % only every ~20 s),
  // so creep the bar slowly; real checkpoints only ever push it forward.
  let pct = 0;
  let text = "Sedang dibuat di Flow...";
  const report = (t: string, p?: number) => {
    text = t;
    if (p != null) pct = Math.max(pct, p);
    onProgress?.(text, pct);
  };
  const creep = setInterval(() => pct >= 28 && pct < 92 && report(text, pct + (model.startsWith("omni") ? 1 : 3)), 3000); // ponytail: fixed guess, tune if bars stall/finish early
  try {
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const j = JSON.parse(data);
        if (j.error) {
          const msg = String(j.error.message ?? JSON.stringify(j.error));
          throw new Error(withRaw(humanize(msg), msg), { cause: msg });
        }
        const status: string = j.choices?.[0]?.delta?.reasoning_content ?? "";
        if (status.trim()) {
          const st = stage(status);
          report(st.text, st.pct);
        }
        const piece: string = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? "";
        if (piece) {
          out += piece;
          const last = piece.trim().split("\n").filter(Boolean).at(-1);
          if (last && !last.startsWith("<") && !last.startsWith("![")) report(humanize(last)?.slice(0, 160) ?? "Sedang dibuat di Flow...");
        }
      } catch (e) {
        if (e instanceof Error && !(e instanceof SyntaxError)) throw e;
      }
    }
  }
  } finally {
    clearInterval(creep);
  }
  return out;
}

/** "Terjemahan · (asli: …)" so the user-facing text stays clear but the real flow2api cause isn't lost. */
function withRaw(human: string | null, raw: string) {
  const r = raw.replace(/\s+/g, " ").trim().slice(0, 80);
  return human && human !== raw ? `${human} (asli: ${r})` : r;
}

function failReason(out: string) {
  const lines = out.trim().split("\n").filter(Boolean);
  const human = lines.map(humanize).filter(Boolean).at(-1) ?? null;
  return withRaw(human, lines.at(-1) ?? "respons kosong").slice(0, 300);
}

export type Progress = (line: string, pct?: number) => void;

/**
 * flow2api's own (Chinese) stage lines → short Indonesian status + a rough percentage.
 * Stages give fixed checkpoints; for videos flow2api also streams "生成进度: N%" (an elapsed-time estimate).
 */
function stage(line: string): { text: string; pct?: number } {
  const t = line.trim();
  const video = t.match(/生成进度[:：]\s*(\d{1,3})%/);
  if (video) return { text: "Video sedang dibuat di Flow...", pct: Math.max(32, Math.min(94, Number(video[1]))) };
  const up = t.match(/上传第\s*(\d+)\s*\/\s*(\d+)/);
  if (up) return { text: `Mengunggah foto acuan ${up[1]}/${up[2]}...`, pct: 10 + Math.round((10 * Number(up[1])) / Number(up[2])) };
  if (/上传完成/.test(t)) return { text: "Foto acuan terunggah, verifikasi captcha...", pct: 22 };
  if (/打码|captcha/i.test(t)) return { text: "Verifikasi captcha & mengirim ke Flow...", pct: 28 };
  if (/链接|下载|缓存|返回/.test(t)) return { text: "Mengambil hasil...", pct: 95 };
  if (/初始化/.test(t)) return { text: "Menyiapkan...", pct: 8 };
  if (/启动/.test(t)) return { text: "Tugas dimulai...", pct: 4 };
  return { text: humanize(t)?.slice(0, 160) ?? "Sedang dibuat di Flow..." };
}

/**
 * flow2api's captcha browser sometimes wedges after running for a long time; every request then fails with
 * "Failed to obtain reCAPTCHA token" until the process restarts. Restart it (once, shared by all concurrent
 * requests) and retry. Requests that were cut off by someone else's restart also retry instead of failing.
 * ponytail: Windows-only restart (finds the PID by port); other OSes just surface the error.
 */
const rs = globalThis as unknown as { __flowRestart?: { gen: number; running: Promise<void> | null }; __flowActive?: number };
rs.__flowRestart ??= { gen: 0, running: null };

async function withCaptchaRetry<T>(fn: () => Promise<T>, onProgress?: Progress) {
  rs.__flowActive = (rs.__flowActive ?? 0) + 1;
  try {
    return await captchaRetry(fn, onProgress);
  } finally {
    rs.__flowActive = Math.max(0, (rs.__flowActive ?? 1) - 1);
    // fallback time is over and nothing is generating: back to hidden captcha browsers
    if (!rs.__flowActive && gs.__flowHeadedUntil && !inHeadedFallback()) {
      gs.__flowHeadedUntil = undefined;
      if (writeHeadless(true)) void restartFlow2Api().catch(() => {});
    }
  }
}

async function captchaRetry<T>(fn: () => Promise<T>, onProgress?: Progress) {
  const state = rs.__flowRestart!;
  const gen = state.gen;
  try {
    return await fn();
  } catch (e) {
    throwIfCancelled(); // "Batalkan": no captcha fallback or retry
    if (process.platform !== "win32" || !(e instanceof Error)) throw e;
    const raw = `${e.message} ${String(e.cause ?? "")}`;
    if (state.gen !== gen || state.running) {
      // another request restarted flow2api while we were waiting; just wait for it and go again
      await state.running;
    } else if (/queue wait timeout/i.test(raw)) {
      // flow2api was busy, not broken: wait a little and try again (no restart, it would kill other jobs)
      onProgress?.("Antrean Flow penuh, mencoba lagi...");
      await new Promise((r) => setTimeout(r, 5000));
    } else if (/obtain reCAPTCHA token|recaptcha/i.test(raw)) {
      if (!inHeadedFallback()) {
        // hidden browser turned down: fall back to visible Chrome for a while
        gs.__flowHeadedUntil = Date.now() + HEADED_FALLBACK_MIN * 60_000;
        writeHeadless(false);
        onProgress?.("Captcha gagal di mode tersembunyi, membuka Chrome verifikasi...");
      } else onProgress?.("Captcha macet, menyalakan ulang mesin video...");
      await restartFlow2Api();
    } else throw e;
    return fn();
  }
}

export function restartFlow2Api() {
  const state = rs.__flowRestart!;
  state.running ??= (async () => {
    state.gen++;
    const cfg = loadFlow2ApiConfig();
    if (!cfg) return;
    const port = new URL(cfg.baseUrl).port || "80";
    const { execFileSync } = await import("node:child_process");
    const netstat = execFileSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8", windowsHide: true });
    const pid = netstat.split("\n").map((l) => l.trim().split(/\s+/)).find((c) => c[1]?.endsWith(`:${port}`) && c[3] === "LISTENING")?.[4];
    if (pid && pid !== "0") {
      try {
        execFileSync("taskkill", ["/PID", pid, "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      } catch {}
    }
    for (let i = 0; i < 10 && (await healthy(cfg)); i++) await new Promise((r) => setTimeout(r, 500));
    g.__flowAdmin = undefined; // admin sessions die with the process
    await ensureRunning(cfg);
  })().finally(() => (state.running = null));
  return state.running;
}

const withRefs = (prompt: string, refs: string[]): ChatContent =>
  refs.length ? [{ type: "text", text: prompt }, ...refs.map((url) => ({ type: "image_url" as const, image_url: { url } }))] : prompt;

/** Video (text-to-video, or reference mode when refs are data URLs). Returns the result URL. */
export async function generateFlowVideo(model: string, prompt: string, onProgress?: Progress, refs: string[] = []) {
  const out = await withCaptchaRetry(() => flowChat(model, withRefs(prompt, refs), onProgress), onProgress);
  const url = out.match(/<video[^>]*\ssrc=['"]([^'"]+)['"]/i)?.[1] ?? out.match(/https?:\/\/[^\s'")]+\.mp4[^\s'")]*/i)?.[0];
  if (!url) throw new Error(`Flow gagal membuat video: ${failReason(out)}`, { cause: out });
  return url;
}

export const FLOW_IMAGE_MODEL = "gemini-3.1-flash-image-portrait"; // Nano Banana, 9:16

/** Image (Nano Banana) using product photos as references. Returns an http(s) URL or a data URL. */
export async function generateFlowImage(prompt: string, refs: string[], onProgress?: Progress) {
  const out = await withCaptchaRetry(() => flowChat(FLOW_IMAGE_MODEL, withRefs(prompt, refs), onProgress), onProgress);
  const url = out.match(/!\[[^\]]*\]\(([^)\s]+)\)/)?.[1] ?? out.match(/<img[^>]*\ssrc=['"]([^'"]+)['"]/i)?.[1];
  if (!url) throw new Error(`Flow gagal membuat gambar: ${failReason(out)}`, { cause: out });
  return url;
}
