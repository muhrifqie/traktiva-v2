"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronUp, CircleAlert, Clock, Coins, Cpu, Layers, Loader2, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import type { AppStatus, Task } from "@/app/api/status/route";
import { GoogleIcon } from "@/components/brand-icons";
import { chime, setSoundOn, soundOn } from "@/lib/chime";

// VS Code-style status bar: engine + accounts on the left, live work in the middle, capacity on the right.
// Click the task area to open a panel with every running task and its scenes.

const mmss = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(t / 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}` : `${m}:${String(t % 60).padStart(2, "0")}`;
};
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

const ENGINE = {
  online: { label: "Mesin video siap", dot: "bg-status-ok" },
  offline: { label: "Mesin video tidur (menyala otomatis saat dipakai)", dot: "bg-muted-foreground" },
  missing: { label: "Mesin video belum terpasang", dot: "bg-destructive" },
} as const;

function Item({ children, title, onClick, href, className = "" }: { children: React.ReactNode; title?: string; onClick?: () => void; href?: string; className?: string }) {
  const cls = `flex h-full shrink-0 items-center gap-1.5 px-2 transition-colors hover:bg-foreground/10 ${className}`;
  if (href) return <Link href={href} title={title} className={cls}>{children}</Link>;
  if (onClick) return <button type="button" title={title} onClick={onClick} className={cls}>{children}</button>;
  return <span title={title} className={cls}>{children}</span>;
}

export function StatusBar() {
  const router = useRouter();
  const [s, setS] = useState<(AppStatus & { skew: number }) | null>(null);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef<Set<string> | null>(null);
  const retry = useRef(0);
  const [sound, setSound] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setSound(soundOn()), 0); // localStorage is browser-only (avoids a hydration mismatch)
    return () => clearTimeout(t);
  }, []);
  const toggleSound = () => {
    const on = !sound;
    setSound(on);
    setSoundOn(on);
    if (on) chime("done"); // preview + unlocks audio after a user gesture
  };
  const [kick, setKick] = useState(0); // bump to re-run the polling effect right away

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/status", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const next: AppStatus = await r.json();
      // toast once for everything that finished since the bar first loaded
      if (seen.current) {
        const fresh = next.finished.filter((f) => !seen.current!.has(f.key));
        if (fresh.length) chime(fresh.some((f) => !f.ok) ? "failed" : "done");
        for (const f of fresh) {
          const go = { label: "Lihat", onClick: () => router.push(f.href) };
          if (f.ok) toast.success(`Selesai: ${f.title}`, { action: go });
          else toast.error(`Perlu dicek: ${f.title}`, { action: go });
        }
      }
      seen.current = new Set(next.finished.map((f) => f.key));
      retry.current = 0;
      setS({ ...next, skew: next.now - Date.now() }); // skew: server clock − browser clock, so timers match server timestamps
    } catch {
      // first load can fail while the dev server compiles; retry soon instead of waiting a full poll
      if (retry.current++ < 5) setTimeout(() => setKick((k) => k + 1), 2000);
    }
  }, [router]);

  const busy = (s?.tasks.length ?? 0) > 0;

  // Poll fast while something runs, slowly otherwise; pause when the window is hidden.
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(() => document.visibilityState === "visible" && void load(), busy ? 2500 : 15000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [busy, load, kick]);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [busy]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const t = now + (s?.skew ?? 0);
  const engine = ENGINE[s?.engine ?? "offline"];
  const tasks = s?.tasks ?? [];
  const items = tasks.flatMap((x) => x.items);
  const working = items.filter((i) => i.state === "working").length;
  const queued = items.filter((i) => i.state === "queued").length;
  const done = tasks.reduce((n, x) => n + x.done, 0);
  const total = tasks.reduce((n, x) => n + x.total, 0);
  const oldest = Math.min(...tasks.map((x) => x.startedAt ?? Infinity));

  return (
    <>
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />}
      {open && <TaskPanel tasks={tasks} slots={s?.slots} now={t} onClose={() => setOpen(false)} />}

      <footer
        className="relative z-50 flex h-(--statusbar-height) shrink-0 items-stretch overflow-hidden border-t bg-sidebar text-[11px] text-muted-foreground"
        aria-label="Status aplikasi"
      >
        <Item title={engine.label} href="/pengaturan">
          <span className={`size-2 rounded-full ${engine.dot}`} />
          <Cpu className="size-3" />
          <span className="hidden sm:inline">{s?.engine === "online" ? "Mesin siap" : s?.engine === "missing" ? "Mesin belum terpasang" : "Mesin standby"}</span>
        </Item>
        <Item title="Akun Google aktif dan total kredit Flow" href="/pengaturan">
          <GoogleIcon className="size-3" />
          {s ? `${s.google.active}/${s.google.total}` : "–"}
          <Coins className="ml-1 size-3" />
          {s ? compact.format(s.google.credits) : "–"}
        </Item>

        <Item onClick={() => setOpen((o) => !o)} title="Lihat semua proses" className="min-w-0 flex-1 justify-start">
          {busy ? (
            <>
              <Loader2 className="size-3 shrink-0 animate-spin text-status-progress" />
              <span className="truncate text-foreground">
                {working} sedang dibuat{queued ? ` · ${queued} antre` : ""}{total ? ` · ${done}/${total} selesai` : ""}
              </span>
              {Number.isFinite(oldest) && <span className="font-mono tabular-nums opacity-80">{mmss(t - oldest)}</span>}
              {total > 0 && (
                <span className="hidden h-1 w-24 overflow-hidden rounded-full bg-muted md:block">
                  <span className="block h-full bg-status-progress transition-[width] duration-700" style={{ width: `${Math.round((done / total) * 100)}%` }} />
                </span>
              )}
            </>
          ) : (
            <>
              <Check className="size-3 shrink-0" />
              <span className="truncate">Tidak ada proses berjalan</span>
            </>
          )}
          <ChevronUp className={`size-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </Item>

        <Item title={sound ? "Suara notifikasi aktif (klik untuk bisukan)" : "Suara notifikasi mati (klik untuk aktifkan)"} onClick={toggleSound}>
          {sound ? <Volume2 className="size-3" /> : <VolumeX className="size-3" />}
        </Item>
        <Item title="Proses yang jalan bersamaan (batas otomatis sesuai spek PC dan jumlah akun Google)" href="/pengaturan">
          <Layers className="size-3" />
          {s ? `${s.slots.active}/${s.slots.max}` : "–"}
          {s && s.slots.waiting > 0 && <span className="opacity-80">+{s.slots.waiting}</span>}
        </Item>
      </footer>
    </>
  );
}

const STATE = {
  working: { icon: Loader2, cls: "animate-spin text-status-progress" },
  queued: { icon: Clock, cls: "text-muted-foreground" },
  done: { icon: Check, cls: "text-status-ok" },
  failed: { icon: CircleAlert, cls: "text-destructive" },
} as const;

function TaskPanel({ tasks, slots, now, onClose }: { tasks: Task[]; slots?: AppStatus["slots"]; now: number; onClose: () => void }) {
  return (
    <div className="fixed bottom-(--statusbar-height) left-0 z-50 flex max-h-[60vh] w-full flex-col overflow-hidden border bg-popover text-popover-foreground shadow-xl sm:left-2 sm:mb-1 sm:w-[440px] sm:rounded-xl">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <p className="flex-1 text-[13px] font-semibold">Proses berjalan</p>
        {slots && <span className="text-[11px] text-muted-foreground">{slots.active} dari {slots.max} jalur dipakai{slots.waiting ? `, ${slots.waiting} antre` : ""}</span>}
        <button type="button" onClick={onClose} aria-label="Tutup" className="grid size-6 place-items-center rounded-md hover:bg-accent"><X className="size-3.5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
            <Check className="size-5 text-status-ok" />
            <p className="text-[13px] font-medium">Semua beres</p>
            <p className="text-xs text-muted-foreground">Gambar dan video yang sedang dibuat akan muncul di sini.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {tasks.map((task) => {
              const pct = task.pct;
              return (
                <li key={task.key} className="space-y-2 px-3 py-2.5">
                  <Link href={task.href} onClick={onClose} className="flex items-baseline gap-2 hover:underline">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{task.title}</span>
                    {task.startedAt && <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{mmss(now - task.startedAt)}</span>}
                  </Link>
                  <p className="truncate text-[11px] text-muted-foreground">{task.subtitle} · {task.progress ?? "Memproses..."}</p>
                  {task.total > 1 && (
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-status-progress transition-[width] duration-700" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  {task.items.length > 0 && (
                    <ul className="space-y-1">
                      {task.items.map((it, i) => {
                        const st = STATE[it.state as keyof typeof STATE] ?? STATE.queued;
                        return (
                          <li key={i} className="flex items-center gap-2 text-[11px]">
                            <st.icon className={`size-3 shrink-0 ${st.cls}`} />
                            <span className="w-24 shrink-0 truncate">{it.label}</span>
                            <span className="min-w-0 flex-1 truncate text-muted-foreground">
                              {it.state === "queued" ? "Menunggu jalur kosong" : it.state === "done" ? "Selesai" : it.state === "failed" ? "Gagal" : it.stage ?? "Sedang dibuat..."}
                            </span>
                            {it.state === "working" && it.pct != null && <span className="w-8 text-right font-mono tabular-nums text-status-progress">{it.pct}%</span>}
                            {it.state === "working" && it.startedAt && <span className="font-mono tabular-nums text-muted-foreground">{mmss(now - it.startedAt)}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
