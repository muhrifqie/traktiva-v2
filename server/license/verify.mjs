// Email codes (purpose "register" = sign-up, "reset" = forgot password). Two backends, same answers ({ ok, otp?, error?, message?, retry_after? }):
//  1. Own SMTP (DATA_DIR/smtp.json, 600: { "host": "smtp.gmail.com", "port": 465, "user": "...", "pass": "<app password>",
//     "fromName": "Traktiva" }): the code is made and checked here, mailed through that account.
//  2. Waroengku Verify (env VERIFY_URL + VERIFY_KEY, or DATA_DIR/verify.json) when no smtp.json.
// Neither configured / unreachable → the reset fails closed with a friendly message.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { audit, DATA_DIR, db, loadSecrets } from "./lib.mjs";
import { mails, sendNow, smtpConfig } from "./mail.mjs";
import { sendMail } from "./smtp.mjs";

const readJson = (name) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
  } catch {
    return null;
  }
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
      await sendNow(email, `code:${purpose}`, mails.code(purpose, code), mailer);
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
