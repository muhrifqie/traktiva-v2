"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CloudDownload, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { syncAllStats, syncTikTokAccount } from "../akun/actions";

export function SyncButton({ accountId, username, primary = false }: { accountId: number; username: string; primary?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function sync() {
    setBusy(true);
    const t = toast.loading(`Mengambil data @${username} dari TikTok...`);
    try {
      const r = await syncTikTokAccount(accountId);
      toast.success(`${r.videos} video & statistik diperbarui`, { id: t });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sinkron gagal", { id: t });
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={sync}
      disabled={busy}
      className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium shadow-xs disabled:opacity-60 ${primary ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border bg-background hover:bg-accent"}`}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <CloudDownload className="size-4" />}
      {busy ? "Menyinkronkan..." : "Sinkronkan"}
    </button>
  );
}

/** "Refresh semua": every logged-in account of the platform synced in parallel (syncAllStats). */
export function SyncAllButton({ platform }: { platform?: "tiktok" | "youtube" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function sync() {
    setBusy(true);
    const t = toast.loading("Memperbarui statistik semua akun (paralel)...");
    try {
      const r = await syncAllStats(platform);
      if (!r.total) toast.info("Belum ada akun yang login.", { id: t });
      else if (r.failed.length) toast.warning(`${r.ok}/${r.total} akun diperbarui`, { id: t, description: r.failed.join("\n"), duration: 10_000 });
      else toast.success(`${r.ok} akun diperbarui`, { id: t });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sinkron gagal", { id: t });
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={sync} disabled={busy} title="Ambil ulang statistik semua akun sekarang" className="flex h-9 items-center gap-1.5 rounded-lg border bg-background px-3.5 text-[13px] font-medium shadow-xs hover:bg-accent disabled:opacity-60">
      <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
      {busy ? "Memperbarui..." : "Refresh semua"}
    </button>
  );
}
