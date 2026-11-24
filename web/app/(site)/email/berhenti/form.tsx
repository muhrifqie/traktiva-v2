"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { unsubscribe } from "../../actions";

export function Unsubscribe({ u, t }: { u: string; t: string }) {
  const [state, setState] = useState<{ done: boolean; email?: string; error?: string }>({ done: false });
  const [pending, start] = useTransition();
  const go = (resubscribe: boolean) =>
    start(async () => {
      const r = await unsubscribe(u, t, resubscribe);
      setState(r.ok ? { done: !resubscribe, email: r.email } : { done: state.done, error: r.message });
    });
  return (
    <div className="mt-6 grid gap-3">
      {state.error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-600 dark:text-red-300" role="alert">{state.error}</p>}
      {state.done ? (
        <>
          <p className="rounded-lg border border-[var(--site-signal)]/25 bg-[var(--site-signal)]/[0.07] px-3 py-2.5 text-sm">Berhasil. {state.email} tidak akan menerima info & promo lagi.</p>
          <button type="button" disabled={pending} onClick={() => go(true)} className="text-sm text-muted-foreground underline hover:text-foreground">Salah tekan? Berlangganan lagi</button>
        </>
      ) : (
        <button type="button" disabled={pending} onClick={() => go(false)} className="site-pill w-full disabled:opacity-60">
          {pending && <Loader2 className="size-4 animate-spin" />} Ya, berhenti berlangganan
        </button>
      )}
    </div>
  );
}
