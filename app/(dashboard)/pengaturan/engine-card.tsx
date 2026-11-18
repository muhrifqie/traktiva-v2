"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, Cpu, Download, Loader2, Power, RotateCw } from "lucide-react";
import { toast } from "sonner";
import type { EngineStatus } from "@/app/api/engine/route";
import { installVideoEngine, restartVideoEngine, stopVideoEngine } from "./actions";

// The video engine (flow2api) as one managed unit: install with step-by-step progress, run hidden in the
// background, restart/stop from here.

const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" });
const btn = "flex h-8 shrink-0 items-center gap-1.5 rounded-lg border bg-background px-3 text-xs font-medium shadow-xs hover:bg-accent disabled:opacity-60";

const BADGE: Record<EngineStatus["state"], { label: string; cls: string }> = {
  running: { label: "Berjalan", cls: "bg-status-ok/10 text-status-ok" },
  stopped: { label: "Standby", cls: "bg-muted text-muted-foreground" },
  starting: { label: "Menyala...", cls: "bg-status-progress/10 text-status-progress" },
  installing: { label: "Memasang", cls: "bg-status-progress/10 text-status-progress" },
  missing: { label: "Belum terpasang", cls: "bg-destructive/10 text-destructive" },
  failed: { label: "Bermasalah", cls: "bg-destructive/10 text-destructive" },
};

export function EngineCard({ initial }: { initial: EngineStatus }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const active = s.state === "installing" || s.state === "starting";
  const prev = useRef(s.state);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/engine", { cache: "no-store" });
      if (r.ok) setS(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && void load(), active ? 1000 : 5000);
    return () => clearInterval(t);
  }, [active, load]);

  // Install finished: the rest of the page (Google login button) depends on the engine being there.
  useEffect(() => {
    if (prev.current === "installing" && s.state !== "installing") {
      if (s.state === "failed") toast.error("Pemasangan mesin video gagal");
      else toast.success("Mesin video terpasang");
      router.refresh();
    }
    prev.current = s.state;
  }, [s.state, router]);

  const act = (key: string, fn: () => Promise<EngineStatus>) => async () => {
    setBusy(key);
    try {
      setS(await fn());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(null);
    }
  };
  const install = act("install", installVideoEngine);
  const restart = act("restart", restartVideoEngine);
  const stop = act("stop", stopVideoEngine);

  const installed = s.installed;
  const badge = BADGE[s.state];

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background"><Cpu className="size-5 text-muted-foreground" /></span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold">
              Mesin video
              <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}>
                {active && <Loader2 className="size-3 animate-spin" />}
                {s.state === "installing" ? `Memasang ${s.stepNo}/${s.steps.length}` : badge.label}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">Membuat video & gambar lewat Flow. Jalan tersembunyi di latar dan mati bersama aplikasi.</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          {s.external ? (
            <span className="text-[11px] text-muted-foreground">Dikelola di luar Traktiva</span>
          ) : s.state === "installing" ? null : !installed ? (
            <button type="button" onClick={install} disabled={!!busy} className={btn}>
              {busy === "install" ? <Loader2 className="size-3.5 animate-spin" /> : s.state === "failed" ? <RotateCw className="size-3.5" /> : <Download className="size-3.5" />}
              {s.state === "failed" ? "Coba pasang lagi" : "Pasang mesin video"}
            </button>
          ) : (
            <>
              <button type="button" onClick={restart} disabled={!!busy || s.state === "starting"} className={btn}>
                {busy === "restart" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
                {s.state === "running" ? "Nyalakan ulang" : "Nyalakan"}
              </button>
              {s.state === "running" && s.pid && (
                <button type="button" onClick={stop} disabled={!!busy} className={`${btn} text-muted-foreground`} title="Mesin menyala lagi otomatis saat dibutuhkan">
                  {busy === "stop" ? <Loader2 className="size-3.5 animate-spin" /> : <Power className="size-3.5" />} Matikan
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {s.state === "installing" && (
        <ol className="space-y-1.5 rounded-lg border bg-background/50 p-3">
          {s.steps.map((label, i) => {
            const n = i + 1;
            const done = n < s.stepNo;
            const current = n === s.stepNo;
            return (
              <li key={label} className="text-xs">
                <div className={`flex items-center gap-2 ${done || current ? "" : "text-muted-foreground"}`}>
                  {done ? <Check className="size-3.5 text-status-ok" /> : current ? <Loader2 className="size-3.5 animate-spin text-status-progress" /> : <span className="grid size-3.5 place-items-center text-[10px]">{n}</span>}
                  <span className={current ? "font-medium" : ""}>{label}</span>
                  {current && s.pct != null && <span className="ml-auto font-mono text-[11px] tabular-nums text-status-progress">{s.pct}%</span>}
                </div>
                {current && (
                  <div className="mt-1 ml-5.5 space-y-1">
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      {s.pct != null ? (
                        <div className="h-full rounded-full bg-status-progress transition-[width] duration-500" style={{ width: `${s.pct}%` }} />
                      ) : (
                        <div className="h-full w-1/3 animate-pulse rounded-full bg-status-progress" />
                      )}
                    </div>
                    {s.detail && <p className="truncate font-mono text-[10px] text-muted-foreground">{s.detail}</p>}
                  </div>
                )}
              </li>
            );
          })}
          <li className="pt-1 text-[11px] text-muted-foreground">Butuh beberapa menit (±300 MB). Boleh tinggalkan halaman ini.</li>
        </ol>
      )}

      {s.state === "running" && (
        <p className="text-[11px] text-muted-foreground">
          {s.pid ? <>Menyala sejak {s.startedAt ? timeFmt.format(s.startedAt) : "-"} · {s.url?.replace(/^https?:\/\//, "")}</> : <>Menjawab di {s.url?.replace(/^https?:\/\//, "")}</>}
        </p>
      )}
      {s.state === "stopped" && <p className="text-[11px] text-muted-foreground">Mati untuk hemat memori; menyala sendiri saat kamu membuat video atau menyambungkan akun.</p>}

      {s.error && s.state !== "installing" && s.state !== "running" && (
        <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
          <p className="flex items-start gap-1.5"><CircleAlert className="mt-px size-3.5 shrink-0" /> {s.error.split("\n")[0]}</p>
          {s.error.includes("\n") && <pre className="max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-destructive/80">{s.error.split("\n").slice(1).join("\n")}</pre>}
        </div>
      )}
    </section>
  );
}
