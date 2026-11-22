// Website purchases with WaroengPay (QRIS). A member picks a plan → an order + a WaroengPay invoice → the buyer pays
// on WaroengPay's page → the signed `payment.paid` webhook (or a status poll) marks the order paid and creates a new
// license in the member's account, or extends the license being renewed.
//
// OFF until the owner sets, on the license server, env WAROENGPAY_API_KEY (wp_live_… or wp_test_… for sandbox),
// WAROENGPAY_WEBHOOK_SECRET (whsec_… / whsec_test_…), SITE_URL, or the same in DATA_DIR/waroengpay.json (600:
// { "apiKey", "webhookSecret", "base"?, "siteUrl"? }), and switches it on in Pengaturan → Pembayaran.
// Webhooks need a trusted TLS certificate on SITE_URL (WaroengPay rejects self-signed ones), so pending orders are
// also polled every minute (syncPendingOrders): payment is picked up within ~1 minute either way.
// Safety rules from WaroengPay's docs: match by invoice id (never by reference), check the amount, ignore events of
// the other mode (test vs live), process each event once, re-check with the API when in doubt.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { audit, createLicenses, DATA_DIR, db, getPlans, getSetting, loadSecrets } from "./lib.mjs";

/** DATA_DIR/waroengpay.json, re-read when it changes (keys can be rotated without a restart). */
let fileCfg = { at: 0, v: {} };
function cfg() {
  const f = path.join(DATA_DIR, "waroengpay.json");
  try {
    const m = fs.statSync(f).mtimeMs;
    if (m !== fileCfg.at) fileCfg = { at: m, v: JSON.parse(fs.readFileSync(f, "utf8")) };
  } catch {
    fileCfg = { at: 0, v: {} };
  }
  return fileCfg.v;
}
const BASE = () => (process.env.WAROENGPAY_BASE || cfg().base || "https://waroengpay.com").replace(/\/+$/, "");
const KEY = () => process.env.WAROENGPAY_API_KEY || cfg().apiKey || "";
const SECRET = () => process.env.WAROENGPAY_WEBHOOK_SECRET || cfg().webhookSecret || "";
const SITE = () => (process.env.SITE_URL || cfg().siteUrl || "https://43.156.15.173:8443").replace(/\/+$/, "");
/** wp_test_ keys create sandbox invoices only (never money); the server then only accepts sandbox events. */
export const testMode = () => KEY().startsWith("wp_test_");

/** Configured on the server AND switched on by the owner. */
export const paymentsReady = () => !!(KEY() && SECRET() && getSetting("payments", {}).enabled);
export const paymentsConfigured = () => !!(KEY() && SECRET());

async function wp(path, { method = "GET", body, idempotency } = {}) {
  const res = await fetch(BASE() + path, {
    method,
    headers: { authorization: `Bearer ${KEY()}`, "content-type": "application/json", ...(idempotency ? { "idempotency-key": idempotency } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WaroengPay ${res.status}: ${json.error ?? json.message ?? "gagal"}`);
  return json;
}

/** New order for a plan (optionally renewing one of the member's licenses) → the WaroengPay invoice to pay. */
export async function createOrder(user, planId, renewId = null) {
  if (!paymentsReady()) throw Object.assign(new Error("Pembayaran otomatis belum aktif. Hubungi penjual lewat WhatsApp."), { status: 503 });
  const plan = getPlans().find((p) => p.id === planId);
  if (!plan || !(plan.price >= 1000)) throw Object.assign(new Error("Paket ini belum bisa dibeli online."), { status: 400 });
  if (renewId) {
    const l = db.prepare("SELECT id, user_id, status FROM licenses WHERE id = ?").get(renewId);
    if (!l || l.user_id !== user.id || l.status === "revoked") throw Object.assign(new Error("Lisensi tidak ditemukan di akunmu."), { status: 404 });
  }
  const id = `TRK-ORD-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
  const inv = await wp("/api/payments", {
    method: "POST",
    idempotency: id,
    body: {
      amount: plan.price,
      reference: id,
      description: `Traktiva ${plan.label}${renewId ? " (perpanjang)" : ""}`.slice(0, 200),
      callback_url: `${SITE()}/api/pay/webhook`,
      redirect_url: `${SITE()}/akun?order=${id}`,
      expires_in: 30,
    },
  });
  db.prepare(
    "INSERT INTO orders (id, user_id, plan, license_id, base_amount, amount, wp_id, pay_url, livemode, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  ).run(id, user.id, plan.id, renewId, plan.price, inv.amount, inv.id, inv.pay_url, inv.livemode ? 1 : 0, Math.floor(Date.parse(inv.expires_at) / 1000) || null);
  audit("order_created", { actor: user.email, detail: `${id} ${plan.label} Rp${plan.price}${renewId ? ` perpanjang #${renewId}` : ""}${inv.livemode ? "" : " (uji)"}` });
  return { id, payUrl: inv.pay_url, amount: inv.amount };
}

/** Verify a webhook delivery: HMAC-SHA256(secret, "<timestamp>.<raw body>"), fresh within 5 minutes. */
export function verifyWebhook(raw, headers) {
  const ts = String(headers["x-waroengpay-timestamp"] ?? "");
  const sig = String(headers["x-signature"] ?? "");
  if (!SECRET() || !/^\d+$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = crypto.createHmac("sha256", SECRET()).update(`${ts}.${raw}`).digest("hex");
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

/** Mark an order paid (once) and deliver: extend the renewed license or create a new one in the member's account. */
function fulfil(order, eventId, data) {
  const paidInvoice = data.base_amount === order.base_amount && data.id === order.wp_id;
  if (!paidInvoice) {
    db.prepare("UPDATE orders SET status = 'mismatch', event_id = ? WHERE id = ? AND status = 'pending'").run(eventId, order.id);
    audit("order_mismatch", { actor: "waroengpay", detail: `${order.id}: dibayar Rp${data.base_amount}, harga Rp${order.base_amount}` });
    return { ok: false, reason: "mismatch" };
  }
  // one transaction: status check + delivery cannot run twice for the same order
  db.exec("BEGIN IMMEDIATE");
  try {
    const fresh = db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id);
    if (fresh.status === "paid") {
      db.exec("COMMIT");
      return { ok: true, already: true };
    }
    const plan = getPlans().find((p) => p.id === fresh.plan);
    const user = db.prepare("SELECT email FROM users WHERE id = ?").get(fresh.user_id);
    let licenseId = fresh.license_id;
    if (licenseId) {
      const l = db.prepare("SELECT expires_at FROM licenses WHERE id = ?").get(licenseId);
      const next = plan?.days == null ? null : Math.max(l?.expires_at ?? 0, Math.floor(Date.now() / 1000)) + plan.days * 86400;
      db.prepare("UPDATE licenses SET expires_at = ?, status = CASE WHEN status = 'suspended' THEN status ELSE 'active' END WHERE id = ?").run(next, licenseId);
      audit("license_extended", { license_id: licenseId, actor: "waroengpay", detail: plan?.days == null ? "lifetime (beli)" : `+${plan.days} hari (beli ${fresh.id})` });
    } else {
      const [made] = createLicenses({
        pepper: loadSecrets().pepper, plan: fresh.plan, days: plan?.days ?? null, devices: plan?.devices ?? 1,
        note: `Beli online ${fresh.id} · ${user?.email ?? ""}`.slice(0, 200), count: 1, actor: "waroengpay", keep: true,
      });
      licenseId = made.id;
      db.prepare("UPDATE licenses SET user_id = ? WHERE id = ?").run(fresh.user_id, licenseId); // straight into the buyer's account
    }
    db.prepare("UPDATE orders SET status = 'paid', paid_at = unixepoch(), event_id = ?, license_id = ? WHERE id = ?").run(eventId, licenseId, fresh.id);
    audit("order_paid", { license_id: licenseId, actor: "waroengpay", detail: `${fresh.id} Rp${fresh.base_amount}${data.late ? " (telat)" : ""}` });
    db.exec("COMMIT");
    return { ok: true, licenseId };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** Poll WaroengPay for pending orders of the last 2 hours (fallback for webhooks that cannot reach us). */
export async function syncPendingOrders() {
  if (!KEY()) return 0;
  const rows = db.prepare("SELECT * FROM orders WHERE status = 'pending' AND created_at > unixepoch() - 7200 ORDER BY created_at LIMIT 20").all();
  for (const o of rows) await syncOrder(o);
  return rows.length;
}

/** Webhook from WaroengPay (forwarded by the web app with the raw body + headers). */
export function handleWebhook(raw, headers) {
  if (!verifyWebhook(raw, headers)) return { status: 401, body: { ok: false, message: "Tanda tangan webhook tidak valid." } };
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return { status: 400, body: { ok: false } };
  }
  // events of the other mode never touch orders (sandbox events on a live server, and the reverse)
  if (event.livemode === testMode()) return { status: 200, body: { ok: true, ignored: "mode" } };
  const data = event.data ?? {};
  const order = db.prepare("SELECT * FROM orders WHERE wp_id = ?").get(String(data.id ?? ""));
  if (!order) return { status: 200, body: { ok: true, ignored: "unknown" } };
  if (event.event === "payment.paid") return { status: 200, body: fulfil(order, String(event.id ?? ""), data) };
  if (event.event === "payment.expired" || event.event === "payment.cancelled") {
    db.prepare("UPDATE orders SET status = ? WHERE id = ? AND status = 'pending'").run(event.event === "payment.expired" ? "expired" : "cancelled", order.id);
  }
  return { status: 200, body: { ok: true } };
}

/** Webhook missed? Ask WaroengPay for the invoice of a pending order (called when the buyer looks at it). */
export async function syncOrder(order) {
  if (order.status !== "pending" || !KEY()) return order;
  try {
    const inv = await wp(`/api/payments/${encodeURIComponent(order.wp_id)}`);
    if (inv.status === "paid" && !!inv.livemode !== testMode()) fulfil(order, `poll:${inv.id}`, inv);
    else if (inv.status === "expired" || inv.status === "cancelled") db.prepare("UPDATE orders SET status = ? WHERE id = ? AND status = 'pending'").run(inv.status, order.id);
  } catch {
    // WaroengPay unreachable: keep pending, the webhook or the next look retries
  }
  return db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id);
}
