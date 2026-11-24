import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/db";

// "Pusat informasi" from the license server: Electron writes it on every license heartbeat (electron/license.js →
// writeServerInfo). Missing in dev / web mode → empty info, the app behaves as before.
export type Announcement = { id: number; title: string; body: string; level: "info" | "warn" | "critical"; created_at: number };
export type ServerInfo = {
  at: number;
  appVersion: string;
  plan: string | null;
  role?: "admin" | "member";
  licenseId?: number | null;
  device?: { name: string; hwParts: string[] };
  licExp: number | null; // unix seconds, null = lifetime
  announcements: Announcement[];
  latest: { version: string; url: string; notes: string; mandatory: number; created_at: number } | null;
  remote: Record<string, string | number | boolean>;
  owner?: { name: string; email: string } | null; // website account the key is linked to (server ≥ 2026-11-24)
};

export function serverInfo(): ServerInfo | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "server-info.json"), "utf8")) as ServerInfo;
  } catch {
    return null;
  }
}

/** A flag the admin sets in the panel (Setelan app); `fallback` when offline/dev or not set. */
export function remoteFlag<T extends string | number | boolean>(name: string, fallback: T): T {
  const v = serverInfo()?.remote?.[name];
  return typeof v === typeof fallback ? (v as T) : fallback;
}

/** License card + banners for the dashboard layout (kept here so components stay free of Date.now). */
export function licenseView(info: ServerInfo | null, appVersion: string) {
  if (!info?.plan) return { license: { status: "dev" as const, plan: "Pengembangan", expiresAt: null, daysLeft: null, role: "member" as const, owner: null }, warning: null, update: null };
  const daysLeft = info.licExp ? Math.max(0, Math.ceil((info.licExp * 1000 - Date.now()) / 86_400_000)) : null;
  const expiresAt = info.licExp
    ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(info.licExp * 1000)
    : "Selamanya";
  const update =
    info.latest && newerVersion(info.latest.version, appVersion)
      ? { version: info.latest.version, url: info.latest.url, notes: info.latest.notes, mandatory: !!info.latest.mandatory }
      : null;
  return {
    license: { status: daysLeft === 0 ? ("expired" as const) : ("active" as const), plan: info.plan[0].toUpperCase() + info.plan.slice(1), expiresAt, daysLeft, role: info.role ?? "member", owner: info.owner ?? null },
    warning: daysLeft != null && daysLeft <= 7 ? `Lisensi habis ${daysLeft ? `${daysLeft} hari lagi` : "hari ini"} (${expiresAt}). Hubungi penjual untuk perpanjang.` : null,
    update,
  };
}

// Opened in the browser (normal CA certificates); the license API itself stays on the pinned :8443 address.
export const ADMIN_PANEL_URL = "https://admin.traktiva.site/admin";
export const BUYER_AREA_URL = "https://app.traktiva.site/akun";

/** "1.10.0" > "1.9.3" */
export function newerVersion(a: string, b: string) {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}
