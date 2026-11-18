import type { CamoufoxStatus } from "@/lib/browser/camoufox-install";

// Client-safe wording for the Camoufox install, shared by the Pengaturan card and the status bar.

export const camoufoxBusy = (s: CamoufoxStatus | null | undefined) =>
  !!s && (s.state === "downloading" || s.state === "verifying" || s.state === "extracting");

export const camoufoxPct = (s: CamoufoxStatus) => (s.total ? Math.min(100, Math.floor((s.received / s.total) * 100)) : 0);

export function fmtBytes(n: number) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.max(0, Math.round(n / 1024))} KB`;
}

function eta(s: CamoufoxStatus) {
  if (!s.total || s.speed < 1024) return null;
  const sec = Math.round((s.total - s.received) / s.speed);
  return sec >= 90 ? `±${Math.round(sec / 60)} menit lagi` : `±${Math.max(1, sec)} detik lagi`;
}

/** One-line description of where the install is. */
export function camoufoxLabel(s: CamoufoxStatus) {
  switch (s.state) {
    case "downloading": {
      if (!s.total) return "Menghubungi server unduhan...";
      const parts = [`${fmtBytes(s.received)} / ${fmtBytes(s.total)}`];
      parts.push(s.speed >= 1024 ? `${fmtBytes(s.speed)}/dtk` : "menunggu koneksi...");
      const e = eta(s);
      if (e) parts.push(e);
      return parts.join(" · ");
    }
    case "verifying":
      return "Memeriksa file unduhan...";
    case "extracting":
      return "Memasang browser (sekitar 1 menit)...";
    case "ready":
      return "Siap dipakai";
    case "failed":
      return s.error ?? "Gagal diunduh";
    default:
      return "Belum diunduh";
  }
}
