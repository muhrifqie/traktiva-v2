"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MailCheck } from "lucide-react";
import { Turnstile } from "@/components/turnstile";
import { forgotPassword } from "../actions";

import { field } from "../masuk/shell";

/** Email → 6-digit code by email → new password. The email is kept across both steps. */
export function ForgotForm({ turnstile }: { turnstile: string }) {
  const [state, action, pending] = useActionState(forgotPassword, null);
  const [email, setEmail] = useState("");
  const [codeStep, setCodeStep] = useState(false); // stays on the code step after a wrong code
  const [wait, setWait] = useState(0);
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) {
      setCodeStep(true);
      setWait(state.retryAfter);
    }
  }
  // countdown for "kirim ulang"; restarts each time a code is (re)sent
  useEffect(() => {
    if (!state?.ok) return;
    const t = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [state]);

  if (!codeStep)
    return (
      <form action={action} className="grid gap-4">
        <p className="text-sm text-muted-foreground">Masukkan email akunmu. Kami kirim kode 6 angka untuk membuat password baru.</p>
        <label className="grid gap-1.5 text-sm font-medium">
          Email
          <input name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" maxLength={254} placeholder="kamu@email.com" className={field} />
        </label>
        <Turnstile siteKey={turnstile} resetKey={state} />
        {state && !state.ok && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-600 dark:text-red-300" role="alert">{state.message}</p>}
        <button type="submit" disabled={pending} className="site-pill w-full disabled:opacity-60">
          {pending && <Loader2 className="size-4 animate-spin" />} Kirim kode
        </button>
        <Link href="/masuk" className="text-sm text-muted-foreground underline hover:text-foreground">Kembali ke halaman masuk</Link>
      </form>
    );

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="email" value={email} />
      <Turnstile siteKey={turnstile} resetKey={state} />
      <p className="flex gap-2.5 rounded-xl border border-[var(--site-signal)]/25 bg-[var(--site-signal)]/[0.07] px-4 py-3 text-[14px] text-[var(--site-body)]">
        <MailCheck className="mt-0.5 size-4 shrink-0 text-[var(--site-signal)]" />
        <span>{state?.ok ? state.message : "Masukkan kode dari email."} <b className="font-medium text-white">{email}</b></span>
      </p>
      <label className="grid gap-1.5 text-sm font-medium">
        Kode 6 angka
        <input name="otp" required autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="123456" className={`${field} h-14 text-center font-mono text-[24px] tracking-[0.4em]`} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Password baru
        <input name="password" type="password" required minLength={8} maxLength={200} autoComplete="new-password" placeholder="Minimal 8 karakter" className={field} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Ulangi password baru
        <input name="again" type="password" required minLength={8} maxLength={200} autoComplete="new-password" className={field} />
      </label>
      {state && !state.ok && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-600 dark:text-red-300" role="alert">{state.message}</p>}
      <button type="submit" disabled={pending} className="site-pill w-full disabled:opacity-60">
        {pending && <Loader2 className="size-4 animate-spin" />} Simpan password & masuk
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
        {/* resend = submit the email alone (the browser skips the required code fields via formNoValidate) */}
        <button type="submit" formNoValidate disabled={pending || wait > 0} name="resend" value="1" className="text-[var(--site-body)] underline hover:text-white disabled:no-underline disabled:opacity-50">
          {wait > 0 ? `Kirim ulang dalam ${wait} dtk` : "Kirim ulang kode"}
        </button>
        <button type="button" onClick={() => { setCodeStep(false); setWait(0); }} className="text-[var(--site-muted)] underline hover:text-white">Ganti email</button>
      </div>
    </form>
  );
}
