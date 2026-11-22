import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, KeyRound, QrCode, Smartphone, Wallet } from "lucide-react";
import { rupiah } from "@/lib/format";
import { publicInfo } from "@/lib/license-api";
import { buyHref, featuredId, PlanCard } from "../plans";

export const metadata: Metadata = {
  title: "Harga",
  description: "Paket lisensi Traktiva: semua fitur di setiap paket, bedanya masa aktif dan jumlah PC. Bayar QRIS, key langsung masuk ke akun.",
};

/** Every plan has every feature; the rows below are the same for all of them (only time, PCs and price differ). */
const FEATURES = [
  "Riset produk laris (KaloData)",
  "Sampai 5 versi video per produk",
  "Naskah, voice-over & subtitle otomatis",
  "Editor timeline + musik bebas royalti",
  "Jadwal upload ke TikTok (multi akun)",
  "Analisis akun & jam terbaik posting",
  "Semua update selama masa aktif",
];

const PAY_STEPS = [
  { icon: Wallet, title: "Pilih paket", text: "Masuk atau daftar gratis, lalu pilih paket." },
  { icon: QrCode, title: "Bayar QRIS", text: "Scan dari e-wallet atau m-banking apa pun. Nominal sudah termasuk kode unik kecil." },
  { icon: KeyRound, title: "Key otomatis masuk", text: "Setelah lunas (±1 menit), lisensi + key muncul di akunmu." },
  { icon: Smartphone, title: "Aktifkan di PC", text: "Download app, tempel key saat diminta. Selesai." },
];

const FAQ = [
  ["Apa beda tiap paket?", "Fiturnya sama persis. Yang beda hanya masa aktif, jumlah PC, dan harganya."],
  ["Bisa perpanjang sebelum habis?", "Bisa. Perpanjangan menambah masa aktif dari tanggal habis yang sekarang, jadi tidak ada hari yang hilang."],
  ["Bisa bayar lewat transfer biasa atau WhatsApp?", "Pembayaran online memakai QRIS. Kalau lebih nyaman lewat penjual, hubungi WhatsApp kami; key yang kamu dapat bisa ditautkan ke akun."],
  ["Satu akun boleh punya banyak lisensi?", "Boleh, misalnya untuk beberapa PC atau tim. Semua lisensi dan PC-nya terlihat di halaman Akun."],
];

export default async function Pricing() {
  const info = await publicInfo();
  const plans = info?.plans ?? [];
  const feat = featuredId(plans);
  return (
    <main>
      <section className="mx-auto max-w-6xl px-5 pt-16 pb-12 text-center md:px-8 md:pt-24">
        <p className="rise inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold text-muted-foreground">Harga sederhana · semua fitur di setiap paket</p>
        <h1 style={{ "--i": 1 } as React.CSSProperties} className="rise mx-auto mt-5 max-w-3xl text-3xl leading-tight font-semibold md:text-5xl">
          Bayar sesuai <span className="text-leaf-ink">masa aktif</span>, bukan per fitur.
        </h1>
        <p style={{ "--i": 2 } as React.CSSProperties} className="rise mx-auto mt-6 max-w-2xl text-lg font-medium text-muted-foreground">
          Semua paket bisa riset produk, bikin video, dan menjadwalkan upload. Pilih berapa lama dan di berapa PC kamu mau pakai.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-5 md:px-8">
        {plans.length ? (
          <div className="grid gap-4 pt-4 md:grid-cols-3">
            {plans.map((p) => <PlanCard key={p.id} p={p} href={buyHref(info, p)} featured={p.id === feat} />)}
          </div>
        ) : (
          <p className="text-center text-muted-foreground">Daftar harga sedang dimuat ulang. Coba muat ulang halaman sebentar lagi.</p>
        )}
      </section>

      {plans.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 py-20 md:px-8">
          <h2 className="reveal text-2xl leading-tight font-semibold md:text-3xl">Bandingkan paket</h2>
          <div className="reveal mt-8 overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[40rem] text-left">
              <thead>
                <tr className="border-b">
                  <th className="p-5 text-sm font-semibold text-muted-foreground">Fitur</th>
                  {plans.map((p) => (
                    <th key={p.id} className={`p-5 text-base font-semibold ${p.id === feat ? "text-leaf-ink" : ""}`}>{p.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="p-5 font-semibold">Harga</td>
                  {plans.map((p) => <td key={p.id} className="p-5 text-base font-semibold tabular-nums">{p.price ? rupiah(p.price) : "—"}</td>)}
                </tr>
                <tr>
                  <td className="p-5 font-semibold">Masa aktif</td>
                  {plans.map((p) => <td key={p.id} className="p-5">{p.days ? `${p.days} hari` : "Selamanya"}</td>)}
                </tr>
                <tr>
                  <td className="p-5 font-semibold">Jumlah PC</td>
                  {plans.map((p) => <td key={p.id} className="p-5">{p.devices} PC</td>)}
                </tr>
                {FEATURES.map((f) => (
                  <tr key={f}>
                    <td className="p-5 text-muted-foreground">{f}</td>
                    {plans.map((p) => <td key={p.id} className="p-5"><Check className="size-5 text-leaf-ink" aria-label="Termasuk" /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="border-y bg-card py-20">
        <div className="mx-auto max-w-6xl px-5 md:px-8">
          <h2 className="reveal text-2xl leading-tight font-semibold md:text-3xl">Cara bayar</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {PAY_STEPS.map(({ icon: I, title, text }, i) => (
              <li key={title} className="reveal lift rounded-xl border bg-background p-7">
                <div className="flex items-center justify-between">
                  <span className="grid size-12 place-items-center rounded-lg bg-primary text-primary-foreground"><I className="size-6" /></span>
                  <span className="text-3xl font-semibold text-muted-foreground/30">{i + 1}</span>
                </div>
                <p className="mt-6 text-xl font-bold">{title}</p>
                <p className="mt-2 text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:px-8 lg:grid-cols-[1fr_2fr]">
        <h2 className="text-2xl leading-tight font-semibold md:text-3xl">Soal pembayaran</h2>
        <div className="grid gap-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="reveal group rounded-xl border bg-card px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">
                {q}
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-transform group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="mt-3 leading-relaxed text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="px-5 pb-24 md:px-10">
        <div className="reveal mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 rounded-xl bg-leaf px-8 py-12 text-[#fff] md:px-14">
          <h2 className="max-w-2xl text-2xl leading-tight font-semibold md:text-3xl">Siap bikin video pertamamu?</h2>
          <Link href="/daftar?next=/lisensi" className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#fff] px-6 font-semibold text-[#106e3a] hover:opacity-90">Daftar gratis <ArrowRight className="size-4" /></Link>
        </div>
      </section>
    </main>
  );
}
