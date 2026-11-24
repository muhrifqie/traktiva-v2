// Bridge for the splash and login screens (local files; they never load remote content).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("traktiva", {
  onStatus: (cb) => ipcRenderer.on("screen:status", (_e, s) => cb(s)),
  onLicense: (cb) => ipcRenderer.on("license:state", (_e, s) => cb(s)),
  activate: (key) => ipcRenderer.invoke("license:activate", key),
  retry: () => ipcRenderer.invoke("license:retry"),
  minimize: () => ipcRenderer.invoke("screen:minimize"),
  quit: () => ipcRenderer.invoke("screen:quit"),
});
