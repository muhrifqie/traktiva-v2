import type { Metadata } from "next";
import Link from "next/link";
import { BuyerLoginForm } from "./form";

export const metadata: Metadata = { title: "Masuk", robots: { index: false, follow: false } };

export default function BuyerLogin() {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-64px)] max-w-[1260px] items-center gap-12 px-5 py-16 md:px-8 lg:grid-cols-2">
      <div>
        <p className="font-mono text-[12px] tracking-[0.08em] text-[var(--site-signal)] uppercase">Area pembeli</p>
        <h1 className="mt-4 text-[40px] leading-[1.08] font-light tracking-[-0.03em] md:text-[56px]">Masuk dengan key lisensi kamu.</h1>
        <ul className="mt-8 grid gap-3 border-l-2 border-[var(--site-signal)] pl-4 text-[16px] text-[var(--site-body)]">
          <li>Cek masa aktif dan paket</li>
          <li>Lihat PC yang memakai key ini</li>
          <li>Download installer versi terbaru</li>
        </ul>
      </div>
      <div className="rounded-3xl bg-[var(--site-card)] p-7 md:p-9">
        <BuyerLoginForm />
        <p className="mt-6 text-[14px] text-[var(--site-muted)]">
          Belum punya key? <Link href="/#harga" className="text-[var(--site-body)] underline hover:text-white">Lihat paket</Link>
        </p>
      </div>
    </main>
  );
}
