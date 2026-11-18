import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { execFile, execFileSync, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

// The video engine (flow2api, https://github.com/TheSmallHanCat/flow2api, MIT) as one unit owned by Traktiva:
//   install  — source (pinned commit) + Python venv + packages + captcha Chromium + config, with progress
//   run      — started on demand as a hidden child of this server (no console window), so it also stops
//              when the app stops; an engine left over from elsewhere on the same port is replaced
//   status   — one place the UI reads (Pengaturan card, status bar)
// Set FLOW2API_EXTERNAL=1 to use a flow2api you run yourself (Traktiva then never starts/stops it).

export const FLOW2API_DIR = process.env.FLOW2API_DIR || "C:\\BOT\\flow2api"; // ponytail: move under DATA_DIR for the packaged app
const SOURCE = { repo: "TheSmallHanCat/flow2api", commit: "c557d1756ccea74ee27842a4ad4da2b110b44284" };
const PYTHONS = ["3.13", "3.12", "3.11", "3.10"]; // flow2api's pinned packages have no wheels for newer Pythons yet
const EXTERNAL = process.env.FLOW2API_EXTERNAL === "1";
const LOG = path.join(FLOW2API_DIR, "flow2api.log");
const INSTALL_LOG = path.join(FLOW2API_DIR, "flow2api-install.log");
const execFileP = promisify(execFile);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- config (flow2api's own config/setting.toml is the single source) ----------

export type Flow2ApiConfig = { baseUrl: string; apiKey: string; adminUser: string; adminPass: string };

/** Read connection details from env (overrides) or flow2api's config/setting.toml. */
export function loadFlow2ApiConfig(): Flow2ApiConfig | null {
  let toml = "";
  try {
    toml = fs.readFileSync(path.join(FLOW2API_DIR, "config", "setting.toml"), "utf8");
  } catch {}
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

export const healthy = (cfg: Flow2ApiConfig, timeoutMs = 3000) =>
  fetch(`${cfg.baseUrl}/health`, { signal: AbortSignal.timeout(timeoutMs) }).then((r) => r.ok, () => false);

const venvPython = () =>
  process.platform === "win32" ? path.join(FLOW2API_DIR, ".venv", "Scripts", "python.exe") : path.join(FLOW2API_DIR, ".venv", "bin", "python");

export const engineInstalled = () =>
  EXTERNAL || (fs.existsSync(path.join(FLOW2API_DIR, "main.py")) && fs.existsSync(venvPython()) && !!loadFlow2ApiConfig());

// ---------- state ----------

export type EngineState = "missing" | "installing" | "stopped" | "starting" | "running" | "failed";
export type EngineStatus = {
  state: EngineState;
  external: boolean;
  installed: boolean;
  step: string | null; // install step label
  stepNo: number;
  steps: string[]; // all install step labels, in order
  pct: number | null; // within the current install step, when known
  detail: string | null; // last useful output line
  error: string | null;
  pid: number | null;
  startedAt: number | null;
  url: string | null;
};

type Install = { stepNo: number; step: string; pct: number | null; detail: string | null; done: Promise<void> };
type Engine = {
  child: ChildProcess | null;
  startedAt: number | null;
  starting: Promise<void> | null;
  stopping: boolean;
  install: Install | null;
  error: string | null;
};
const g = globalThis as unknown as { __flowEngine?: Engine };
const E = (g.__flowEngine ??= { child: null, startedAt: null, starting: null, stopping: false, install: null, error: null });

const STEPS = ["Mengunduh kode mesin", "Mencari Python", "Membuat lingkungan Python", "Memasang paket Python", "Mengunduh browser captcha", "Menyiapkan konfigurasi"];

const alive = (c: ChildProcess | null): c is ChildProcess => !!c && c.exitCode === null && c.signalCode === null;

export async function engineStatus(): Promise<EngineStatus> {
  const cfg = loadFlow2ApiConfig();
  const base: EngineStatus = {
    state: "stopped",
    external: EXTERNAL,
    installed: engineInstalled(),
    step: null,
    stepNo: 0,
    steps: STEPS,
    pct: null,
    detail: null,
    error: E.error,
    pid: alive(E.child) ? E.child.pid ?? null : null,
    startedAt: alive(E.child) ? E.startedAt : null,
    url: cfg?.baseUrl ?? null,
  };
  if (E.install) return { ...base, state: "installing", step: E.install.step, stepNo: E.install.stepNo, pct: E.install.pct, detail: E.install.detail, error: null };
  if (!engineInstalled()) return { ...base, state: E.error ? "failed" : "missing" };
  if (E.starting) return { ...base, state: "starting" };
  if (cfg && (await healthy(cfg, 1500))) return { ...base, state: "running", error: null };
  return { ...base, state: E.error ? "failed" : "stopped" };
}

function logTail(file = LOG, lines = 6) {
  try {
    const text = fs.readFileSync(file, "utf8");
    return text.slice(-4000).split(/\r?\n/).filter((l) => l.trim() && !/GET \/health/.test(l)).slice(-lines).join("\n");
  } catch {
    return "";
  }
}

// ---------- process ----------

/** PID listening on the engine port (Windows), to replace an engine this server did not start. */
async function listenerPid(cfg: Flow2ApiConfig) {
  if (process.platform !== "win32") return null;
  const port = new URL(cfg.baseUrl).port || "80";
  const { stdout } = await execFileP("netstat", ["-ano", "-p", "TCP"], { windowsHide: true });
  const pid = stdout.split("\n").map((l) => l.trim().split(/\s+/)).find((c) => c[1]?.endsWith(`:${port}`) && c[3] === "LISTENING")?.[4];
  return pid && pid !== "0" ? Number(pid) : null;
}

async function killTree(pid: number) {
  if (process.platform === "win32") await execFileP("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }).catch(() => {});
  else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
}

/** Make sure the engine answers; starts it (hidden) when needed. Throws a user-facing message on failure. */
export async function startEngine(): Promise<Flow2ApiConfig> {
  if (E.install) throw new Error("Mesin video sedang dipasang. Tunggu sampai selesai (lihat Pengaturan).");
  const cfg = loadFlow2ApiConfig();
  if (!cfg || !engineInstalled()) throw new Error("Mesin video belum terpasang. Pasang dulu di Pengaturan.");
  if (alive(E.child) && (await healthy(cfg))) return cfg;
  if (EXTERNAL) {
    if (await healthy(cfg)) return cfg;
    throw new Error(`Mesin video (eksternal) tidak menjawab di ${cfg.baseUrl}.`);
  }
  E.starting ??= (async () => {
    // Something else holds the port (an engine left over from an older Traktiva, or started by hand):
    // replace it, so the engine always runs hidden and is stopped together with the app.
    if (!alive(E.child)) {
      const pid = await listenerPid(cfg).catch(() => null);
      if (pid) await killTree(pid);
      for (let i = 0; i < 10 && (await healthy(cfg, 1000)); i++) await sleep(500);
    }
    if (!alive(E.child)) spawnEngine();
    for (let i = 0; i < 90; i++) {
      await sleep(1000);
      if (await healthy(cfg, 1500)) {
        E.error = null;
        return;
      }
      if (!alive(E.child)) break;
    }
    const tail = logTail();
    await stopEngine();
    E.error = `Mesin video gagal menyala.${tail ? `\n${tail}` : ""}`;
    throw new Error("Mesin video tidak bisa dinyalakan. Lihat detailnya di Pengaturan.");
  })().finally(() => (E.starting = null));
  await E.starting;
  return cfg;
}

function spawnEngine() {
  const log = fs.openSync(LOG, "a");
  fs.writeSync(log, `\n===== ${new Date().toISOString()} started by Traktiva =====\n`);
  // NOT detached: the child gets a hidden console (windowsHide) that its own children (Python's real
  // interpreter behind the venv launcher, the Playwright driver) inherit, so no terminal window ever opens.
  // Non-detached children are also killed by Windows when this server process exits.
  const child = spawn(venvPython(), ["main.py"], {
    cwd: FLOW2API_DIR,
    windowsHide: true,
    stdio: ["ignore", log, log],
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
  });
  fs.closeSync(log);
  E.child = child;
  E.startedAt = Date.now();
  E.stopping = false;
  child.on("exit", (code) => {
    if (E.child !== child) return;
    E.child = null;
    E.startedAt = null;
    if (!E.stopping) E.error = `Mesin video berhenti sendiri (kode ${code}).${logTail() ? `\n${logTail()}` : ""}`; // started again on the next request
  });
}

export async function stopEngine() {
  const child = E.child;
  if (!alive(child)) return;
  E.stopping = true;
  if (child.pid) await killTree(child.pid);
  for (let i = 0; i < 20 && alive(child); i++) await sleep(250);
  E.child = null;
  E.startedAt = null;
}

export async function restartEngine() {
  if (EXTERNAL) throw new Error("Mesin video eksternal dikelola di luar Traktiva.");
  await stopEngine();
  const cfg = loadFlow2ApiConfig();
  if (cfg) {
    const pid = await listenerPid(cfg).catch(() => null);
    if (pid) await killTree(pid);
  }
  E.error = null;
  return startEngine();
}

// Belt and braces next to the OS-level cleanup: stop the engine with this server.
const pg = globalThis as unknown as { __flowEngineExitHook?: boolean };
if (!pg.__flowEngineExitHook) {
  pg.__flowEngineExitHook = true;
  process.once("exit", () => {
    const pid = E.child?.pid;
    if (pid && process.platform === "win32") {
      try {
        execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      } catch {}
    } else E.child?.kill();
  });
}

// ---------- install ----------

/** Start (or join) the engine install. Resolves when it is ready to start. */
export function installEngine(): Promise<void> {
  if (E.install) return E.install.done;
  if (EXTERNAL) return Promise.reject(new Error("Mesin video eksternal dikelola di luar Traktiva."));
  const inst: Install = { stepNo: 0, step: STEPS[0], pct: null, detail: null, done: Promise.resolve() };
  E.error = null;
  E.install = inst;
  inst.done = runInstall(inst)
    .catch((e) => {
      E.error = e instanceof Error ? e.message : String(e);
      throw e;
    })
    .finally(() => (E.install = null));
  inst.done.catch(() => {});
  return inst.done;
}

function step(inst: Install, n: number) {
  inst.stepNo = n;
  inst.step = STEPS[n - 1];
  inst.pct = null;
  inst.detail = null;
  fs.mkdirSync(FLOW2API_DIR, { recursive: true });
  fs.appendFileSync(INSTALL_LOG, `\n== ${new Date().toISOString()} ${n}/${STEPS.length} ${inst.step}\n`);
}

async function runInstall(inst: Install) {
  await stopEngine();

  step(inst, 1);
  if (!fs.existsSync(path.join(FLOW2API_DIR, "main.py"))) await downloadSource(inst);

  step(inst, 2);
  const python = await findPython();

  step(inst, 3);
  if (!fs.existsSync(venvPython())) await run(inst, python.cmd, [...python.args, "-m", "venv", ".venv"]);

  step(inst, 4);
  await run(inst, venvPython(), ["-m", "pip", "install", "--disable-pip-version-check", "-r", "requirements.txt"], (l) => {
    const m = l.match(/^(Collecting|Downloading|Installing collected packages|Successfully installed)\s*(.*)/);
    if (m) inst.detail = `${m[1]} ${m[2]}`.slice(0, 120);
  });

  step(inst, 5);
  await run(inst, venvPython(), ["-m", "playwright", "install", "chromium"], (l) => {
    const pct = l.match(/(\d{1,3})% of/);
    if (pct) inst.pct = Number(pct[1]);
    const what = l.match(/^Downloading (.+?) (?:\d|from)/);
    if (what) inst.detail = what[1];
  });

  step(inst, 6);
  writeConfig();
  if (!loadFlow2ApiConfig()) throw new Error("Konfigurasi mesin video tidak valid.");
}

/** Source zip of the pinned commit (no git needed), extracted into FLOW2API_DIR. */
async function downloadSource(inst: Install) {
  const url = `https://codeload.github.com/${SOURCE.repo}/zip/${SOURCE.commit}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flow2api-"));
  try {
    const zip = path.join(tmp, "src.zip");
    let lastErr: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const total = Number(res.headers.get("content-length") || 0);
        const out = fs.createWriteStream(zip);
        let got = 0;
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          if (!out.write(chunk)) await new Promise<void>((r) => out.once("drain", () => r()));
          got += chunk.length;
          inst.pct = total ? Math.floor((got / total) * 100) : null;
          inst.detail = `${(got / 1024 / 1024).toFixed(1)} MB`;
        }
        await new Promise<void>((r) => out.end(() => r()));
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        await sleep(3000);
      }
    }
    if (lastErr) throw new Error(`Gagal mengunduh kode mesin video: ${lastErr instanceof Error ? lastErr.message : lastErr}`);
    const out = path.join(tmp, "x");
    fs.mkdirSync(out);
    // Windows' own bsdtar reads zips; a "tar" earlier on PATH (e.g. Git's GNU tar) does not.
    const tar = process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\Windows", "System32", "tar.exe") : "tar";
    await execFileP(tar, ["-xf", zip, "-C", out], { windowsHide: true });
    const root = path.join(out, fs.readdirSync(out)[0]); // <repo>-<commit>/
    fs.mkdirSync(FLOW2API_DIR, { recursive: true });
    fs.cpSync(root, FLOW2API_DIR, { recursive: true });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function findPython(): Promise<{ cmd: string; args: string[] }> {
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileP("py", ["-0p"], { windowsHide: true });
      for (const v of PYTHONS) if (new RegExp(`-V:${v.replace(".", "\\.")}\\b|-${v.replace(".", "\\.")}(-64)?\\b`).test(stdout)) return { cmd: "py", args: [`-${v}`] };
    } catch {}
  }
  for (const cmd of [...PYTHONS.map((v) => `python${v}`), "python3", "python"]) {
    try {
      const { stdout } = await execFileP(cmd, ["-c", "import sys;print('%d.%d'%sys.version_info[:2])"], { windowsHide: true });
      if (PYTHONS.includes(stdout.trim())) return { cmd, args: [] };
    } catch {}
  }
  throw new Error("Python 3.10–3.13 belum terpasang di komputer ini. Pasang dari python.org (centang \"Add to PATH\"), lalu klik Coba lagi.");
}

/** Run an install command hidden, streaming its output to the install log and a line callback. */
function run(inst: Install, cmd: string, args: string[], onLine?: (line: string) => void) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: FLOW2API_DIR, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8", PIP_NO_INPUT: "1" } });
    const tail: string[] = [];
    const feed = (buf: Buffer) => {
      const text = buf.toString("utf8");
      fs.appendFileSync(INSTALL_LOG, text);
      for (const raw of text.split(/[\r\n]+/)) {
        const line = raw.replace(/\x1b\[[0-9;]*m/g, "").trim();
        if (!line) continue;
        tail.push(line);
        if (tail.length > 8) tail.shift();
        onLine?.(line);
      }
    };
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    child.on("error", (e) => reject(new Error(`${inst.step} gagal: ${e.message}`)));
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${inst.step} gagal (kode ${code}).\n${tail.slice(-4).join("\n")}`))));
  });
}

/** Local-only config with random credentials; the browser captcha mode is what Traktiva sizes and uses. */
function writeConfig() {
  const file = path.join(FLOW2API_DIR, "config", "setting.toml");
  if (fs.existsSync(file)) return; // keep existing credentials (tokens in flow2api's DB stay valid)
  const example = fs.readFileSync(path.join(FLOW2API_DIR, "config", "setting_example.toml"), "utf8");
  const toml = example
    .replace(/^api_key = .*$/m, `api_key = "${randomBytes(16).toString("hex")}"`)
    .replace(/^admin_password = .*$/m, `admin_password = "${randomBytes(12).toString("base64url")}"`)
    .replace(/^host = "0\.0\.0\.0"/m, 'host = "127.0.0.1"')
    .replace(/^captcha_method = "[^"]*"/m, 'captcha_method = "browser"');
  fs.writeFileSync(file, toml);
}
