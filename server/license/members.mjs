// Member accounts for the website (internal API, called only by the web app with the service token).
// Sign-in: email + password (scrypt) or Google (the web app does the OAuth exchange and passes the verified profile).
// Licenses are claimed into an account with their key; the desktop app still activates with the key.
// A member may free one PC of a license per 7 days themselves (more = through the admin).
import crypto from "node:crypto";
import { appInfo, audit, db, getPlans, getSetting, hashKey, hashPassword, normalizeKey, verifyPassword } from "./lib.mjs";
import { newTotpSecret, totpUri, verifyTotp } from "./totp.mjs";
import { createOrder, paymentsReady, syncOrder } from "./payments.mjs";
import { emailGate } from "./verify.mjs";

export const MEMBER_SESSION_TTL = 30 * 86400;
export const SELF_RESET_COOLDOWN = 7 * 86400;
export const PASSWORD_LINK_TTL = 30 * 60;
const TICKET_TTL = 5 * 60_000; // password/Google OK, waiting for the 2FA code

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

/** Routes for internal-api.mjs. `h` = its helpers (json, bad, body, sha, now, failsOf, fails, licenseRow, secrets). */
export function memberRoutes(h) {
  const { json, bad, body, sha, now, failsOf, fails, licenseRow, secrets } = h;

  const tickets = new Map(); // ticket -> { userId, how, until, tries }
  const userOf = (req) => {
    const sid = String(req.headers["x-member-session"] ?? "");
    if (!sid) return null;
    const user = db.prepare("SELECT u.* FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.expires_at > unixepoch()").get(sha(sid)) ?? null;
    if (user) db.prepare("UPDATE user_sessions SET last_seen = unixepoch() WHERE id_hash = ? AND (last_seen IS NULL OR last_seen < unixepoch() - 300)").run(sha(sid));
    return user;
  };
  /** Signed in with password/Google/link: straight in, or a 2FA ticket when the account has an authenticator. */
  const signIn = (res, user, ip, how, ua) => {
    if (!user.totp_secret) return startSession(res, user, ip, how, ua);
    const ticket = crypto.randomBytes(24).toString("base64url");
    if (tickets.size > 5000) tickets.clear();
    tickets.set(ticket, { userId: user.id, how, ua, until: Date.now() + TICKET_TTL, tries: 0 });
    json(res, 200, { ok: true, needCode: true, ticket });
  };
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
        isAdmin: !!user.is_admin, totp: !!user.totp_secret,
      },
      licenses,
      plans,
      site: getSetting("site", {}),
      announcements: info.announcements,
      latest: info.latest,
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

    // second step of sign-in for accounts with an authenticator
    "POST /internal/member/login/2fa": {
      open: true,
      fn: async (req, res) => {
        const b = await body(req);
        const ip = ipOf(b);
        const t = tickets.get(String(b.ticket ?? ""));
        if (!t || t.until < Date.now()) return bad(res, "Waktu habis. Masuk lagi dari awal.", 401);
        const user = db.prepare("SELECT * FROM users WHERE id = ?").get(t.userId);
        if (!user || !verifyTotp(user.totp_secret, b.code)) {
          if (++t.tries >= 5) tickets.delete(String(b.ticket));
          audit("member_2fa_failed", { ip, actor: user?.email ?? "?" });
          return bad(res, t.tries >= 5 ? "Terlalu banyak kode salah. Masuk lagi dari awal." : "Kode salah. Cek jam HP dan coba kode terbaru.", 401);
        }
        tickets.delete(String(b.ticket));
        startSession(res, user, ip, `${t.how}+2fa`, t.ua);
      },
    },

    // authenticator: setup (pending secret + QR link), enable with a first code, disable with a code
    "POST /internal/member/2fa/setup": member(async (_req, res, user) => {
      const secret = newTotpSecret();
      db.prepare("UPDATE users SET totp_pending = ? WHERE id = ?").run(secret, user.id);
      json(res, 200, { ok: true, secret, uri: totpUri(secret, user.email) });
    }),
    "POST /internal/member/2fa/enable": member(async (req, res, user) => {
      const b = await body(req);
      if (!user.totp_pending || !verifyTotp(user.totp_pending, b.code)) return bad(res, "Kode salah. Pindai QR lagi lalu masukkan kode 6 angka terbaru.");
      db.prepare("UPDATE users SET totp_secret = totp_pending, totp_pending = NULL WHERE id = ?").run(user.id);
      audit("member_2fa_enabled", { actor: user.email });
      json(res, 200, { ok: true });
    }),
    "POST /internal/member/2fa/disable": member(async (req, res, user) => {
      const b = await body(req);
      if (!verifyTotp(user.totp_secret, b.code)) return bad(res, "Kode salah.");
      db.prepare("UPDATE users SET totp_secret = NULL, totp_pending = NULL WHERE id = ?").run(user.id);
      audit("member_2fa_disabled", { actor: user.email });
      json(res, 200, { ok: true });
    }),

    // one-time "atur password" link: check, then set (signs the member in, via 2FA when enabled)
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
const SITE = (process.env.SITE_URL || "https://43.156.15.173:8443").replace(/\/+$/, "");
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
