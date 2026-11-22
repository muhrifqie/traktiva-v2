// Member accounts for the website (internal API, called only by the web app with the service token).
// Sign-in: email + password (scrypt) or Google (the web app does the OAuth exchange and passes the verified profile).
// Licenses are claimed into an account with their key; the desktop app still activates with the key.
// A member may free one PC of a license per 7 days themselves (more = through the admin).
import crypto from "node:crypto";
import { appInfo, audit, db, getPlans, getSetting, hashKey, hashPassword, normalizeKey, openKey, sealKey, verifyPassword } from "./lib.mjs";
import { createOrder, paymentsReady, syncOrder } from "./payments.mjs";
import { emailGate } from "./verify.mjs";

export const MEMBER_SESSION_TTL = 30 * 86400;
export const SELF_RESET_COOLDOWN = 86400; // a member may reset the hardware lock of a license once a day
/** "bisa lagi dalam 5 jam" / "… 40 menit" for a cooldown that ends at `until` (unix s). */
const waitText = (until, t) => {
  const s = until - t;
  return s >= 3600 ? `${Math.ceil(s / 3600)} jam` : `${Math.max(1, Math.ceil(s / 60))} menit`;
};
export const PASSWORD_LINK_TTL = 30 * 60;

/** One-time "atur password" link token for a member (admin panel / CLI). Returns the plain token (shown once). */
export function createPasswordToken(userId, createdBy) {
  const token = crypto.randomBytes(24).toString("base64url");
  db.prepare("INSERT INTO password_tokens (token_hash, user_id, expires_at, created_by) VALUES (?, ?, unixepoch() + ?, ?)").run(
    crypto.createHash("sha256").update(token).digest("hex"), userId, PASSWORD_LINK_TTL, createdBy,
  );
  audit("password_link_created", { actor: createdBy, detail: db.prepare("SELECT email FROM users WHERE id = ?").get(userId)?.email });
  return token;
}
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/** Audit events a member sees about their own account and licenses (Ringkasan → Aktivitas). */
const MEMBER_EVENTS = [
  "activated", "activate_failed", "device_reset", "device_released", "device_changed", "license_extended", "license_claimed",
  "license_suspended", "license_active", "license_revoked", "order_paid", "member_registered", "member_login", "member_login_failed",
  "member_google_linked", "member_password_changed", "member_password_set", "member_password_reset",
  "member_sessions_revoked",
];

/** Routes for internal-api.mjs. `h` = its helpers (json, bad, body, sha, now, failsOf, fails, licenseRow, secrets). */
export function memberRoutes(h) {
  const { json, bad, body, sha, now, failsOf, fails, licenseRow, secrets } = h;

  const userOf = (req) => {
    const sid = String(req.headers["x-member-session"] ?? "");
    if (!sid) return null;
    const user = db.prepare("SELECT u.* FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.expires_at > unixepoch()").get(sha(sid)) ?? null;
    if (user) db.prepare("UPDATE user_sessions SET last_seen = unixepoch() WHERE id_hash = ? AND (last_seen IS NULL OR last_seen < unixepoch() - 300)").run(sha(sid));
    return user;
  };
  /** Signed in with password/Google/link. */
  const signIn = (res, user, ip, how, ua) => startSession(res, user, ip, how, ua);
  const startSession = (res, user, ip, how, ua) => {
    const sid = crypto.randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO user_sessions (id_hash, user_id, expires_at, created_at, last_seen, ip, ua) VALUES (?, ?, ?, unixepoch(), unixepoch(), ?, ?)").run(
      sha(sid), user.id, now() + MEMBER_SESSION_TTL, ip, String(ua ?? "").slice(0, 300) || null,
    );
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
        key: openKey(secrets.pepper, db.prepare("SELECT key_enc FROM licenses WHERE id = ?").get(l.id)?.key_enc), // null = older key, only the hint
        devices: db
          .prepare("SELECT id, name, app_version, created_at, last_seen, hw IS NOT NULL AS hw_locked FROM devices WHERE license_id = ? AND status = 'active' ORDER BY created_at DESC")
          .all(l.id),
      };
    });
    const info = appInfo();
    return {
      user: {
        id: user.id, email: user.email, name: user.name, avatar: user.avatar, phone: user.phone,
        hasPassword: !!user.password_hash, google: !!user.google_sub, created_at: user.created_at,
        isAdmin: !!user.is_admin,
      },
      licenses,
      plans,
      site: getSetting("site", {}),
      announcements: info.announcements,
      latest: info.latest,
      // release history for the member's "Aplikasi" page (newest first)
      releases: db.prepare("SELECT version, url, notes, mandatory, created_at FROM releases ORDER BY id DESC LIMIT 12").all(),
      buyOnline: paymentsReady(),
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
        startSession(res, db.prepare("SELECT * FROM users WHERE id = ?").get(Number(r.lastInsertRowid)), ip, "email", b.ua);
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
        signIn(res, user, ip, "email", b.ua);
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
        signIn(res, user, ip, "google", b.ua);
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
      const n = normalizeKey(b.key).replace(/^TRK/, "");
      const seal = sealKey(secrets.pepper, `TRK-${n.match(/.{1,4}/g).join("-")}`); // canonical TRK-XXXX-XXXX-XXXX-XXXX
      if (lic.user_id === user.id) {
        db.prepare("UPDATE licenses SET key_enc = ? WHERE id = ? AND key_enc IS NULL").run(seal, lic.id);
        return json(res, 200, { ok: true, already: true });
      }
      db.prepare("UPDATE licenses SET user_id = ?, key_enc = coalesce(key_enc, ?) WHERE id = ?").run(user.id, seal, lic.id);
      audit("license_claimed", { license_id: lic.id, ip: String(b.ip ?? "").slice(0, 64) || null, actor: user.email });
      json(res, 200, { ok: true, already: false });
    }),

    // reset the hardware lock of a license (the buyer changed PC / hardware): every PC on it is released, so the key
    // activates on the new PC. Once a day per license (shared with the single-PC release below).
    "POST /internal/member/licenses/:id/reset-hwid": member(async (req, res, user, id) => {
      const b = await body(req);
      const l = db.prepare("SELECT id, user_id, status, self_reset_at FROM licenses WHERE id = ?").get(Number(id));
      if (!l || l.user_id !== user.id) return bad(res, "Lisensi tidak ditemukan.", 404);
      if (l.status === "revoked") return bad(res, "Lisensi ini sudah dicabut.", 409);
      const t = now();
      if (l.self_reset_at && l.self_reset_at + SELF_RESET_COOLDOWN > t) {
        return bad(res, `Reset HWID bisa lagi dalam ${waitText(l.self_reset_at + SELF_RESET_COOLDOWN, t)}. Kalau mendesak, hubungi penjual.`, 429);
      }
      const pcs = db.prepare("SELECT id, name FROM devices WHERE license_id = ? AND status = 'active'").all(l.id);
      if (!pcs.length) return bad(res, "Belum ada PC yang terkunci ke key ini. Langsung aktifkan saja di PC baru.", 409);
      db.prepare("UPDATE devices SET status = 'reset' WHERE license_id = ? AND status = 'active'").run(l.id);
      db.prepare("UPDATE licenses SET self_reset_at = ? WHERE id = ?").run(t, l.id);
      audit("device_reset", { license_id: l.id, ip: String(b.ip ?? "").slice(0, 64) || null, actor: user.email, detail: `reset HWID: ${pcs.map((p) => p.name ?? "PC").join(", ")} (oleh pembeli)` });
      json(res, 200, { ok: true, released: pcs.length });
    }),

    // free one PC of a license; same once-a-day allowance as the license reset above
    "POST /internal/member/devices/:id/reset": member(async (req, res, user, id) => {
      const b = await body(req);
      const d = db.prepare("SELECT d.*, l.user_id, l.self_reset_at FROM devices d JOIN licenses l ON l.id = d.license_id WHERE d.id = ? AND d.status = 'active'").get(String(id));
      if (!d || d.user_id !== user.id) return bad(res, "Perangkat tidak ditemukan.", 404);
      const t = now();
      if (d.self_reset_at && d.self_reset_at + SELF_RESET_COOLDOWN > t) {
        return bad(res, `Reset HWID bisa lagi dalam ${waitText(d.self_reset_at + SELF_RESET_COOLDOWN, t)}. Kalau mendesak, hubungi penjual.`, 429);
      }
      db.prepare("UPDATE devices SET status = 'reset' WHERE id = ?").run(d.id);
      db.prepare("UPDATE licenses SET self_reset_at = ? WHERE id = ?").run(t, d.license_id);
      audit("device_reset", { license_id: d.license_id, device_id: d.id, ip: String(b.ip ?? "").slice(0, 64) || null, actor: user.email, detail: `${d.name ?? "PC"} (oleh pembeli)` });
      json(res, 200, { ok: true });
    }),

    // one-time "atur password" link: check, then set (signs the member in)
    "POST /internal/member/password-token/check": {
      open: true,
      fn: async (req, res) => {
        const b = await body(req);
        const t = db.prepare("SELECT t.*, u.email FROM password_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?").get(sha(String(b.token ?? "")));
        if (!t || t.used_at || t.expires_at < now()) return bad(res, "Link ini sudah dipakai atau kedaluwarsa. Minta link baru ke admin.", 410);
        json(res, 200, { ok: true, email: t.email });
      },
    },
    "POST /internal/member/password-token": {
      open: true,
      fn: async (req, res) => {
        const b = await body(req);
        const ip = ipOf(b);
        if (limited(`token:${ip}`)) return bad(res, "Terlalu banyak percobaan. Coba lagi 15 menit lagi.", 429);
        const t = db.prepare("SELECT * FROM password_tokens WHERE token_hash = ?").get(sha(String(b.token ?? "")));
        if (!t || t.used_at || t.expires_at < now()) {
          miss(`token:${ip}`);
          return bad(res, "Link ini sudah dipakai atau kedaluwarsa. Minta link baru ke admin.", 410);
        }
        const next = String(b.password ?? "");
        if (next.length < 10 || next.length > 200) return bad(res, "Password minimal 10 karakter.");
        db.prepare("UPDATE password_tokens SET used_at = unixepoch() WHERE token_hash = ?").run(t.token_hash);
        db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(next), t.user_id);
        db.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(t.user_id);
        const user = db.prepare("SELECT * FROM users WHERE id = ?").get(t.user_id);
        audit("member_password_set", { ip, actor: user.email, detail: "lewat link" });
        signIn(res, user, ip, "link", b.ua);
      },
    },

    // forgotten password: 6-digit code by email (Waroengku Verify, purpose "reset"), then a new password.
    // Unknown emails get the same answer as known ones (no account probing).
    "POST /internal/member/forgot": {
      open: true,
      fn: async (req, res) => {
        const b = await body(req);
        const ip = ipOf(b);
        if (limited(`forgot:${ip}`)) return bad(res, "Terlalu banyak percobaan. Coba lagi 15 menit lagi.", 429);
        const email = cleanEmail(b.email);
        if (!EMAIL.test(email)) return bad(res, "Email tidak valid.");
        const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
        const otp = String(b.otp ?? "").replace(/\D/g, "").slice(0, 6);
        if (!otp) {
          const sent = { ok: true, otp: true, message: "Kalau email ini terdaftar, kode 6 angka sudah dikirim. Cek juga folder spam.", retry_after: 60 };
          if (!user) return json(res, 200, sent);
          const g = await emailGate("reset", email, ip);
          if (g.otp || g.ok) return json(res, 200, { ...sent, retry_after: g.retry_after ?? 60 });
          return bad(res, g.message || "Kode gagal dikirim. Coba lagi sebentar.", 502);
        }
        const next = String(b.password ?? "");
        if (next.length < 8 || next.length > 200) return bad(res, "Password baru minimal 8 karakter.");
        if (!user) {
          miss(`forgot:${ip}`);
          return bad(res, "Kode salah atau kedaluwarsa.", 400);
        }
        const g = await emailGate("reset", email, ip, otp);
        if (!g.ok) {
          miss(`forgot:${ip}`);
          return bad(res, g.message || "Kode salah atau kedaluwarsa.", 400);
        }
        db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(next), user.id);
        db.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(user.id);
        audit("member_password_reset", { ip, actor: user.email, detail: "lupa password (kode email)" });
        signIn(res, user, ip, "reset", b.ua);
      },
    },

    // activity of this account and its licenses (Ringkasan timeline, license detail history). Only events about the
    // member's own things; admin-only details (notes, reasons, admin names) are not sent.
    "GET /internal/member/activity": member(async (_req, res, user) => {
      const rows = db
        .prepare(
          `SELECT e.id, e.at, e.event, e.license_id, e.device_id, e.detail, l.key_hint, d.name AS device_name,
                  CASE WHEN e.event IN ('member_login', 'member_login_failed') THEN e.ip END AS ip
             FROM audit_events e
             LEFT JOIN licenses l ON l.id = e.license_id
             LEFT JOIN devices d ON d.id = e.device_id
            WHERE e.event IN (${MEMBER_EVENTS.map(() => "?").join(",")})
              AND ((e.license_id IN (SELECT id FROM licenses WHERE user_id = ?) AND e.event NOT LIKE 'member_%') OR (e.license_id IS NULL AND e.actor = ?))
            ORDER BY e.at DESC, e.id DESC LIMIT 200`,
        )
        .all(...MEMBER_EVENTS, user.id, user.email);
      const keep = new Set(["license_extended", "order_paid", "member_sessions_revoked"]); // details safe to show the member
      json(res, 200, { ok: true, events: rows.map((r) => ({ ...r, detail: keep.has(r.event) ? r.detail : null })) });
    }),

    // web sessions of this account (Pengaturan → Perangkat & sesi)
    "GET /internal/member/sessions": member(async (req, res, user) => {
      const mine = sha(String(req.headers["x-member-session"] ?? ""));
      const rows = db
        .prepare("SELECT rowid AS id, created_at, last_seen, ip, ua, id_hash = ? AS current FROM user_sessions WHERE user_id = ? AND expires_at > unixepoch() ORDER BY current DESC, coalesce(last_seen, created_at) DESC")
        .all(mine, user.id);
      json(res, 200, { ok: true, sessions: rows.map((r) => ({ ...r, current: !!r.current })) });
    }),
    "POST /internal/member/sessions/revoke": member(async (req, res, user) => {
      const b = await body(req);
      const mine = sha(String(req.headers["x-member-session"] ?? ""));
      const r = b.all
        ? db.prepare("DELETE FROM user_sessions WHERE user_id = ? AND id_hash <> ?").run(user.id, mine)
        : db.prepare("DELETE FROM user_sessions WHERE user_id = ? AND rowid = ? AND id_hash <> ?").run(user.id, Number(b.id) || 0, mine);
      audit("member_sessions_revoked", { actor: user.email, detail: b.all ? `semua perangkat lain (${r.changes})` : `1 sesi` });
      json(res, 200, { ok: true, removed: r.changes });
    }),

    // buy / renew online (WaroengPay QRIS): returns the payment page to send the buyer to
    "POST /internal/member/orders": member(async (req, res, user) => {
      const b = await body(req);
      try {
        json(res, 200, { ok: true, ...(await createOrder(user, String(b.plan ?? ""), b.renew ? Number(b.renew) : null)) });
      } catch (e) {
        bad(res, e.message, e.status ?? 502);
      }
    }),
    "GET /internal/member/orders": member(async (_req, res, user) => {
      const rows = db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20").all(user.id);
      const out = [];
      for (const o of rows) out.push(o.status === "pending" ? await syncOrder(o) : o); // webhook missed → ask WaroengPay
      json(res, 200, { ok: true, orders: out.map(({ id, plan, license_id, base_amount, amount, status, created_at, paid_at, pay_url, livemode }) => ({ id, plan, license_id, base_amount, amount, status, created_at, paid_at, pay_url, livemode })) });
    }),

    "POST /internal/member/profile": member(async (req, res, user) => {
      const b = await body(req);
      const phone = String(b.phone ?? "").replace(/\D/g, "").replace(/^0/, "62").slice(0, 16) || null;
      if (phone && !/^62\d{8,13}$/.test(phone)) return bad(res, "Nomor WhatsApp tidak valid (contoh 0812xxxxxxx).");
      db.prepare("UPDATE users SET name = ?, phone = ? WHERE id = ?").run(cleanName(b.name), phone, user.id);
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

// ---------------------------------------------------------------- expiry reminders (WhatsApp via the owner's webhook)
// Off until Pengaturan → Pengingat has a webhook and is switched on. Each (license, kind) is sent once.
const SITE = (process.env.SITE_URL || "https://app.traktiva.site").replace(/\/+$/, "");
const REMINDERS = [
  { kind: "7d", from: 1 * 86400, to: 7 * 86400, text: (d) => `habis ${d} hari lagi` },
  { kind: "1d", from: 0, to: 1 * 86400, text: () => "habis besok" },
  { kind: "expired", from: -2 * 86400, to: 0, text: () => "sudah habis" },
];

/** Send due reminders; returns how many went out. `send` is injectable for the self-test. */
export async function runReminders(send = postWebhook) {
  const cfg = getSetting("reminders", {});
  if (!cfg.enabled || !cfg.webhook) return 0;
  const plans = getPlans();
  let sent = 0;
  for (const r of REMINDERS) {
    const due = db
      .prepare(
        `SELECT l.id, l.key_hint, l.plan, l.expires_at, u.email, u.name, u.phone FROM licenses l JOIN users u ON u.id = l.user_id
          WHERE l.status = 'active' AND l.expires_at IS NOT NULL AND u.phone IS NOT NULL
            AND l.expires_at - unixepoch() > ? AND l.expires_at - unixepoch() <= ?
            AND NOT EXISTS (SELECT 1 FROM reminder_log g WHERE g.license_id = l.id AND g.kind = ?)`,
      )
      .all(r.from, r.to, r.kind);
    for (const l of due) {
      const days = Math.max(1, Math.ceil((l.expires_at - Date.now() / 1000) / 86400));
      const date = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(l.expires_at * 1000);
      const plan = plans.find((p) => p.id === l.plan)?.label ?? l.plan;
      const text = `Halo ${l.name || "kak"}, lisensi Traktiva kamu (paket ${plan}, key …${l.key_hint}) ${r.text(days)} (${date}). Perpanjang lewat ${SITE}/akun supaya app tetap jalan.`;
      try {
        await send(cfg.webhook, { phone: l.phone, text, licenseId: l.id, kind: r.kind });
        db.prepare("INSERT OR IGNORE INTO reminder_log (license_id, kind) VALUES (?, ?)").run(l.id, r.kind);
        audit("reminder_sent", { license_id: l.id, actor: "system", detail: `${r.kind} → ${l.phone.slice(0, 5)}…` });
        sent++;
      } catch (e) {
        audit("reminder_failed", { license_id: l.id, actor: "system", detail: String(e instanceof Error ? e.message : e).slice(0, 120) });
      }
    }
  }
  return sent;
}

async function postWebhook(url, payload) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`webhook ${res.status}`);
}
