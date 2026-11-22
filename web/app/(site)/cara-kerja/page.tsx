import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Download, KeyRound, UserPlus, Wallet } from "lucide-react";
import { NEEDS, STEPS } from "../content";
import { CtaBand, PageHero, Section, WRAP } from "../_ui";

export const metadata: Metadata = {
  title: "Cara kerja",
  description: "Dari etalase TikTok Shop ke video terjadwal dalam 4 langkah, plus cara mulai: daftar, beli lisensi, pasang app, tempel key.",
  alternates: { canonical: "https://traktiva.site/cara-kerja" },
};

const START = [
  { icon: UserPlus, title: "Daftar akun", text: "Gratis, pakai email atau Google." },
  { icon: Wallet, title: "Beli lisensi", text: "Bayar QRIS. Key langsung masuk ke akun." },
  { icon: Download, title: "Pasang app", text: "Download installer dari akun, jalankan di PC." },
  { icon: KeyRound, title: "Tempel key", text: "Saat app pertama dibuka. PC langsung aktif." },
];

export default function HowItWorks() {
  return (
    <main>
      <PageHero eyebrow="Cara kerja" title="Dari etalase ke FYP dalam 4 langkah." sub="Traktiva mengerjakan bagian yang makan waktu: riset, naskah, video, suara, dan jadwal. Kamu tinggal memilih dan merapikan." />

      {/* the daily flow */}
      <div className={`${WRAP} pb-4`}>
        <ol className="grid gap-4 md:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="reveal flex gap-5 rounded-xl border bg-card p-6">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-leaf font-semibold text-[#fff]">{i + 1}</span>
              <div>
                <p className="text-lg font-semibold">{s.title}</p>
                <p className="mt-1.5 leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* getting started + requirements */}
      <Section title="Mulai pakai dalam 10 menit" sub="Sekali saja di awal. Setelah itu tinggal buka app dan bikin video." tint>
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <ol className="grid gap-3 sm:grid-cols-2">
            {START.map(({ icon: I, title, text }, i) => (
              <li key={title} className="flex gap-4 rounded-xl border bg-background p-5">
                <I className="mt-0.5 size-5 shrink-0 text-leaf-ink" />
                <div>
                  <p className="font-semibold"><span className="text-muted-foreground">{i + 1}. </span>{title}</p>
                  <p className="mt-1 text-[0.9375rem] text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="rounded-xl border bg-background p-5">
            <p className="font-semibold">Yang kamu butuhkan</p>
            <ul className="mt-3 grid gap-2.5 text-[0.9375rem] text-muted-foreground">
              {NEEDS.map((n) => <li key={n} className="flex items-start gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-leaf-ink" /> {n}</li>)}
            </ul>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/daftar" className="site-pill">Daftar gratis <ArrowRight className="size-4" /></Link>
          <Link href="/fitur" className="site-pill-outline">Lihat semua fitur</Link>
        </div>
      </Section>

      <div className="h-16" />
      <CtaBand />
    </main>
  );
}
