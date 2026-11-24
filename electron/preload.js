// Renderer can detect desktop mode via window.desktop; add IPC bridges here as features need them.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  platform: process.platform,
  /** Release this PC's license slot and enter another key (packaged app only). */
  changeLicense: () => ipcRenderer.invoke("license:change"),
  /** Renew the license session now (fresh plan, banners, settings). */
  refreshLicense: () => ipcRenderer.invoke("license:refresh"),
  /** In-app update: download, verify and install the newest version (the app restarts). */
  update: {
    install: () => ipcRenderer.invoke("update:install"),
    /** The version already downloaded (installed automatically when the app closes), or null. */
    status: () => ipcRenderer.invoke("update:status"),
    onReady: (cb) => {
      const listener = (_e, s) => cb(s);
      ipcRenderer.on("update:ready", listener);
      return () => ipcRenderer.removeListener("update:ready", listener);
    },
    /** { stage: "check" | "download" | "verify" | "install", received?, total? }; returns an unsubscribe function. */
    onProgress: (cb) => {
      const listener = (_e, p) => cb(p);
      ipcRenderer.on("update:progress", listener);
      return () => ipcRenderer.removeListener("update:progress", listener);
    },
  },
  window: {
    state: () => ipcRenderer.invoke("window:state"),
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    toggleFullscreen: () => ipcRenderer.invoke("window:toggle-fullscreen"),
    close: () => ipcRenderer.invoke("window:close"),
    /** Subscribe to maximize/fullscreen/focus changes; returns an unsubscribe function. */
    onState: (cb) => {
      const listener = (_e, s) => cb(s);
      ipcRenderer.on("window:state", listener);
      return () => ipcRenderer.removeListener("window:state", listener);
    },
  },
});
