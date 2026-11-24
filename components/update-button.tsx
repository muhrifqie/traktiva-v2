"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const STAGE: Record<DesktopUpdateProgress["stage"], string> = {
  check: "Memeriksa…",
  download: "Mengunduh",
  verify: "Memeriksa file…",
  install: "Memasang, app akan dibuka ulang…",
};
const mb = (n = 0) => (n / 1048576).toFixed(0);

/**
 * "Update sekarang": the desktop app downloads, verifies and installs the new version itself. Without the bridge
 * (web mode, or an app build before in-app updates) it falls back to the download link.
 */
export function UpdateButton({ url, className = "", big = false }: { url: string; className?: string; big?: boolean }) {
  const [p, setP] = useState<DesktopUpdateProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    const u = window.desktop?.update;
    if (!u) return;
    setInApp(true); // eslint-disable-line react-hooks/set-state-in-effect -- the bridge only exists in the browser
    return u.onProgress(setP);
  }, []);

  const base = `inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-80 ${big ? "h-10 px-5 text-sm" : "px-3 py-1.5 text-xs"} ${className}`;
  if (!inApp)
    return (
      <a href={url} target="_blank" rel="noreferrer" className={base}>
        <Download className="size-3.5" /> Download
      </a>
    );

  const run = async () => {
    setBusy(true);
    const r = await window.desktop!.update!.install();
    if (!r.ok) {
      setBusy(false);
      setP(null);
      toast.error(r.message ?? "Update gagal");
    }
  };
  const pct = p?.stage === "download" && p.total ? Math.round(((p.received ?? 0) / p.total) * 100) : null;
  return (
    <div className="grid gap-1.5">
      <button type="button" onClick={run} disabled={busy} className={base}>
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        {busy ? (p ? (pct != null ? `${STAGE.download} ${pct}%` : STAGE[p.stage]) : STAGE.check) : "Update sekarang"}
      </button>
      {busy && pct != null && (
        <div className="grid gap-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-black/20 dark:bg-white/15"><div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} /></div>
          <span className="text-[10px] opacity-80 tabular-nums">{mb(p?.received)} / {mb(p?.total)} MB</span>
        </div>
      )}
    </div>
  );
}
