"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudDownload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { syncTikTokAccount } from "../akun/actions";

/** Data older than this is refreshed automatically when the page opens. */
const STALE_MS = 5 * 60_000;
// one automatic sync per account at a time, also across quick re-renders/navigations
const autoRunning = new Set<number>();

export function SyncButton({
  accountId, username, primary = false, syncedAt = null, auto = false,
}: { accountId: number; username: string; primary?: boolean; syncedAt?: number | null; auto?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"manual" | "auto" | null>(null);
  const started = useRef<number | null>(null);

  const sync = useCallback(
    async (kind: "manual" | "auto") => {
      setBusy(kind);
      const t = kind === "manual" ? toast.loading(`Mengambil data @${username} dari TikTok...`) : undefined;
      try {
        const r = await syncTikTokAccount(accountId);
        if (t) toast.success(`${r.videos} video & statistik diperbarui`, { id: t });
        router.refresh();
      } catch (e) {
        toast.error(`${kind === "auto" ? "Sinkron otomatis gagal: " : ""}${e instanceof Error ? e.message : "Sinkron gagal"}`, { id: t });
      } finally {
        setBusy(null);
      }
    },
    [accountId, username, router],
  );

  // opening the page refreshes stale data by itself (the button stays for an immediate manual sync)
  useEffect(() => {
    if (!auto || started.current === accountId || autoRunning.has(accountId)) return;
    if (syncedAt && Date.now() - syncedAt < STALE_MS) return;
    started.current = accountId;
    autoRunning.add(accountId);
    let fired = false;
    const t = setTimeout(() => {
      fired = true;
      void sync("auto").finally(() => autoRunning.delete(accountId));
    }, 0);
    return () => {
      clearTimeout(t);
      // cancelled before it ran (React dev mounts effects twice): let the next run start it
      if (!fired) {
        started.current = null;
        autoRunning.delete(accountId);
      }
    };
  }, [auto, accountId, syncedAt, sync]);

  return (
    <button
      type="button"
      onClick={() => void sync("manual")}
      disabled={!!busy}
      title={busy === "auto" ? "Data lebih dari 5 menit, diperbarui otomatis" : undefined}
      className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium shadow-xs disabled:opacity-60 ${primary ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border bg-background hover:bg-accent"}`}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <CloudDownload className="size-4" />}
      {busy === "auto" ? "Menyinkronkan otomatis..." : busy ? "Menyinkronkan..." : "Sinkronkan"}
    </button>
  );
}
