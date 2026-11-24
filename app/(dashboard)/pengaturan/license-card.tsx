"use client";

import { useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Cpu, ExternalLink, KeyRound, Loader2, Monitor, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/confirm-dialog";

export type LicenseCardProps = {
  status: "dev" | "active" | "expired";
  plan: string;
  role: "admin" | "member";
  expiresAt: string | null;
  daysLeft: number | null;
  licenseId: number | null;
  deviceName: string | null;
  hwParts: string[];
  checkedAt: string | null;
  buyerUrl: string;
  adminUrl: string;
};

const PART_LABEL: Record<string, string> = { guid: "Windows", board: "Motherboard", boardSerial: "Serial board", cpu: "CPU", ram: "RAM", disk: "Disk", bios: "BIOS" };
const STATUS = {
  dev: { label: "Mode pengembangan", cls: "bg-[#4ea7fc1a] text-[#4ea7fc]" },
  active: { label: "Aktif", cls: "bg-status-ok/10 text-status-ok" },
  expired: { label: "Kedaluwarsa", cls: "bg-destructive/10 text-destructive" },
} as const;

// window.desktop exists only inside the Electron app (not in the browser / during SSR)
const noop = () => () => {};
const useDesktop = () => useSyncExternalStore(noop, () => !!window.desktop?.changeLicense, () => false);

/** Pengaturan → Lisensi: what this PC runs on, plus refresh / switch key. */
export function LicenseCard(p: LicenseCardProps) {
  const router = useRouter();
  const desktop = useDesktop();
  const [pending, start] = useTransition();
  const st = STATUS[p.status];

  const refresh = () =>
    start(async () => {
      const r = await window.desktop!.refreshLicense();
      if (r.ok) toast.success("Lisensi diperbarui dari server");
      else toast.error(r.message ?? "Gagal memperbarui lisensi");
      router.refresh();
    });
  const change = async () => {
    const ok = await confirmDialog({
      title: "Ganti lisensi?",
      description: "PC ini dilepas dari key sekarang (slotnya kosong lagi), lalu kamu masukkan key lain. Proyek, akun, dan setelan di PC ini tetap aman.",
      confirmLabel: "Ganti lisensi",
    });
    if (ok) await window.desktop!.changeLicense();
  };

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-status-ok/10 text-status-ok"><BadgeCheck className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold">
            Lisensi
            {p.role === "admin" && <span className="rounded-full bg-[#f2c94c1f] px-2 py-0.5 text-[10px] font-semibold text-[#f2c94c]">Admin</span>}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            {p.status === "dev" ? "Pengecekan lisensi mati di mode pengembangan. Jalankan npm run dev:electron:license untuk mengujinya." : "Diperbarui otomatis tiap 5 menit dari server lisensi."}
          </p>
        </div>
        {desktop && p.status !== "dev" && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={refresh} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Perbarui</Button>
            <Button size="sm" variant="outline" onClick={change}><KeyRound /> Ganti lisensi</Button>
          </div>
        )}
      </div>

      {p.status !== "dev" && (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Paket", `${p.plan}${p.licenseId ? ` · #${p.licenseId}` : ""}`],
              ["Berlaku sampai", p.expiresAt ?? "—"],
              ["Sisa waktu", p.daysLeft != null ? `${p.daysLeft} hari` : "Selamanya"],
              ["Dicek terakhir", p.checkedAt ?? "—"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border bg-muted/30 px-3 py-2">
                <dt className="text-[11px] text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 text-[13px] font-medium">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-3 py-2.5 text-xs">
            <span className="flex items-center gap-1.5 font-medium"><Monitor className="size-3.5 text-muted-foreground" /> {p.deviceName ?? "PC ini"}</span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Cpu className="size-3.5" />
              {p.hwParts.length ? <>Terkunci ke {p.hwParts.map((x) => PART_LABEL[x] ?? x).join(", ")}</> : "Hardware belum terbaca"}
            </span>
            <span className="text-muted-foreground">Ganti RAM/disk/motherboard? Minta reset perangkat ke penjual.</span>
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <a href={p.buyerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ExternalLink className="size-3.5" /> Akun di web (download, perpanjang)
        </a>
        {p.role === "admin" && (
          <a href={p.adminUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ShieldCheck className="size-3.5" /> Panel admin
          </a>
        )}
      </div>
    </section>
  );
}
