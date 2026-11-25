// Traktiva license server (HTTP on 127.0.0.1; nginx terminates TLS in front of it).
// Endpoints: POST /v1/activate, /v1/nonce, /v1/session · GET /health. See docs/license-design.md.
import crypto from "node:crypto";
import http from "node:http";
import { publicTemplates, templatesRev } from "./templates.mjs";
import { appInfo, audit, db, hashKey, HW_PARTS, hwChanges, hwTolerance, loadSecrets, normalizeKey, signToken, verifyDevice } from "./lib.mjs";

/** Client hardware fingerprint → { part: 24-hex } with known parts only (anything else is dropped). */
const cleanHw = (hw) => {
  if (!hw || typeof hw !== "object") return null;
  const out = {};
  for (const k of Object.keys(HW_PARTS)) if (/^[0-9a-f]{24}$/.test(String(hw[k] ?? ""))) out[k] = hw[k];
  return Object.keys(out).length ? out : null;
};

const PORT = Number(process.env.LICENSE_PORT || 3820);
const HOST = process.env.LICENSE_HOST || "127.0.0.1";
const TOKEN_TTL = 15 * 60; // seconds; the app renews it with a heartbeat every 5 min
const secrets = loadSecrets();

// ---------------------------------------------------------------- rate limits (in memory, per IP)
// ponytail: in-process counters, fine for one pm2 instance; move to SQLite if it ever runs clustered
const hits = new Map();
function limited(ip, bucket, max, windowSec) {
  const k = `${bucket}:${ip}`;
  const now = Date.now();
  const h = hits.get(k);
  if (!h || now > h.reset) {
    hits.set(k, { n: 1, reset: now + windowSec * 1000 });
    return false;
  }
  return ++h.n > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, h] of hits) if (now > h.reset) hits.delete(k);
  db.prepare("DELETE FROM nonces WHERE expires_at < unixepoch()").run();
}, 60_000).unref();

// ---------------------------------------------------------------- helpers

const send = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};
const fail = (res, code, error, message) => send(res, code, { ok: false, error, message });

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16_384) throw new Error("too large");
  }
  return raw ? JSON.parse(raw) : {};
}

/** Why a license cannot be used right now (null = usable). */
function licenseProblem(lic) {
  if (!lic) return ["invalid_key", "Key lisensi tidak dikenal."];
  if (lic.status === "suspended") return ["suspended", "Lisensi ini sedang ditangguhkan. Hubungi penjual."];
  if (lic.status === "revoked") return ["revoked", "Lisensi ini sudah dicabut."];
  if (lic.expires_at && lic.expires_at < Date.now() / 1000) return ["expired", "Masa aktif lisensi sudah habis."];
  return null;
}

// ---------------------------------------------------------------- routes

async function activate(req, res, ip) {
  if (limited(ip, "activate", 10, 15 * 60)) return fail(res, 429, "rate_limited", "Terlalu banyak percobaan. Coba lagi 15 menit lagi.");
  const b = await readJson(req);
  const key = normalizeKey(b.key);
  if (key.length !== 19 || !/^[A-Za-z0-9+/=]{40,48}$/.test(String(b.devicePub ?? "")) || !b.deviceHash) return fail(res, 400, "bad_request", "Data aktivasi tidak lengkap.");
  const lic = db.prepare("SELECT * FROM licenses WHERE key_hash = ?").get(hashKey(secrets.pepper, key));
  const problem = licenseProblem(lic);
  if (problem) {
    audit("activate_failed", { license_id: lic?.id ?? null, ip, detail: problem[0] });
    return fail(res, 403, ...problem);
  }
  // same PC activating again (reinstall): replace its old device record instead of using another slot
  const active = db.prepare("SELECT * FROM devices WHERE license_id = ? AND status = 'active'").all(lic.id);
  const same = active.find((d) => d.device_hash === String(b.deviceHash));
  if (!same && active.length >= lic.max_devices) {
    audit("activate_failed", { license_id: lic.id, ip, detail: "device_limit" });
    return fail(res, 403, "device_limit", `Key ini sudah dipakai di ${lic.max_devices} perangkat lain. Minta reset perangkat ke penjual.`);
  }
  if (same) db.prepare("UPDATE devices SET status = 'reset' WHERE id = ?").run(same.id);
  const id = crypto.randomBytes(16).toString("hex");
  const hw = cleanHw(b.hw);
  db.prepare("INSERT INTO devices (id, license_id, device_hash, public_key, name, app_version, last_ip, last_seen, hw) VALUES (?,?,?,?,?,?,?,unixepoch(),?)").run(
    id, lic.id, String(b.deviceHash).slice(0, 128), String(b.devicePub), String(b.deviceName ?? "").slice(0, 80), String(b.appVersion ?? "").slice(0, 20), ip, hw && JSON.stringify(hw),
  );
  audit("activated", { license_id: lic.id, device_id: id, ip, detail: same ? "reactivated" : null });
  send(res, 200, { ok: true, deviceId: id, plan: lic.plan });
}

async function nonce(req, res, ip) {
  if (limited(ip, "nonce", 60, 60)) return fail(res, 429, "rate_limited", "Terlalu banyak permintaan.");
  const b = await readJson(req);
  const dev = db.prepare("SELECT id FROM devices WHERE id = ? AND status = 'active'").get(String(b.deviceId ?? ""));
  if (!dev) return fail(res, 403, "device_unknown", "Perangkat ini belum diaktifkan atau sudah direset.");
  const n = crypto.randomBytes(24).toString("base64url");
  db.prepare("INSERT INTO nonces (nonce, device_id, expires_at) VALUES (?, ?, unixepoch() + 120)").run(n, dev.id);
  send(res, 200, { ok: true, nonce: n });
}

async function session(req, res, ip) {
  if (limited(ip, "session", 60, 60)) return fail(res, 429, "rate_limited", "Terlalu banyak permintaan.");
  const b = await readJson(req);
  const row = db.prepare("SELECT * FROM nonces WHERE nonce = ? AND expires_at >= unixepoch()").get(String(b.nonce ?? ""));
  if (row) db.prepare("DELETE FROM nonces WHERE nonce = ?").run(row.nonce); // single use
  const dev = row && row.device_id === b.deviceId ? db.prepare("SELECT * FROM devices WHERE id = ? AND status = 'active'").get(row.device_id) : null;
  if (!dev) return fail(res, 403, "device_unknown", "Perangkat ini belum diaktifkan atau sudah direset.");
  if (!verifyDevice(dev.public_key, `traktiva-session:${row.nonce}`, String(b.signature ?? ""))) {
    audit("session_bad_signature", { license_id: dev.license_id, device_id: dev.id, ip });
    return fail(res, 403, "bad_signature", "Tanda tangan perangkat tidak cocok.");
  }
  const lic = db.prepare("SELECT * FROM licenses WHERE id = ?").get(dev.license_id);
  const problem = licenseProblem(lic);
  if (problem) return fail(res, 403, ...problem);
  // hardware lock: the same device key on different hardware (copied profile, swapped parts) is refused
  const changed = hwChanges(dev.hw, cleanHw(b.hw));
  if (changed.length > hwTolerance()) {
    audit("device_changed", { license_id: lic.id, device_id: dev.id, ip, detail: changed.map((k) => HW_PARTS[k]).join(", ") });
    return fail(res, 403, "device_changed", `Hardware PC ini berubah (${changed.map((k) => HW_PARTS[k]).join(", ")}). Minta reset perangkat ke penjual, atau pakai key lain.`);
  }
  db.prepare("UPDATE devices SET last_seen = unixepoch(), last_ip = ?, app_version = COALESCE(?, app_version) WHERE id = ?").run(ip, b.appVersion ? String(b.appVersion).slice(0, 20) : null, dev.id);
  const now = Math.floor(Date.now() / 1000);
  const payload = { lic: lic.id, dev: dev.id, plan: lic.plan, role: lic.role ?? "member", features: JSON.parse(lic.features), licExp: lic.expires_at, iat: now, exp: now + TOKEN_TTL };
  // info = announcements / newest release / remote flags, refreshed on every heartbeat (not signed: TLS is pinned)
  // owner = the website account the key is linked to (sidebar profile + greeting in the app); null = not linked
  const u = lic.user_id ? db.prepare("SELECT name, email FROM users WHERE id = ?").get(lic.user_id) : null;
  const owner = u ? { name: (u.name || u.email.split("@")[0]).slice(0, 80), email: u.email } : null;
  // Galeri template: the whole list only when the app's copy is older (apps that send no revision get nothing)
  const rev = templatesRev();
  const templates = typeof b.templatesRev === "number" && b.templatesRev !== rev ? { templatesRev: rev, templates: publicTemplates() } : { templatesRev: rev };
  send(res, 200, { ok: true, token: signToken(secrets.signKey, payload), payload, info: { ...appInfo(), owner, ...templates } });
}

// ---------------------------------------------------------------- server

/** "Ganti lisensi" in the app: the device frees its own slot (signed challenge, like a session). */
async function release(req, res, ip) {
  if (limited(ip, "session", 60, 60)) return fail(res, 429, "rate_limited", "Terlalu banyak permintaan.");
  const b = await readJson(req);
  const row = db.prepare("SELECT * FROM nonces WHERE nonce = ? AND expires_at >= unixepoch()").get(String(b.nonce ?? ""));
  if (row) db.prepare("DELETE FROM nonces WHERE nonce = ?").run(row.nonce);
  const dev = row && row.device_id === b.deviceId ? db.prepare("SELECT * FROM devices WHERE id = ? AND status = 'active'").get(row.device_id) : null;
  if (!dev || !verifyDevice(dev.public_key, `traktiva-release:${row.nonce}`, String(b.signature ?? ""))) return fail(res, 403, "device_unknown", "Perangkat tidak dikenal.");
  db.prepare("UPDATE devices SET status = 'reset' WHERE id = ?").run(dev.id);
  audit("device_released", { license_id: dev.license_id, device_id: dev.id, ip, detail: dev.name });
  send(res, 200, { ok: true });
}

const routes = { "POST /v1/activate": activate, "POST /v1/nonce": nonce, "POST /v1/session": session, "POST /v1/release": release };

http
  .createServer(async (req, res) => {
    // nginx passes the real client address; direct hits only come from localhost
    const ip = String(req.headers["x-real-ip"] || req.socket.remoteAddress || "");
    const url = new URL(req.url ?? "/", "http://x");
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, publicKey: secrets.publicRaw });
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return fail(res, 404, "not_found", "Tidak ditemukan.");
    try {
      await route(req, res, ip);
    } catch (e) {
      console.error("[license]", req.method, url.pathname, e instanceof Error ? e.message : e);
      if (!res.headersSent) fail(res, 400, "bad_request", "Permintaan tidak valid.");
    }
  })
  .listen(PORT, HOST, () => console.log(`[license] listening on http://${HOST}:${PORT}`));
