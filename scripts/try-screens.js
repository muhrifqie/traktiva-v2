// Dev check for the native screens + license guard inside real Electron, against a local license server.
// Usage: start `node server/license/server.mjs` (LICENSE_DATA_DIR=...) and create a key, then
//   TRAKTIVA_LICENSE_URL=http://127.0.0.1:3820 TRAKTIVA_LICENSE_PUBKEY=<pub> TRK_KEY=<key> OUT=<dir> npx electron scripts/try-screens.js
// Screenshots of splash / login (empty, error, success) land in OUT; the result of activate + session is printed.
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

app.setPath("userData", path.join(require("node:os").tmpdir(), "traktiva-try-screens")); // never touch the real profile
const license = require("../electron/license");
const SCREENS = path.join(__dirname, "..", "electron", "screens");
const OUT = process.env.OUT || path.join(__dirname, "..", "data");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => fs.appendFileSync(path.join(OUT, "log.txt"), a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") + "\n");
log("start");
app.on("window-all-closed", () => {}); // keep running between the splash and the login window
setTimeout(() => (log("timeout"), app.exit(1)), 60_000);

function open(file, width, height) {
  const win = new BrowserWindow({ width, height, frame: false, show: true, backgroundColor: "#0e110f", webPreferences: { preload: path.join(SCREENS, "preload.js"), contextIsolation: true, sandbox: true } });
  win.loadFile(path.join(SCREENS, file));
  return new Promise((r) => win.webContents.once("did-finish-load", () => r(win)));
}
const shot = async (win, name) => fs.writeFileSync(path.join(OUT, `${name}.png`), (await win.webContents.capturePage()).toPNG());

app.whenReady().then(async () => {
  log("ready");
  try {
    fs.rmSync(path.join(app.getPath("userData"), "license.json"), { force: true });
    const splash = await open("splash.html", 460, 300);
    splash.webContents.send("screen:status", { text: "Memeriksa lisensi…", version: "0.1.0" });
    await sleep(700);
    await shot(splash, "splash");
    splash.destroy();

    const login = await open("login.html", 440, 600);
    ipcMain.handle("license:activate", (_e, key) => license.activate(key));
    login.webContents.send("license:state", { error: "not_activated", needKey: true, device: license.deviceName() });
    await sleep(500);
    await shot(login, "login-empty");

    const type = (v) => login.webContents.executeJavaScript(`(() => { const i = document.getElementById("key"); i.value = ${JSON.stringify(v)}; i.dispatchEvent(new Event("input")); document.getElementById("form").requestSubmit(); })()`);
    await type("TRK-AAAA-BBBB-CCCC-DDDD");
    await sleep(1200);
    await shot(login, "login-error");

    await type(process.env.TRK_KEY.toLowerCase().replace(/-/g, ""));
    await sleep(1500);
    await shot(login, "login-success");

    const s = await license.session();
    log("session after restart-equivalent:", JSON.stringify({ ok: s.ok, plan: s.payload?.plan, features: s.payload?.features, error: s.error }));

    // lock screen look (suspended)
    login.webContents.send("license:state", { error: "suspended", message: "Lisensi ini sedang ditangguhkan. Hubungi penjual.", needKey: false, device: license.deviceName() });
    await sleep(400);
    await shot(login, "login-locked");
  } catch (e) {
    log("error", String(e && e.stack || e));
  } finally {
    fs.rmSync(app.getPath("userData"), { recursive: true, force: true });
    app.quit();
  }
});
