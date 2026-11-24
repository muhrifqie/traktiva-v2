import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { publicInfo, waLink } from "@/lib/license-api";
import { FAQ } from "../content";
import { CtaBand, FaqList, PageHero, WRAP } from "../_ui";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Jawaban soal Traktiva: kebutuhan PC, pembayaran QRIS, lisensi & jumlah PC, ganti PC, dan keamanan akun media sosial.",
  alternates: { canonical: "https://traktiva.site/faq" },
};

export default async function Faq() {
  const info = await publicInfo();
  const wa = waLink(info?.site, "Halo, saya mau tanya soal Traktiva.");
  // FAQPage structured data for search results
  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.flatMap((g) => g.items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } }))),
  };
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <PageHero eyebrow="FAQ" title="Pertanyaan yang sering muncul" sub="Belum ketemu jawabannya? Chat kami di WhatsApp." />
      <div className={`${WRAP} grid gap-10 pb-16 lg:grid-cols-[14rem_1fr]`}>
        <nav aria-label="Topik" className="hidden lg:block">
          <ul className="sticky top-24 grid gap-1 text-sm">
            {FAQ.map((g) => <li key={g.title}><a href={`#${g.title}`} className="block rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">{g.title}</a></li>)}
          </ul>
        </nav>
        <div className="grid gap-10">
          {FAQ.map((g) => (
            <section key={g.title} id={g.title} className="scroll-mt-24">
              <h2 className="mb-4 text-lg font-semibold">{g.title}</h2>
              <FaqList items={g.items} />
            </section>
          ))}
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="flex items-center gap-4 rounded-xl border bg-card p-5 hover:border-foreground/40">
              <MessageCircle className="size-5 text-leaf-ink" />
              <span className="flex-1"><b className="font-semibold">Masih ada pertanyaan?</b> <span className="text-muted-foreground">Chat kami di WhatsApp.</span></span>
            </a>
          )}
        </div>
      </div>
      <CtaBand />
    </main>
  );
}
