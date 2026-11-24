// In-app update without electron-updater (node_modules are not packed into the app): read latest.yml that
// electron-builder writes next to the installer, download the installer with progress, check its SHA-512, run it
// silently (same flags electron-updater uses) and quit; the installer starts the new version when it is done.
//
// Automatic (startAuto): the packaged app checks shortly after start and every few hours, downloads a newer version
// quietly into <userData>/updates and verifies it. Once ready it is installed when the user closes the app (no
// restart), or right away when the admin marked that release as mandatory. "Update sekarang" uses the ready file.
// The download host is fixed here on purpose: nothing from the network can point the app at another file.
const { app } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");
const { spawn } = require("node:child_process");

const BASE = "https://download.traktiva.site/";
let running = null;
const FIRST_CHECK_MS = 60_000; // let the app finish starting first
const CHECK_EVERY_MS = 4 * 3600_000;
/** A verified installer waiting to be installed: { version, file } */
let ready = null;
let installing = false;
const cacheDir = () => path.join(app.getPath("userData"), "updates");

/** "1.10.0" > "1.9.3" */
function newer(a, b) {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

function get(url, onData) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "cache-control": "no-cache" } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`Server update menjawab ${res.statusCode}`));
        }
        onData(res, Number(res.headers["content-length"] || 0));
        res.on("end", resolve).on("error", reject);
      })
      .on("error", reject)
      .setTimeout(60_000, function () {
        this.destroy(new Error("Koneksi ke server update terputus."));
      });
  });
}

/** version, file name and sha512 from latest.yml (flat keys only; no YAML library needed). */
async function latest() {
  let text = "";
  await get(`${BASE}latest.yml?t=${Date.now()}`, (res) => res.setEncoding("utf8").on("data", (d) => (text += d)));
  const pick = (k) => text.match(new RegExp(`^${k}:\\s*'?([^'\\r\\n]+)'?`, "m"))?.[1]?.trim();
  const info = { version: pick("version"), file: pick("path"), sha512: pick("sha512") };
  if (!info.version || !info.file || !info.sha512 || !/^[\w.-]+\.exe$/.test(info.file)) throw new Error("Info update tidak lengkap.");
  return info;
}

/** SHA-512 (base64) of a file on disk. */
function fileHash(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha512");
    fs.createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("base64"))).on("error", reject);
  });
}

/**
 * The newest installer on disk, verified: reused when it was downloaded before, else downloaded now.
 * Resolves the file path, or null when this app is already up to date.
 */
async function fetchVerified(send) {
  send({ stage: "check" });
  const info = await latest();
  if (!newer(info.version, app.getVersion())) return null;
  if (ready?.version === info.version && fs.existsSync(ready.file)) return ready.file;
  fs.mkdirSync(cacheDir(), { recursive: true });
  const dest = path.join(cacheDir(), `Traktiva-Setup-${info.version}.exe`);
  if (fs.existsSync(dest) && (await fileHash(dest)) === info.sha512) {
    ready = { version: info.version, file: dest };
    return dest;
  }
  const part = `${dest}.part`; // never a half file under the real name
  const hash = crypto.createHash("sha512");
  const out = fs.createWriteStream(part);
  let received = 0;
  let last = 0;
  try {
    await get(BASE + encodeURIComponent(info.file), (res, total) => {
      res.on("data", (chunk) => {
        received += chunk.length;
        hash.update(chunk);
        out.write(chunk);
        if (Date.now() - last > 250) {
          last = Date.now();
          send({ stage: "download", received, total });
        }
      });
    });
  } finally {
    await new Promise((r) => out.end(r));
  }
  send({ stage: "verify" });
  if (hash.digest("base64") !== info.sha512) {
    fs.rmSync(part, { force: true });
    throw new Error("File update rusak (hash tidak cocok). Coba lagi.");
  }
  fs.renameSync(part, dest);
  ready = { version: info.version, file: dest };
  return dest;
}

/** Run the installer silently into the same folder. `restart`: start the app again when done. */
function runInstaller(file, restart) {
  installing = true;
  spawn(file, ["--updated", "/S", ...(restart ? ["--force-run"] : [])], { detached: true, stdio: "ignore" }).unref();
}

/**
 * Download + install the newest version. `send(progress)` gets { stage, received, total }.
 * Resolves { ok:false, message } on failure; on success the app quits while the installer runs.
 */
async function install(send) {
  if (!app.isPackaged) return { ok: false, message: "Update di dalam app hanya untuk versi terpasang." };
  if (running) return running;
  running = (async () => {
    try {
      const file = await fetchVerified(send);
      if (!file) return { ok: false, message: "Kamu sudah memakai versi terbaru." };
      send({ stage: "install" });
      runInstaller(file, true);
      setTimeout(() => app.quit(), 800);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Update gagal." };
    } finally {
      running = null;
    }
  })();
  return running;
}

/** For the app: the version already downloaded and verified (installed on close), or null. */
const status = () => ({ ready: ready && fs.existsSync(ready.file) ? ready.version : null });

/** Installers of versions this app already has are not needed any more. */
function cleanCache() {
  try {
    for (const f of fs.readdirSync(cacheDir())) {
      const v = f.match(/^Traktiva-Setup-([\d.]+)\.exe(\.part)?$/)?.[1];
      if (!v || !newer(v, app.getVersion())) fs.rmSync(path.join(cacheDir(), f), { force: true });
    }
  } catch {}
}

/**
 * Automatic updates (packaged app only). `isMandatory(version)` says whether the admin marked that release as
 * mandatory (read from server-info); `onReady({ version })` tells the window a new version waits for the next close.
 */
function startAuto({ isMandatory, onReady }) {
  if (!app.isPackaged) return;
  cleanCache();
  const check = async () => {
    if (running || installing) return;
    try {
      const before = ready?.version;
      const file = await fetchVerified(() => {});
      if (!file) return;
      if (ready.version !== before) onReady({ version: ready.version });
      // a mandatory update does not wait for the user to close the app
      if (isMandatory(ready.version)) {
        runInstaller(file, true);
        setTimeout(() => app.quit(), 800);
      }
    } catch (e) {
      console.warn("[update] cek otomatis gagal:", e instanceof Error ? e.message : e); // offline etc.: next round
    }
  };
  setTimeout(check, FIRST_CHECK_MS);
  setInterval(check, CHECK_EVERY_MS).unref();
}

/** Closing the app with a downloaded update: install it quietly, without opening the app again. */
function installOnQuit() {
  if (installing || !ready || !fs.existsSync(ready.file) || !newer(ready.version, app.getVersion())) return false;
  runInstaller(ready.file, false);
  return true;
}

module.exports = { install, latest, newer, startAuto, status, installOnQuit };
