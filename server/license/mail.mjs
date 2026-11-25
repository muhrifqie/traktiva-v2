// Email engine: one look for every mail, an outbox for everything that is not a code, and a daily cap.
//  - Codes (sign-up, forgot password) go out right away with sendNow() and fail loudly.
//  - Notifications and broadcasts go through queueMail(): the worker in internal-api sends one mail every few
//    seconds, retries with backoff, and stops for the day at the cap (free Gmail allows ~500/day; codes count too).
//  - SMTP account: DATA_DIR/smtp.json (600) { host, port, user, pass, fromName }. Missing = nothing is sent.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { audit, DATA_DIR, db, getSetting, loadSecrets } from "./lib.mjs";
import { sendMail } from "./smtp.mjs";

export const SITE = (process.env.SITE_URL || "https://app.traktiva.site").replace(/\/+$/, "");

export function smtpConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "smtp.json"), "utf8"));
    return c?.host && c?.user && c?.pass ? c : null;
  } catch {
    return null;
  }
}

/** Which automatic mails are on (Admin → Email). Codes and security notices are always sent. */
export const EMAIL_DEFAULTS = { welcome: true, payment: true, reminders: true, dailyCap: 400 };
export const emailSettings = () => ({ ...EMAIL_DEFAULTS, ...getSetting("email", {}) });

db.exec(`CREATE TABLE IF NOT EXISTS email_outbox (
  id INTEGER PRIMARY KEY, to_email TEXT NOT NULL, kind TEXT NOT NULL, subject TEXT NOT NULL, text TEXT, html TEXT,
  batch TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), next_at INTEGER NOT NULL DEFAULT (unixepoch()),
  tries INTEGER NOT NULL DEFAULT 0, sent_at INTEGER, error TEXT)`);
db.exec("CREATE INDEX IF NOT EXISTS email_outbox_due ON email_outbox (sent_at, next_at)");
if (!db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'email_opt_out'").get()) {
  db.exec("ALTER TABLE users ADD COLUMN email_opt_out INTEGER NOT NULL DEFAULT 0"); // 1 = no news/broadcasts
}

// ---------------------------------------------------------------- look
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const P = (s) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#3d443a">${s}</p>`;

/**
 * One mail in the house style. `lines` = paragraphs (plain text, escaped here), `code` = big 6-digit box,
 * `rows` = key/value table, `cta` = { href, label } button, `unsub` = link at the bottom (broadcasts only).
 * Returns { subject, text, html }.
 */
export function compose({ subject, title, hello, lines = [], code, rows, cta, outro, unsub }) {
  const t = [hello ? `${hello},` : null, "", ...lines, ""];
  if (code) t.push(`Kode: ${code}`, "");
  if (rows) t.push(...rows.map(([k, v]) => `${k}: ${v}`), "");
  if (cta) t.push(`${cta.label}: ${cta.href}`, "");
  if (outro) t.push(outro, "");
  t.push("Salam,", "Tim Traktiva");
  if (unsub) t.push("", `Berhenti menerima info & promo: ${unsub}`);

  const html = `<!doctype html><html><body style="margin:0;background:#f5f5ef;font-family:Arial,Helvetica,sans-serif;color:#0b0d0a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e3e5dc;border-radius:12px">
<tr><td style="padding:28px 28px 4px"><span style="display:inline-block;background:#106e3a;color:#fff;font-weight:bold;border-radius:8px;padding:6px 10px;font-size:14px">Traktiva</span></td></tr>
<tr><td style="padding:14px 28px 4px;font-size:19px;font-weight:bold;color:#0b0d0a">${esc(title || subject)}</td></tr>
<tr><td style="padding:10px 28px 0">${hello ? P(`${esc(hello)},`) : ""}${lines.map((l) => P(esc(l))).join("")}</td></tr>
${code ? `<tr><td style="padding:6px 28px 14px"><div style="font-size:32px;letter-spacing:8px;font-weight:bold;font-family:Consolas,monospace;background:#f5f5ef;border-radius:8px;padding:14px 0;text-align:center">${esc(code)}</div></td></tr>` : ""}
${rows ? `<tr><td style="padding:4px 28px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5ef;border-radius:8px">${rows.map(([k, v]) => `<tr><td style="padding:8px 12px;font-size:13px;color:#5c6357">${esc(k)}</td><td style="padding:8px 12px;font-size:13px;font-weight:bold;text-align:right">${esc(v)}</td></tr>`).join("")}</table></td></tr>` : ""}
${cta ? `<tr><td style="padding:6px 28px 18px"><a href="${esc(cta.href)}" style="display:inline-block;background:#106e3a;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;border-radius:8px;padding:11px 18px">${esc(cta.label)}</a></td></tr>` : ""}
<tr><td style="padding:0 28px 26px">${outro ? P(esc(outro)) : ""}${P("Salam,<br>Tim Traktiva")}</td></tr>
</table>
${unsub ? `<p style="font-size:12px;color:#8a9084;margin:16px 0 0">Tidak mau menerima info & promo lagi? <a href="${esc(unsub)}" style="color:#5c6357">Berhenti berlangganan</a></p>` : ""}
</td></tr></table></body></html>`;
  return { subject, text: t.join("\n"), html };
}

// ---------------------------------------------------------------- sending
const startOfDayWib = () => {
  const now = Math.floor(Date.now() / 1000);
  return now - ((now + 7 * 3600) % 86400);
};
export const sentToday = () => db.prepare("SELECT count(*) AS n FROM email_outbox WHERE sent_at >= ?").get(startOfDayWib()).n;

/** Send right away (codes). Counts toward the daily total; throws when SMTP is missing or refuses. */
export async function sendNow(to, kind, mail, mailer = sendMail) {
  const cfg = smtpConfig();
  if (!cfg) throw new Error("SMTP belum diatur");
  await mailer(cfg, { to, ...mail });
  db.prepare("INSERT INTO email_outbox (to_email, kind, subject, sent_at, tries) VALUES (?, ?, ?, unixepoch(), 1)").run(to, kind, mail.subject);
}

/** Put a mail in the outbox; the worker sends it. */
export function queueMail(to, kind, mail, batch = null) {
  db.prepare("INSERT INTO email_outbox (to_email, kind, subject, text, html, batch) VALUES (?, ?, ?, ?, ?, ?)").run(to, kind, mail.subject, mail.text, mail.html, batch);
}

let busy = false;
/** One outbox step: send the oldest due mail, unless the daily cap is reached. Returns what happened (for tests/logs). */
export async function mailerTick(mailer = sendMail) {
  if (busy) return "busy";
  const cfg = smtpConfig();
  if (!cfg) return "no-smtp";
  if (sentToday() >= emailSettings().dailyCap) return "cap";
  const m = db.prepare("SELECT * FROM email_outbox WHERE sent_at IS NULL AND tries < 5 AND next_at <= unixepoch() ORDER BY id LIMIT 1").get();
  if (!m) return "idle";
  busy = true;
  try {
    await mailer(cfg, { to: m.to_email, subject: m.subject, text: m.text, html: m.html });
    db.prepare("UPDATE email_outbox SET sent_at = unixepoch(), tries = tries + 1, error = NULL, text = NULL, html = NULL WHERE id = ?").run(m.id);
    return "sent";
  } catch (e) {
    const err = String(e?.message ?? e).slice(0, 200);
    db.prepare("UPDATE email_outbox SET tries = tries + 1, next_at = unixepoch() + ?, error = ? WHERE id = ?").run(60 * 2 ** m.tries, err, m.id); // 1, 2, 4, 8 min
    if (m.tries + 1 >= 5) audit("email_failed", { actor: m.to_email, detail: `${m.kind}: ${err}` });
    return "failed";
  } finally {
    busy = false;
  }
}

/** Start the background sender (internal-api). One mail per `everyMs` keeps Gmail happy. */
export function startMailer(everyMs = 4000) {
  setInterval(() => void mailerTick().catch((e) => console.error("[mail]", e instanceof Error ? e.message : e)), everyMs).unref();
  // keep the outbox small: bodies are dropped once sent; rows older than 60 days go
  setInterval(() => db.prepare("DELETE FROM email_outbox WHERE created_at < unixepoch() - 60 * 86400").run(), 86400_000).unref();
}

/** Admin → Email: is it set up, what is waiting, what failed, and one page of the sent/queued mails (newest first). */
export const MAIL_PAGE = 10;
export function mailStatus(page = 1) {
  const cfg = smtpConfig();
  const one = (sql, ...a) => db.prepare(sql).get(...a).n;
  return {
    configured: !!cfg,
    from: cfg ? `${cfg.fromName || "Traktiva"} <${cfg.user}>` : null,
    settings: emailSettings(),
    sentToday: sentToday(),
    pending: one("SELECT count(*) AS n FROM email_outbox WHERE sent_at IS NULL AND tries < 5"),
    failed: one("SELECT count(*) AS n FROM email_outbox WHERE sent_at IS NULL AND tries >= 5"),
    recent: db.prepare("SELECT id, to_email, kind, subject, created_at, sent_at, tries, error, batch FROM email_outbox ORDER BY id DESC LIMIT ? OFFSET ?")
      .all(MAIL_PAGE, (Math.max(1, Math.floor(page) || 1) - 1) * MAIL_PAGE),
    recentTotal: one("SELECT count(*) AS n FROM email_outbox"),
    page: Math.max(1, Math.floor(page) || 1),
    perPage: MAIL_PAGE,
  };
}

// ---------------------------------------------------------------- unsubscribe links (news/broadcasts only)
const unsubSig = (userId) => crypto.createHmac("sha256", loadSecrets().pepper).update(`unsub:${userId}`).digest("base64url").slice(0, 22);
export const unsubLink = (userId) => `${SITE}/email/berhenti?u=${userId}&t=${unsubSig(userId)}`;
export const unsubValid = (userId, token) => {
  const want = Buffer.from(unsubSig(Number(userId)));
  const got = Buffer.from(String(token ?? "").padEnd(want.length).slice(0, want.length));
  return Number(userId) > 0 && crypto.timingSafeEqual(want, got);
};

// ---------------------------------------------------------------- the automatic mails
const fmtDate = (s) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(s * 1000);
const fmtTime = (s) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(s * 1000) + " WIB";
const first = (name) => (name || "").trim().split(/\s+/)[0] || "Halo";

export const mails = {
  code: (purpose, code) =>
    purpose === "register"
      ? compose({ subject: "Kode verifikasi akun Traktiva", title: "Verifikasi email kamu", lines: ["Masukkan kode ini di halaman daftar untuk menyelesaikan pembuatan akun Traktiva. Berlaku 10 menit."], code, outro: "Kalau kamu tidak mendaftar di Traktiva, abaikan email ini." })
      : compose({ subject: "Kode lupa password akun Traktiva", title: "Kode lupa password", lines: ["Kami menerima permintaan untuk membuat password baru akun Traktiva kamu. Masukkan kode ini di halaman lupa password. Berlaku 10 menit."], code, outro: "Kalau kamu tidak meminta ini, abaikan saja; password kamu tidak berubah." }),

  welcome: (u) =>
    compose({
      subject: "Selamat datang di Traktiva",
      hello: `Halo ${first(u.name)}`,
      lines: ["Akun Traktiva kamu sudah aktif. Tiga langkah untuk mulai:", "1. Beli lisensi (atau tempel key dari penjual).", "2. Download app dan pasang di PC Windows.", "3. Tempel key saat app pertama dibuka."],
      cta: { href: `${SITE}/akun`, label: "Buka akun saya" },
    }),

  paid: (u, o) =>
    compose({
      subject: `Pembayaran diterima: lisensi ${o.planLabel} aktif`,
      hello: `Halo ${first(u.name)}`,
      lines: ["Terima kasih, pembayaranmu sudah kami terima dan lisensinya langsung aktif."],
      rows: [["Paket", o.planLabel], ["Nominal", `Rp ${Number(o.amount).toLocaleString("id-ID")}`], ["Key", `…${o.keyHint}`], ["Berlaku sampai", o.expiresAt ? fmtDate(o.expiresAt) : "Selamanya"], ["Nomor pesanan", o.id]],
      cta: { href: `${SITE}/akun`, label: "Lihat key & download app" },
      outro: "Key lengkap ada di akunmu. Jangan bagikan key ke orang lain.",
    }),

  reminder: (u, l, kind) =>
    compose({
      subject: kind === "expired" ? `Lisensi Traktiva ${l.planLabel} sudah habis` : `Lisensi Traktiva ${l.planLabel} ${kind === "1d" ? "habis besok" : "habis 7 hari lagi"}`,
      hello: `Halo ${first(u.name)}`,
      lines: [
        kind === "expired"
          ? `Lisensi ${l.planLabel} (key …${l.keyHint}) sudah habis pada ${fmtDate(l.expiresAt)}, jadi app di PC-mu terkunci.`
          : `Lisensi ${l.planLabel} (key …${l.keyHint}) akan habis pada ${fmtDate(l.expiresAt)}.`,
        "Perpanjang sekarang supaya app tetap jalan. Masa aktif baru ditambahkan dari tanggal habis yang sekarang, jadi tidak ada hari yang hilang.",
      ],
      cta: { href: `${SITE}/lisensi/${l.id}`, label: "Perpanjang lisensi" },
    }),

  security: (u, what, ip, at) =>
    compose({
      subject: "Password akun Traktiva kamu diubah",
      hello: `Halo ${first(u.name)}`,
      lines: [`Password akun Traktiva (${u.email}) baru saja ${what}. Semua perangkat lain otomatis keluar.`],
      rows: [["Waktu", fmtTime(at)], ["Alamat IP", ip || "-"]],
      outro: "Bukan kamu? Segera buat password baru lewat halaman lupa password dan hubungi kami.",
      cta: { href: `${SITE}/lupa-password`, label: "Amankan akun" },
    }),

  broadcast: (u, b) =>
    compose({
      subject: b.subject,
      title: b.subject,
      hello: `Halo ${first(u.name)}`,
      lines: String(b.message).split(/\n{2,}/).map((s) => s.replace(/\n/g, " ").trim()).filter(Boolean),
      cta: b.ctaUrl ? { href: b.ctaUrl, label: b.ctaLabel || "Lihat selengkapnya" } : undefined,
      unsub: unsubLink(u.id),
    }),
};

/** Queue an automatic mail unless that kind is switched off in Admin → Email. Never throws. */
export function notify(kind, to, mail) {
  try {
    const s = emailSettings();
    if (kind in EMAIL_DEFAULTS && s[kind] === false) return false;
    if (!to) return false;
    queueMail(to, kind, mail);
    return true;
  } catch (e) {
    console.error("[mail]", e instanceof Error ? e.message : e);
    return false;
  }
}
