// Traktiva license admin CLI (run on the server, e.g. `ssh shopeeboosthelper "cd /srv/traktiva-license && node admin.mjs list"`).
//   node admin.mjs init                                   create signing key + pepper, print the public key for the app
//   node admin.mjs create [--plan bulanan|tahunan|lifetime] [--days N] [--devices N] [--note "Budi"] [--count 1] [--role admin]
//   node admin.mjs list                                   licenses with device counts
//   node admin.mjs devices <licenseId>                    devices of one license
//   node admin.mjs reset <deviceId>                       free a device slot (buyer changed PC)
//   node admin.mjs suspend|activate|revoke <licenseId>
//   node admin.mjs extend <licenseId> <days>
//   node admin.mjs add-admin <name>                       create admin / reset password (new random password shown once)
//   node admin.mjs admins | remove-admin <name>
import { audit, createLicenses, db, getPlans, initSecrets, loadSecrets, setAdminPassword } from "./lib.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name, def) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : def;
};
const date = (s) => (s ? new Date(s * 1000).toISOString().slice(0, 10) : "selamanya");

switch (cmd) {
  case "init": {
    const s = initSecrets();
    console.log("Kunci publik server (taruh di electron/license-pins.json → serverPublicKey):\n" + s.publicRaw);
    break;
  }
  case "create": {
    const { pepper } = loadSecrets();
    const plan = getPlans().find((p) => p.id === flag("plan", "bulanan"));
    if (!plan) throw new Error(`Paket tidak dikenal. Pilihan: ${getPlans().map((p) => p.id).join(", ")}`);
    const days = flag("days") != null ? Number(flag("days")) || null : plan.days;
    const devices = Number(flag("devices", plan.devices));
    // the key is shown once; only its hash is stored
    for (const { id, key } of createLicenses({ pepper, plan: plan.id, days, devices, note: flag("note", null), count: Math.min(500, Number(flag("count", 1))), actor: "cli", role: flag("role", "member") }))
      console.log(`${key}  (id ${id}, ${plan.label}, ${days ? `${days} hari` : "selamanya"}, ${devices} perangkat)`);
    break;
  }
  case "add-admin": {
    const name = String(rest[0] ?? "").trim();
    if (!/^[\w .-]{2,40}$/.test(name)) throw new Error("Nama admin 2–40 karakter (huruf, angka, spasi, . - _).");
    const password = setAdminPassword(name);
    audit("admin_password_reset", { detail: name, actor: "cli" });
    console.log(`Login panel: username ${name}, password (tampil SEKALI, ganti di Pengaturan setelah masuk):
${password}`);
    break;
  }
  case "admins": {
    for (const a of db.prepare("SELECT * FROM admins ORDER BY id").all()) console.log(`${a.name}  dibuat ${date(a.created_at)}  login terakhir ${a.last_login ? new Date(a.last_login * 1000).toISOString() : "-"}`);
    break;
  }
  case "remove-admin": {
    const a = db.prepare("SELECT id FROM admins WHERE name = ?").get(String(rest[0]));
    if (!a) throw new Error("Admin tidak ditemukan.");
    db.prepare("DELETE FROM admin_sessions WHERE admin_id = ?").run(a.id);
    db.prepare("DELETE FROM admins WHERE id = ?").run(a.id);
    audit("admin_removed", { detail: String(rest[0]), actor: "cli" });
    console.log("Admin dihapus.");
    break;
  }
  case "list": {
    const rows = db
      .prepare("SELECT l.*, (SELECT count(*) FROM devices d WHERE d.license_id = l.id AND d.status = 'active') AS used FROM licenses l ORDER BY l.id DESC LIMIT 200")
      .all();
    for (const l of rows) console.log(`#${l.id}  …${l.key_hint}  ${l.status.padEnd(9)} ${l.plan}  perangkat ${l.used}/${l.max_devices}  s/d ${date(l.expires_at)}  ${l.note ?? ""}`);
    break;
  }
  case "devices": {
    for (const d of db.prepare("SELECT * FROM devices WHERE license_id = ? ORDER BY created_at DESC").all(Number(rest[0])))
      console.log(`${d.id}  ${d.status.padEnd(6)} ${d.name ?? "-"}  v${d.app_version ?? "?"}  ${d.last_ip ?? ""}  terakhir ${d.last_seen ? new Date(d.last_seen * 1000).toISOString() : "-"}`);
    break;
  }
  case "reset": {
    const r = db.prepare("UPDATE devices SET status = 'reset' WHERE id = ?").run(String(rest[0]));
    audit("device_reset", { device_id: String(rest[0]), actor: "cli" });
    console.log(r.changes ? "Perangkat direset." : "Perangkat tidak ditemukan.");
    break;
  }
  case "suspend":
  case "activate":
  case "revoke": {
    const status = { suspend: "suspended", activate: "active", revoke: "revoked" }[cmd];
    const r = db.prepare("UPDATE licenses SET status = ? WHERE id = ?").run(status, Number(rest[0]));
    audit(`license_${status}`, { license_id: Number(rest[0]), actor: "cli" });
    console.log(r.changes ? `Lisensi #${rest[0]} → ${status}` : "Lisensi tidak ditemukan.");
    break;
  }
  case "extend": {
    const days = Number(rest[1]);
    const l = db.prepare("SELECT expires_at FROM licenses WHERE id = ?").get(Number(rest[0]));
    if (!l) throw new Error("Lisensi tidak ditemukan.");
    const base = Math.max(l.expires_at ?? 0, Math.floor(Date.now() / 1000));
    db.prepare("UPDATE licenses SET expires_at = ? WHERE id = ?").run(base + days * 86400, Number(rest[0]));
    console.log(`Lisensi #${rest[0]} aktif s/d ${date(base + days * 86400)}`);
    break;
  }
  default:
    console.log("Perintah: init | create | list | devices | reset | suspend | activate | revoke | extend | add-admin | admins | remove-admin (lihat komentar di atas file)");
}
