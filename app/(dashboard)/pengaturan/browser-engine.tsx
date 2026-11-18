"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Download, Globe, Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import type { BrowserStatus } from "@/app/api/browser/route";
import { camoufoxBusy, camoufoxLabel, camoufoxPct } from "@/lib/browser/progress";
import { downloadCamoufox } from "./actions";

// Status of the login browser: Camoufox (anti-detect, downloaded once ~500 MB) with live download
// progress, plus which browser new accounts use meanwhile.

export function BrowserEngine({ initial }: { initial: BrowserStatus }) {
  const [s, setS] = useState(initial);
  const [starting, setStarting] = useState(false);
  const busy = camoufoxBusy(s.camoufox);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/browser", { cache: "no-store" });
      if (r.ok) setS(await r.json());
    } catch {}
  }, []);

  // Fast while installing (live progress); slow otherwise, so a download started by a login shows up too.
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && void load(), busy ? 1000 : 5000);
    return () => clearInterval(t);
  }, [busy, load]);

  const start = useCallback(async () => {
    setStarting(true);
    try {
      const c = await downloadCamoufox();
      setS((prev) => ({ ...prev, camoufox: c }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memulai unduhan");
    } finally {
      setStarting(false);
    }
  }, []);

  const c = s.camoufox;
  const pct = camoufoxPct(c);
  const ready = c.state === "ready";

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background"><Globe className="size-5 text-muted-foreground" /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Browser login</p>
            <p className="text-xs text-muted-foreground">Camoufox: browser anti-deteksi untuk login akun. Diunduh sekali (±500 MB).</p>
          </div>
        </div>
        {ready ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-status-ok/10 px-2 py-0.5 text-[11px] font-medium text-status-ok"><CircleCheck className="size-3" /> Siap</span>
        ) : busy ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-status-progress/10 px-2 py-0.5 text-[11px] font-medium text-status-progress">
            <Loader2 className="size-3 animate-spin" /> {c.state === "downloading" ? `${pct}%` : "Memasang"}
          </span>
        ) : (
          <button type="button" onClick={start} disabled={starting} className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border bg-background px-3 text-xs font-medium shadow-xs hover:bg-accent disabled:opacity-60">
            {starting ? <Loader2 className="size-3.5 animate-spin" /> : c.state === "failed" ? <RotateCw className="size-3.5" /> : <Download className="size-3.5" />}
            {c.state === "failed" ? "Coba lagi" : "Unduh Camoufox"}
          </button>
        )}
      </div>

      {busy && (
        <div className="space-y-1.5 rounded-lg border bg-background/50 p-3">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium">{c.state === "downloading" ? "Mengunduh Camoufox" : c.state === "verifying" ? "Memeriksa" : "Memasang"}</span>
            <span className="truncate font-mono text-[11px] tabular-nums text-muted-foreground">{camoufoxLabel(c)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.state === "downloading" ? pct : undefined}>
            {c.state === "downloading" ? (
              <div className="h-full rounded-full bg-status-progress transition-[width] duration-700" style={{ width: `${pct}%` }} />
            ) : (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-status-progress" />
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">Boleh tinggalkan halaman ini; unduhan jalan terus dan melanjutkan sendiri kalau koneksi putus.</p>
        </div>
      )}

      {c.state === "failed" && (
        <p className="flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
          <CircleAlert className="mt-px size-3.5 shrink-0" /> {c.error ?? "Gagal diunduh."} Bagian yang sudah terunduh disimpan; &quot;Coba lagi&quot; akan melanjutkannya.
        </p>
      )}

      {!ready && (
        <p className="text-[11px] text-muted-foreground">
          {s.fallback
            ? <>Sambil menunggu, akun <b>baru</b> login memakai <b>{s.fallback}</b> yang sudah ada di komputer ini. Akun yang dibuat dengan {s.fallback} akan tetap memakai {s.fallback}.</>
            : <>Tidak ada Chrome/Edge di komputer ini, jadi login akun menunggu Camoufox selesai terpasang.</>}
        </p>
      )}
    </section>
  );
}
