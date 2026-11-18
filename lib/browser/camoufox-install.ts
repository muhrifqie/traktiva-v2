import "server-only";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { CamoufoxFetcher, camoufoxPath, INSTALL_DIR } from "camoufox-js/dist/pkgman.js";
import { browsersDir, compatFlag, getRepoName, setActive, versionFolderName } from "camoufox-js/dist/multiversion.js";

// Installs the Camoufox browser (~500 MB) in the background with progress the UI can show.
// camoufox-js has its own installer, but it only reports to the terminal and restarts from 0 on every
// network hiccup. This one resumes (HTTP Range) and survives flaky connections. Same folder layout as
// camoufox-js, so its launcher picks the result up directly.

export type CamoufoxState = "ready" | "missing" | "downloading" | "verifying" | "extracting" | "failed";
export type CamoufoxStatus = {
  state: CamoufoxState;
  received: number; // bytes
  total: number; // bytes, 0 = unknown yet
  speed: number; // bytes/s, smoothed
  error: string | null;
};

type Job = CamoufoxStatus & { done: Promise<void> };
const g = globalThis as unknown as { __camoufoxJob?: Job | null; __camoufoxFail?: string | null };

const MAX_ATTEMPTS = 40;
const STALL_MS = 30_000; // no bytes for this long = drop the connection and resume
const execFileP = promisify(execFile);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function camoufoxInstalled() {
  try {
    camoufoxPath();
    return true;
  } catch {
    return false;
  }
}

export function camoufoxStatus(): CamoufoxStatus {
  const job = g.__camoufoxJob;
  if (job) return { state: job.state, received: job.received, total: job.total, speed: job.speed, error: null };
  if (camoufoxInstalled()) return { state: "ready", received: 0, total: 0, speed: 0, error: null };
  const error = g.__camoufoxFail ?? null;
  return { state: error ? "failed" : "missing", received: 0, total: 0, speed: 0, error };
}

/** Start (or join) the background install. Resolves when Camoufox is ready; rejects on failure. */
export function installCamoufox(): Promise<void> {
  if (g.__camoufoxJob) return g.__camoufoxJob.done;
  if (camoufoxInstalled()) return Promise.resolve();
  const job: Job = { state: "downloading", received: 0, total: 0, speed: 0, error: null, done: Promise.resolve() };
  g.__camoufoxFail = null;
  g.__camoufoxJob = job;
  job.done = run(job)
    .catch((e) => {
      g.__camoufoxFail = e instanceof Error ? e.message : String(e);
      console.error("[camoufox] install failed:", e);
      throw e;
    })
    .finally(() => {
      g.__camoufoxJob = null;
    });
  job.done.catch(() => {}); // callers that only kick it off must not see an unhandled rejection
  return job.done;
}

async function run(job: Job) {
  const fetcher = new CamoufoxFetcher();
  await withRetry(() => fetcher.init(), 5);
  const folder = versionFolderName(fetcher.version, fetcher.release, fetcher.sha256);
  const relativePath = `browsers/${getRepoName("daijro/camoufox")}/${folder}`;
  const installDir = path.join(INSTALL_DIR.toString(), relativePath);
  fs.mkdirSync(browsersDir(), { recursive: true });
  fs.writeFileSync(compatFlag(), ""); // tells the Python library this folder uses its layout

  if (!fs.existsSync(path.join(installDir, "version.json"))) {
    // Kept between attempts (and app restarts) so a dropped connection resumes instead of starting over.
    const part = path.join(INSTALL_DIR.toString(), `${folder}.zip.part`);
    await download(fetcher.url, part, job);

    job.state = "verifying";
    if (fetcher.sha256 && (await sha256(part)) !== fetcher.sha256.toLowerCase()) {
      fs.rmSync(part, { force: true });
      throw new Error("File Camoufox rusak saat diunduh. Coba unduh lagi.");
    }

    job.state = "extracting";
    const staging = fs.mkdtempSync(path.join(browsersDir(), ".staging-"));
    try {
      await extract(fetcher, part, staging);
      fetcher.setVersion(staging);
      fs.mkdirSync(path.dirname(installDir), { recursive: true });
      fs.rmSync(installDir, { recursive: true, force: true }); // leftover of an interrupted extract
      fs.renameSync(staging, installDir);
    } finally {
      fs.rmSync(staging, { recursive: true, force: true });
    }
    fs.rmSync(part, { force: true });
  }
  setActive(relativePath);
  if (!camoufoxInstalled()) throw new Error("Camoufox terpasang tapi tidak bisa dipakai.");
}

async function download(url: string, file: string, job: Job) {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const have = fs.existsSync(file) ? fs.statSync(file).size : 0;
    job.received = have;
    const ctrl = new AbortController();
    let stall = setTimeout(() => ctrl.abort(), STALL_MS);
    try {
      const res = await fetch(url, { headers: have ? { Range: `bytes=${have}-` } : {}, signal: ctrl.signal });
      if (res.status === 416) return; // already complete
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const resumed = res.status === 206;
      const len = Number(res.headers.get("content-length") || 0);
      job.total = len ? (resumed ? have + len : len) : job.total;
      if (!resumed) job.received = 0;
      const out = fs.createWriteStream(file, { flags: resumed ? "a" : "w" });
      try {
        let windowStart = Date.now();
        let windowBytes = 0;
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          clearTimeout(stall);
          stall = setTimeout(() => ctrl.abort(), STALL_MS);
          if (!out.write(chunk)) await new Promise<void>((r) => out.once("drain", () => r()));
          job.received += chunk.length;
          windowBytes += chunk.length;
          const dt = Date.now() - windowStart;
          if (dt >= 1000) {
            const now = (windowBytes * 1000) / dt;
            job.speed = job.speed ? job.speed * 0.7 + now * 0.3 : now;
            windowStart = Date.now();
            windowBytes = 0;
          }
        }
      } finally {
        await new Promise<void>((r) => out.end(() => r()));
      }
      if (!job.total || job.received >= job.total) return;
      throw new Error("Koneksi terputus");
    } catch (e) {
      lastErr = e;
      job.speed = 0;
      await sleep(Math.min(15_000, 2000 + attempt * 1000));
    } finally {
      clearTimeout(stall);
    }
  }
  throw new Error(`Gagal mengunduh Camoufox (koneksi tidak stabil): ${lastErr instanceof Error ? lastErr.message : lastErr}`);
}

async function sha256(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/** Windows' built-in tar extracts zips without blocking this process; AdmZip (sync) is the fallback. */
async function extract(fetcher: CamoufoxFetcher, zip: string, dest: string) {
  if (process.platform === "win32") {
    const tar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
    if (fs.existsSync(tar)) {
      try {
        await execFileP(tar, ["-xf", zip, "-C", dest], { windowsHide: true });
        return;
      } catch {
        fs.rmSync(dest, { recursive: true, force: true });
        fs.mkdirSync(dest, { recursive: true });
      }
    }
  }
  await fetcher.extractZip(zip, dest);
}

async function withRetry<T>(fn: () => Promise<T>, tries: number): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(3000);
    }
  }
}
