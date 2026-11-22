import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk admin", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-sidebar p-4">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border bg-card p-7 text-center shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="mx-auto size-12 drop-shadow-[0_8px_22px_rgb(16_110_58/0.5)]" />
        <div>
          <h1 className="text-lg font-semibold">Admin lisensi Traktiva</h1>
          <p className="text-sm text-muted-foreground">Masuk dengan akun admin kamu.</p>
        </div>
        <LoginForm />
        <a href="/masuk?next=/admin" className="block rounded-lg border px-3 py-2.5 text-[0.8125rem] font-medium hover:bg-accent">
          Masuk dengan akun member (email / Google)
        </a>
        <p className="text-[0.6875rem] text-muted-foreground">Akun member perlu peran admin + verifikasi 2 langkah. Lupa password? Minta owner kirim link atur password.</p>
      </div>
    </main>
  );
}
