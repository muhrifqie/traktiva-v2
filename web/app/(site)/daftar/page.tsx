import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { googleEnabled, safeNext } from "@/lib/google";
import { memberSignedIn } from "@/lib/license-api";
import { AuthForm } from "../masuk/form";
import { AuthShell } from "../masuk/shell";

export const metadata: Metadata = { title: "Daftar", robots: { index: false, follow: false } };

export default async function Register({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await memberSignedIn()) redirect(next); // a stale cookie must not bounce between /masuk and /akun
  return (
    <AuthShell eyebrow="Akun gratis" title="Buat akun, lalu tambahkan key lisensimu." points={["Daftar pakai email atau Google", "Masukkan key yang kamu beli sekali saja", "Pantau masa aktif & PC yang memakai key"]}>
      <AuthForm mode="register" next={next} google={googleEnabled()} />
    </AuthShell>
  );
}
