import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { googleEnabled, safeNext } from "@/lib/google";
import { memberSignedIn } from "@/lib/license-api";
import { AuthForm } from "./form";
import { AuthShell } from "./shell";

export const metadata: Metadata = { title: "Masuk", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = { "google-off": "Masuk dengan Google belum tersedia. Pakai email dulu." };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next: n, error } = await searchParams;
  const next = safeNext(n);
  if (await memberSignedIn()) redirect(next); // a stale cookie must not bounce between /masuk and /akun
  const message = error ? (ERRORS[error] ?? error).slice(0, 200) : null;
  return (
    <AuthShell eyebrow="Area member" title="Masuk ke akun Traktiva kamu." points={["Semua lisensi kamu di satu tempat", "Pindah PC sendiri tanpa chat admin", "Download installer versi terbaru"]}>
      {message && <p className="mb-5 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-[14px] text-red-200" role="alert">{message}</p>}
      <AuthForm mode="login" next={next} google={googleEnabled()} />
    </AuthShell>
  );
}
