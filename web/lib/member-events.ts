import type { MemberEvent } from "@/lib/license-api";

type Tone = "ok" | "warn" | "bad" | "";

/** Buyer-facing wording of an account/license event (Ringkasan → Aktivitas, license history, notifications). */
const LABEL: Record<string, [string, Tone]> = {
  activated: ["PC baru diaktifkan", "ok"],
  activate_failed: ["Aktivasi PC ditolak", "bad"],
  device_reset: ["PC dilepas (reset HWID)", "warn"],
  device_released: ["PC dilepas", ""],
  device_changed: ["Hardware PC berubah, ditolak", "bad"],
  license_extended: ["Lisensi diperpanjang", "ok"],
  license_claimed: ["Key ditautkan ke akun", "ok"],
  license_suspended: ["Lisensi ditangguhkan", "warn"],
  license_active: ["Lisensi diaktifkan lagi", "ok"],
  license_revoked: ["Lisensi dicabut", "bad"],
  order_paid: ["Pembayaran diterima", "ok"],
  member_registered: ["Akun dibuat", "ok"],
  member_login: ["Masuk ke website", ""],
  member_login_failed: ["Percobaan masuk gagal", "bad"],
  member_google_linked: ["Google ditautkan", ""],
  member_password_changed: ["Password diganti", ""],
  member_password_set: ["Password diatur lewat link", ""],
  member_password_reset: ["Password direset lewat email", "warn"],
  member_2fa_enabled: ["Verifikasi 2 langkah aktif", "ok"],
  member_2fa_disabled: ["Verifikasi 2 langkah dimatikan", "warn"],
  member_2fa_reset: ["Verifikasi 2 langkah direset admin", "warn"],
  member_sessions_revoked: ["Perangkat lain dikeluarkan", ""],
};

const FAIL: Record<string, string> = { invalid_key: "key salah", device_limit: "batas PC penuh", suspended: "lisensi ditangguhkan", revoked: "lisensi dicabut", expired: "kedaluwarsa" };

export function describeMemberEvent(e: MemberEvent) {
  const [label, tone] = LABEL[e.event] ?? [e.event, ""];
  const bits = [
    e.key_hint ? `key …${e.key_hint}` : null,
    e.device_name,
    e.event === "activate_failed" && e.detail ? FAIL[e.detail] ?? e.detail : e.detail,
    e.ip && e.ip !== "?" ? `IP ${e.ip}` : null,
  ].filter(Boolean);
  return { label, tone, detail: bits.join(" · ") };
}

export const TONE_DOT: Record<Tone, string> = { ok: "bg-status-ok", warn: "bg-amber-500", bad: "bg-destructive", "": "bg-muted-foreground/50" };
