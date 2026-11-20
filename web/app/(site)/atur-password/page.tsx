import type { Metadata } from "next";
import Link from "next/link";
import { ApiError, licenseApi } from "@/lib/license-api";
import { SetPasswordForm } from "../masuk/form";
import { AuthShell } from "../masuk/shell";

export const metadata: Metadata = { title: "Atur password", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** One-time link from the admin (new account or forgotten password): check it, then let the member set a password. */
export default async function SetPassword({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const token = String((await searchParams).t ?? "").slice(0, 100);
  let email: string | null = null;
  let problem = "Link tidak lengkap. Buka lagi link yang dikirim admin.";
  if (/^[\w-]{20,100}$/.test(token)) {
    try {
      email = (await licenseApi<{ email: string }>("/internal/member/password-token/check", { method: "POST", body: { token } })).email;
    } catch (e) {
      problem = e instanceof ApiError ? e.message : "Server sedang sibuk. Coba lagi sebentar.";
    }
  }
  return (
    <AuthShell eyebrow="Atur password" title="Buat password untuk akunmu." points={["Link ini hanya bisa dipakai sekali", "Berlaku 30 menit sejak dibuat", "Setelah itu kamu langsung masuk"]}>
      {email ? (
        <SetPasswordForm token={token} email={email} />
      ) : (
        <div className="grid gap-4">
          <p className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-[14px] text-red-200" role="alert">{problem}</p>
          <Link href="/masuk" className="site-pill-outline site-sm justify-self-start">Ke halaman masuk</Link>
        </div>
      )}
    </AuthShell>
  );
}
