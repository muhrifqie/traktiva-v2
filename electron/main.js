// Electron shell: dev loads `next dev`; packaged app runs the Next standalone server locally.
const { app, BrowserWindow, ipcMain, screen, shell, utilityProcess } = require("electron");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const license = require("./license");
const updater = require("./updater");

const ICON = path.join(__dirname, "..", "resources", "icon.png");
const SCREENS = path.join(__dirname, "screens");
let server;
let mainWin = null;


function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    }).on("error", reject);
  });
}

async function waitFor(url, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try { await fetch(url); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error(`Server tidak merespons: ${url}`);
}

async function startServer() {
  if (!app.isPackaged) return "http://localhost:3000";
  const port = await freePort();
  const dir = path.join(process.resourcesPath, "app-server");
  server = utilityProcess.fork(path.join(dir, "server.js"), [], {
    cwd: dir,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1", // local only, never exposed to LAN
      TRAKTIVA_DATA_DIR: app.getPath("userData"),
      TRAKTIVA_FLOW2API_BUNDLE: path.join(process.resourcesPath, "flow2api"), // video engine sidecar (copied by after-pack)
    },
  });
  return `http://127.0.0.1:${port}`;
}

// ---------------------------------------------------------------- splash & login (native screens, local files)

function screenWindow(file, { width, height }) {
  const win = new BrowserWindow({
    width,
    height,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    show: false,
    center: true,
    icon: ICON,
    backgroundColor: "#0e110f",
    webPreferences: { preload: path.join(SCREENS, "preload.js"), contextIsolation: true, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault()); // these screens never leave their file
  win.once("ready-to-show", () => win.show());
  win.loadFile(path.join(SCREENS, file));
  return win;
}

const ready = (win) => new Promise((r) => (win.webContents.isLoading() ? win.webContents.once("did-finish-load", r) : r()));

/** Show the license screen until the user activates (or retries successfully); resolves when licensed. */
function askLicense(reason) {
  return new Promise((resolve) => {
    const win = screenWindow("login.html", { width: 440, height: 600 });
    let licensed = false;
    const done = (r) => {
      if (!r.ok) return r;
      licensed = true;
      setTimeout(() => {
        resolve(r);
        win.destroy();
      }, 600); // let the "Berhasil" state be seen
      return r;
    };
    const own = (fn) => (event, ...args) => (event.sender === win.webContents ? fn(...args) : undefined);
    ipcMain.removeHandler("license:activate");
    ipcMain.removeHandler("license:retry");
    ipcMain.handle("license:activate", own(async (key) => done(await license.activate(String(key ?? "")))));
    ipcMain.handle("license:retry", own(async () => done(await license.session())));
    ready(win).then(() => win.webContents.send("license:state", { ...reason, device: license.deviceName() }));
    win.on("closed", () => {
      if (!licensed) app.quit(); // closed without a valid license (first start or locked): quit
    });
  });
}

/** Make sure this PC holds a usable license; the splash steps aside while the login screen is open. */
async function ensureLicensed(status, splash) {
  if (!license.enabled()) return;
  const login = async (reason) => {
    splash.hide();
    await askLicense(reason);
    splash.show();
  };
  if (!license.configured()) return login({ error: "not_configured", message: "Server lisensi belum dikonfigurasi di versi aplikasi ini. Hubungi penjual.", needKey: false });
  status("Memeriksa lisensi…");
  const r = await license.session();
  if (!r.ok) await login(r);
}

/** "Ganti lisensi" from the app (sidebar → lisensi): free this PC's slot, ask for a new key, reload with it. */
async function changeLicense() {
  if (!mainWin) return { ok: false };
  mainWin.hide();
  await askLicense(await license.release());
  mainWin.show();
  mainWin.webContents.reload(); // server-info (plan, role, banners) belongs to the new key
  license.startHeartbeat(lockApp);
  return { ok: true };
}

/** License stopped being usable while the app runs: hide the app behind the lock screen until it is valid again. */
async function lockApp(reason) {
  if (!mainWin) return;
  mainWin.hide();
  await askLicense(reason);
  mainWin.show();
  license.startHeartbeat(lockApp);
}

app.whenReady().then(() => {
  ipcMain.handle("screen:minimize", (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.handle("screen:quit", () => app.quit());
});

async function createWindow() {
  const splash = screenWindow("splash.html", { width: 460, height: 300 });
  const status = (text) => ready(splash).then(() => !splash.isDestroyed() && splash.webContents.send("screen:status", { text, version: app.getVersion() }));
  status("Menyiapkan…");
  // the local server starts while the license is checked
  const urlPromise = startServer();
  await ensureLicensed(status, splash);
  status("Membuka Traktiva…");
  const url = await urlPromise;
  // default size: ~90% of the screen's work area (capped), so the studio opens roomy on any monitor
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: Math.min(sw, 1720, Math.max(1280, Math.round(sw * 0.9))),
    height: Math.min(sh, 1080, Math.max(800, Math.round(sh * 0.9))),
    center: true,
    minWidth: 720, // small enough for half-screen snapping; layout switches to compact mode below md
    minHeight: 520,
    show: false,
    frame: false, // no OS title bar: the app's own navbar is the title bar (drag region + window buttons)
    autoHideMenuBar: true,
    icon: ICON, // taskbar/window icon (exe icon comes from electron-builder)
    backgroundColor: "#0e110f", // avoid white flash before the page paints
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
  });
  // External links open in the user's browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: "deny" };
  });
  win.once("ready-to-show", () => {
    win.show();
    if (!splash.isDestroyed()) splash.destroy();
  });
  setupZoom(win);
  setupWindowControls(win);
  await waitFor(url);
  mainWin = win;
  await win.loadURL(url);
  if (license.enabled() && license.configured()) license.startHeartbeat(lockApp);
  ipcMain.removeHandler("license:change");
  ipcMain.removeHandler("license:refresh");
  // Pengaturan → Lisensi → "Perbarui sekarang": renew the session (and server-info) right away
  ipcMain.handle("license:refresh", async (e) => {
    if (e.sender !== win.webContents || !license.enabled()) return { ok: false, message: "Lisensi tidak aktif di mode ini." };
    const r = await license.session();
    if (!r.ok && !r.offline) lockApp(r);
    return { ok: r.ok, message: r.message };
  });
  ipcMain.handle("license:change", (e) => (e.sender === win.webContents && license.enabled() ? changeLicense() : { ok: false }));
  // "Update sekarang": download + verify + install the new version without opening the browser
  ipcMain.removeHandler("update:install");
  ipcMain.handle("update:install", (e) =>
    e.sender === win.webContents ? updater.install((p) => !win.isDestroyed() && win.webContents.send("update:progress", p)) : { ok: false },
  );
}

// Zoom: Ctrl +/=/-/0 and Ctrl+scroll, clamped 50–200%, remembered across restarts.
// (Electron's default menu needs Shift for "+" on most keyboards and ignores Ctrl+scroll, so handle it ourselves.)
const ZOOM_FILE = () => path.join(app.getPath("userData"), "zoom.json");
const clampZoom = (z) => Math.min(2, Math.max(0.5, Math.round(z * 10) / 10));

function setupZoom(win) {
  const wc = win.webContents;
  let factor = 1;
  try {
    factor = clampZoom(JSON.parse(fs.readFileSync(ZOOM_FILE(), "utf8")).factor || 1);
  } catch {}
  const set = (z) => {
    factor = clampZoom(z);
    wc.setZoomFactor(factor);
    try { fs.writeFileSync(ZOOM_FILE(), JSON.stringify({ factor })); } catch {}
  };
  wc.on("did-finish-load", () => wc.setZoomFactor(factor)); // reapply after navigations/reloads
  wc.on("zoom-changed", (_e, dir) => set(factor + (dir === "in" ? 0.1 : -0.1))); // Ctrl+scroll / pinch
  wc.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || !(input.control || input.meta) || input.alt) return;
    const k = input.key;
    if (k === "=" || k === "+") set(factor + 0.1);
    else if (k === "-" || k === "_") set(factor - 0.1);
    else if (k === "0") set(1);
    else return;
    event.preventDefault();
  });
}

// Custom title bar: the renderer asks main to minimize/maximize/close, and main reports window state back
// so the maximize button can switch to "restore". F11 toggles real fullscreen.
function setupWindowControls(win) {
  const wc = win.webContents;
  const state = () => ({ maximized: win.isMaximized(), fullscreen: win.isFullScreen(), focused: win.isFocused() });
  const push = () => !wc.isDestroyed() && wc.send("window:state", state());
  for (const ev of ["maximize", "unmaximize", "enter-full-screen", "leave-full-screen", "focus", "blur"]) win.on(ev, push);

  // Only our own page may drive the window.
  const own = (fn) => (event, ...args) => (event.sender === wc ? fn(...args) : undefined);
  ipcMain.handle("window:state", own(() => state()));
  ipcMain.handle("window:minimize", own(() => win.minimize()));
  ipcMain.handle("window:toggle-maximize", own(() => (win.isMaximized() ? win.unmaximize() : win.maximize())));
  ipcMain.handle("window:toggle-fullscreen", own(() => win.setFullScreen(!win.isFullScreen())));
  ipcMain.handle("window:close", own(() => win.close()));

  wc.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F11") {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
}

app.whenReady().then(createWindow).catch((e) => {
  console.error(e);
  app.quit();
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => server?.kill());
