// Traktiva license INTERNAL API for the web app (web/, Next.js): 127.0.0.1:3822 only, JSON only.
// Every call needs the service token (data/service-token); admin calls also need a live admin session
// (x-admin-session), which this process checks itself, so the web app can never act without a logged-in admin.
// The web app never touches the DB or the signing key.
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { appInfo, audit, hwTolerance, createLicenses, DATA_DIR, db, getPlans, getSetting, hashKey, hashPassword, loadSecrets, normalizeKey, setPlans, setSetting, verifyPassword } from "./lib.mjs";
import { createPasswordToken, memberRoutes, runReminders } from "./members.mjs";
import { handleWebhook, paymentsConfigured, paymentsReady, syncPendingOrders, testMode } from "./payments.mjs";

const PORT = Number(process.env.INTERNAL_PORT || 3822);
const HOST = "127.0.0.1";
const SESSION_TTL = 12 * 3600;
const secrets = loadSecrets();

// service token shared with the web app (created once, 600)
const TOKEN_FILE = path.join(DATA_DIR, "service-token");
if (!fs.existsSync(TOKEN_FILE)) fs.writeFileSync(TOKEN_FILE, crypto.randomBytes(32).toString("base64url"), { mode: 0o600 });
const SERVICE_TOKEN = fs.readFileSync(TOKEN_FILE, "utf8").trim();

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const now = () => Math.floor(Date.now() / 1000);
const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};
const bad = (res, message, code = 400) => json(res, code, { ok: false, message });
const sameToken = (a, b) => {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

async function body(req) {
  let raw = "";
  for await (const c of req) {
    raw += c;
    if (raw.length > 65_536) throw new Error("too large");
  }
  return raw ? JSON.parse(raw) : {};
}

/** Admin rules (Pengaturan → Keamanan): member admins need an authenticator unless switched off. */
const security = () => ({ requireAdmin2fa: true, ...getSetting("security", {}) });

/** A signed-in member with the admin role → admin identity (actor = their email); "need_2fa" when 2FA is required. */
function memberAdmin(req) {
  const sid = String(req.headers["x-member-session"] ?? "");
  if (!sid) return null;
  const u = db
    .prepare("SELECT u.* FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.expires_at > unixepoch() AND u.is_admin = 1")
    .get(sha(sid));
  if (!u) return null;
  if (security().requireAdmin2fa && !u.totp_secret) return "need_2fa";
  return { id: null, userId: u.id, name: u.email, kind: "member" };
}

const sessionAdmin = (sid) =>
  sid ? db.prepare("SELECT a.id, a.name FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE s.id_hash = ? AND s.expires_at > unixepoch()").get(sha(sid)) ?? null : null;

// login brute-force guard per client IP (the web app forwards nginx's X-Real-IP): 5 misses → 15 min.
// Per IP, not per user, so a stranger cannot lock the owner out. nginx adds 6 req/min/IP on top.
const fails = new Map();
const failsOf = (ip) => fails.get(ip) ?? { n: 0, until: 0 };
const plan = (id) => getPlans().find((p) => p.id === id);
const LICENSE_COLS = `l.*, (SELECT email FROM users u WHERE u.id = l.user_id) AS owner, (SELECT count(*) FROM devices d WHERE d.license_id = l.id AND d.status = 'active') AS used,
                      (SELECT max(last_seen) FROM devices d WHERE d.license_id = l.id) AS last_seen`;
const licenseRow = (id) => db.prepare(`SELECT ${LICENSE_COLS} FROM licenses l WHERE l.id = ?`).get(id);

// ---------------------------------------------------------------- routes (open = no admin session needed)

const routes = {
  "POST /internal/admin/login": {
    open: true,
    fn: async (req, res) => {
      const { username, password, ip: rawIp } = await body(req);
      const ip = String(rawIp ?? "?").slice(0, 64);
      if (Date.now() < failsOf(ip).until) return bad(res, "Terlalu banyak percobaan. Coba lagi 15 menit lagi.", 429);
      const admin = db.prepare("SELECT * FROM admins WHERE name = ? COLLATE NOCASE").get(String(username ?? "").trim().slice(0, 40));
      if (!verifyPassword(password, admin?.password_hash)) {
        const n = failsOf(ip).n + 1;
        if (fails.size > 10_000) fails.clear(); // ponytail: crude cap, fine for one admin panel
        fails.set(ip, { n, until: n >= 5 ? Date.now() + 15 * 60_000 : 0 });
        audit("admin_login_failed", { actor: "?", ip, detail: String(username ?? "").slice(0, 40) });
        return bad(res, "Username atau password salah.", 401);
      }
      fails.delete(ip);
      const sid = crypto.randomBytes(32).toString("base64url");
      db.prepare("INSERT INTO admin_sessions (id_hash, admin_id, expires_at) VALUES (?, ?, ?)").run(sha(sid), admin.id, now() + SESSION_TTL);
      db.prepare("DELETE FROM admin_sessions WHERE expires_at <= unixepoch()").run();
      db.prepare("UPDATE admins SET last_login = unixepoch() WHERE id = ?").run(admin.id);
      audit("admin_login", { actor: admin.name, ip });
      json(res, 200, { ok: true, name: admin.name, session: sid, maxAge: SESSION_TTL });
    },
  },
  "POST /internal/admin/password": {
    fn: async (req, res, admin) => {
      const { current, next } = await body(req);
      const row = db.prepare("SELECT password_hash FROM admins WHERE id = ?").get(admin.id);
      if (!verifyPassword(current, row?.password_hash)) return bad(res, "Password lama salah.", 400);
      const pw = String(next ?? "");
      if (pw.length < 10 || pw.length > 200) return bad(res, "Password baru minimal 10 karakter.");
      db.prepare("UPDATE admins SET password_hash = ? WHERE id = ?").run(hashPassword(pw), admin.id);
      // log out every other session of this admin; keep the one making the change
      db.prepare("DELETE FROM admin_sessions WHERE admin_id = ? AND id_hash <> ?").run(admin.id, sha(String(req.headers["x-admin-session"])));
      audit("admin_password_changed", { actor: admin.name });
      json(res, 200, { ok: true });
    },
  },
  "POST /internal/admin/logout": {
    open: true,
    fn: async (req, res) => {
      const sid = req.headers["x-admin-session"];
      if (sid) db.prepare("DELETE FROM admin_sessions WHERE id_hash = ?").run(sha(String(sid)));
      json(res, 200, { ok: true });
    },
  },
  "GET /internal/admin/me": { fn: async (_req, res, admin) => json(res, 200, { ok: true, name: admin.name, kind: admin.kind ?? "admin" }) },

  // ---- WaroengPay webhook, forwarded by the web app with the raw body and WaroengPay's headers
  "POST /internal/pay/webhook": {
    open: true,
    fn: async (req, res) => {
      const b = await body(req);
      const r = handleWebhook(String(b.raw ?? ""), b.headers ?? {});
      json(res, r.status, r.body);
    },
  },
  "GET /internal/orders": {
    fn: async (_req, res) =>
      json(res, 200, {
        ok: true,
        orders: db.prepare("SELECT o.*, u.email FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 200").all(),
      }),
  },

  // ---- member accounts (admin panel → Member)
  "GET /internal/members": {
    fn: async (req, res) => {
      const q = (new URL(req.url, "http://x").searchParams.get("q") ?? "").trim();
      const rows = db
        .prepare(
          `SELECT u.id, u.email, u.name, u.phone, u.is_admin, u.created_at, u.last_login, u.password_hash IS NOT NULL AS has_password,
                  u.google_sub IS NOT NULL AS google, u.totp_secret IS NOT NULL AS totp,
                  (SELECT count(*) FROM licenses l WHERE l.user_id = u.id) AS licenses
             FROM users u ${q ? "WHERE u.email LIKE ? OR u.name LIKE ?" : ""} ORDER BY u.is_admin DESC, u.id DESC LIMIT 300`,
        )
        .all(...(q ? [`%${q}%`, `%${q}%`] : []));
      json(res, 200, { ok: true, members: rows, security: security() });
    },
  },
  // create a member account (no password yet: send them an "atur password" link)
  "POST /internal/members": {
    fn: async (req, res, admin) => {
      const b = await body(req);
      const email = String(b.email ?? "").trim().toLowerCase().slice(0, 254);
      if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email)) return bad(res, "Email tidak valid.");
      if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return bad(res, "Email ini sudah punya akun.", 409);
      const r = db.prepare("INSERT INTO users (email, name, is_admin) VALUES (?, ?, ?)").run(email, String(b.name ?? "").trim().slice(0, 80) || null, b.admin ? 1 : 0);
      audit("member_created", { actor: admin.name, detail: email + (b.admin ? " (admin)" : "") });
      json(res, 200, { ok: true, id: Number(r.lastInsertRowid) });
    },
  },
  "POST /internal/members/:id": {
    fn: async (req, res, admin, id) => {
      const u = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(id));
      if (!u) return bad(res, "Akun tidak ditemukan.", 404);
      const b = await body(req);
      if (b.action === "role") {
        if (admin.userId === u.id) return bad(res, "Peran akunmu sendiri tidak bisa diubah dari sini.");
        db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(b.admin ? 1 : 0, u.id);
        if (!b.admin) db.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(u.id); // drop admin access right away
        audit("member_role", { actor: admin.name, detail: `${u.email} → ${b.admin ? "admin" : "member"}` });
        return json(res, 200, { ok: true });
      }
      if (b.action === "link") return json(res, 200, { ok: true, token: createPasswordToken(u.id, admin.name), ttl: 30 * 60 });
      if (b.action === "reset2fa") {
        db.prepare("UPDATE users SET totp_secret = NULL, totp_pending = NULL WHERE id = ?").run(u.id);
        db.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(u.id);
        audit("member_2fa_reset", { actor: admin.name, detail: u.email });
        return json(res, 200, { ok: true });
      }
      bad(res, "Aksi tidak dikenal.");
    },
  },

  "GET /internal/summary": {
    fn: async (_req, res) => {
      const one = (sql) => db.prepare(sql).get().n;
      json(res, 200, {
        ok: true,
        active: one("SELECT count(*) n FROM licenses WHERE status = 'active' AND (expires_at IS NULL OR expires_at > unixepoch())"),
        expiringSoon: one("SELECT count(*) n FROM licenses WHERE status = 'active' AND expires_at BETWEEN unixepoch() AND unixepoch() + 7 * 86400"),
        expired: one("SELECT count(*) n FROM licenses WHERE status = 'active' AND expires_at <= unixepoch()"),
        inactive: one("SELECT count(*) n FROM licenses WHERE status <> 'active'"),
        online: one("SELECT count(*) n FROM devices WHERE status = 'active' AND last_seen > unixepoch() - 600"),
        activationsToday: one("SELECT count(*) n FROM audit_events WHERE event = 'activated' AND at > unixepoch() - 86400"),
        failedToday: one("SELECT count(*) n FROM audit_events WHERE event = 'activate_failed' AND at > unixepoch() - 86400"),
        byPlan: db.prepare("SELECT plan, count(*) n FROM licenses WHERE status = 'active' AND (expires_at IS NULL OR expires_at > unixepoch()) GROUP BY plan").all(),
        recent: db.prepare("SELECT e.*, l.key_hint, l.note FROM audit_events e LEFT JOIN licenses l ON l.id = e.license_id ORDER BY e.id DESC LIMIT 8").all(),
        // app versions in the field (devices seen in the last 7 days) vs the newest release
        versions: db.prepare("SELECT COALESCE(app_version, '?') AS version, count(*) n FROM devices WHERE status = 'active' AND last_seen > unixepoch() - 7 * 86400 GROUP BY 1 ORDER BY n DESC LIMIT 6").all(),
        latest: db.prepare("SELECT version, mandatory, created_at FROM releases ORDER BY id DESC LIMIT 1").get() ?? null,
        expiring: db.prepare("SELECT id, key_hint, note, plan, expires_at FROM licenses WHERE status = 'active' AND expires_at BETWEEN unixepoch() AND unixepoch() + 7 * 86400 ORDER BY expires_at LIMIT 6").all(),
        liveAnnouncements: db.prepare("SELECT id, title, level FROM announcements WHERE active = 1 AND (ends_at IS NULL OR ends_at > unixepoch()) ORDER BY id DESC LIMIT 3").all(),
        plans: getPlans(),
      });
    },
  },

  "GET /internal/licenses": {
    fn: async (req, res) => {
      const u = new URL(req.url, "http://x");
      const q = (u.searchParams.get("q") ?? "").trim();
      const status = u.searchParams.get("status") ?? "";
      const where = [];
      const args = [];
      if (q) {
        where.push("(l.note LIKE ? OR l.key_hint LIKE ? OR CAST(l.id AS TEXT) = ? OR EXISTS (SELECT 1 FROM devices d WHERE d.license_id = l.id AND d.name LIKE ?) OR EXISTS (SELECT 1 FROM users u WHERE u.id = l.user_id AND u.email LIKE ?))");
        args.push(`%${q}%`, `%${q.replace(/^.*-/, "").slice(-4)}%`, q.replace(/^#/, ""), `%${q}%`, `%${q}%`);
      }
      if (status === "expired") where.push("l.status = 'active' AND l.expires_at <= unixepoch()");
      else if (status === "active") where.push("l.status = 'active' AND (l.expires_at IS NULL OR l.expires_at > unixepoch())");
      else if (["suspended", "revoked"].includes(status)) (where.push("l.status = ?"), args.push(status));
      const plan = u.searchParams.get("plan");
      if (plan) (where.push("l.plan = ?"), args.push(plan));
      const rows = db.prepare(`SELECT ${LICENSE_COLS} FROM licenses l ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY l.id DESC LIMIT 500`).all(...args);
      json(res, 200, { ok: true, licenses: rows, plans: getPlans() });
    },
  },

  "POST /internal/licenses": {
    fn: async (req, res, admin) => {
      const b = await body(req);
      const p = plan(String(b.plan));
      if (!p) return bad(res, "Pilih paket.");
      const count = Math.min(200, Math.max(1, Number(b.count) || 1));
      const devices = Math.min(20, Math.max(1, Number(b.devices) || p.devices));
      const days = p.days == null ? null : Math.min(3650, Math.max(1, Number(b.days) || p.days));
      const note = String(b.note ?? "").trim().slice(0, 200) || null;
      const role = b.role === "admin" ? "admin" : "member";
      const keys = createLicenses({ pepper: secrets.pepper, plan: p.id, days, devices, note, count, actor: admin.name, role });
      json(res, 200, { ok: true, keys, plan: p.label, days, devices, role });
    },
  },

  "GET /internal/licenses/:id": {
    fn: async (_req, res, _admin, id) => {
      const l = licenseRow(Number(id));
      if (!l) return bad(res, "Lisensi tidak ditemukan.", 404);
      json(res, 200, {
        ok: true,
        license: l,
        plans: getPlans(),
        devices: db.prepare("SELECT id, name, app_version, last_ip, status, created_at, last_seen, hw IS NOT NULL AS hw_locked FROM devices WHERE license_id = ? ORDER BY created_at DESC").all(l.id),
        events: db.prepare("SELECT * FROM audit_events WHERE license_id = ? ORDER BY id DESC LIMIT 100").all(l.id),
      });
    },
  },

  "POST /internal/licenses/:id": {
    fn: async (req, res, admin, id) => {
      const l = licenseRow(Number(id));
      if (!l) return bad(res, "Lisensi tidak ditemukan.", 404);
      const b = await body(req);
      if (b.action === "status") {
        if (!["active", "suspended", "revoked"].includes(b.status)) return bad(res, "Status tidak dikenal.");
        if (l.status === "revoked") return bad(res, "Lisensi yang sudah dicabut tidak bisa diubah.");
        db.prepare("UPDATE licenses SET status = ? WHERE id = ?").run(b.status, l.id);
        audit(`license_${b.status}`, { license_id: l.id, actor: admin.name, detail: String(b.reason ?? "").slice(0, 200) || null });
      } else if (b.action === "extend") {
        const days = Number(b.days);
        if (!(days > 0 && days <= 3650)) return bad(res, "Jumlah hari tidak valid.");
        const base = Math.max(l.expires_at ?? 0, now());
        db.prepare("UPDATE licenses SET expires_at = ? WHERE id = ?").run(base + days * 86400, l.id);
        audit("license_extended", { license_id: l.id, actor: admin.name, detail: `+${days} hari` });
      } else if (b.action === "lifetime") {
        db.prepare("UPDATE licenses SET expires_at = NULL WHERE id = ?").run(l.id);
        audit("license_extended", { license_id: l.id, actor: admin.name, detail: "lifetime" });
      } else if (b.action === "unclaim") {
        db.prepare("UPDATE licenses SET user_id = NULL WHERE id = ?").run(l.id);
        audit("license_unclaimed", { license_id: l.id, actor: admin.name, detail: l.owner });
      } else if (b.action === "role") {
        const role = b.role === "admin" ? "admin" : "member";
        db.prepare("UPDATE licenses SET role = ? WHERE id = ?").run(role, l.id);
        audit("license_edited", { license_id: l.id, actor: admin.name, detail: `peran ${role}` });
      } else if (b.action === "edit") {
        const devices = Math.min(20, Math.max(1, Number(b.devices) || l.max_devices));
        const note = String(b.note ?? "").trim().slice(0, 200) || null;
        db.prepare("UPDATE licenses SET note = ?, max_devices = ? WHERE id = ?").run(note, devices, l.id);
        audit("license_edited", { license_id: l.id, actor: admin.name, detail: `perangkat ${devices}` });
      } else return bad(res, "Aksi tidak dikenal.");
      json(res, 200, { ok: true, license: licenseRow(l.id) });
    },
  },

  "POST /internal/devices/:id/reset": {
    fn: async (_req, res, admin, id) => {
      const d = db.prepare("SELECT * FROM devices WHERE id = ?").get(String(id));
      if (!d) return bad(res, "Perangkat tidak ditemukan.", 404);
      db.prepare("UPDATE devices SET status = 'reset' WHERE id = ?").run(d.id);
      audit("device_reset", { license_id: d.license_id, device_id: d.id, actor: admin.name, detail: d.name });
      json(res, 200, { ok: true, licenseId: d.license_id });
    },
  },

  "GET /internal/audit": {
    fn: async (req, res) => {
      const before = Number(new URL(req.url, "http://x").searchParams.get("before")) || 1e15;
      json(res, 200, {
        ok: true,
        events: db.prepare("SELECT e.*, l.key_hint, l.note FROM audit_events e LEFT JOIN licenses l ON l.id = e.license_id WHERE e.id < ? ORDER BY e.id DESC LIMIT 100").all(before),
      });
    },
  },

  "GET /internal/settings": {
    fn: async (_req, res) =>
      json(res, 200, {
        ok: true,
        plans: getPlans(),
        site: getSetting("site", {}),
        remote: getSetting("remote", {}),
        hwid: { tolerance: hwTolerance() },
        security: security(),
        reminders: { enabled: false, webhook: "", ...getSetting("reminders", {}) },
        payments: { enabled: !!getSetting("payments", {}).enabled, configured: paymentsConfigured(), testMode: testMode() },
        admins: db.prepare("SELECT name, created_at, last_login FROM admins ORDER BY id").all(),
      }),
  },
  "POST /internal/settings": {
    fn: async (req, res, admin) => {
      const { plans, site, remote, hwid, security: sec, reminders, payments } = await body(req);
      if (payments !== undefined) {
        if (payments?.enabled && !paymentsConfigured()) return bad(res, "Isi WAROENGPAY_API_KEY dan WAROENGPAY_WEBHOOK_SECRET di server dulu.");
        setSetting("payments", { enabled: !!payments?.enabled });
        audit("payments_updated", { actor: admin.name, detail: payments?.enabled ? `bayar online aktif${testMode() ? " (mode uji)" : ""}` : "bayar online mati" });
      }
      if (sec !== undefined) {
        setSetting("security", { requireAdmin2fa: sec?.requireAdmin2fa !== false });
        audit("security_updated", { actor: admin.name, detail: sec?.requireAdmin2fa === false ? "2FA admin opsional" : "2FA admin wajib" });
      }
      if (reminders !== undefined) {
        const webhook = String(reminders?.webhook ?? "").trim().slice(0, 300);
        if (webhook && !/^https?:\/\//.test(webhook)) return bad(res, "Alamat webhook harus http(s)://");
        setSetting("reminders", { enabled: !!reminders?.enabled && !!webhook, webhook });
        audit("reminders_updated", { actor: admin.name, detail: reminders?.enabled && webhook ? "WA aktif" : "WA mati" });
      }
      if (hwid !== undefined) {
        const tolerance = Math.max(0, Math.min(6, Math.round(Number(hwid?.tolerance) || 0)));
        setSetting("hwid", { tolerance });
        audit("hwid_updated", { actor: admin.name, detail: tolerance ? `toleransi ${tolerance} komponen` : "ketat" });
      }
      if (plans !== undefined) {
        if (!Array.isArray(plans) || !plans.length || plans.length > 10) return bad(res, "Daftar paket tidak valid.");
        const clean = plans.map((p) => ({
          id: String(p.id).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20),
          label: String(p.label ?? p.id).trim().slice(0, 30),
          days: p.days == null || p.days === "" ? null : Math.max(1, Math.min(3650, Number(p.days))),
          devices: Math.max(1, Math.min(20, Number(p.devices) || 1)),
          price: Math.max(0, Math.round(Number(p.price) || 0)),
        }));
        if (clean.some((p) => !p.id || !p.label) || new Set(clean.map((p) => p.id)).size !== clean.length) return bad(res, "ID/nama paket kosong atau dobel.");
        setPlans(clean);
        audit("plans_updated", { actor: admin.name, detail: clean.map((p) => `${p.id}:${p.price}`).join(", ") });
      }
      if (site !== undefined) {
        const wa = String(site?.whatsapp ?? "").replace(/\D/g, "").replace(/^0/, "62").slice(0, 16);
        setSetting("site", { whatsapp: wa });
        audit("site_updated", { actor: admin.name, detail: wa ? `WA ${wa}` : "WA kosong" });
      }
      if (remote !== undefined) {
        // flat map of simple values the desktop app reads (string / number / boolean)
        if (!remote || typeof remote !== "object" || Array.isArray(remote) || Object.keys(remote).length > 50) return bad(res, "Setelan app tidak valid.");
        const clean = {};
        for (const [k, v] of Object.entries(remote)) {
          const key = String(k).trim().replace(/[^\w.-]/g, "").slice(0, 40);
          if (!key || !["string", "number", "boolean"].includes(typeof v)) return bad(res, "Setelan app: nama kosong atau nilai tidak didukung.");
          clean[key] = typeof v === "string" ? v.slice(0, 500) : v;
        }
        setSetting("remote", clean);
        audit("remote_updated", { actor: admin.name, detail: Object.keys(clean).join(", ") || "kosong" });
      }
      json(res, 200, { ok: true });
    },
  },

  // ---- announcements (shown in the app + buyer dashboard)
  "GET /internal/announcements": {
    fn: async (_req, res) => json(res, 200, { ok: true, announcements: db.prepare("SELECT * FROM announcements ORDER BY id DESC LIMIT 100").all() }),
  },
  "POST /internal/announcements": {
    fn: async (req, res, admin) => {
      const b = await body(req);
      const title = String(b.title ?? "").trim().slice(0, 120);
      if (!title) return bad(res, "Judul pengumuman wajib diisi.");
      const level = ["info", "warn", "critical"].includes(b.level) ? b.level : "info";
      const days = Number(b.days) || 0;
      const r = db
        .prepare("INSERT INTO announcements (title, body, level, ends_at, actor) VALUES (?, ?, ?, ?, ?)")
        .run(title, String(b.body ?? "").trim().slice(0, 2000), level, days > 0 ? now() + Math.min(days, 365) * 86400 : null, admin.name);
      audit("announcement_created", { actor: admin.name, detail: title });
      json(res, 200, { ok: true, id: Number(r.lastInsertRowid) });
    },
  },
  "POST /internal/announcements/:id": {
    fn: async (req, res, admin, id) => {
      const a = db.prepare("SELECT * FROM announcements WHERE id = ?").get(Number(id));
      if (!a) return bad(res, "Pengumuman tidak ditemukan.", 404);
      const { action } = await body(req);
      if (action === "delete") db.prepare("DELETE FROM announcements WHERE id = ?").run(a.id);
      else if (action === "on" || action === "off") db.prepare("UPDATE announcements SET active = ? WHERE id = ?").run(action === "on" ? 1 : 0, a.id);
      else return bad(res, "Aksi tidak dikenal.");
      audit(`announcement_${action}`, { actor: admin.name, detail: a.title });
      json(res, 200, { ok: true });
    },
  },

  // ---- releases (update checker in the app, download link for buyers)
  "GET /internal/releases": {
    fn: async (_req, res) => json(res, 200, { ok: true, releases: db.prepare("SELECT * FROM releases ORDER BY id DESC LIMIT 50").all() }),
  },
  "POST /internal/releases": {
    fn: async (req, res, admin) => {
      const b = await body(req);
      const version = String(b.version ?? "").trim().replace(/^v/i, "");
      if (!/^\d+\.\d+\.\d+$/.test(version)) return bad(res, "Versi harus seperti 1.2.0.");
      let url;
      try {
        url = new URL(String(b.url ?? ""));
      } catch {
        return bad(res, "Link download tidak valid.");
      }
      if (url.protocol !== "https:") return bad(res, "Link download harus https://");
      if (db.prepare("SELECT 1 FROM releases WHERE version = ?").get(version)) return bad(res, "Versi ini sudah ada.");
      db.prepare("INSERT INTO releases (version, url, notes, mandatory, actor) VALUES (?, ?, ?, ?, ?)").run(
        version, url.href, String(b.notes ?? "").trim().slice(0, 4000), b.mandatory ? 1 : 0, admin.name,
      );
      audit("release_created", { actor: admin.name, detail: version + (b.mandatory ? " (wajib)" : "") });
      json(res, 200, { ok: true });
    },
  },
  "POST /internal/releases/:id/delete": {
    fn: async (_req, res, admin, id) => {
      const r = db.prepare("SELECT version FROM releases WHERE id = ?").get(Number(id));
      if (!r) return bad(res, "Rilis tidak ditemukan.", 404);
      db.prepare("DELETE FROM releases WHERE id = ?").run(Number(id));
      audit("release_deleted", { actor: admin.name, detail: r.version });
      json(res, 200, { ok: true });
    },
  },

  // ---- public website (service token only): landing page data
  "GET /internal/public": {
    open: true,
    fn: async (_req, res) => {
      const latest = db.prepare("SELECT version, created_at FROM releases ORDER BY id DESC LIMIT 1").get() ?? null;
      json(res, 200, { ok: true, plans: getPlans(), site: getSetting("site", {}), latest, buyOnline: paymentsReady() });
    },
  },

  // ---- member accounts (website): see members.mjs
  ...memberRoutes({ json, bad, body, sha, now, failsOf, fails, licenseRow, secrets }),
};

function match(method, pathname) {
  for (const [k, r] of Object.entries(routes)) {
    const [m, pattern] = k.split(" ");
    if (m !== method) continue;
    const hit = pathname.match(new RegExp(`^${pattern.replace(/:id/g, "([^/]+)")}$`));
    if (hit) return { ...r, param: hit[1] };
  }
  return null;
}

// online payments: poll pending orders every minute (webhooks need a trusted certificate on SITE_URL)
setInterval(() => void syncPendingOrders().catch((e) => console.error("[orders]", e instanceof Error ? e.message : e)), 60_000).unref();

// expiry reminders: hourly (no-op while switched off in Pengaturan)
setInterval(() => void runReminders().catch((e) => console.error("[reminders]", e instanceof Error ? e.message : e)), 3600_000).unref();
setTimeout(() => void runReminders().catch(() => {}), 60_000).unref();

setInterval(() => {
  db.prepare("DELETE FROM admin_sessions WHERE expires_at < unixepoch()").run();
  db.prepare("DELETE FROM buyer_sessions WHERE expires_at < unixepoch()").run();
  db.prepare("DELETE FROM user_sessions WHERE expires_at < unixepoch()").run();
}, 3600_000).unref();

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/health") return json(res, 200, { ok: true });
    if (!sameToken(String(req.headers.authorization ?? "").replace(/^Bearer /, ""), SERVICE_TOKEN)) return bad(res, "Token layanan salah.", 403);
    const r = match(req.method, url.pathname);
    if (!r) return bad(res, "Tidak ditemukan.", 404);
    let admin = null;
    if (!r.open) {
      admin = sessionAdmin(String(req.headers["x-admin-session"] ?? ""));
      if (!admin) {
        const m = memberAdmin(req);
        if (m === "need_2fa") return json(res, 403, { ok: false, code: "need_2fa", message: "Aktifkan verifikasi 2 langkah di halaman Akun dulu untuk membuka panel admin." });
        admin = m;
      }
      if (!admin) return bad(res, "Sesi admin habis. Masuk lagi.", 401);
    }
    try {
      await r.fn(req, res, admin, r.param && decodeURIComponent(r.param));
    } catch (e) {
      console.error("[internal]", req.method, url.pathname, e instanceof Error ? e.message : e);
      if (!res.headersSent) bad(res, "Permintaan tidak valid.");
    }
  })
  .listen(PORT, HOST, () => console.log(`[internal] http://${HOST}:${PORT}`));
