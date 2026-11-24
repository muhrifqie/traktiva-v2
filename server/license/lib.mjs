// Traktiva license server: shared pieces (DB, secrets, tokens). Node 22.5+ (node:sqlite), no npm deps.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const DATA_DIR = process.env.LICENSE_DATA_DIR || path.join(import.meta.dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

// ---------------------------------------------------------------- secrets (created once by `admin.mjs init`)

const SECRETS = path.join(DATA_DIR, "secrets.json");

/** Server signing key (Ed25519) + pepper for key hashes. Never leaves the server. */
export function loadSecrets() {
  if (!fs.existsSync(SECRETS)) throw new Error("secrets.json belum ada: jalankan `node admin.mjs init` dulu");
  const s = JSON.parse(fs.readFileSync(SECRETS, "utf8"));
  return { pepper: s.pepper, signKey: crypto.createPrivateKey(s.signKeyPem), publicRaw: s.publicRaw };
}

export function initSecrets() {
  if (fs.existsSync(SECRETS)) return loadSecrets();
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const publicRaw = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
  const s = { pepper: crypto.randomBytes(32).toString("base64"), signKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }), publicRaw };
  fs.writeFileSync(SECRETS, JSON.stringify(s, null, 1), { mode: 0o600 });
  return loadSecrets();
}

// ---------------------------------------------------------------- database

export const db = new DatabaseSync(path.join(DATA_DIR, "license.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY,
    key_hash TEXT NOT NULL UNIQUE,
    key_hint TEXT NOT NULL,              -- last 4 chars, to recognise a key in lists
    plan TEXT NOT NULL DEFAULT 'pro',
    features TEXT NOT NULL DEFAULT '["app","ai","upload","update"]',
    max_devices INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
    expires_at INTEGER,                  -- unix seconds, NULL = lifetime
    note TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,                 -- random id handed to the app
    license_id INTEGER NOT NULL REFERENCES licenses(id),
    device_hash TEXT NOT NULL,
    public_key TEXT NOT NULL,            -- device Ed25519 public key, raw 32 bytes base64
    name TEXT, app_version TEXT, last_ip TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','reset')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    last_seen INTEGER
  );
  CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, device_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY, at INTEGER NOT NULL DEFAULT (unixepoch()), event TEXT NOT NULL,
    license_id INTEGER, device_id TEXT, ip TEXT, detail TEXT
  );
  -- admin panel: one row per person (owner, Azzam...); login = name + password_hash (added below)
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()), last_login INTEGER
  );
  CREATE TABLE IF NOT EXISTS admin_sessions (id_hash TEXT PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES admins(id), expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  -- "pusat informasi": what the desktop app and the buyer dashboard show
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
    level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','warn','critical')),
    active INTEGER NOT NULL DEFAULT 1, ends_at INTEGER,     -- NULL = until switched off
    created_at INTEGER NOT NULL DEFAULT (unixepoch()), actor TEXT
  );
  CREATE TABLE IF NOT EXISTS releases (
    id INTEGER PRIMARY KEY, version TEXT NOT NULL UNIQUE, url TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
    mandatory INTEGER NOT NULL DEFAULT 0,                   -- 1 = apps older than this must update
    created_at INTEGER NOT NULL DEFAULT (unixepoch()), actor TEXT
  );
  -- buyer website login (with their license key; replaced by member accounts, kept for old rows)
  CREATE TABLE IF NOT EXISTS buyer_sessions (id_hash TEXT PRIMARY KEY, license_id INTEGER NOT NULL REFERENCES licenses(id), expires_at INTEGER NOT NULL);
  -- member accounts on the website: email + password (scrypt) and/or Google; licenses are claimed with their key
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT, avatar TEXT,
    password_hash TEXT, google_sub TEXT UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()), last_login INTEGER
  );
  CREATE TABLE IF NOT EXISTS user_sessions (id_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
`);
// member web sessions: when, from where, which browser (Pengaturan → Perangkat & sesi)
for (const [col, type] of [["created_at", "INTEGER"], ["last_seen", "INTEGER"], ["ip", "TEXT"], ["ua", "TEXT"]])
  if (!db.prepare("SELECT 1 FROM pragma_table_info('user_sessions') WHERE name = ?").get(col)) db.exec(`ALTER TABLE user_sessions ADD COLUMN ${col} ${type}`);
// the full key, encrypted, for keys a member owns (bought online or linked to the account): shown in their account
if (!db.prepare("SELECT 1 FROM pragma_table_info('licenses') WHERE name = 'key_enc'").get()) db.exec("ALTER TABLE licenses ADD COLUMN key_enc TEXT");
// who did it (admin name / "cli" / "app"); added after the first deploy
if (!db.prepare("SELECT 1 FROM pragma_table_info('audit_events') WHERE name = 'actor'").get()) db.exec("ALTER TABLE audit_events ADD COLUMN actor TEXT");
// panel login = name + password (scrypt); token_hash stays only as a random placeholder (old token login removed)
if (!db.prepare("SELECT 1 FROM pragma_table_info('admins') WHERE name = 'password_hash'").get()) db.exec("ALTER TABLE admins ADD COLUMN password_hash TEXT");
// role: 'admin' (owner/team: label + panel shortcut in the app) or 'member' (buyers)
if (!db.prepare("SELECT 1 FROM pragma_table_info('licenses') WHERE name = 'role'").get()) db.exec("ALTER TABLE licenses ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
// hardware fingerprint taken at activation: JSON { board, boardSerial, cpu, ram, disk, bios } of hashes (old rows may also hold an ignored "guid")
if (!db.prepare("SELECT 1 FROM pragma_table_info('devices') WHERE name = 'hw'").get()) db.exec("ALTER TABLE devices ADD COLUMN hw TEXT");
// member accounts: owner of a license (claimed on the website) + last self-service device reset (7-day cooldown)
// member accounts: admin role (signs into /admin with the member session), WhatsApp number for reminders
for (const [col, type] of [["is_admin", "INTEGER NOT NULL DEFAULT 0"], ["phone", "TEXT"]]) {
  if (!db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = ?").get(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${type}`);
}
db.exec(`
  -- one-time "atur password" links (admin creates, member opens within 30 min)
  CREATE TABLE IF NOT EXISTS password_tokens (
    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL, used_at INTEGER, created_by TEXT
  );
  -- website purchases paid with WaroengPay (QRIS); a paid order creates or extends a license for the member
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), plan TEXT NOT NULL,
    license_id INTEGER REFERENCES licenses(id),          -- set for renewals; filled with the new license when paid
    base_amount INTEGER NOT NULL, amount INTEGER, wp_id TEXT UNIQUE, pay_url TEXT, livemode INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','cancelled','mismatch')),
    event_id TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), paid_at INTEGER, expires_at INTEGER
  );
  -- expiry reminders already sent (license, kind = '7d' | '1d' | 'expired'), so each goes out once
  CREATE TABLE IF NOT EXISTS reminder_log (license_id INTEGER NOT NULL, kind TEXT NOT NULL, sent_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY (license_id, kind));
`);
if (!db.prepare("SELECT 1 FROM pragma_table_info('licenses') WHERE name = 'user_id'").get()) {
  db.exec("ALTER TABLE licenses ADD COLUMN user_id INTEGER REFERENCES users(id)");
  db.exec("ALTER TABLE licenses ADD COLUMN self_reset_at INTEGER");
  db.exec("CREATE INDEX IF NOT EXISTS licenses_user ON licenses(user_id)");
}

// ---------------------------------------------------------------- admin passwords

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const DUMMY = `scrypt$${"A".repeat(22)}$${"A".repeat(43)}`; // unknown user: still spend the same time
export const newPassword = () => crypto.randomBytes(12).toString("base64url"); // 16 chars
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString("base64url")}$${crypto.scryptSync(String(pw), salt, 32, SCRYPT).toString("base64url")}`;
}
export function verifyPassword(pw, stored) {
  const [, salt, hash] = String(stored || DUMMY).split("$");
  const got = crypto.scryptSync(String(pw ?? ""), Buffer.from(salt, "base64url"), 32, SCRYPT);
  const want = Buffer.from(hash ?? "", "base64url");
  return !!stored && got.length === want.length && crypto.timingSafeEqual(got, want);
}
/** Create the admin or reset their password; logs out their sessions. Returns the new password (shown once). */
export function setAdminPassword(name, password = newPassword()) {
  db.prepare(
    "INSERT INTO admins (name, token_hash, password_hash) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET password_hash = excluded.password_hash",
  ).run(name, crypto.randomBytes(32).toString("hex"), hashPassword(password));
  db.prepare("DELETE FROM admin_sessions WHERE admin_id = (SELECT id FROM admins WHERE name = ?)").run(name);
  return password;
}

/** Plans sold (Pengaturan → Paket). days = null means lifetime; price in rupiah (0 = not set yet). */
export const DEFAULT_PLANS = [
  { id: "bulanan", label: "Bulanan", days: 30, devices: 1, price: 0 },
  { id: "tahunan", label: "Tahunan", days: 365, devices: 1, price: 0 },
  { id: "lifetime", label: "Lifetime", days: null, devices: 1, price: 0 },
];
export function getPlans() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'plans'").get();
  return row ? JSON.parse(row.value) : DEFAULT_PLANS;
}
export const setPlans = (plans) => setSetting("plans", plans);

/** JSON settings: plans, site ({ whatsapp }), remote (flags the desktop app reads, e.g. { maintenance: false }). */
export function getSetting(key, fallback) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? JSON.parse(row.value) : fallback;
}
export const setSetting = (key, value) =>
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));

/** Hardware lock: which components differ from the activation fingerprint (missing now = changed). */
// Physical parts only. Windows' MachineGuid is NOT part of the lock: it is a registry value that HWID spoofers
// (common among multi-account affiliates), cleaners and Windows resets change without any hardware change, which
// locked real buyers out. Older activations still carry a stored "guid": it is ignored here.
export const HW_PARTS = { board: "Motherboard (UUID)", boardSerial: "Motherboard (serial)", cpu: "CPU", ram: "RAM", disk: "Disk", bios: "BIOS" };
export function hwChanges(stored, now) {
  if (!stored) return []; // activated before the lock existed: nothing to compare
  const a = typeof stored === "string" ? JSON.parse(stored) : stored;
  return Object.keys(a).filter((k) => k in HW_PARTS && (!now || now[k] !== a[k]));
}
/** How many components may differ before the session is refused (Pengaturan → Kunci hardware; 0 = strict). */
export const hwTolerance = () => Math.max(0, Math.min(6, Number(getSetting("hwid", {}).tolerance) || 0));

/** What every app/buyer sees right now: live announcements, newest release, remote flags. */
export function appInfo() {
  return {
    announcements: db
      .prepare("SELECT id, title, body, level, created_at FROM announcements WHERE active = 1 AND (ends_at IS NULL OR ends_at > unixepoch()) ORDER BY id DESC LIMIT 5")
      .all(),
    latest: db.prepare("SELECT version, url, notes, mandatory, created_at FROM releases ORDER BY id DESC LIMIT 1").get() ?? null,
    remote: getSetting("remote", {}),
  };
}

export const audit = (event, { license_id = null, device_id = null, ip = null, detail = null, actor = null } = {}) =>
  db.prepare("INSERT INTO audit_events (event, license_id, device_id, ip, detail, actor) VALUES (?,?,?,?,?,?)").run(event, license_id, device_id, ip, detail, actor);

/** Create `count` keys for a plan; returns [{ id, key }]. The plain key exists only in this return value. */
/** keep: also store the key encrypted (sealKey) so its owner can see it again in the member area. */
export function createLicenses({ pepper, plan, days, devices, note = null, count = 1, actor = null, role = "member", keep = false }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const key = newLicenseKey();
    const exp = days ? Math.floor(Date.now() / 1000) + days * 86400 : null;
    const r = db
      .prepare("INSERT INTO licenses (key_hash, key_hint, plan, max_devices, expires_at, note, role) VALUES (?,?,?,?,?,?,?)")
      .run(hashKey(pepper, key), key.slice(-4), plan, devices, exp, note, role === "admin" ? "admin" : "member");
    const id = Number(r.lastInsertRowid);
    if (keep) db.prepare("UPDATE licenses SET key_enc = ? WHERE id = ?").run(sealKey(pepper, key), id);
    audit("license_created", { license_id: id, detail: note, actor });
    out.push({ id, key });
  }
  return out;
}

// ---------------------------------------------------------------- keys & tokens

/** TRK-XXXX-XXXX-XXXX-XXXX (Crockford-ish alphabet, no 0/O/1/I), 80 random bits. */
export function newLicenseKey() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(16);
  const chars = [...bytes].map((b) => abc[b % abc.length]).join("");
  return `TRK-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
}
// AES-256-GCM with a key derived from the pepper (secrets.json): a stolen database alone does not reveal keys.
const encKey = (pepper) => crypto.createHmac("sha256", Buffer.from(pepper, "base64")).update("traktiva-key-enc-v1").digest();
export function sealKey(pepper, key) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", encKey(pepper), iv);
  const data = Buffer.concat([c.update(String(key), "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}
/** The key from sealKey, or null when missing / tampered. */
export function openKey(pepper, sealed) {
  try {
    const [v, iv, tag, data] = String(sealed ?? "").split(".");
    if (v !== "v1") return null;
    const d = crypto.createDecipheriv("aes-256-gcm", encKey(pepper), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
export const normalizeKey = (k) => String(k ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const hashKey = (pepper, key) => crypto.createHmac("sha256", Buffer.from(pepper, "base64")).update(normalizeKey(key)).digest("hex");

const b64url = (buf) => Buffer.from(buf).toString("base64url");

/** Session token = base64url(JSON payload) "." base64url(Ed25519 signature). Verified by the app with the server public key. */
export function signToken(signKey, payload) {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${b64url(crypto.sign(null, Buffer.from(body), signKey))}`;
}

/** Verify a device signature: raw 32-byte Ed25519 public key (base64) over `message`. */
export function verifyDevice(publicRaw, message, sigB64) {
  try {
    const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicRaw, "base64")]);
    const key = crypto.createPublicKey({ key: der, format: "der", type: "spki" });
    return crypto.verify(null, Buffer.from(message), key, Buffer.from(sigB64, "base64"));
  } catch {
    return false;
  }
}
