// License guard (Electron main only; the renderer never sees keys). Design: docs/license-design.md.
// Activation binds a license key to this PC's Ed25519 key pair; every session is a signed challenge, and the
// server answers with a token signed by its own key, which we verify with the pinned public key.
const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { execFile, execFileSync } = require("node:child_process");
const { app, safeStorage } = require("electron");

const PINS = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "license-pins.json"), "utf8"));
  } catch {
    return {};
  }
})();
// dev overrides (TRAKTIVA_LICENSE_URL=http://127.0.0.1:3820 against a local `node server/license/server.mjs`)
const URL_BASE = (process.env.TRAKTIVA_LICENSE_URL || PINS.url || "").replace(/\/+$/, "");
const SERVER_PUBLIC_KEY = process.env.TRAKTIVA_LICENSE_PUBKEY || PINS.serverPublicKey || "";
const HEARTBEAT_MS = 5 * 60_000;
const GRACE_MS = 10 * 60_000; // network hiccup tolerance before the app locks ("always online")

/** Is the guard on? Packaged builds always; dev with `npm run dev:electron:license` (--license) or a custom server URL. */
const enabled = () => app.isPackaged || process.argv.includes("--license") || !!process.env.TRAKTIVA_LICENSE_URL;
const configured = () => !!(URL_BASE && SERVER_PUBLIC_KEY);

// ---------------------------------------------------------------- device identity

const STORE = () => path.join(app.getPath("userData"), "license.json");

function machineGuid() {
  try {
    return execFileSync("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"], { encoding: "utf8", windowsHide: true }).match(/MachineGuid\s+REG_SZ\s+(\S+)/)?.[1] ?? "";
  } catch {
    return "";
  }
}

/** "Same PC" id used to reuse a slot on reinstall (Windows install + board UUID). */
async function deviceHash() {
  const hw = await hardware();
  return crypto.createHash("sha256").update(`${machineGuid()}|${hw?.board ?? os.hostname()}`).digest("hex");
}

// Hardware fingerprint (HWID lock): each component hashed on its own, so the server can tell WHICH part changed
// (RAM upgrade, new disk…) and the admin decides how many may differ (Pengaturan → Kunci hardware). Read once per start.
const HW_SCRIPT = [
  "$o=[ordered]@{}",
  "$o.board=(Get-CimInstance Win32_ComputerSystemProduct).UUID",
  "$o.boardSerial=(Get-CimInstance Win32_BaseBoard).SerialNumber",
  '$p=Get-CimInstance Win32_Processor|Select-Object -First 1; $o.cpu="$($p.ProcessorId)|$($p.Name)"',
  "$o.ram=[math]::Round(((Get-CimInstance Win32_PhysicalMemory|Measure-Object Capacity -Sum).Sum)/1GB)",
  "$o.disk=(Get-CimInstance Win32_DiskDrive|Sort-Object Index|Select-Object -First 1).SerialNumber",
  "$o.bios=(Get-CimInstance Win32_BIOS).SerialNumber",
  "$o|ConvertTo-Json -Compress",
].join("; ");
const JUNK = /^(0+|none|default string|to be filled.*|system serial number|not applicable)$/i; // OEM placeholders
let hwPromise = null;
/**
 * { board, boardSerial, cpu, ram, disk, bios } → 24-hex hashes; null when Windows could not be queried.
 * MachineGuid is left out on purpose (spoofers/cleaners change it with no hardware change); it only feeds deviceHash.
 */
function hardware() {
  hwPromise ??= new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", HW_SCRIPT], { windowsHide: true, timeout: 20_000 }, (err, out) => {
      let raw = null;
      try {
        raw = err ? null : JSON.parse(out);
      } catch {}
      if (!raw) {
        hwPromise = null; // try again on the next heartbeat
        return resolve(null);
      }
      const hw = {};
      for (const [k, v] of Object.entries(raw)) {
        const val = String(v ?? "").trim();
        if (val && !JUNK.test(val)) hw[k] = crypto.createHash("sha256").update(`traktiva-hw|${k}|${val}`).digest("hex").slice(0, 24);
      }
      resolve(hw);
    });
  });
  return hwPromise;
}

async function readStore() {
  try {
    const s = JSON.parse(fs.readFileSync(STORE(), "utf8"));
    // async decrypt (the sync one is deprecated in Electron 45); reads keys saved by encryptString too
    const { result: pem } = await safeStorage.decryptStringAsync(Buffer.from(s.key, "base64"));
    return { deviceId: s.deviceId, privateKey: crypto.createPrivateKey(pem) };
  } catch {
    return null;
  }
}

function writeStore(deviceId, privateKey) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Penyimpanan aman Windows tidak tersedia di perangkat ini.");
  const pem = privateKey.export({ format: "pem", type: "pkcs8" });
  fs.writeFileSync(STORE(), JSON.stringify({ deviceId, key: safeStorage.encryptString(pem).toString("base64") }), { mode: 0o600 });
}

const clearStore = () => fs.rmSync(STORE(), { force: true });

// ---------------------------------------------------------------- transport (HTTPS pinned to our server's certificate)

function post(pathname, body) {
  const url = new URL(URL_BASE + pathname);
  const data = JSON.stringify(body);
  // plain HTTP only for a local dev server
  if (url.protocol === "http:") {
    if (app.isPackaged || !["127.0.0.1", "localhost"].includes(url.hostname)) return Promise.reject(new Error("Server lisensi harus HTTPS."));
    return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: data, signal: AbortSignal.timeout(15_000) }).then((r) => r.json());
  }
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data) },
        timeout: 15_000,
        agent: false, // fresh TLS handshake every time, so the pin below is always checked (no reused socket)
        ca: PINS.certPem, // trust only our own self-signed certificate...
        checkServerIdentity: (_host, cert) => (cert.fingerprint256 === PINS.certSha256 ? undefined : new Error("Sertifikat server lisensi tidak cocok.")), // ...and exactly this one
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error(`Jawaban server lisensi tidak valid (${res.statusCode}).`));
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("Server lisensi tidak merespons.")));
    req.on("error", reject);
    req.end(data);
  });
}

// ---------------------------------------------------------------- token

function verifyToken(token) {
  const [body, sig] = String(token).split(".");
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(SERVER_PUBLIC_KEY, "base64")]);
  const ok = crypto.verify(null, Buffer.from(body), crypto.createPublicKey({ key: spki, format: "der", type: "spki" }), Buffer.from(sig, "base64url"));
  if (!ok) throw new Error("Token lisensi tidak sah.");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (payload.exp * 1000 < Date.now()) throw new Error("Token lisensi kedaluwarsa.");
  return payload;
}

// ---------------------------------------------------------------- public API

const state = { token: null, payload: null, lastOk: 0, timer: null };
/** Errors that mean "this PC must be activated again" (vs. "try again later"). */
const NEEDS_KEY = new Set(["device_unknown", "bad_signature", "revoked", "invalid_key"]);

/** Signed challenge → session token. Returns { ok, payload } or { ok:false, error, message, needKey, offline }. */
async function session() {
  const dev = await readStore();
  if (!dev) return { ok: false, error: "not_activated", message: "Masukkan key lisensi untuk mulai memakai Traktiva.", needKey: true };
  try {
    const n = await post("/v1/nonce", { deviceId: dev.deviceId });
    if (!n.ok) return { ok: false, error: n.error, message: n.message, needKey: NEEDS_KEY.has(n.error) };
    const signature = crypto.sign(null, Buffer.from(`traktiva-session:${n.nonce}`), dev.privateKey).toString("base64");
    const s = await post("/v1/session", { deviceId: dev.deviceId, nonce: n.nonce, signature, appVersion: app.getVersion(), hw: await hardware(), templatesRev: templatesRev() });
    if (!s.ok) return { ok: false, error: s.error, message: s.message, needKey: NEEDS_KEY.has(s.error) };
    state.payload = verifyToken(s.token);
    state.token = s.token;
    state.lastOk = Date.now();
    await writeServerInfo(s.info);
    return { ok: true, payload: state.payload };
  } catch (e) {
    return { ok: false, error: "offline", message: `Tidak bisa terhubung ke server lisensi. Periksa internet lalu coba lagi. (${e instanceof Error ? e.message : e})`, offline: true };
  }
}

/**
 * "Pusat informasi": announcements, newest release and remote flags arrive with every session (each 5 min).
 * Written to <userData>/server-info.json, which the app's Next server reads (lib/server-info.ts).
 */
// where the app's Next server reads it: userData when packaged, ./data in dev (next dev's DATA_DIR)
// (TRAKTIVA_DATA_DIR in dev = run against another data folder, e.g. the installed app's, with the same license)
const infoFile = () => path.join(process.env.TRAKTIVA_DATA_DIR || (app.isPackaged ? app.getPath("userData") : path.join(__dirname, "..", "data")), "server-info.json");

// Galeri template: the server sends the whole list only when our revision is older; kept next to server-info.json
const templatesFile = () => path.join(path.dirname(infoFile()), "templates.json");
function templatesRev() {
  try {
    return Number(JSON.parse(fs.readFileSync(templatesFile(), "utf8")).rev) || 0;
  } catch {
    return 0;
  }
}

async function writeServerInfo(info) {
  const { templates, templatesRev: rev, ...rest } = info ?? {};
  if (Array.isArray(templates)) {
    try {
      fs.writeFileSync(`${templatesFile()}.tmp`, JSON.stringify({ rev, at: Date.now(), templates }));
      fs.renameSync(`${templatesFile()}.tmp`, templatesFile());
    } catch (e) {
      console.error("[license] templates:", e instanceof Error ? e.message : e);
    }
  }
  info = rest;
  const file = infoFile();
  const hw = await hardware();
  const data = {
    at: Date.now(),
    appVersion: app.getVersion(),
    licenseId: state.payload?.lic ?? null,
    plan: state.payload?.plan ?? null,
    role: state.payload?.role ?? "member",
    licExp: state.payload?.licExp ?? null,
    device: { name: os.hostname(), hwParts: hw ? Object.keys(hw) : [] },
    ...(info ?? {}),
  };
  try {
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
    fs.renameSync(`${file}.tmp`, file);
  } catch (e) {
    console.error("[license] server-info:", e instanceof Error ? e.message : e);
  }
}

/** Activate this PC with a license key, then open a session. */
async function activate(key) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const devicePub = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
  let r;
  try {
    r = await post("/v1/activate", { key, devicePub, deviceHash: await deviceHash(), deviceName: os.hostname(), appVersion: app.getVersion(), hw: await hardware() });
  } catch (e) {
    return { ok: false, error: "offline", message: `Tidak bisa terhubung ke server lisensi. (${e instanceof Error ? e.message : e})`, offline: true };
  }
  if (!r.ok) return r;
  writeStore(r.deviceId, privateKey);
  return session();
}

/**
 * "Ganti lisensi": free this PC's slot on the server (signed with the device key, so nobody else can release it),
 * then forget the local key. Offline: the slot stays taken until the admin resets it.
 */
async function release() {
  const dev = await readStore();
  clearInterval(state.timer);
  if (dev) {
    try {
      const n = await post("/v1/nonce", { deviceId: dev.deviceId });
      if (n.ok) {
        const signature = crypto.sign(null, Buffer.from(`traktiva-release:${n.nonce}`), dev.privateKey).toString("base64");
        await post("/v1/release", { deviceId: dev.deviceId, nonce: n.nonce, signature });
      }
    } catch {}
  }
  clearStore();
  state.token = state.payload = null;
  fs.rmSync(infoFile(), { force: true });
  return { ok: false, error: "not_activated", message: "Masukkan key lisensi yang baru.", needKey: true };
}

/** Renew the token every 5 min; call onLock(result) when the license stops being usable. */
function startHeartbeat(onLock) {
  clearInterval(state.timer);
  state.timer = setInterval(async () => {
    const r = await session();
    if (r.ok) return;
    if (r.offline && Date.now() - state.lastOk < GRACE_MS) return; // short outage: keep working
    if (r.needKey) clearStore();
    clearInterval(state.timer);
    onLock(r);
  }, HEARTBEAT_MS);
}

module.exports = { enabled, configured, session, activate, release, startHeartbeat, current: () => state.payload, deviceName: () => os.hostname() };
