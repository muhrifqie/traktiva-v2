import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { publicInfo } from "@/lib/license-api";
import { FAQ_TOP, FEATURES, STEPS } from "./content";
import { buyHref, featuredId, PlanCard } from "./plans";
import { PlatformGrid, PlatformOrbit } from "./platforms-ui";
import { CtaBand, FaqList, Section, WRAP } from "./_ui";

export const metadata: Metadata = {
  title: { absolute: "Traktiva · Bikin video pakai AI, otomatis" },
  description: "App Windows untuk bikin video dengan AI: naskah, gambar, klip, suara, dan subtitle otomatis, sampai 5 versi sekaligus, lalu jadwalkan upload ke media sosial.",
  alternates: { canonical: "https://traktiva.site/" },
};

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
            <Sparkles className="size-3.5 text-leaf-ink" /> Studio video AI · App Windows
          </p>
          <h1 style={{ "--i": 1 } as React.CSSProperties} className="rise mt-5 max-w-xl text-4xl leading-[1.1] font-semibold md:text-5xl">
            Bikin video pakai AI, <span className="text-leaf-ink">tanpa ribet edit.</span>
          </h1>
          <p style={{ "--i": 2 } as React.CSSProperties} className="rise mt-5 max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">
            Tulis ide atau pilih produk. Traktiva membuat sampai 5 video lengkap dengan naskah, suara, dan subtitle, lalu menjadwalkannya ke media sosialmu.
          </p>
          <div style={{ "--i": 3 } as React.CSSProperties} className="rise mt-8 flex flex-wrap items-center gap-3">
            <Link href="/harga" className="site-pill">Lihat paket <ArrowRight className="size-4" /></Link>
            <Link href="/cara-kerja" className="site-pill-outline">Cara kerjanya</Link>
          </div>
          <ul style={{ "--i": 4 } as React.CSSProperties} className="rise mt-9 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
            {["Sampai 5 versi sekaligus", "Suara & subtitle otomatis", "Jadwal upload otomatis"].map((t) => (
              <li key={t} className="flex items-center gap-2"><Check className="size-4 shrink-0 text-leaf-ink" /> {t}</li>
            ))}
          </ul>
        </div>
        <div style={{ "--i": 2 } as React.CSSProperties} className="rise hidden sm:block">
          <PlatformOrbit />
        </div>
      </section>

      {/* 2 · features */}
      <Section id="fitur" title="Semua kerjaan bikin video, satu app." sub="Dari ide sampai video tayang, tanpa pindah-pindah aplikasi." action={{ href: "/fitur", label: "Semua fitur" }} tint>
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

      {/* 3 · platforms */}
      <Section id="platform" title="Satu video, banyak platform." sub="Sekarang TikTok. Berikutnya Shopee Video, Instagram, YouTube, dan lainnya dari video yang sama." action={{ href: "/platform", label: "Lihat roadmap" }}>
        <PlatformGrid />
      </Section>

      {/* 4 · how it works */}
      <Section id="cara-kerja" title="Dari ide ke video tayang dalam 4 langkah." action={{ href: "/cara-kerja", label: "Lihat detailnya" }} tint>
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

      {/* 5 · pricing */}
      <Section id="harga" title="Pilih paket, langsung jalan." sub="Semua fitur ada di setiap paket. Bedanya cuma masa aktif dan jumlah PC." action={{ href: "/harga", label: "Bandingkan paket" }}>
        {plans.length ? (
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((p) => <PlanCard key={p.id} p={p} href={buyHref(info, p)} featured={p.id === feat} />)}
          </div>
        ) : (
          <p className="text-muted-foreground">Daftar harga sedang dimuat ulang. Coba muat ulang halaman sebentar lagi.</p>
        )}
        <p className="mt-6 text-sm text-muted-foreground">Bayar QRIS dari semua e-wallet & m-banking. Key langsung masuk ke akunmu setelah lunas.</p>
      </Section>

      {/* 6 · faq */}
      <Section id="faq" title="Pertanyaan yang sering muncul" action={{ href: "/faq", label: "Semua pertanyaan" }} tint>
        <FaqList items={FAQ_TOP} />
      </Section>

      <CtaBand />
    </main>
  );
}
