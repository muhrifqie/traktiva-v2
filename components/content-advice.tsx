import { Moon } from "lucide-react";
import type { ContentHealth } from "@/lib/content-health";

/** Badge with what to do next for an account, from lib/content-health.ts (Beranda + Profil & Postingan). */
export function Advice({ h }: { h: Pick<ContentHealth, "status" | "trend"> }) {
  const chip = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold";
  if (h.status === "rest") return <span className={`${chip} bg-status-progress/10 text-status-progress`}><Moon className="size-3" /> Istirahatkan / ganti konten</span>;
  if (h.status === "drop") return <span className={`${chip} bg-destructive/10 text-destructive`}>Penonton turun {Math.round(Math.abs(h.trend ?? 0) * 100)}%, coba hook baru</span>;
  if (h.status === "rare") return <span className={`${chip} bg-[#f2c94c1a] text-[#f2c94c]`}>Jarang posting, tambah 1 video/hari</span>;
  if (h.status === "ok") return <span className={`${chip} bg-status-ok/10 text-status-ok`}><span className="size-1.5 rounded-full bg-current" /> Sehat, lanjut posting</span>;
  return <span className={`${chip} bg-muted text-muted-foreground`}>Belum ada video minggu ini</span>;
}
