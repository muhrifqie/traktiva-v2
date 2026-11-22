// Email codes for "lupa password". Two backends, same answers ({ ok, otp?, error?, message?, retry_after? }):
//  1. Own SMTP (DATA_DIR/smtp.json, 600: { "host": "smtp.gmail.com", "port": 465, "user": "...", "pass": "<app password>",
//     "fromName": "Traktiva" }): the code is made and checked here, mailed through that account.
//  2. Waroengku Verify (env VERIFY_URL + VERIFY_KEY, or DATA_DIR/verify.json) when no smtp.json.
// Neither configured / unreachable → the reset fails closed with a friendly message.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { audit, DATA_DIR, db, loadSecrets } from "./lib.mjs";
import { sendMail } from "./smtp.mjs";

const readJson = (name) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
  } catch {
    return null;
  }
};
const smtpConfig = () => {
  const c = readJson("smtp.json");
  return c?.host && c?.user && c?.pass ? c : null;
};
function verifyConfig() {
  if (process.env.VERIFY_URL && process.env.VERIFY_KEY) return { url: process.env.VERIFY_URL, key: process.env.VERIFY_KEY };
  return readJson("verify.json");
}

export const verifyConfigured = () => !!(smtpConfig() || verifyConfig()?.key);
const DOWN = { ok: false, error: "verify_down", message: "Pengiriman email sedang gangguan. Coba lagi sebentar atau hubungi penjual." };

/** Send a code (no otp) or check one (otp). Never throws. `mailer` is injectable for the self-test. */
export async function emailGate(purpose, email, ip, otp, mailer = sendMail) {
  const smtp = smtpConfig();
  if (smtp) return localGate(smtp, mailer, purpose, email, ip, otp);
  const c = verifyConfig();
  if (c?.url && c?.key) {
    try {
      const r = await fetch(`${c.url.replace(/\/+$/, "")}/v1/gate`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${c.key}` },
        body: JSON.stringify({ purpose, email, ip: ip || undefined, otp: otp || undefined }),
        signal: AbortSignal.timeout(25_000),
      });
      if (r.ok) return await r.json();
    } catch {
      /* fall through */
    }
  }
  return DOWN;
}

// ---------------------------------------------------------------- own codes (same limits as Waroengku Verify)
const CODE_TTL = 10 * 60, RESEND_GAP = 60, PER_HOUR = 5, MAX_TRIES = 5;
db.exec(`CREATE TABLE IF NOT EXISTS email_codes (
  id INTEGER PRIMARY KEY, email TEXT NOT NULL, purpose TEXT NOT NULL, code_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()), expires_at INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0, used_at INTEGER)`);
db.exec("CREATE INDEX IF NOT EXISTS email_codes_lookup ON email_codes (email, purpose, created_at)");

let pepper;
const hashCode = (email, purpose, code) =>
  crypto.createHmac("sha256", (pepper ??= loadSecrets().pepper)).update(`${purpose}:${email}:${code}`).digest("hex");

async function localGate(smtp, mailer, purpose, email, ip, otp) {
  const now = Math.floor(Date.now() / 1000);
  if (!otp) {
    const last = db.prepare("SELECT created_at FROM email_codes WHERE email = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1").get(email, purpose);
    if (last && now - last.created_at < RESEND_GAP) return { ok: false, otp: true, message: "Kode baru saja dikirim. Tunggu sebentar.", retry_after: RESEND_GAP - (now - last.created_at) };
    const hour = db.prepare("SELECT count(*) AS n FROM email_codes WHERE email = ? AND purpose = ? AND created_at > ?").get(email, purpose, now - 3600).n;
    if (hour >= PER_HOUR) return { ok: false, error: "too_many", message: "Terlalu banyak permintaan kode. Coba lagi 1 jam lagi." };
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    try {
      await mailer(smtp, resetMail(email, code));
    } catch (e) {
      audit("email_failed", { ip, actor: email, detail: String(e?.message ?? e).slice(0, 200) });
      return DOWN;
    }
    db.prepare("UPDATE email_codes SET used_at = ? WHERE email = ? AND purpose = ? AND used_at IS NULL").run(now, email, purpose); // older codes stop working
    db.prepare("INSERT INTO email_codes (email, purpose, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)").run(email, purpose, hashCode(email, purpose, code), now, now + CODE_TTL);
    return { ok: false, otp: true, message: "Kode dikirim.", retry_after: RESEND_GAP };
  }
  const row = db.prepare("SELECT * FROM email_codes WHERE email = ? AND purpose = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1").get(email, purpose, now);
  if (!row || row.tries >= MAX_TRIES) return { ok: false, otp: true, message: "Kode kedaluwarsa atau terlalu banyak salah. Minta kode baru." };
  const good = crypto.timingSafeEqual(Buffer.from(row.code_hash, "hex"), Buffer.from(hashCode(email, purpose, String(otp)), "hex"));
  if (!good) {
    db.prepare("UPDATE email_codes SET tries = tries + 1 WHERE id = ?").run(row.id);
    return { ok: false, otp: true, message: `Kode salah. Sisa ${MAX_TRIES - row.tries - 1} percobaan.` };
  }
  db.prepare("UPDATE email_codes SET used_at = ? WHERE id = ?").run(now, row.id);
  return { ok: true, verified: true };
}

function resetMail(to, code) {
  const text = `Kode untuk membuat password baru Traktiva: ${code}\n\nBerlaku 10 menit. Kalau kamu tidak meminta ini, abaikan email ini; password kamu tidak berubah.\n\nTraktiva · https://traktiva.site`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5ef;font-family:Arial,Helvetica,sans-serif;color:#0b0d0a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border:1px solid #e3e5dc;border-radius:12px">
<tr><td style="padding:28px 28px 8px"><span style="display:inline-block;background:#106e3a;color:#fff;font-weight:bold;border-radius:8px;padding:6px 10px;font-size:14px">Traktiva</span></td></tr>
<tr><td style="padding:12px 28px 0;font-size:18px;font-weight:bold">Kode lupa password</td></tr>
<tr><td style="padding:8px 28px 0;font-size:14px;color:#5c6357">Masukkan kode ini di halaman lupa password untuk membuat password baru.</td></tr>
<tr><td style="padding:20px 28px"><div style="font-size:32px;letter-spacing:8px;font-weight:bold;font-family:Consolas,monospace;background:#f5f5ef;border-radius:8px;padding:14px 0;text-align:center">${code}</div></td></tr>
<tr><td style="padding:0 28px 28px;font-size:13px;color:#5c6357">Berlaku 10 menit. Kalau kamu tidak meminta ini, abaikan email ini; password kamu tidak berubah.</td></tr>
</table>
<p style="font-size:12px;color:#8a9084;margin:16px 0 0">Traktiva · <a href="https://traktiva.site" style="color:#106e3a">traktiva.site</a></p>
</td></tr></table></body></html>`;
  return { to, subject: `${code} adalah kode lupa password Traktiva`, text, html };
}
