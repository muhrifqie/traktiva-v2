// Traktiva license ADMIN PANEL: localhost only (127.0.0.1:3821), opened through an SSH tunnel:
//   ssh -N -L 3821:127.0.0.1:3821 shopeeboosthelper   →   http://localhost:3821
// Login with a per-admin token (`node admin.mjs add-admin <name>`). Same DB as the license server.
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { audit, createLicenses, db, getPlans, loadSecrets, setPlans } from "./lib.mjs";

const PORT = Number(process.env.ADMIN_PORT || 3821);
const HOST = "127.0.0.1"; // never on a public interface
const SESSION_TTL = 12 * 3600;
const STATIC = path.join(import.meta.dirname, "admin-web");
const secrets = loadSecrets();

// ---------------------------------------------------------------- helpers

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const now = () => Math.floor(Date.now() / 1000);
const json = (res, code, body, headers = {}) => {
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(body));
};
const bad = (res, message, code = 400) => json(res, code, { ok: false, message });

async function body(req) {
  let raw = "";
  for await (const c of req) {
    raw += c;
    if (raw.length > 65_536) throw new Error("too large");
  }
  return raw ? JSON.parse(raw) : {};
}

const cookie = (req, name) => (req.headers.cookie ?? "").split(/;\s*/).map((c) => c.split("=")).find(([k]) => k === name)?.[1];

function currentAdmin(req) {
  const sid = cookie(req, "trk_admin");
  if (!sid) return null;
  return db.prepare("SELECT a.id, a.name FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE s.id_hash = ? AND s.expires_at > unixepoch()").get(sha(sid)) ?? null;
}

// login brute-force guard (tunnel means every request looks like 127.0.0.1: one shared bucket is fine)
let fails = { n: 0, until: 0 };

const plan = (id) => getPlans().find((p) => p.id === id);
const licenseRow = (id) =>
  db
    .prepare(`SELECT l.*, (SELECT count(*) FROM devices d WHERE d.license_id = l.id AND d.status = 'active') AS used,
                     (SELECT max(last_seen) FROM devices d WHERE d.license_id = l.id) AS last_seen
              FROM licenses l WHERE l.id = ?`)
    .get(id);

// ---------------------------------------------------------------- API

const api = {
  "POST /api/login": async (req, res) => {
    if (Date.now() < fails.until) return bad(res, "Terlalu banyak percobaan. Tunggu sebentar.", 429);
    const { token } = await body(req);
    const admin = db.prepare("SELECT * FROM admins WHERE token_hash = ?").get(sha(String(token ?? "").trim()));
    if (!admin) {
      fails = { n: fails.n + 1, until: fails.n + 1 >= 5 ? Date.now() + 5 * 60_000 : 0 };
      audit("admin_login_failed", { actor: "?" });
      return bad(res, "Token salah.", 401);
    }
    fails = { n: 0, until: 0 };
    const sid = crypto.randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO admin_sessions (id_hash, admin_id, expires_at) VALUES (?, ?, ?)").run(sha(sid), admin.id, now() + SESSION_TTL);
    db.prepare("UPDATE admins SET last_login = unixepoch() WHERE id = ?").run(admin.id);
    audit("admin_login", { actor: admin.name });
    json(res, 200, { ok: true, name: admin.name }, { "set-cookie": `trk_admin=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL}` });
  },
  "POST /api/logout": async (req, res) => {
    const sid = cookie(req, "trk_admin");
    if (sid) db.prepare("DELETE FROM admin_sessions WHERE id_hash = ?").run(sha(sid));
    json(res, 200, { ok: true }, { "set-cookie": "trk_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
  },
  "GET /api/me": async (_req, res, admin) => json(res, 200, { ok: true, name: admin.name }),

  "GET /api/summary": async (_req, res) => {
    const one = (sql, ...a) => db.prepare(sql).get(...a).n;
    json(res, 200, {
      ok: true,
      active: one("SELECT count(*) n FROM licenses WHERE status = 'active' AND (expires_at IS NULL OR expires_at > unixepoch())"),
      expiringSoon: one("SELECT count(*) n FROM licenses WHERE status = 'active' AND expires_at BETWEEN unixepoch() AND unixepoch() + 7 * 86400"),
      expired: one("SELECT count(*) n FROM licenses WHERE status = 'active' AND expires_at <= unixepoch()"),
      suspended: one("SELECT count(*) n FROM licenses WHERE status <> 'active'"),
      online: one("SELECT count(*) n FROM devices WHERE status = 'active' AND last_seen > unixepoch() - 600"),
      activationsToday: one("SELECT count(*) n FROM audit_events WHERE event = 'activated' AND at > unixepoch() - 86400"),
      failedToday: one("SELECT count(*) n FROM audit_events WHERE event = 'activate_failed' AND at > unixepoch() - 86400"),
      byPlan: db.prepare("SELECT plan, count(*) n FROM licenses WHERE status = 'active' AND (expires_at IS NULL OR expires_at > unixepoch()) GROUP BY plan").all(),
      recent: db.prepare("SELECT e.*, l.key_hint FROM audit_events e LEFT JOIN licenses l ON l.id = e.license_id ORDER BY e.id DESC LIMIT 8").all(),
    });
  },

  "GET /api/licenses": async (req, res) => {
    const u = new URL(req.url, "http://x");
    const q = (u.searchParams.get("q") ?? "").trim();
    const status = u.searchParams.get("status") ?? "";
    const where = [];
    const args = [];
    if (q) {
      where.push("(l.note LIKE ? OR l.key_hint LIKE ? OR CAST(l.id AS TEXT) = ? OR EXISTS (SELECT 1 FROM devices d WHERE d.license_id = l.id AND d.name LIKE ?))");
      args.push(`%${q}%`, `%${q.replace(/^.*-/, "").slice(-4)}%`, q.replace(/^#/, ""), `%${q}%`);
    }
    if (status === "expired") where.push("l.status = 'active' AND l.expires_at <= unixepoch()");
    else if (status === "active") where.push("l.status = 'active' AND (l.expires_at IS NULL OR l.expires_at > unixepoch())");
    else if (status) (where.push("l.status = ?"), args.push(status));
    if (u.searchParams.get("plan")) (where.push("l.plan = ?"), args.push(u.searchParams.get("plan")));
    const rows = db
      .prepare(`SELECT l.*, (SELECT count(*) FROM devices d WHERE d.license_id = l.id AND d.status = 'active') AS used,
                       (SELECT max(last_seen) FROM devices d WHERE d.license_id = l.id) AS last_seen
                FROM licenses l ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY l.id DESC LIMIT 500`)
      .all(...args);
    json(res, 200, { ok: true, licenses: rows, plans: getPlans() });
  },

  "POST /api/licenses": async (req, res, admin) => {
    const b = await body(req);
    const p = plan(String(b.plan));
    if (!p) return bad(res, "Pilih paket.");
    const count = Math.min(200, Math.max(1, Number(b.count) || 1));
    const devices = Math.min(20, Math.max(1, Number(b.devices) || p.devices));
    const days = p.days == null ? null : Math.max(1, Number(b.days) || p.days);
    const note = String(b.note ?? "").trim().slice(0, 200) || null;
    const made = createLicenses({ pepper: secrets.pepper, plan: p.id, days, devices, note, count, actor: admin.name });
    json(res, 200, { ok: true, keys: made, plan: p.label, days, devices });
  },

  "GET /api/licenses/:id": async (_req, res, _admin, id) => {
    const l = licenseRow(Number(id));
    if (!l) return bad(res, "Lisensi tidak ditemukan.", 404);
    json(res, 200, {
      ok: true,
      license: l,
      plans: getPlans(),
      devices: db.prepare("SELECT id, name, app_version, last_ip, status, created_at, last_seen FROM devices WHERE license_id = ? ORDER BY created_at DESC").all(l.id),
      events: db.prepare("SELECT * FROM audit_events WHERE license_id = ? ORDER BY id DESC LIMIT 100").all(l.id),
    });
  },

  "POST /api/licenses/:id": async (req, res, admin, id) => {
    const l = licenseRow(Number(id));
    if (!l) return bad(res, "Lisensi tidak ditemukan.", 404);
    const b = await body(req);
    if (b.action === "status") {
      if (!["active", "suspended", "revoked"].includes(b.status)) return bad(res, "Status tidak dikenal.");
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
    } else if (b.action === "edit") {
      const devices = Math.min(20, Math.max(1, Number(b.devices) || l.max_devices));
      const note = String(b.note ?? "").trim().slice(0, 200) || null;
      db.prepare("UPDATE licenses SET note = ?, max_devices = ? WHERE id = ?").run(note, devices, l.id);
      audit("license_edited", { license_id: l.id, actor: admin.name, detail: `perangkat ${devices}` });
    } else return bad(res, "Aksi tidak dikenal.");
    json(res, 200, { ok: true, license: licenseRow(l.id) });
  },

  "POST /api/devices/:id/reset": async (_req, res, admin, id) => {
    const d = db.prepare("SELECT * FROM devices WHERE id = ?").get(String(id));
    if (!d) return bad(res, "Perangkat tidak ditemukan.", 404);
    db.prepare("UPDATE devices SET status = 'reset' WHERE id = ?").run(d.id);
    audit("device_reset", { license_id: d.license_id, device_id: d.id, actor: admin.name, detail: d.name });
    json(res, 200, { ok: true });
  },

  "GET /api/audit": async (req, res) => {
    const u = new URL(req.url, "http://x");
    const before = Number(u.searchParams.get("before")) || 1e15;
    json(res, 200, {
      ok: true,
      events: db.prepare("SELECT e.*, l.key_hint, l.note FROM audit_events e LEFT JOIN licenses l ON l.id = e.license_id WHERE e.id < ? ORDER BY e.id DESC LIMIT 100").all(before),
    });
  },

  "GET /api/settings": async (_req, res) => json(res, 200, { ok: true, plans: getPlans(), admins: db.prepare("SELECT name, created_at, last_login FROM admins ORDER BY id").all() }),
  "POST /api/settings": async (req, res, admin) => {
    const { plans } = await body(req);
    if (!Array.isArray(plans) || !plans.length) return bad(res, "Daftar paket kosong.");
    const clean = plans.map((p) => ({
      id: String(p.id).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20),
      label: String(p.label ?? p.id).slice(0, 30),
      days: p.days == null || p.days === "" ? null : Math.max(1, Math.min(3650, Number(p.days))),
      devices: Math.max(1, Math.min(20, Number(p.devices) || 1)),
      price: Math.max(0, Math.round(Number(p.price) || 0)),
    }));
    if (clean.some((p) => !p.id) || new Set(clean.map((p) => p.id)).size !== clean.length) return bad(res, "ID paket kosong atau dobel.");
    setPlans(clean);
    audit("plans_updated", { actor: admin.name, detail: clean.map((p) => `${p.id}:${p.price}`).join(", ") });
    json(res, 200, { ok: true, plans: clean });
  },
};

function route(method, pathname) {
  for (const [k, fn] of Object.entries(api)) {
    const [m, pattern] = k.split(" ");
    if (m !== method) continue;
    const re = new RegExp(`^${pattern.replace(/:id/g, "([^/]+)")}$`);
    const hit = pathname.match(re);
    if (hit) return { fn, param: hit[1], open: k === "POST /api/login" || k === "POST /api/logout" };
  }
  return null;
}

// ---------------------------------------------------------------- static files (the panel itself)

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };
function serveStatic(pathname, res) {
  const file = path.join(STATIC, pathname === "/" ? "index.html" : path.normalize(pathname).replace(/^([/\\])+/, ""));
  if (!file.startsWith(STATIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (pathname === "/") return void (res.writeHead(404), res.end("admin-web/index.html hilang"));
    return serveStatic("/", res); // SPA fallback
  }
  res.writeHead(200, {
    "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
    "cache-control": "no-cache",
    "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'" /* inline style attrs for layout; scripts stay locked to our own file */,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  fs.createReadStream(file).pipe(res);
}

setInterval(() => db.prepare("DELETE FROM admin_sessions WHERE expires_at < unixepoch()").run(), 3600_000).unref();

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (!url.pathname.startsWith("/api/")) return serveStatic(url.pathname, res);
    // writes only from this panel's own page (blocks cross-site requests from other tabs)
    if (req.method !== "GET" && req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return bad(res, "Origin ditolak.", 403);
    const r = route(req.method, url.pathname);
    if (!r) return bad(res, "Tidak ditemukan.", 404);
    const admin = r.open ? null : currentAdmin(req);
    if (!r.open && !admin) return bad(res, "Silakan masuk.", 401);
    try {
      await r.fn(req, res, admin, r.param && decodeURIComponent(r.param));
    } catch (e) {
      console.error("[admin]", req.method, url.pathname, e instanceof Error ? e.message : e);
      if (!res.headersSent) bad(res, "Permintaan tidak valid.");
    }
  })
  .listen(PORT, HOST, () => console.log(`[admin] http://${HOST}:${PORT}`));
