import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, Check, Clapperboard, Heart, MessageCircle, Music2, Share2, ShoppingBag, Store } from "lucide-react";
import { publicInfo } from "@/lib/license-api";
import { FAQ_TOP, FEATURES, STEPS } from "./content";
import { buyHref, featuredId, PlanCard } from "./plans";
import { CtaBand, FaqList, Section, WRAP } from "./_ui";

export const metadata: Metadata = {
  title: { absolute: "Traktiva · Video affiliate TikTok Shop otomatis" },
  description: "App Windows untuk bikin dan menjadwalkan video affiliate TikTok Shop dengan AI: riset produk, sampai 5 versi video per produk, suara & subtitle otomatis, upload terjadwal.",
  alternates: { canonical: "https://traktiva.site/" },
};

/** Hero art: three vertical videos made from one product, in TikTok's frame. Flat colors only, no motion. */
const PHONES = [
  { tag: "A", hook: "Blender 6 mata pisau, 30 detik jadi jus", bg: "bg-[#1f3d1a]", tilt: "-rotate-3 translate-y-4" },
  { tag: "B", hook: "Capek nyuci blender besar? Ini solusinya", bg: "bg-[#106e3a]", tilt: "z-10" },
  { tag: "C", hook: "Review jujur setelah 2 minggu pakai", bg: "bg-[#2b2f2a]", tilt: "rotate-3 translate-y-4" },
];

function Phone({ tag, hook, bg, tilt }: (typeof PHONES)[number]) {
  return (
    <div className={`relative aspect-[9/16] w-[30%] max-w-[12rem] shrink-0 overflow-hidden rounded-[1.4rem] border-4 border-[#0a0b0a] ${bg} ${tilt}`}>
      <Clapperboard className="absolute top-1/2 left-1/2 size-7 -translate-1/2 text-[#fff] opacity-25" />
      <span className="absolute top-3 left-3 rounded-full bg-[#000]/60 px-2 py-0.5 text-[0.625rem] font-semibold text-[#fff]">Versi {tag}</span>
      <div className="absolute right-2 bottom-16 grid gap-3 text-[#fff]/90"><Heart className="size-4" /><MessageCircle className="size-4" /><Share2 className="size-4" /></div>
      <div className="absolute inset-x-3 bottom-3 grid gap-1.5">
        <p className="text-[0.6875rem] leading-tight font-semibold text-[#fff]">{hook}</p>
        <span className="flex w-fit items-center gap-1 rounded-md bg-[#ff9f1c] px-1.5 py-0.5 text-[0.5625rem] font-bold text-black"><ShoppingBag className="size-2.5" /> Cek keranjang</span>
        <span className="flex items-center gap-1 text-[0.5625rem] text-[#fff]/80"><Music2 className="size-2.5" /> suara asli · Traktiva</span>
      </div>
    </div>
  );
}

export default async function Landing() {
  const info = await publicInfo();
  const plans = info?.plans ?? [];
  const feat = featuredId(plans);

  return (
    <main>
      {/* 1 · hero */}
      <section className={`${WRAP} grid items-center gap-12 pt-14 pb-16 lg:grid-cols-[1.1fr_1fr] lg:pt-20`}>
        <div>
          <p className="rise inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            <Store className="size-3.5 text-leaf-ink" /> Untuk affiliate TikTok Shop · App Windows
          </p>
          <h1 style={{ "--i": 1 } as React.CSSProperties} className="rise mt-5 max-w-xl text-4xl leading-[1.1] font-semibold md:text-5xl">
            Video affiliate TikTok Shop, <span className="text-leaf-ink">dibuat otomatis.</span>
          </h1>
          <p style={{ "--i": 2 } as React.CSSProperties} className="rise mt-5 max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">
            Pilih produk dari etalase. Traktiva membuat sampai 5 video lengkap dengan suara dan subtitle, lalu menjadwalkannya ke TikTok.
          </p>
          <div style={{ "--i": 3 } as React.CSSProperties} className="rise mt-8 flex flex-wrap items-center gap-3">
            <Link href="/harga" className="site-pill">Lihat paket <ArrowRight className="size-4" /></Link>
            <Link href="/cara-kerja" className="site-pill-outline">Cara kerjanya</Link>
          </div>
          <ul style={{ "--i": 4 } as React.CSSProperties} className="rise mt-9 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
            {["Sampai 5 versi per produk", "Suara & subtitle otomatis", "Jadwal tayang TikTok"].map((t) => (
              <li key={t} className="flex items-center gap-2"><Check className="size-4 shrink-0 text-leaf-ink" /> {t}</li>
            ))}
          </ul>
        </div>
        <div style={{ "--i": 2 } as React.CSSProperties} className="rise relative hidden items-end justify-center gap-3 rounded-xl border bg-card px-6 pt-10 pb-14 sm:flex md:gap-5" aria-hidden>
          {PHONES.map((p) => <Phone key={p.tag} {...p} />)}
          <div className="absolute -bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-semibold whitespace-nowrap">
            <CalendarClock className="size-4 text-leaf-ink" /> 3 video terjadwal · 19.00
          </div>
        </div>
      </section>

      {/* 2 · features */}
      <Section id="fitur" title="Semua kerjaan konten affiliate, satu app." sub="Dari cari produk sampai video tayang, tanpa pindah-pindah aplikasi." action={{ href: "/fitur", label: "Semua fitur" }} tint>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ id, icon: I, title, short }) => (
            <Link key={id} href={`/fitur#${id}`} className="reveal lift flex flex-col rounded-xl border bg-background p-6">
              <span className="grid size-10 place-items-center rounded-lg bg-muted"><I className="size-5 text-leaf-ink" /></span>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted-foreground">{short}</p>
            </Link>
          ))}
        </div>
      </Section>

      {/* 3 · how it works */}
      <Section id="cara-kerja" title="Dari etalase ke FYP dalam 4 langkah." action={{ href: "/cara-kerja", label: "Lihat detailnya" }}>
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="reveal rounded-xl border bg-card p-6">
              <span className="grid size-8 place-items-center rounded-full bg-leaf text-sm font-semibold text-[#fff]">{i + 1}</span>
              <p className="mt-5 font-semibold">{s.title}</p>
              <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* 4 · pricing */}
      <Section id="harga" title="Pilih paket, langsung jalan." sub="Semua fitur ada di setiap paket. Bedanya cuma masa aktif dan jumlah PC." action={{ href: "/harga", label: "Bandingkan paket" }} tint>
        {plans.length ? (
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((p) => <PlanCard key={p.id} p={p} href={buyHref(info, p)} featured={p.id === feat} />)}
          </div>
        ) : (
          <p className="text-muted-foreground">Daftar harga sedang dimuat ulang. Coba muat ulang halaman sebentar lagi.</p>
        )}
        <p className="mt-6 text-sm text-muted-foreground">Bayar QRIS dari semua e-wallet & m-banking. Key langsung masuk ke akunmu setelah lunas.</p>
      </Section>

      {/* 5 · faq */}
      <Section id="faq" title="Pertanyaan yang sering muncul" action={{ href: "/faq", label: "Semua pertanyaan" }}>
        <FaqList items={FAQ_TOP} />
      </Section>

      <CtaBand />
    </main>
  );
}
