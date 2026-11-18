import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Fallback engine while Camoufox is not installed: a Chromium-based browser that is already on the PC
// (Chrome, else Edge, which ships with Windows 10/11), so nothing extra has to be downloaded.

export type ChromiumBrowser = { name: "Chrome" | "Edge" | "Chromium"; path: string };

function candidates(): ChromiumBrowser[] {
  const env = process.env;
  const pf = env.ProgramFiles || "C:\\Program Files";
  const pf86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const local = env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  if (process.platform === "win32") {
    return [
      { name: "Chrome", path: path.join(pf, "Google", "Chrome", "Application", "chrome.exe") },
      { name: "Chrome", path: path.join(pf86, "Google", "Chrome", "Application", "chrome.exe") },
      { name: "Chrome", path: path.join(local, "Google", "Chrome", "Application", "chrome.exe") },
      { name: "Edge", path: path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe") },
      { name: "Edge", path: path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe") },
    ];
  }
  if (process.platform === "darwin") {
    return [
      { name: "Chrome", path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" },
      { name: "Edge", path: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" },
    ];
  }
  return [
    { name: "Chrome", path: "/usr/bin/google-chrome" },
    { name: "Chromium", path: "/usr/bin/chromium" },
    { name: "Chromium", path: "/usr/bin/chromium-browser" },
    { name: "Edge", path: "/usr/bin/microsoft-edge" },
  ];
}

export function findChromium(): ChromiumBrowser | null {
  const custom = process.env.TRAKTIVA_CHROMIUM_PATH;
  if (custom && fs.existsSync(custom)) return { name: "Chromium", path: custom };
  return candidates().find((c) => fs.existsSync(c.path)) ?? null;
}
