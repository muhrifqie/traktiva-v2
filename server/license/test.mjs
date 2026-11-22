// Self-check: runs the server on a temp data dir and walks activate → nonce → session plus the failure cases.
// Usage: node server/license/test.mjs
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trk-license-"));
// WaroengPay stand-in (sandbox key): records invoices, answers like POST/GET /api/payments
const WP_SECRET = "whsec_test_selftest";
const wpInvoices = [];
const wpMock = http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d)).on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.method === "POST" && req.url === "/api/payments") {
        const b = JSON.parse(raw);
        const inv = { id: `WRG-T${wpInvoices.length + 1}`, status: "pending", base_amount: b.amount, amount: b.amount + 137, pay_url: "https://wp.test/pay/x", livemode: false, expires_at: new Date(Date.now() + 1800e3).toISOString() };
        wpInvoices.push(inv);
        return res.end(JSON.stringify(inv));
      }
      const inv = wpInvoices.find((i) => req.url.endsWith(i.id));
      res.statusCode = inv ? 200 : 404;
      res.end(JSON.stringify(inv ?? { error: "not_found" }));
    });
  })
  .listen(38294, "127.0.0.1");
// Waroengku Verify stand-in: purpose "reset" sends code 246810, then accepts it once
const verifySent = [];
const verifyMock = http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d)).on("end", () => {
      const b = JSON.parse(raw || "{}");
      res.setHeader("content-type", "application/json");
      if (req.headers.authorization !== "Bearer vk_selftest") return res.end(JSON.stringify({ ok: false, error: "bad_key", message: "kunci" }));
      if (!b.otp) return verifySent.push(b.email), res.end(JSON.stringify({ ok: false, otp: true, message: "Kode dikirim.", retry_after: 60 }));
      res.end(JSON.stringify(b.otp === "246810" ? { ok: true, verified: true } : { ok: false, otp: true, message: "Kode salah." }));
    });
  })
  .listen(38295, "127.0.0.1");
const env = { ...process.env, VERIFY_URL: "http://127.0.0.1:38295", VERIFY_KEY: "vk_selftest", LICENSE_DATA_DIR: dir, LICENSE_PORT: "38291", WAROENGPAY_BASE: "http://127.0.0.1:38294", WAROENGPAY_API_KEY: "wp_test_selftest", WAROENGPAY_WEBHOOK_SECRET: WP_SECRET };
const admin = (...a) => execFileSync(process.execPath, [path.join(import.meta.dirname, "admin.mjs"), ...a], { env, encoding: "utf8" });
const serverPub = admin("init").trim().split("\n").pop();
const key = admin("create", "--days", "30", "--note", "test").split(" ")[0];
const server = spawn(process.execPath, [path.join(import.meta.dirname, "server.mjs")], { env, stdio: "ignore" });
const base = "http://127.0.0.1:38291";
const post = (p, body) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

try {
  for (let i = 0; i < 50 && !(await fetch(base + "/health").then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 100));

  // a device = Ed25519 key pair
  const device = () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
    return { privateKey, pub: publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64"), hash: crypto.randomBytes(8).toString("hex") };
  };
  const login = async (d, deviceId) => {
    const { nonce } = await post("/v1/nonce", { deviceId });
    const signature = crypto.sign(null, Buffer.from(`traktiva-session:${nonce}`), d.privateKey).toString("base64");
    return post("/v1/session", { deviceId, nonce, signature });
  };

  assert.equal((await post("/v1/activate", { key: "TRK-AAAA-BBBB-CCCC-DDDD", devicePub: device().pub, deviceHash: "x" })).error, "invalid_key");

  const pc1 = device();
  const act = await post("/v1/activate", { key: key.toLowerCase().replace(/-/g, " "), devicePub: pc1.pub, deviceHash: pc1.hash, deviceName: "PC1" });
  assert.ok(act.ok, JSON.stringify(act));

  const s = await login(pc1, act.deviceId);
  assert.ok(s.ok, JSON.stringify(s));
  // the token verifies with the server public key and nothing else
  const [body, sig] = s.token.split(".");
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(serverPub, "base64")]);
  assert.ok(crypto.verify(null, Buffer.from(body), crypto.createPublicKey({ key: spki, format: "der", type: "spki" }), Buffer.from(sig, "base64url")));
  assert.equal(JSON.parse(Buffer.from(body, "base64url")).features.includes("ai"), true);

  // replayed nonce / wrong key are refused
  const { nonce } = await post("/v1/nonce", { deviceId: act.deviceId });
  const forged = crypto.sign(null, Buffer.from(`traktiva-session:${nonce}`), device().privateKey).toString("base64");
  assert.equal((await post("/v1/session", { deviceId: act.deviceId, nonce, signature: forged })).error, "bad_signature");
  assert.equal((await post("/v1/session", { deviceId: act.deviceId, nonce, signature: forged })).error, "device_unknown");

  // second PC: limit 1 → refused; same PC again → allowed (replaces its old record)
  assert.equal((await post("/v1/activate", { key, devicePub: device().pub, deviceHash: "other-pc" })).error, "device_limit");
  const again = await post("/v1/activate", { key, devicePub: pc1.pub, deviceHash: pc1.hash });
  assert.ok(again.ok);
  assert.equal((await login(pc1, act.deviceId)).error, "device_unknown"); // old device id is gone

  // suspend → session refused
  admin("suspend", "1");
  assert.equal((await login(pc1, again.deviceId)).error, "suspended");
  console.log("license server ok");

  // internal API (admin panel): name + password login, per-IP lockout, password change
  const pw = admin("add-admin", "Owner").trim().split("\n").pop();
  const internal = spawn(process.execPath, [path.join(import.meta.dirname, "internal-api.mjs")], { env: { ...env, INTERNAL_PORT: "38292" }, stdio: "ignore" });
  try {
    const ib = "http://127.0.0.1:38292";
    for (let i = 0; i < 50 && !(await fetch(ib + "/health").then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 100));
    const svc = fs.readFileSync(path.join(dir, "service-token"), "utf8").trim();
    const ipost = (p, body, session) =>
      fetch(ib + p, { method: "POST", headers: { authorization: `Bearer ${svc}`, "content-type": "application/json", ...(session && { "x-admin-session": session }) }, body: JSON.stringify(body) }).then((r) => r.json());
    assert.equal((await ipost("/internal/admin/login", { username: "Owner", password: "salah", ip: "1.1.1.1" })).ok, false);
    const ok = await ipost("/internal/admin/login", { username: "owner", password: pw, ip: "1.1.1.1" }); // name is case-insensitive
    assert.ok(ok.ok && ok.session, JSON.stringify(ok));
    for (let i = 0; i < 5; i++) await ipost("/internal/admin/login", { username: "Owner", password: "x", ip: "6.6.6.6" });
    assert.match((await ipost("/internal/admin/login", { username: "Owner", password: pw, ip: "6.6.6.6" })).message, /Terlalu banyak/); // that IP is locked…
    assert.ok((await ipost("/internal/admin/login", { username: "Owner", password: pw, ip: "1.1.1.1" })).ok); // …the owner's is not
    assert.equal((await ipost("/internal/admin/password", { current: "salah", next: "passwordbaru123" }, ok.session)).ok, false);
    assert.ok((await ipost("/internal/admin/password", { current: pw, next: "passwordbaru123" }, ok.session)).ok);
    assert.ok((await ipost("/internal/admin/login", { username: "Owner", password: "passwordbaru123", ip: "1.1.1.1" })).ok);
    // pusat informasi: announcement + release reach the app with every session
    assert.ok((await ipost("/internal/announcements", { title: "Maintenance malam ini", level: "warn" }, ok.session)).ok);
    assert.equal((await ipost("/internal/releases", { version: "1.2.0", url: "http://x.test/a.exe" }, ok.session)).ok, false); // https only
    assert.ok((await ipost("/internal/releases", { version: "v1.2.0", url: "https://x.test/a.exe", mandatory: true }, ok.session)).ok);
    assert.ok((await ipost("/internal/settings", { remote: { maintenance: false, maxParallel: 3 } }, ok.session)).ok);
    admin("activate", "1");
    const info = (await login(pc1, again.deviceId)).info;
    assert.equal(info.announcements[0].title, "Maintenance malam ini");
    assert.deepEqual([info.latest.version, info.latest.mandatory, info.remote.maxParallel], ["1.2.0", 1, 3]);

    // member accounts: register, wrong password, claim a key, others cannot claim it, self reset with a 7-day cooldown
    const mpost = (p, body, session) =>
      fetch(ib + p, { method: "POST", headers: { authorization: `Bearer ${svc}`, "content-type": "application/json", ...(session && { "x-member-session": session }) }, body: JSON.stringify(body) }).then((r) => r.json());
    const mget = (p, session) => fetch(ib + p, { headers: { authorization: `Bearer ${svc}`, "x-member-session": session } }).then((r) => r.json());
    assert.equal((await mpost("/internal/member/register", { email: "bad", password: "12345678" })).ok, false);
    assert.equal((await mpost("/internal/member/register", { email: "budi@tes.id", password: "pendek" })).ok, false);
    // sign-up needs the email code: step 1 mails it (no account yet), a wrong code fails, the right one creates the account
    const reg1 = await mpost("/internal/member/register", { email: "Budi@Tes.id", name: "Budi", password: "rahasia123", ip: "3.3.3.3" });
    assert.ok(reg1.ok && reg1.needCode && !reg1.session, JSON.stringify(reg1));
    assert.equal((await mpost("/internal/member/login", { email: "budi@tes.id", password: "rahasia123", ip: "3.3.3.3" })).ok, false); // not created yet
    assert.equal((await mpost("/internal/member/register", { email: "budi@tes.id", otp: "111111", ip: "3.3.3.3" })).ok, false);
    const reg = await mpost("/internal/member/register", { email: "budi@tes.id", otp: "246810", ip: "3.3.3.3" });
    assert.ok(reg.ok && reg.session, JSON.stringify(reg));
    assert.equal((await mpost("/internal/member/register", { email: "budi@tes.id", password: "rahasia123" })).ok, false); // duplicate (case-insensitive)
    assert.equal((await mpost("/internal/member/login", { email: "budi@tes.id", password: "salah12345", ip: "3.3.3.3" })).ok, false);
    const mlog = await mpost("/internal/member/login", { email: "BUDI@tes.id", password: "rahasia123", ip: "3.3.3.3" });
    assert.ok(mlog.ok);
    assert.equal((await mpost("/internal/member/claim", { key: "TRK-AAAA-BBBB-CCCC-DDDD" }, mlog.session)).ok, false);
    assert.ok((await mpost("/internal/member/claim", { key: key.toLowerCase() }, mlog.session)).ok);
    assert.equal((await mpost("/internal/member/claim", { key }, mlog.session)).already, true);
    const me = await mget("/internal/member/me", mlog.session);
    assert.equal(me.licenses[0].key, key.toUpperCase()); // a linked key is shown in full to its owner (canonical form)
    assert.deepEqual([me.user.email, me.licenses.length, me.licenses[0].id, me.licenses[0].devices.length, me.latest.version], ["budi@tes.id", 1, 1, 1, "1.2.0"]);
    assert.equal(me.licenses[0].key_hash, undefined); // never leaks the hash
    assert.deepEqual(me.releases.map((r) => r.version), ["1.2.0"]); // release history for the Aplikasi page
    await mpost("/internal/member/register", { email: "sari@tes.id", password: "rahasia123", ip: "4.4.4.4" });
    const other = await mpost("/internal/member/register", { email: "sari@tes.id", otp: "246810", ip: "4.4.4.4" });
    assert.match((await mpost("/internal/member/claim", { key }, other.session)).message, /akun lain/);
    assert.equal((await mpost(`/internal/member/devices/${me.licenses[0].devices[0].id}/reset`, {}, other.session)).ok, false); // not hers
    assert.ok((await mpost(`/internal/member/devices/${me.licenses[0].devices[0].id}/reset`, {}, mlog.session)).ok);
    const pc3 = device();
    const act3 = await post("/v1/activate", { key, devicePub: pc3.pub, deviceHash: pc3.hash });
    assert.ok(act3.ok, JSON.stringify(act3)); // the freed slot is usable again
    assert.match((await mpost(`/internal/member/devices/${act3.deviceId}/reset`, {}, mlog.session)).message, /bisa lagi dalam \d+ (jam|menit)/); // once a day
    // Google: same verified email links to the existing account; unverified is refused
    assert.equal((await mpost("/internal/member/google", { sub: "1234567890", email: "budi@tes.id", emailVerified: false })).ok, false);
    const g = await mpost("/internal/member/google", { sub: "1234567890", email: "budi@tes.id", emailVerified: true, name: "Budi G" });
    assert.ok(g.ok);
    assert.equal((await mget("/internal/member/me", g.session)).user.google, true);
    assert.equal((await mget("/internal/member/me", "palsu")).ok, false);

    // member admin: CLI creates the account + one-time link → set password → straight into the panel
    const cli = admin("member-admin", "owner@tes.id", "--name", "Owner");
    const token = cli.match(/atur-password\?t=([\w-]+)/)?.[1];
    assert.ok(token, cli);
    assert.equal((await mpost("/internal/member/password-token/check", { token })).email, "owner@tes.id");
    assert.equal((await mpost("/internal/member/password-token", { token, password: "pendek" })).ok, false); // < 10 chars
    const set = await mpost("/internal/member/password-token", { token, password: "PanjangSekali#2026", ip: "5.5.5.5" });
    assert.ok(set.ok && set.session, JSON.stringify(set));
    assert.equal((await mpost("/internal/member/password-token", { token, password: "PanjangSekali#2027" })).ok, false); // used once
    const adminMe = (session) => fetch(ib + "/internal/admin/me", { headers: { authorization: `Bearer ${svc}`, "x-member-session": session } }).then((r) => r.json());
    assert.equal((await adminMe(mlog.session)).ok, false); // a normal member is no admin
    const me2 = await adminMe(set.session);
    assert.deepEqual([me2.ok, me2.name, me2.kind], [true, "owner@tes.id", "member"]);
    const step2 = await mpost("/internal/member/login", { email: "owner@tes.id", password: "PanjangSekali#2026", ip: "5.5.5.5" });
    assert.ok(step2.ok && step2.session && !step2.needCode); // password is enough
    // admin manages members: list, promote/demote, link for another account
    const list = await fetch(ib + "/internal/members", { headers: { authorization: `Bearer ${svc}`, "x-member-session": step2.session } }).then((r) => r.json());
    assert.ok(list.members.some((m) => m.email === "owner@tes.id" && m.is_admin));
    const budiId = list.members.find((m) => m.email === "budi@tes.id").id;
    const asAdminPost = (p, body) => fetch(ib + p, { method: "POST", headers: { authorization: `Bearer ${svc}`, "content-type": "application/json", "x-member-session": step2.session }, body: JSON.stringify(body) }).then((r) => r.json());
    assert.ok((await asAdminPost(`/internal/members/${budiId}`, { action: "link" })).token);
    assert.equal((await asAdminPost(`/internal/members/${list.members.find((m) => m.email === "owner@tes.id").id}`, { action: "role", admin: false })).ok, false); // not yourself

    // email engine: welcome mails queued at sign-up, news opt-out, broadcast to an audience, unsubscribe links are signed
    const asAdminGet = (p) => fetch(ib + p, { headers: { authorization: `Bearer ${svc}`, "x-member-session": step2.session } }).then((r) => r.json());
    let mailSt = await asAdminGet("/internal/email");
    assert.ok(mailSt.ok && mailSt.configured === false); // no smtp.json in the self-test: everything waits in the outbox
    assert.ok(mailSt.recent.some((m) => m.kind === "welcome" && m.to_email === "budi@tes.id" && !m.sent_at));
    assert.equal(mailSt.audiences.active, 1); // budi has a live license
    assert.ok((await mpost("/internal/member/email-prefs", { news: false }, mlog.session)).ok);
    assert.equal((await mget("/internal/member/me", mlog.session)).user.emailNews, false);
    assert.equal((await asAdminGet("/internal/email")).audiences.active, 0); // opted out = not a broadcast recipient
    assert.ok((await mpost("/internal/member/email-prefs", { news: true }, mlog.session)).ok);
    assert.equal((await asAdminPost("/internal/email/broadcast", { subject: "x", message: "y" })).ok, false); // too short
    const bc = await asAdminPost("/internal/email/broadcast", { subject: "Fitur baru", message: "Halo semua, ada fitur baru di Traktiva.", audience: "all" });
    assert.ok(bc.ok && bc.queued >= 3, JSON.stringify(bc));
    mailSt = await asAdminGet("/internal/email");
    assert.ok(mailSt.recent.some((m) => m.kind === "broadcast" && m.batch === bc.batch));
    assert.equal((await asAdminPost("/internal/email/broadcast", { subject: "Tes kirim", message: "Pesan uji untuk admin.", test: true })).ok, false); // no SMTP → refused, nothing sent
    assert.equal((await mpost("/internal/email/unsubscribe", { u: budiId, t: "palsu" })).ok, false);
    assert.ok((await asAdminPost("/internal/email/settings", { welcome: false, dailyCap: 50 })).settings.dailyCap === 50);

    // expiry reminders: off by default; on → sent once per kind to the member's WhatsApp number
    const soon = admin("create", "--plan", "bulanan", "--days", "5", "--note", "reminder").split(" ")[0];
    assert.ok((await mpost("/internal/member/claim", { key: soon }, mlog.session)).ok);
    assert.equal((await mpost("/internal/member/profile", { name: "Budi", phone: "123" }, mlog.session)).ok, false);
    assert.ok((await mpost("/internal/member/profile", { name: "Budi", phone: "0812-3456-7890" }, mlog.session)).ok);
    const remind = () => execFileSync(process.execPath, ["--disable-warning=ExperimentalWarning", "--input-type=module", "-e",
      "import { runReminders } from './members.mjs'; const out = []; const n = await runReminders(async (url, p) => out.push(p)); console.log(JSON.stringify({ n, out }));"],
      { env, cwd: import.meta.dirname, encoding: "utf8" });
    assert.equal(JSON.parse(remind()).n, 0); // switched off
    assert.ok((await ipost("/internal/settings", { reminders: { enabled: true, webhook: "https://wa.test/kirim" } }, ok.session)).ok);
    const first = JSON.parse(remind());
    assert.equal(first.n, 1);
    assert.equal(first.out[0].phone, "6281234567890");
    assert.match(first.out[0].text, /habis 5 hari lagi/);
    assert.equal(JSON.parse(remind()).n, 0); // once

    // online purchase (WaroengPay, mocked): off until configured + switched on; paid webhook → license in the account
    const memberOrder = (body) => mpost("/internal/member/orders", body, mlog.session);
    assert.equal((await memberOrder({ plan: "bulanan" })).ok, false); // switched off
    assert.ok((await ipost("/internal/settings", { plans: [{ id: "bulanan", label: "Bulanan", days: 30, devices: 1, price: 50000 }, { id: "lifetime", label: "Lifetime", days: null, devices: 1, price: 0 }] }, ok.session)).ok);
    assert.ok((await ipost("/internal/settings", { payments: { enabled: true } }, ok.session)).ok);
    assert.equal((await memberOrder({ plan: "lifetime" })).ok, false); // no price → not sold online
    const order = await memberOrder({ plan: "bulanan" });
    assert.ok(order.ok && order.payUrl && order.amount === 50137, JSON.stringify(order));
    const wpId = wpInvoices.at(-1).id;
    const sign = (bodyText, ts = Math.floor(Date.now() / 1000)) => ({
      "x-waroengpay-timestamp": String(ts),
      "x-signature": crypto.createHmac("sha256", WP_SECRET).update(`${ts}.${bodyText}`).digest("hex"),
    });
    const hook = (event, headers) => {
      const raw = JSON.stringify(event);
      return ipost("/internal/pay/webhook", { raw, headers: headers ?? sign(raw) });
    };
    const paid = (id, base, evt = "evt_" + id, livemode = false) => ({ id: evt, event: "payment.paid", livemode, data: { id, base_amount: base, amount: base + 137, status: "paid", livemode } });
    assert.equal((await hook(paid(wpId, 50000), { "x-waroengpay-timestamp": "1", "x-signature": "palsu" })).ok, false); // bad signature
    assert.equal((await hook(paid(wpId, 50000, "evt_live", true))).ignored, "mode"); // live event on a sandbox server
    const done = await hook(paid(wpId, 50000));
    assert.ok(done.ok && done.licenseId, JSON.stringify(done));
    assert.equal((await hook(paid(wpId, 50000))).already, true); // replay: delivered once
    const mine = await mget("/internal/member/me", mlog.session);
    const bought = mine.licenses.find((l) => l.id === done.licenseId);
    assert.ok(bought && bought.plan === "bulanan" && bought.expires_at > Date.now() / 1000 + 29 * 86400);
    // the buyer can read the bought key again, and it activates the app
    assert.match(bought.key, /^TRK-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.equal(bought.key.slice(-4), bought.key_hint);
    const buyerPc = device();
    assert.ok((await post("/v1/activate", { key: bought.key, devicePub: buyerPc.pub, deviceHash: buyerPc.hash })).ok);
    // reset HWID of that license: every PC released, once a day; not on someone else's license
    assert.equal((await mpost(`/internal/member/licenses/${bought.id}/reset-hwid`, {}, other.session)).ok, false);
    const hwid = await mpost(`/internal/member/licenses/${bought.id}/reset-hwid`, {}, mlog.session);
    assert.deepEqual([hwid.ok, hwid.released], [true, 1], JSON.stringify(hwid));
    assert.equal((await mget("/internal/member/me", mlog.session)).licenses.find((l) => l.id === bought.id).devices.length, 0);
    assert.match((await mpost(`/internal/member/licenses/${bought.id}/reset-hwid`, {}, mlog.session)).message, /bisa lagi dalam/);
    const newPc = device();
    assert.ok((await post("/v1/activate", { key: bought.key, devicePub: newPc.pub, deviceHash: newPc.hash })).ok); // the new PC activates
    // renewal extends that license; a wrong amount never delivers
    const renew = await memberOrder({ plan: "bulanan", renew: done.licenseId });
    const renewWp = wpInvoices.at(-1).id;
    assert.equal((await hook(paid(renewWp, 1000, "evt_cheap"))).reason, "mismatch");
    const renew2 = await memberOrder({ plan: "bulanan", renew: done.licenseId });
    assert.ok(renew.ok && renew2.ok);
    assert.ok((await hook(paid(wpInvoices.at(-1).id, 50000, "evt_renew"))).ok);
    const after = (await mget("/internal/member/me", mlog.session)).licenses.find((l) => l.id === done.licenseId);
    assert.ok(after.expires_at >= bought.expires_at + 30 * 86400 - 5);
    const orders = await mget("/internal/member/orders", mlog.session);
    assert.deepEqual(orders.orders.map((o) => o.status).sort(), ["mismatch", "paid", "paid"]);
    // no webhook at all (self-signed certificate): paid at WaroengPay → picked up by polling the invoice
    const polled = await memberOrder({ plan: "bulanan" });
    Object.assign(wpInvoices.at(-1), { status: "paid" });
    const view = (await mget("/internal/member/orders", mlog.session)).orders.find((o) => o.id === polled.id);
    assert.equal(view.status, "paid");
    assert.ok(view.license_id);

    // hardware lock + admin role + "ganti lisensi"
    const adminKey = admin("create", "--plan", "lifetime", "--devices", "2", "--role", "admin", "--note", "owner").split(" ")[0];
    const hw = { guid: "a".repeat(24), board: "b".repeat(24), cpu: "c".repeat(24), ram: "d".repeat(24), disk: "e".repeat(24) };
    const pc2 = device();
    const act2 = await post("/v1/activate", { key: adminKey, devicePub: pc2.pub, deviceHash: pc2.hash, hw });
    assert.ok(act2.ok, JSON.stringify(act2));
    const loginHw = async (h) => {
      const { nonce: n } = await post("/v1/nonce", { deviceId: act2.deviceId });
      return post("/v1/session", { deviceId: act2.deviceId, nonce: n, signature: crypto.sign(null, Buffer.from(`traktiva-session:${n}`), pc2.privateKey).toString("base64"), hw: h });
    };
    const same = await loginHw(hw);
    assert.equal(same.payload.role, "admin");
    // Windows' MachineGuid is not part of the lock (spoofers/cleaners change it): a different guid still signs in,
    // also for devices activated while the guid was still stored
    assert.ok((await loginHw({ ...hw, guid: "9".repeat(24) })).ok);
    assert.ok((await loginHw({ ...hw, guid: undefined })).ok);
    const moreRam = { ...hw, ram: "f".repeat(24) };
    const locked = await loginHw(moreRam);
    assert.equal(locked.error, "device_changed");
    assert.match(locked.message, /RAM/);
    assert.equal((await loginHw(null)).error, "device_changed"); // no fingerprint = refused
    assert.ok((await ipost("/internal/settings", { hwid: { tolerance: 1 } }, ok.session)).ok);
    assert.ok((await loginHw(moreRam)).ok); // one part may differ now
    assert.equal((await loginHw({ ...moreRam, disk: "0".repeat(24) })).error, "device_changed"); // two may not
    const { nonce: rn } = await post("/v1/nonce", { deviceId: act2.deviceId });
    assert.ok((await post("/v1/release", { deviceId: act2.deviceId, nonce: rn, signature: crypto.sign(null, Buffer.from(`traktiva-release:${rn}`), pc2.privateKey).toString("base64") })).ok);
    assert.equal((await loginHw(hw)).error, "device_unknown"); // slot freed, this PC needs a key again
    // forgotten password by email code; unknown emails look the same and send nothing
    assert.deepEqual(verifySent, ["budi@tes.id", "sari@tes.id"]); // the sign-up codes
    verifySent.length = 0;
    assert.equal((await mpost("/internal/member/forgot", { email: "tidakada@tes.id", ip: "9.9.9.9" })).otp, true);
    assert.equal(verifySent.length, 0);
    assert.equal((await mpost("/internal/member/forgot", { email: "budi@tes.id", ip: "9.9.9.9" })).otp, true);
    assert.deepEqual(verifySent, ["budi@tes.id"]);
    assert.equal((await mpost("/internal/member/forgot", { email: "budi@tes.id", otp: "111111", password: "BaruSekali2026", ip: "9.9.9.9" })).ok, false);
    assert.equal((await mpost("/internal/member/forgot", { email: "budi@tes.id", otp: "246810", password: "pendek", ip: "9.9.9.9" })).ok, false);
    const reset = await mpost("/internal/member/forgot", { email: "budi@tes.id", otp: "246 810", password: "BaruSekali2026", ip: "9.9.9.9", ua: "Mozilla/5.0 (Windows NT 10.0) Chrome/142" });
    assert.ok(reset.session, JSON.stringify(reset));
    assert.equal((await mget("/internal/member/me", mlog.session)).ok, false); // old sessions signed out
    assert.equal((await mpost("/internal/member/login", { email: "budi@tes.id", password: "rahasia123", ip: "9.9.9.9" })).ok, false);
    const phone = await mpost("/internal/member/login", { email: "budi@tes.id", password: "BaruSekali2026", ip: "8.8.8.8", ua: "Mozilla/5.0 (iPhone) Safari" });
    assert.ok(phone.session);

    // sessions list + sign out the other devices
    const sess = (await mget("/internal/member/sessions", reset.session)).sessions;
    assert.deepEqual(sess.map((x) => [x.current, x.ip]), [[true, "9.9.9.9"], [false, "8.8.8.8"]]);
    assert.match(sess[0].ua, /Chrome/);
    assert.equal((await mpost("/internal/member/sessions/revoke", { id: sess[0].id }, reset.session)).removed, 0); // never its own
    assert.equal((await mpost("/internal/member/sessions/revoke", { all: true }, reset.session)).removed, 1);
    assert.equal((await mget("/internal/member/me", phone.session)).ok, false);
    assert.ok((await mget("/internal/member/me", reset.session)).ok);

    // activity: own account + own licenses only, never admin notes or other members
    const act = (await mget("/internal/member/activity", reset.session)).events;
    const kinds = new Set(act.map((e) => e.event));
    for (const k of ["member_login", "license_claimed", "member_password_reset", "member_sessions_revoked"]) assert.ok(kinds.has(k), k);
    assert.ok(!kinds.has("license_created") && !kinds.has("admin_login"));
    assert.ok(act.every((e) => e.license_id == null || e.key_hint));
    assert.ok(!act.some((e) => e.event === "license_claimed" && e.detail)); // notes stay internal
    const sari = await mpost("/internal/member/login", { email: "sari@tes.id", password: "rahasia123", ip: "4.4.4.4" });
    assert.ok(!(await mget("/internal/member/activity", sari.session)).events.some((e) => e.event === "license_claimed")); // not hers
    console.log("internal api ok");
  } finally {
    await new Promise((r) => (internal.once("exit", r), internal.kill()));
  }

  // own SMTP mode (smtp.json present): codes made and checked here, limits enforced, mail goes through the mailer
  fs.writeFileSync(path.join(dir, "smtp.json"), JSON.stringify({ host: "smtp.test", user: "kirim@tes.id", pass: "x" }));
  const mail = execFileSync(process.execPath, ["--disable-warning=ExperimentalWarning", "--input-type=module", "-e", `
    import { emailGate } from './verify.mjs';
    const sent = []; const mailer = async (cfg, m) => sent.push(m);
    const r1 = await emailGate("reset", "a@tes.id", "1.1.1.1", "", mailer);
    const code = sent[0].text.match(/Kode: ([0-9]{6})/)[1];
    const again = await emailGate("reset", "a@tes.id", "1.1.1.1", "", mailer); // within 60 s
    const wrong = await emailGate("reset", "a@tes.id", "1.1.1.1", code === "000000" ? "111111" : "000000", mailer);
    const right = await emailGate("reset", "a@tes.id", "1.1.1.1", code, mailer);
    const reuse = await emailGate("reset", "a@tes.id", "1.1.1.1", code, mailer);
    const down = await emailGate("reset", "b@tes.id", "1.1.1.1", "", async () => { throw new Error("535 auth"); });
    console.log(JSON.stringify({ r1, sent: sent.length, to: sent[0].to, codeOk: /^[0-9]{6}$/.test(code), inHtml: sent[0].html.includes(code), again, wrong, right, reuse, down }));`],
    { env: { ...process.env, LICENSE_DATA_DIR: dir }, cwd: import.meta.dirname, encoding: "utf8" });
  const m = JSON.parse(mail);
  assert.ok(m.r1.otp && m.sent === 1 && m.to === "a@tes.id" && m.codeOk && m.inHtml, mail);
  assert.ok(!m.again.ok && m.again.retry_after > 0); // resend gap
  assert.ok(!m.wrong.ok && /Sisa 4/.test(m.wrong.message));
  assert.ok(m.right.ok && !m.reuse.ok); // one use
  assert.equal(m.down.error, "verify_down"); // SMTP failure → friendly message, nothing stored
  console.log("email codes ok");
} finally {
  // wait for the server to exit: on Windows its open DB file blocks deleting the temp dir
  wpMock.close();
  verifyMock.close();
  await new Promise((r) => (server.once("exit", r), server.kill()));
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
