import "server-only";
import { captchaBrowsersFor, parallelLimit } from "@/lib/settings";
import { eq } from "drizzle-orm";
import { startEngine, restartEngine, type Flow2ApiConfig } from "@/lib/engine/flow2api-engine";
import { db } from "@/lib/db";
import { googleAccounts } from "@/lib/db/schema";
import { refreshGoogleSession } from "@/lib/platforms/google";

// Client for the local video engine (flow2api, https://github.com/TheSmallHanCat/flow2api, MIT):
// admin API to register Google/Flow sessions, OpenAI-compatible API to generate.
// Installing, starting and stopping the engine lives in lib/engine/flow2api-engine.ts.

export { loadFlow2ApiConfig, type Flow2ApiConfig } from "@/lib/engine/flow2api-engine";

// Capacity sizing runs once per wanted value across concurrent callers; engine settings and the
// account check run at most every REVIVE_MS.
const gs = globalThis as unknown as {
  __flowCapacity?: { want: number; done: Promise<void> };
  __flowRevive?: { at: number; run: Promise<void> | null };
  __flowResynced?: Map<number, number>; // flow2api token id → last automatic re-sync
};
const RESYNC_EVERY_MS = 10 * 60_000;
const REVIVE_MS = 20_000;
const NO_TOKEN = /没有可用的Token|所有Token都处于禁用|No available token/i;

export async function requireFlow2Api() {
  const cfg = await startEngine();
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
  await reviveAccounts(cfg).catch(() => {});
  return cfg;
}

/**
 * flow2api switches an account off after a few errors in a row, and it counts its own captcha-queue
 * timeouts as account errors: one burst of parallel jobs on a cold engine disables a healthy account
 * and every later job fails with "no token available". Traktiva owns the engine, so it (1) raises that
 * threshold and (2) switches back on accounts that were disabled without a real reason (not banned for
 * 429, not expired). Real session problems are detected by Traktiva's own sync instead.
 */
async function reviveAccounts(cfg: Flow2ApiConfig, force = false) {
  const st = (gs.__flowRevive ??= { at: 0, run: null });
  if (st.run) return st.run;
  if (!force && Date.now() - st.at < REVIVE_MS) return;
  st.run = (async () => {
    const conf = await admin(cfg, "/api/admin/config");
    if (Number(conf.error_ban_threshold) < 10) {
      await admin(cfg, "/api/admin/config", { method: "POST", body: JSON.stringify({ error_ban_threshold: 10 }) });
    }
    const j = await admin(cfg, "/api/tokens");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- flow2api JSON
    const tokens: any[] = Array.isArray(j) ? j : j?.tokens ?? [];
    const resynced = (gs.__flowResynced ??= new Map());
    for (const t of tokens) {
      if (t.is_active || t.ban_reason) continue;
      const expired = !!t.at_expired || (t.at_expires && Date.parse(t.at_expires) < Date.now());
      if (!expired) {
        await admin(cfg, `/api/tokens/${t.id}/enable`, { method: "POST" }).catch(() => {});
        continue;
      }
      // Access token expired and flow2api couldn't renew it from the cookies it holds ("请重新同步 Google
      // Cookies"): the account's own browser profile still has a live Google login, so take fresh cookies
      // from there, hand them to flow2api (which mints a new access token) and switch the account back on.
      const id = Number(t.id);
      if (Date.now() - (resynced.get(id) ?? 0) < RESYNC_EVERY_MS) continue;
      resynced.set(id, Date.now());
      await resyncFromProfile(cfg, id).catch((e) => console.error(`[flow2api] re-sync token ${id} failed:`, e));
    }
  })().finally(() => {
    st.at = Date.now();
    st.run = null;
  });
  return st.run;
}

/** Fresh cookies from the Google account's profile → flow2api (new access token) → account on again. */
async function resyncFromProfile(cfg: Flow2ApiConfig, tokenId: number) {
  const a = await db.select().from(googleAccounts).where(eq(googleAccounts.flowTokenId, tokenId)).get();
  if (!a) return;
  const s = await refreshGoogleSession(a.sessionKey);
  if (!s) {
    await db.update(googleAccounts).set({ status: "need_login", lastError: "Sesi Google habis, login ulang.", lastSyncAt: new Date() }).where(eq(googleAccounts.id, a.id));
    return;
  }
  await pushSession(cfg, tokenId, s.st, s.cookies, `Traktiva ${a.email}`);
  const credits = await admin(cfg, `/api/tokens/${tokenId}/refresh-credits`, { method: "POST" }).then((j) => (j.credits != null ? Number(j.credits) : null), () => null);
  await db.update(googleAccounts).set({ credits, status: "active", lastError: null, lastSyncAt: new Date() }).where(eq(googleAccounts.id, a.id));
}

/** Update an existing flow2api token with a fresh cookie set (flow2api turns it into a new access token) and enable it. */
async function pushSession(cfg: Flow2ApiConfig, tokenId: number, st: string, cookies: BrowserCookie[], remark: string) {
  const body = JSON.stringify({ st, google_cookies: JSON.stringify(cookies), remark, video_enabled: true, image_enabled: true });
  await admin(cfg, `/api/tokens/${tokenId}`, { method: "PUT", body });
  await admin(cfg, `/api/tokens/${tokenId}/enable`, { method: "POST" }); // PUT renews the token but leaves a disabled one disabled
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
    await pushSession(cfg, input.tokenId, input.st, input.cookies, input.remark);
    const credits = await refreshFlowCredits(input.tokenId).catch(() => null);
    return { id: input.tokenId, email: null as string | null, credits };
  }
  const j = await admin(cfg, "/api/tokens", { method: "POST", body });
  return { id: Number(j.token.id), email: (j.token.email as string) ?? null, credits: j.token.credits != null ? Number(j.token.credits) : null };
}

export async function refreshFlowCredits(tokenId: number) {
  const cfg = await requireFlow2Api();
  const j = await admin(cfg, `/api/tokens/${tokenId}/refresh-credits`, { method: "POST" });
  return j.credits != null ? Number(j.credits) : null;
}

// ---------- credits stay current after generating ----------

const CREDIT_SYNC_MS = 20_000;
const cs = globalThis as unknown as { __creditSync?: { last: number; timer: ReturnType<typeof setTimeout> | null; running: boolean } };

/**
 * After a successful image/clip: re-read every Flow account's credits from flow2api and store them, so
 * Pengaturan AI and the status bar show what is left. Throttled (≤ 1 run per 20 s, plus one trailing run
 * so the last generation of a batch is always counted). Cheap API call, no browser involved.
 */
export function syncFlowCreditsSoon() {
  const st = (cs.__creditSync ??= { last: 0, timer: null, running: false });
  if (st.timer) return; // a run is already scheduled
  const wait = Math.max(0, st.last + CREDIT_SYNC_MS - Date.now());
  st.timer = setTimeout(() => {
    st.timer = null;
    if (st.running) return syncFlowCreditsSoon();
    st.running = true;
    st.last = Date.now();
    void syncAllCredits()
      .catch((e) => console.error("[flow2api] credit sync failed:", e))
      .finally(() => (st.running = false));
  }, wait);
}

async function syncAllCredits() {
  const rows = await db.select().from(googleAccounts).where(eq(googleAccounts.status, "active"));
  for (const a of rows) {
    if (!a.flowTokenId) continue;
    const credits = await refreshFlowCredits(a.flowTokenId).catch(() => null);
    if (credits != null) await db.update(googleAccounts).set({ credits, lastSyncAt: new Date() }).where(eq(googleAccounts.id, a.id));
  }
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
  if (NO_TOKEN.test(line)) return "Tidak ada akun Flow yang aktif saat ini (dinonaktifkan atau cooldown).";
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
async function flowChat(model: string, content: ChatContent, onProgress?: Progress) {
  const cfg = await requireFlow2Api();
  const res = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content }], stream: true }),
    signal: AbortSignal.timeout(30 * 60_000),
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
 */
const rs = globalThis as unknown as { __flowRestart?: { gen: number; running: Promise<void> | null } };
rs.__flowRestart ??= { gen: 0, running: null };

async function withCaptchaRetry<T>(fn: () => Promise<T>, onProgress?: Progress) {
  const state = rs.__flowRestart!;
  const gen = state.gen;
  try {
    return await fn();
  } catch (e) {
    if (!(e instanceof Error)) throw e;
    const raw = `${e.message} ${String(e.cause ?? "")}`;
    if (state.gen !== gen || state.running) {
      // another request restarted flow2api while we were waiting; just wait for it and go again
      await state.running;
    } else if (/queue wait timeout/i.test(raw)) {
      // flow2api was busy, not broken: wait a little and try again (no restart, it would kill other jobs)
      onProgress?.("Antrean Flow penuh, mencoba lagi...");
      await new Promise((r) => setTimeout(r, 5000));
    } else if (NO_TOKEN.test(raw)) {
      // usually an account flow2api switched off after captcha hiccups: switch it back on and go again
      onProgress?.("Mengaktifkan ulang akun Flow...");
      const cfg = await requireFlow2Api();
      await reviveAccounts(cfg, true);
    } else if (/obtain reCAPTCHA token/i.test(raw)) {
      onProgress?.("Captcha macet, menyalakan ulang mesin video...");
      await restartFlow2Api();
    } else throw e;
    return fn();
  }
}

export function restartFlow2Api() {
  const state = rs.__flowRestart!;
  state.running ??= (async () => {
    state.gen++;
    g.__flowAdmin = undefined; // admin sessions die with the process
    gs.__flowCapacity = undefined;
    await restartEngine();
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
