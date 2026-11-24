// In-app update without electron-updater (node_modules are not packed into the app): read latest.yml that
// electron-builder writes next to the installer, download the installer with progress, check its SHA-512, run it
// silently (same flags electron-updater uses) and quit; the installer starts the new version when it is done.
// The download host is fixed here on purpose: nothing from the network can point the app at another file.
const { app } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");
const { spawn } = require("node:child_process");

const BASE = "https://download.traktiva.site/";
let running = null;

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

/**
 * Download + install the newest version. `send(progress)` gets { stage, received, total }.
 * Resolves { ok:false, message } on failure; on success the app quits while the installer runs.
 */
async function install(send) {
  if (!app.isPackaged) return { ok: false, message: "Update di dalam app hanya untuk versi terpasang." };
  if (running) return running;
  running = (async () => {
    try {
      send({ stage: "check" });
      const info = await latest();
      if (!newer(info.version, app.getVersion())) return { ok: false, message: "Kamu sudah memakai versi terbaru." };
      const dest = path.join(app.getPath("temp"), `traktiva-update-${info.version}.exe`);
      const hash = crypto.createHash("sha512");
      const out = fs.createWriteStream(dest);
      let received = 0;
      let last = 0;
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
      await new Promise((r) => out.end(r));
      send({ stage: "verify" });
      if (hash.digest("base64") !== info.sha512) {
        fs.rmSync(dest, { force: true });
        return { ok: false, message: "File update rusak (hash tidak cocok). Coba lagi." };
      }
      send({ stage: "install" });
      // --updated: the installer knows it is an update; /S: silent into the same folder; --force-run: start the app after
      spawn(dest, ["--updated", "/S", "--force-run"], { detached: true, stdio: "ignore" }).unref();
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

module.exports = { install, latest, newer };
