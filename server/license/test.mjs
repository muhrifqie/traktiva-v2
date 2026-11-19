// Self-check: runs the server on a temp data dir and walks activate → nonce → session plus the failure cases.
// Usage: node server/license/test.mjs
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trk-license-"));
const env = { ...process.env, LICENSE_DATA_DIR: dir, LICENSE_PORT: "38291" };
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

    // buyer website: key login → own license only
    assert.equal((await ipost("/internal/buyer/login", { key: "TRK-AAAA-BBBB-CCCC-DDDD", ip: "2.2.2.2" })).ok, false);
    const buyer = await ipost("/internal/buyer/login", { key: key.toLowerCase(), ip: "2.2.2.2" });
    assert.ok(buyer.ok, JSON.stringify(buyer));
    const me = await fetch(ib + "/internal/buyer/me", { headers: { authorization: `Bearer ${svc}`, "x-buyer-session": buyer.session } }).then((r) => r.json());
    assert.deepEqual([me.license.id, me.devices.length, me.latest.version], [1, 1, "1.2.0"]);
    assert.equal(me.license.key_hash, undefined); // never leaks the hash

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
    console.log("internal api ok");
  } finally {
    await new Promise((r) => (internal.once("exit", r), internal.kill()));
  }
} finally {
  // wait for the server to exit: on Windows its open DB file blocks deleting the temp dir
  await new Promise((r) => (server.once("exit", r), server.kill()));
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
