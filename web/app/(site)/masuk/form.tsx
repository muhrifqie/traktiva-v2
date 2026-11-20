"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { login, register } from "../actions";

const field = "h-12 rounded-2xl border border-white/15 bg-black/30 px-4 text-[16px] outline-none placeholder:text-white/25 focus:border-[var(--site-signal)]";

/** Google mark (official colors) for the sign-in button. */
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function GoogleButton({ next, label }: { next: string; label: string }) {
  return (
    // a plain link: the OAuth start is a top-level navigation to /api/auth/google (sets state, redirects to Google)
    <a href={`/api/auth/google?next=${encodeURIComponent(next)}`} className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-white/20 bg-white text-[16px] font-semibold text-black hover:bg-[#e4e4e7]">
      <GoogleG /> {label}
    </a>
  );
}

export function AuthForm({ mode, next, google }: { mode: "login" | "register"; next: string; google: boolean }) {
  const [state, action, pending] = useActionState(mode === "login" ? login : register, null);
  const [email, setEmail] = useState(""); // controlled: kept after a failed attempt
  const [name, setName] = useState("");
  return (
    <div className="grid gap-5">
      {google && (
        <>
          <GoogleButton next={next} label={mode === "login" ? "Masuk dengan Google" : "Daftar dengan Google"} />
          <div className="flex items-center gap-3 text-[13px] text-[var(--site-muted)]">
            <span className="h-px flex-1 bg-white/10" /> atau pakai email <span className="h-px flex-1 bg-white/10" />
          </div>
        </>
      )}
      <form action={action} className="grid gap-4">
        <input type="hidden" name="next" value={next} />
        {mode === "register" && (
          <label className="grid gap-2 text-[15px] font-medium">
            Nama
            <input name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} placeholder="Nama kamu" className={field} />
          </label>
        )}
        <label className="grid gap-2 text-[15px] font-medium">
          Email
          <input name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" maxLength={254} placeholder="kamu@email.com" className={field} />
        </label>
        <label className="grid gap-2 text-[15px] font-medium">
          Password
          <input name="password" type="password" required minLength={mode === "register" ? 8 : 1} maxLength={200} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "register" ? "Minimal 8 karakter" : ""} className={field} />
        </label>
        {state && !state.ok && <p className="text-[14px] text-red-300" role="alert">{state.message}</p>}
        <button type="submit" disabled={pending} className="site-pill w-full disabled:opacity-60">
          {pending && <Loader2 className="size-4 animate-spin" />} {mode === "login" ? "Masuk" : "Buat akun"}
        </button>
      </form>
      <p className="text-[14px] text-[var(--site-muted)]">
        {mode === "login" ? (
          <>Belum punya akun? <Link href={`/daftar?next=${encodeURIComponent(next)}`} className="text-[var(--site-body)] underline hover:text-white">Daftar gratis</Link></>
        ) : (
          <>Sudah punya akun? <Link href={`/masuk?next=${encodeURIComponent(next)}`} className="text-[var(--site-body)] underline hover:text-white">Masuk</Link></>
        )}
      </p>
    </div>
  );
}
