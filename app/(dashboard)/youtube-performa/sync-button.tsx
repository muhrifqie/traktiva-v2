"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudDownload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { syncYouTubeAccount } from "./actions";

export function YouTubeSyncButton({ accountId, name, primary = false }: { accountId: number; name: string; primary?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function sync() {
    setBusy(true);
    const t = toast.loading(`Mengambil data ${name} dari YouTube Studio...`);
    try {
      const r = await syncYouTubeAccount(accountId);
      toast.success(`${r.videos} video & Insight diperbarui`, { id: t });
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
      className={`flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-medium shadow-xs disabled:opacity-60 ${primary ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border bg-background hover:bg-accent"}`}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <CloudDownload className="size-4" />}
      {busy ? "Menyinkronkan..." : "Sinkron dari Studio"}
    </button>
  );
}

/** Channels without Studio data yet: sync them once on open (one after another), then refresh the page. */
export function AutoSync({ ids }: { ids: number[] }) {
  const router = useRouter();
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    let stop = false;
    void (async () => {
      for (const id of key.split(",").map(Number)) {
        if (stop) return;
        await syncYouTubeAccount(id).catch((e) => toast.error(e instanceof Error ? e.message : "Sinkron gagal"));
        if (!stop) router.refresh();
      }
    })();
    return () => {
      stop = true;
    };
  }, [key, router]);
  return null;
}
