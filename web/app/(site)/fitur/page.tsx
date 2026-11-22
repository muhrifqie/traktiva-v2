import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { FEATURES } from "../content";
import { CtaBand, PageHero, WRAP } from "../_ui";

export const metadata: Metadata = {
  title: "Fitur",
  description: "Riset produk laris, sampai 5 video per produk, voice-over & subtitle otomatis, editor timeline, upload terjadwal ke TikTok, dan analisis akun.",
  alternates: { canonical: "https://traktiva.site/fitur" },
};

export default function Features() {
  return (
    <main>
      <PageHero eyebrow="Fitur" title="Semua yang dibutuhkan affiliate video, dalam satu app." sub="Setiap paket mendapat semua fitur di bawah, termasuk update selama masa aktif.">
        <Link href="/harga" className="site-pill">Lihat paket <ArrowRight className="size-4" /></Link>
      </PageHero>

      {/* jump list */}
      <nav aria-label="Daftar fitur" className={`${WRAP} pb-6`}>
        <ul className="flex flex-wrap gap-2">
          {FEATURES.map(({ id, icon: I, title }) => (
            <li key={id}><a href={`#${id}`} className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium hover:border-foreground/40"><I className="size-4 text-leaf-ink" /> {title}</a></li>
          ))}
        </ul>
      </nav>

      <div className={`${WRAP} grid gap-4 pb-20`}>
        {FEATURES.map(({ id, icon: I, title, short, points }, n) => (
          <section key={id} id={id} className="reveal grid scroll-mt-24 gap-6 rounded-xl border bg-card p-6 md:grid-cols-[1fr_1.2fr] md:p-8">
            <div>
              <span className="grid size-11 place-items-center rounded-lg bg-muted"><I className="size-5 text-leaf-ink" /></span>
              <p className="mt-5 text-xs font-semibold text-muted-foreground">0{n + 1}</p>
              <h2 className="mt-1 text-xl font-semibold md:text-2xl">{title}</h2>
              <p className="mt-2 leading-relaxed text-muted-foreground">{short}</p>
            </div>
            <ul className="grid content-center gap-3">
              {points.map((p) => (
                <li key={p} className="flex items-start gap-3 rounded-lg border bg-background px-4 py-3 text-[0.9375rem]">
                  <Check className="mt-0.5 size-4 shrink-0 text-leaf-ink" /> {p}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <CtaBand />
    </main>
  );
}
