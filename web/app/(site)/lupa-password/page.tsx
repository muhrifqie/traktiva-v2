import type { Metadata } from "next";
import { AuthShell } from "../masuk/shell";
import { turnstileSiteKey } from "@/lib/turnstile";
import { ForgotForm } from "./form";

export const metadata: Metadata = { title: "Lupa password", robots: { index: false, follow: false } };

export default function Forgot() {
  return (
    <AuthShell card="Lupa password" eyebrow="Lupa password" title="Buat password baru lewat email." points={["Kode 6 angka berlaku 10 menit", "Semua perangkat lain otomatis keluar", "Masuk pakai Google? Tidak perlu password"]}>
      <ForgotForm turnstile={turnstileSiteKey()} />
    </AuthShell>
  );
}
