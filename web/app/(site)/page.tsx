import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, BarChart3, CalendarClock, Captions, Clapperboard, Heart, LayoutGrid, MessageCircle, Mic, MonitorSmartphone, Music2, Search,
  Share2, ShieldCheck, ShoppingBag, Sparkles, Store, Users, Wand2,
} from "lucide-react";
import { publicInfo } from "@/lib/license-api";
import { buyHref, featuredId, PlanCard } from "./plans";

export const metadata: Metadata = {
  title: { absolute: "Traktiva · Video affiliate TikTok Shop otomatis" },
  description: "App Windows untuk bikin dan menjadwalkan video affiliate TikTok Shop dengan AI: riset produk, sampai 5 versi video per produk, suara & subtitle otomatis, upload terjadwal.",
};

/** Hero art: three vertical videos made from one product, in TikTok's frame. Flat colors only. */
const PHONES = [
  { tag: "A", hook: "Blender 6 mata pisau, 30 detik jadi jus 😳", bg: "bg-[#1f3d1a]", tilt: "-rotate-6 translate-y-6" },
  { tag: "B", hook: "Capek nyuci blender besar? Ini solusinya", bg: "bg-[#106e3a]", tilt: "z-10 scale-105" },
  { tag: "C", hook: "Review jujur setelah 2 minggu pakai", bg: "bg-[#2b2f2a]", tilt: "rotate-6 translate-y-6" },
];

function Phone({ tag, hook, bg, tilt, i }: (typeof PHONES)[number] & { i: number }) {
  return (
    <div className={`site-float relative aspect-[9/16] w-[30%] max-w-[13rem] shrink-0 overflow-hidden rounded-[1.6rem] border-4 border-[#0a0b0a] shadow-2xl ${bg} ${tilt}`} style={{ animationDelay: `${i * 0.7}s` }}>
      <Clapperboard className="absolute top-1/2 left-1/2 size-8 -translate-1/2 text-[#fff] opacity-25" />
      <span className="absolute top-3 left-3 rounded-full bg-[#000]/60 px-2 py-0.5 text-[0.625rem] font-bold text-[#fff]">Versi {tag}</span>
      <div className="absolute right-2 bottom-16 grid gap-3 text-[#fff]/90 drop-shadow">
        <Heart className="size-4" /><MessageCircle className="size-4" /><Share2 className="size-4" />
      </div>
      <div className="absolute inset-x-3 bottom-3 grid gap-1.5">
        <p className="text-[0.6875rem] leading-tight font-bold text-[#fff] drop-shadow">{hook}</p>
        <span className="flex w-fit items-center gap-1 rounded-md bg-[#ff9f1c] px-1.5 py-0.5 text-[0.5625rem] font-bold text-black"><ShoppingBag className="size-2.5" /> Cek keranjang</span>
        <span className="flex items-center gap-1 text-[0.5625rem] text-[#fff]/80"><Music2 className="size-2.5" /> suara asli · Traktiva</span>
      </div>
    </div>
  );
}

const TICKER = ["Riset produk laris", "Naskah AI", "Sampai 5 versi video", "Voice-over", "Subtitle otomatis", "Musik bebas royalti", "Editor timeline", "Jadwal upload TikTok", "Multi akun"];

const FEATURES = [
  { icon: Search, title: "Riset produk yang lagi laris", text: "Data KaloData langsung di app: produk terlaris, video terlaris, dan kreator top. Satu klik jadi proyek video.", span: "lg:col-span-2" },
  { icon: LayoutGrid, title: "1 produk → 5 video", text: "Hook langsung, masalah → solusi, review jujur, unboxing. Semua dibuat bersamaan.", big: "5×" },
  { icon: Mic, title: "Suara & subtitle jadi", text: "Voice-over AI satu tarikan, subtitle 1–2 kata yang pas dengan suara." },
  { icon: Wand2, title: "Editor timeline bawaan", text: "Potong, ganti musik, efek, dan teks tanpa pindah aplikasi." },
  { icon: ShieldCheck, title: "Akunmu tetap milikmu", text: "Login di Chrome PC kamu sendiri, jeda wajar. Ada verifikasi? App berhenti dan memberi tahu." },
  { icon: CalendarClock, title: "Upload terjadwal ke TikTok", text: "Pakai fitur jadwal TikTok sendiri, jadi tetap tayang walau PC dimatikan. Musik latar opsional.", span: "lg:col-span-3" },
];

const STEPS = [
  ["Pilih produk", "Dari etalase TikTok Shop kamu atau dari riset produk laris."],
  ["AI bikin videonya", "Naskah, gambar, klip, suara, subtitle: sampai 5 versi sekaligus."],
  ["Rapikan kalau mau", "Editor timeline untuk sentuhan akhir, atau langsung pakai."],
  ["Jadwalkan & tayang", "Atur jam tayang per akun, TikTok yang memposting tepat waktu."],
];

const FOR_WHO = [
  { icon: Sparkles, title: "Affiliate pemula", text: "Belum jago edit? Pilih produk, tekan Buat video. Hasilnya siap posting." },
  { icon: MonitorSmartphone, title: "Kreator full-time", text: "Posting rutin tiap hari ke beberapa akun tanpa begadang ngedit." },
  { icon: Users, title: "Tim & agensi", text: "Satu akun website, banyak lisensi & PC. Pantau masa aktif dan PC dari satu tempat." },
];

const FAQ = [
  ["Butuh PC seperti apa?", "Windows 10/11 dengan Google Chrome terpasang dan internet stabil. Pembuatan video berjalan di server AI, jadi PC biasa sudah cukup."],
  ["Bayarnya gimana?", "QRIS dari semua e-wallet & m-banking langsung di website, key otomatis masuk ke akunmu. Bisa juga lewat WhatsApp penjual."],
  ["Satu key bisa dipakai di berapa PC?", "Sesuai paket. Satu akun website bisa menyimpan banyak key, misalnya untuk beberapa PC atau tim."],
  ["Aman untuk akun TikTok saya?", "Traktiva memakai Chrome dan akun kamu sendiri dengan jeda wajar, tanpa trik melewati verifikasi. Tetap ada risiko limit dari platform kalau mengunggah terlalu banyak; mulai pelan dan naikkan bertahap."],
  ["Apa yang dibutuhkan selain key?", "Akun TikTok Shop affiliate dan akun Google untuk pembuatan video. Semua dipasang dari dalam app."],
  ["Ganti PC atau upgrade hardware?", "Tekan Pindah PC atau Lepas PC di akun member (1× per hari), lalu tempel key di PC baru."],
];

export default async function Landing() {
  const info = await publicInfo();
  const plans = info?.plans ?? [];
  const feat = featuredId(plans);

  return (
    <main>
      {/* 1 · hero */}
      <section className="mx-auto grid max-w-[90rem] items-center gap-12 px-5 pt-14 pb-16 md:px-10 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
        <div>
          <p className="rise inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            <Store className="size-3.5 text-leaf-ink" /> Untuk affiliate TikTok Shop · App Windows
          </p>
          <h1 style={{ "--i": 1 } as React.CSSProperties} className="rise mt-5 max-w-2xl text-4xl leading-[1.08] font-semibold md:text-6xl">
            Video affiliate TikTok Shop, <span className="text-leaf-ink">dibuat otomatis.</span>
          </h1>
          <p style={{ "--i": 2 } as React.CSSProperties} className="rise mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Pilih produk dari etalase. Traktiva membuat sampai 5 video lengkap dengan suara dan subtitle, lalu menjadwalkannya ke TikTok.
          </p>
          <div style={{ "--i": 3 } as React.CSSProperties} className="rise mt-8 flex flex-wrap items-center gap-3">
            <Link href="/harga" className="site-pill">Lihat paket <ArrowRight className="size-4" /></Link>
            <a href="#cara-kerja" className="px-2 text-sm font-semibold text-muted-foreground hover:text-foreground">Cara kerjanya →</a>
          </div>
          <ul style={{ "--i": 4 } as React.CSSProperties} className="rise mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-muted-foreground">
            {["Sampai 5 versi per produk", "Suara & subtitle otomatis", "Jadwal tayang TikTok"].map((t) => (
              <li key={t} className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-leaf-ink" /> {t}</li>
            ))}
          </ul>
        </div>
        <div style={{ "--i": 2 } as React.CSSProperties} className="rise relative flex items-end justify-center gap-3 rounded-xl border bg-card px-6 pt-10 pb-14 md:gap-5" aria-hidden>
          {PHONES.map((p, i) => <Phone key={p.tag} {...p} i={i} />)}
          <div className="absolute -bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-background shadow-xl">
            <span className="ping size-2 rounded-full bg-leaf-ink" /> <CalendarClock className="size-4 text-leaf-ink" /> 3 video terjadwal · 19.00
          </div>
        </div>
      </section>

      {/* 2 · ticker */}
      <div className="mt-6 overflow-hidden border-y bg-leaf py-4 text-[#fff]" aria-hidden>
        <div className="marquee flex w-max gap-10 font-display text-2xl font-bold whitespace-nowrap">
          {[...TICKER, ...TICKER].map((t, i) => <span key={i} className="flex items-center gap-10">{t} <span className="opacity-40">✦</span></span>)}
        </div>
      </div>

      {/* 3 · features bento */}
      <section id="fitur" className="mx-auto max-w-[90rem] scroll-mt-20 px-5 py-24 md:px-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 className="reveal max-w-3xl text-4xl leading-none font-bold md:text-5xl">Semua kerjaan konten affiliate. Satu app.</h2>
          <p className="max-w-sm text-muted-foreground">Dari cari produk sampai video tayang, tanpa pindah-pindah aplikasi.</p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: I, title, text, span, big }) => (
            <article key={title} className={`reveal lift group flex min-h-[15rem] flex-col rounded-[1.75rem] border bg-card p-7 ${span ?? ""}`}>
              <div className="flex items-start justify-between">
                <span className="grid size-12 place-items-center rounded-lg bg-muted"><I className="size-6 text-leaf-ink" /></span>
                {big && <span className="font-display text-6xl leading-none font-extrabold text-leaf-ink">{big}</span>}
              </div>
              <h3 className="mt-auto pt-8 text-2xl font-bold">{title}</h3>
              <p className="mt-2 text-muted-foreground">{text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* 4 · how it works */}
      <section id="cara-kerja" className="scroll-mt-20 border-y bg-card py-24">
        <div className="mx-auto max-w-[90rem] px-5 md:px-10">
          <h2 className="text-4xl leading-none font-bold md:text-5xl">Dari etalase ke FYP <span className="text-leaf-ink">dalam 4 langkah.</span></h2>
          <ol className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="reveal lift rounded-xl border bg-background p-7">
                <span className="font-display text-6xl leading-none font-extrabold text-leaf-ink">{String(i + 1).padStart(2, "0")}</span>
                <p className="mt-8 text-xl font-bold">{t}</p>
                <p className="mt-2 text-muted-foreground">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 5 · for who */}
      <section className="mx-auto max-w-[90rem] px-5 py-24 md:px-10">
        <h2 className="text-4xl leading-none font-bold md:text-5xl">Dibuat untuk yang jualan lewat video.</h2>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {FOR_WHO.map(({ icon: I, title, text }) => (
            <div key={title} className="reveal lift rounded-xl border p-7">
              <I className="size-7 text-leaf-ink" />
              <p className="mt-6 text-xl font-bold">{title}</p>
              <p className="mt-2 text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border bg-card p-7">
          <BarChart3 className="size-7 text-leaf-ink" />
          <p className="min-w-0 flex-1 text-lg">
            <b className="font-bold">Analisis akun bawaan:</b> <span className="text-muted-foreground">rata-rata penonton, tren 7 hari, jam terbaik posting, dan saran kapan ganti konten.</span>
          </p>
          <Captions className="size-7 text-leaf-ink" />
        </div>
      </section>

      {/* 6 · pricing */}
      <section id="harga" className="scroll-mt-20 border-t py-24">
        <div className="mx-auto max-w-[90rem] px-5 md:px-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="text-4xl leading-none font-bold md:text-5xl">Pilih paket. Langsung jalan.</h2>
            <Link href="/harga" className="inline-flex items-center gap-2 font-semibold text-leaf-ink hover:underline">Bandingkan paket lengkap <ArrowRight className="size-4" /></Link>
          </div>
          {plans.length ? (
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {plans.map((p) => <PlanCard key={p.id} p={p} href={buyHref(info, p)} featured={p.id === feat} />)}
            </div>
          ) : (
            <p className="mt-12 text-muted-foreground">Daftar harga sedang dimuat ulang. Coba muat ulang halaman sebentar lagi.</p>
          )}
          <p className="mt-6 text-sm text-muted-foreground">Bayar QRIS dari semua e-wallet & m-banking. Key langsung masuk ke akunmu setelah lunas.</p>
        </div>
      </section>

      {/* 7 · faq */}
      <section id="faq" className="mx-auto grid max-w-[90rem] scroll-mt-20 gap-10 px-5 pb-24 md:px-10 lg:grid-cols-[1fr_2fr]">
        <h2 className="text-4xl leading-none font-bold md:text-5xl">Pertanyaan yang sering muncul</h2>
        <div className="grid gap-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="reveal group rounded-xl border bg-card px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">
                {q}
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-leaf text-[#fff] transition-transform group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 8 · closing */}
      <section className="px-5 pb-24 md:px-10">
        <div className="reveal mx-auto max-w-[90rem] rounded-xl bg-leaf px-8 py-16 text-center text-[#fff] md:py-24">
          <h2 className="mx-auto max-w-4xl text-4xl leading-none font-bold md:text-6xl">Produk sudah ada. Tinggal videonya.</h2>
          <p className="mx-auto mt-6 max-w-xl text-lg opacity-75">Daftar gratis, pilih paket, dan buat video pertamamu hari ini.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/harga" className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#fff] px-6 font-semibold text-[#106e3a] hover:opacity-90">Lihat paket <ArrowRight className="size-4" /></Link>
            <Link href="/daftar" className="inline-flex h-12 items-center rounded-lg border border-[#fff]/40 px-6 font-semibold hover:border-[#fff]">Daftar gratis</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
