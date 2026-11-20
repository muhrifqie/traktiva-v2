// Member accounts for the website (internal API, called only by the web app with the service token).
// Sign-in: email + password (scrypt) or Google (the web app does the OAuth exchange and passes the verified profile).
// Licenses are claimed into an account with their key; the desktop app still activates with the key.
// A member may free one PC of a license per 7 days themselves (more = through the admin).
import crypto from "node:crypto";
import { appInfo, audit, db, getPlans, getSetting, hashKey, hashPassword, normalizeKey, verifyPassword } from "./lib.mjs";

export const MEMBER_SESSION_TTL = 30 * 86400;
export const SELF_RESET_COOLDOWN = 7 * 86400;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/** Routes for internal-api.mjs. `h` = its helpers (json, bad, body, sha, now, failsOf, fails, licenseRow, secrets). */
export function memberRoutes(h) {
  const { json, bad, body, sha, now, failsOf, fails, licenseRow, secrets } = h;

  const userOf = (req) => {
    const sid = String(req.headers["x-member-session"] ?? "");
    return sid ? db.prepare("SELECT u.* FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.expires_at > unixepoch()").get(sha(sid)) ?? null : null;
  };
  const startSession = (res, user, ip, how) => {
    const sid = crypto.randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO user_sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha(sid), user.id, now() + MEMBER_SESSION_TTL);
    db.prepare("UPDATE users SET last_login = unixepoch() WHERE id = ?").run(user.id);
    audit("member_login", { ip, actor: user.email, detail: how });
    json(res, 200, { ok: true, session: sid, maxAge: MEMBER_SESSION_TTL });
  };
  /** 10 misses per bucket (IP or user) → 15 min pause. */
  const limited = (key) => Date.now() < failsOf(key).until;
  const miss = (key) => {
    const n = failsOf(key).n + 1;
    if (fails.size > 10_000) fails.clear(); // ponytail: crude cap, fine for one web app
    fails.set(key, { n, until: n >= 10 ? Date.now() + 15 * 60_000 : 0 });
  };
  const cleanEmail = (e) => String(e ?? "").trim().toLowerCase().slice(0, 254);
  const cleanName = (n) => String(n ?? "").trim().replace(/\s+/g, " ").slice(0, 80) || null;
  const ipOf = (b) => String(b.ip ?? "?").slice(0, 64);
  /** Wrap a route that needs a signed-in member. */
  const member = (fn) => ({
    open: true,
    fn: async (req, res, _admin, param) => {
      const user = userOf(req);
      if (!user) return bad(res, "Sesi habis. Masuk lagi.", 401);
      return fn(req, res, user, param);
    },
  });

  function memberView(user) {
    const plans = getPlans();
    const t = now();
    const licenses = db.prepare("SELECT id FROM licenses WHERE user_id = ? ORDER BY id DESC").all(user.id).map(({ id }) => {
      const l = licenseRow(id);
      const nextReset = l.self_reset_at ? l.self_reset_at + SELF_RESET_COOLDOWN : 0;
      return {
        id: l.id,
        key_hint: l.key_hint,
        plan: l.plan,
        planLabel: plans.find((p) => p.id === l.plan)?.label ?? l.plan,
        role: l.role,
        status: l.status,
        expires_at: l.expires_at,
        max_devices: l.max_devices,
        used: l.used,
        created_at: l.created_at,
        canResetAt: nextReset > t ? nextReset : null, // null = may free a PC now
        devices: db
          .prepare("SELECT id, name, app_version, created_at, last_seen, hw IS NOT NULL AS hw_locked FROM devices WHERE license_id = ? AND status = 'active' ORDER BY created_at DESC")
          .all(l.id),
      };
    });
    const info = appInfo();
    return {
      user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, hasPassword: !!user.password_hash, google: !!user.google_sub, created_at: user.created_at },
      licenses,
      plans,
      site: getSetting("site", {}),
      announcements: info.announcements,
      latest: info.latest,
    };
  }

  return {
    "POST /internal/member/register": {
      open: true,
      fn: async (req, res) => {
        const b = await body(req);
        const ip = ipOf(b);
        if (limited(`reg:${ip}`)) return bad(res, "Terlalu banyak percobaan. Coba lagi 15 menit lagi.", 429);
        const email = cleanEmail(b.email);
        const password = String(b.password ?? "");
        if (!EMAIL.test(email)) return bad(res, "Email tidak valid.");
        if (password.length < 8 || password.length > 200) return bad(res, "Password minimal 8 karakter.");
        if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
          miss(`reg:${ip}`);
          return bad(res, "Email ini sudah terdaftar. Silakan masuk (atau pakai Google kalau dulu daftar dengan Google).", 409);
        }
        const r = db.prepare("INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)").run(email, cleanName(b.name), hashPassword(password));
        audit("member_registered", { ip, actor: email, detail: "email" });
        startSession(res, db.prepare("SELECT * FROM users WHERE id = ?").get(Number(r.lastInsertRowid)), ip, "email");
      },
    },

    "POST /internal/member/login": {
      open: true,
      fn: async (req, res) => {
        const b = await body(req);
        const ip = ipOf(b);
        if (limited(`login:${ip}`)) return bad(res, "Terlalu banyak percobaan. Coba lagi 15 menit lagi.", 429);
        const user = db.prepare("SELECT * FROM users WHERE email = ?").get(cleanEmail(b.email));
        if (!verifyPassword(b.password, user?.password_hash)) {
          miss(`login:${ip}`);
          audit("member_login_failed", { ip, actor: "?", detail: cleanEmail(b.email).slice(0, 80) });
          return bad(res, user && !user.password_hash ? "Akun ini masuk lewat Google. Pakai tombol Masuk dengan Google." : "Email atau password salah.", 401);
        }
        fails.delete(`login:${ip}`);
        startSession(res, user, ip, "email");
      },
    },

    // The web app already exchanged the OAuth code with Google over TLS: this is Google's verified profile.
    "POST /internal/member/google": {
      open: true,
      fn: async (req, res) => {
        const b = await body(req);
        const ip = ipOf(b);
        const sub = String(b.sub ?? "").slice(0, 64);
        const email = cleanEmail(b.email);
        if (!/^\d{5,64}$/.test(sub) || !EMAIL.test(email)) return bad(res, "Data akun Google tidak lengkap.");
        if (!b.emailVerified) return bad(res, "Email akun Google ini belum terverifikasi.");
        let user = db.prepare("SELECT * FROM users WHERE google_sub = ?").get(sub);
        if (!user) {
          const byEmail = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
          if (byEmail) {
            // same verified email: link Google to the existing account
            db.prepare("UPDATE users SET google_sub = ?, avatar = COALESCE(avatar, ?), name = COALESCE(name, ?) WHERE id = ?").run(sub, b.avatar ?? null, cleanName(b.name), byEmail.id);
            audit("member_google_linked", { ip, actor: email });
          } else {
            db.prepare("INSERT INTO users (email, name, avatar, google_sub) VALUES (?, ?, ?, ?)").run(email, cleanName(b.name), String(b.avatar ?? "").slice(0, 500) || null, sub);
            audit("member_registered", { ip, actor: email, detail: "google" });
          }
          user = db.prepare("SELECT * FROM users WHERE google_sub = ?").get(sub);
        }
        startSession(res, user, ip, "google");
      },
    },

    "POST /internal/member/logout": {
      open: true,
      fn: async (req, res) => {
        db.prepare("DELETE FROM user_sessions WHERE id_hash = ?").run(sha(String(req.headers["x-member-session"] ?? "")));
        json(res, 200, { ok: true });
      },
    },

    "GET /internal/member/me": member(async (_req, res, user) => json(res, 200, { ok: true, ...memberView(user) })),

    // claim a license into this account with its key
    "POST /internal/member/claim": member(async (req, res, user) => {
      const b = await body(req);
      const bucket = `claim:${user.id}`;
      if (limited(bucket)) return bad(res, "Terlalu banyak percobaan. Coba lagi 15 menit lagi.", 429);
      const lic = db.prepare("SELECT id, user_id, status FROM licenses WHERE key_hash = ?").get(hashKey(secrets.pepper, normalizeKey(b.key)));
      if (!lic || lic.status === "revoked") {
        miss(bucket);
        return bad(res, "Key lisensi tidak dikenal.", 404);
      }
      if (lic.user_id && lic.user_id !== user.id) return bad(res, "Key ini sudah terdaftar di akun lain. Hubungi penjual kalau ini key milikmu.", 409);
      if (lic.user_id === user.id) return json(res, 200, { ok: true, already: true });
      db.prepare("UPDATE licenses SET user_id = ? WHERE id = ?").run(user.id, lic.id);
      audit("license_claimed", { license_id: lic.id, ip: String(b.ip ?? "").slice(0, 64) || null, actor: user.email });
      json(res, 200, { ok: true, already: false });
    }),

    // free one PC of a license (the buyer changed PC / hardware); once per license per 7 days
    "POST /internal/member/devices/:id/reset": member(async (req, res, user, id) => {
      const b = await body(req);
      const d = db.prepare("SELECT d.*, l.user_id, l.self_reset_at FROM devices d JOIN licenses l ON l.id = d.license_id WHERE d.id = ? AND d.status = 'active'").get(String(id));
      if (!d || d.user_id !== user.id) return bad(res, "Perangkat tidak ditemukan.", 404);
      const t = now();
      if (d.self_reset_at && d.self_reset_at + SELF_RESET_COOLDOWN > t) {
        const days = Math.ceil((d.self_reset_at + SELF_RESET_COOLDOWN - t) / 86400);
        return bad(res, `Reset mandiri bisa lagi ${days} hari lagi. Kalau mendesak, hubungi penjual.`, 429);
      }
      db.prepare("UPDATE devices SET status = 'reset' WHERE id = ?").run(d.id);
      db.prepare("UPDATE licenses SET self_reset_at = ? WHERE id = ?").run(t, d.license_id);
      audit("device_reset", { license_id: d.license_id, device_id: d.id, ip: String(b.ip ?? "").slice(0, 64) || null, actor: user.email, detail: `${d.name ?? "PC"} (oleh pembeli)` });
      json(res, 200, { ok: true });
    }),

    "POST /internal/member/profile": member(async (req, res, user) => {
      const b = await body(req);
      db.prepare("UPDATE users SET name = ? WHERE id = ?").run(cleanName(b.name), user.id);
      json(res, 200, { ok: true });
    }),

    // change (or, for Google-only accounts, set) the password; other sessions are signed out
    "POST /internal/member/password": member(async (req, res, user) => {
      const b = await body(req);
      if (user.password_hash && !verifyPassword(b.current, user.password_hash)) return bad(res, "Password sekarang salah.");
      const next = String(b.next ?? "");
      if (next.length < 8 || next.length > 200) return bad(res, "Password baru minimal 8 karakter.");
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(next), user.id);
      db.prepare("DELETE FROM user_sessions WHERE user_id = ? AND id_hash <> ?").run(user.id, sha(String(req.headers["x-member-session"] ?? "")));
      audit("member_password_changed", { actor: user.email });
      json(res, 200, { ok: true });
    }),
  };
}
