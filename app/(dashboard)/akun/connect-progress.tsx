"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, CircleDashed, Loader2, X, XCircle } from "lucide-react";
import { PlatformIcon } from "@/components/platform-icon";
import { PLATFORM } from "@/lib/platforms";

// Progress panel of "Tambahkan akun" / "Login ulang": login, identifying the account, then every data scrape step
// (videos taken, showcase photos, YouTube Studio pages) with live counters from the server (lib/sync-progress.ts).
// One run at a time; the panel sits above the status bar until closed (success closes itself).

type State = "wait" | "run" | "done" | "fail" | "skip";
type Step = { key: string; label: string; state: State; detail?: string };
export type Run = { id: number; platform: string; title?: string; doneTitle?: string; who?: string; steps: Step[]; error?: string; finished?: boolean; summary?: string };
export type Live = { stage: string; n: number | null; total: number | null };

let current: Run | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = (next: Run | null) => ((current = next), listeners.forEach((l) => l()));
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

export type Tracker = ReturnType<typeof beginRun>;

/** Start a run with its steps (all waiting); the first one runs. */
export function beginRun(platform: string, steps: [key: string, label: string][], opts: { title?: string; doneTitle?: string } = {}) {
  const id = ++seq;
  emit({ id, platform, ...opts, steps: steps.map(([key, label], i) => ({ key, label, state: i ? "wait" : "run" })) });
  const mine = () => current?.id === id;
  const patch = (fn: (r: Run) => Run) => mine() && current && emit(fn(current));
  const t = {
    who: (who: string) => patch((r) => ({ ...r, who })),
    /** Mark a step; "run" also closes the steps before it as done. */
    step(key: string, state: State, detail?: string) {
      patch((r) => {
        const at = r.steps.findIndex((s) => s.key === key);
        return { ...r, steps: r.steps.map((s, i) => (i === at ? { ...s, state, detail: detail ?? s.detail } : state === "run" && i < at && (s.state === "run" || s.state === "wait") ? { ...s, state: "done" } : s)) };
      });
    },
    /** Poll the server's live counter for this account while `key` runs; returns stop(). */
    watch(accountId: number, key: string, fmt: (p: Live) => string) {
      let on = true;
      const timer = setInterval(() => {
        if (!mine()) return clearInterval(timer);
        fetch(`/api/sync-progress?id=${accountId}`, { cache: "no-store" })
          .then((r) => r.json() as Promise<Live | null>)
          .then((p) => on && p && t.step(key, "run", fmt(p)), () => {});
      }, 1000);
      return () => ((on = false), clearInterval(timer)); // a late answer never overwrites the final detail
    },
    finish(summary: string) {
      patch((r) => ({ ...r, finished: true, summary, steps: r.steps.map((s) => (s.state === "run" || s.state === "wait" ? { ...s, state: "done" } : s)) }));
      setTimeout(() => mine() && current?.finished && !current.error && emit(null), 12_000);
    },
    fail(message: string) {
      patch((r) => ({ ...r, finished: true, error: message, steps: r.steps.map((s) => (s.state === "run" ? { ...s, state: "fail" } : s)) }));
    },
  };
  return t;
}

const ICON: Record<State, React.ReactNode> = {
  wait: <CircleDashed className="size-4 text-muted-foreground/50" />,
  run: <Loader2 className="size-4 animate-spin text-primary" />,
  done: <Check className="size-4 text-status-ok" />,
  fail: <XCircle className="size-4 text-destructive" />,
  skip: <CircleDashed className="size-4 text-muted-foreground/50" />,
};

/** Mounted once in the dashboard layout. */
export function ConnectProgress() {
  const run = useSyncExternalStore(subscribe, () => current, () => null);
  if (!run) return null;
  const done = run.steps.filter((s) => s.state === "done" || s.state === "skip").length;
  const pct = run.finished && !run.error ? 100 : Math.round((done / run.steps.length) * 100);
  const label = PLATFORM[run.platform as keyof typeof PLATFORM]?.label ?? run.platform;
  return (
    <div role="status" aria-live="polite" className="fixed right-4 bottom-[calc(var(--statusbar-height)+12px)] z-50 w-[340px] overflow-hidden rounded-xl border bg-popover shadow-xl animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center gap-2.5 px-3.5 pt-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-muted"><PlatformIcon platform={run.platform as keyof typeof PLATFORM} className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{run.error ? (run.title ? "Gagal" : "Gagal menghubungkan") : run.finished ? (run.doneTitle ?? "Akun siap dipakai") : (run.title ?? `Menghubungkan ${label}`)}</p>
          <p className="truncate text-[11px] text-muted-foreground">{run.who ?? "Menunggu login..."}</p>
        </div>
        {run.finished && (
          <button type="button" onClick={() => emit(null)} aria-label="Tutup" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-4" /></button>
        )}
      </div>
      <div className="mx-3.5 mt-2.5 h-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-[width] duration-500 ${run.error ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
      <ol className="grid gap-1.5 px-3.5 py-3">
        {run.steps.map((s) => (
          <li key={s.key} className="flex items-start gap-2 text-xs">
            <span className="mt-px shrink-0">{ICON[s.state]}</span>
            <span className={`min-w-0 flex-1 ${s.state === "wait" ? "text-muted-foreground" : ""}`}>
              {s.label}
              {s.detail && <span className={`block text-[11px] ${s.state === "fail" ? "text-destructive" : "text-muted-foreground"} tabular-nums`}>{s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
      {(run.error || run.summary) && (
        <div className={`flex items-center gap-2 border-t px-3.5 py-2.5 text-[11px] ${run.error ? "text-destructive" : "text-muted-foreground"}`}>
          <span className="min-w-0 flex-1 line-clamp-3">{run.error ?? run.summary}</span>
          {!run.error && <Link href="/akun" onClick={() => emit(null)} className="shrink-0 font-medium text-brand-light hover:underline">Lihat akun</Link>}
        </div>
      )}
    </div>
  );
}
