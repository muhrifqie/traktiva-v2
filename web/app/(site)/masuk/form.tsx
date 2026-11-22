"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Turnstile } from "@/components/turnstile";
import { login, register, setPasswordFromLink } from "../actions";

import { field } from "./shell";

const label = "grid gap-1.5 text-sm font-medium";
const errorBox = "rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-600 dark:text-red-300";

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
    <a href={`/api/auth/google?next=${encodeURIComponent(next)}`} className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border bg-background text-[15px] font-semibold hover:border-foreground/40">
      <GoogleG /> {label}
    </a>
  );
}

/** Password input with a show/hide toggle. */
function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? "text" : "password"} className={`${field} pr-11`} />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Sembunyikan password" : "Tampilkan password"} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function AuthForm({ mode, next, google, turnstile }: { mode: "login" | "register"; next: string; google: boolean; turnstile: string }) {
  const [state, action, pending] = useActionState(mode === "login" ? login : register, null);
  const [email, setEmail] = useState(""); // controlled: kept after a failed attempt
  const [name, setName] = useState("");
  const login_ = mode === "login";
  return (
    <div className="grid gap-5">
      {google && (
        <>
          <GoogleButton next={next} label={login_ ? "Masuk dengan Google" : "Daftar dengan Google"} />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> atau pakai email <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      <form action={action} className="grid gap-4">
        <input type="hidden" name="next" value={next} />
        {!login_ && (
          <label className={label}>
            Nama
            <input name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} placeholder="Nama kamu" className={field} />
          </label>
        )}
        <label className={label}>
          Email
          <input name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={!google} autoComplete="email" maxLength={254} placeholder="kamu@email.com" className={field} />
        </label>
        <div className={label}>
          <span className="flex items-center justify-between">
            <label htmlFor="password">Password</label>
            {login_ && <Link href="/lupa-password" className="text-xs font-normal text-muted-foreground hover:text-foreground hover:underline">Lupa password?</Link>}
          </span>
          <PasswordInput id="password" name="password" required minLength={login_ ? 1 : 8} maxLength={200} autoComplete={login_ ? "current-password" : "new-password"} placeholder={login_ ? "" : "Minimal 8 karakter"} />
        </div>
        <Turnstile siteKey={turnstile} resetKey={state} />
        {state && !state.ok && <p className={errorBox} role="alert">{state.message}</p>}
        <button type="submit" disabled={pending} className="site-pill w-full disabled:opacity-60">
          {pending && <Loader2 className="size-4 animate-spin" />} {login_ ? "Masuk" : "Buat akun gratis"}
        </button>
        {!login_ && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Dengan membuat akun, kamu setuju dengan <Link href="/ketentuan" className="underline hover:text-foreground">Ketentuan Layanan</Link> dan <Link href="/privasi" className="underline hover:text-foreground">Kebijakan Privasi</Link>.
          </p>
        )}
      </form>
      <p className="border-t pt-5 text-center text-sm text-muted-foreground">
        {login_ ? (
          <>Belum punya akun? <Link href={`/daftar?next=${encodeURIComponent(next)}`} className="font-semibold text-foreground hover:underline">Daftar gratis</Link></>
        ) : (
          <>Sudah punya akun? <Link href={`/masuk?next=${encodeURIComponent(next)}`} className="font-semibold text-foreground hover:underline">Masuk</Link></>
        )}
      </p>
    </div>
  );
}

/** "Atur password" from a one-time link (new account created by the admin, or a forgotten password). */
export function SetPasswordForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(setPasswordFromLink, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-muted-foreground">Akun: <b className="font-medium text-foreground">{email}</b></p>
      <label className={label}>
        Password baru
        <input name="password" type="password" required minLength={10} maxLength={200} autoComplete="new-password" placeholder="Minimal 10 karakter" className={field} />
      </label>
      <label className={label}>
        Ulangi password
        <input name="again" type="password" required minLength={10} maxLength={200} autoComplete="new-password" className={field} />
      </label>
      <p className="text-xs text-muted-foreground">Pakai kalimat panjang yang hanya kamu tahu, dan simpan di password manager.</p>
      {state && !state.ok && <p className={errorBox} role="alert">{state.message}</p>}
      <button type="submit" disabled={pending} className="site-pill w-full disabled:opacity-60">
        {pending && <Loader2 className="size-4 animate-spin" />} Simpan password & masuk
      </button>
    </form>
  );
}
