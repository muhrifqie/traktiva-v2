// Display helpers shared by server and client components (WIB, Indonesian labels).
import type { AuditEvent, License } from "./license-api";

const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const timeFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export const fmtDate = (s: number | null) => (s ? dateFmt.format(s * 1000) : "Selamanya");
export const fmtTime = (s: number | null) => (s ? timeFmt.format(s * 1000) : "—");
export const rupiah = (n: number) => (n ? `Rp ${new Intl.NumberFormat("id-ID").format(n)}` : "—");
/** Unix seconds now (a helper, so server components can read the clock without tripping react-hooks/purity). */
export const nowSec = () => Math.floor(Date.now() / 1000);
export const isOnline = (s: number | null, now: number) => !!s && now - s < 600;

export type LicenseState = "active" | "expired" | "suspended" | "revoked";
export function licenseState(l: Pick<License, "status" | "expires_at">, now: number): LicenseState {
  if (l.status !== "active") return l.status;
  return l.expires_at && l.expires_at <= now ? "expired" : "active";
}
export const STATE_LABEL: Record<LicenseState | "reset", string> = { active: "Aktif", expired: "Kedaluwarsa", suspended: "Ditangguhkan", revoked: "Dicabut", reset: "Direset" };
export const STATE_CLASS: Record<LicenseState | "reset", string> = {
  active: "bg-status-ok/12 text-status-ok",
  expired: "bg-amber-400/10 text-amber-300",
  suspended: "bg-orange-400/12 text-orange-300",
  revoked: "bg-destructive/12 text-destructive",
  reset: "bg-destructive/12 text-destructive",
};

const EVENT: Record<string, [string, "ok" | "bad" | "warn" | ""]> = {
  license_created: ["Key dibuat", "ok"], activated: ["Perangkat diaktifkan", "ok"], activate_failed: ["Aktivasi gagal", "bad"],
  license_suspended: ["Ditangguhkan", "warn"], license_active: ["Diaktifkan lagi", "ok"], license_revoked: ["Dicabut", "bad"],
  license_extended: ["Diperpanjang", "ok"], license_edited: ["Diubah", ""], device_reset: ["Perangkat direset", "warn"],
  session_bad_signature: ["Tanda tangan palsu", "bad"], admin_login: ["Admin masuk", ""], admin_login_failed: ["Login admin gagal", "bad"],
  plans_updated: ["Paket diubah", ""], admin_token_issued: ["Token admin dibuat", ""], admin_password_reset: ["Password admin direset", "warn"], admin_password_changed: ["Password diganti", ""],
  announcement_created: ["Pengumuman tayang", "ok"], announcement_on: ["Pengumuman ditayangkan", ""], announcement_off: ["Pengumuman dimatikan", ""], announcement_delete: ["Pengumuman dihapus", "warn"],
  release_created: ["Rilis diumumkan", "ok"], release_deleted: ["Rilis dihapus", "warn"], site_updated: ["Kontak diubah", ""], remote_updated: ["Setelan app diubah", ""], buyer_login: ["Pembeli masuk web", ""], device_changed: ["Hardware berubah, ditolak", "bad"], device_released: ["Perangkat dilepas (ganti lisensi)", ""],
  member_registered: ["Member daftar", "ok"], member_login: ["Member masuk", ""], member_login_failed: ["Login member gagal", "bad"], member_google_linked: ["Google ditautkan", ""],
  member_password_changed: ["Member ganti password", ""], license_claimed: ["Key diklaim ke akun", "ok"], license_unclaimed: ["Key dilepas dari akun", "warn"], hwid_updated: ["Kunci hardware diubah", ""], admin_removed: ["Admin dihapus", "warn"],
};
const FAIL: Record<string, string> = { invalid_key: "key salah", device_limit: "batas perangkat penuh", suspended: "lisensi ditangguhkan", revoked: "lisensi dicabut", expired: "kedaluwarsa" };

export function describeEvent(e: AuditEvent) {
  const [label, tone] = EVENT[e.event] ?? [e.event, ""];
  const detail = e.event === "activate_failed" && e.detail ? FAIL[e.detail] ?? e.detail : e.detail;
  return { label, tone, detail };
}
