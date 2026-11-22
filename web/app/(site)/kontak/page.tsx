import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, KeyRound, MessageCircle } from "lucide-react";
import { publicInfo, waLink } from "@/lib/license-api";
import { CtaBand, PageHero, WRAP } from "../_ui";

export const metadata: Metadata = {
  title: "Kontak",
  description: "Hubungi tim Traktiva lewat WhatsApp untuk pembelian, bantuan aktivasi, dan pertanyaan lisensi.",
  alternates: { canonical: "https://traktiva.site/kontak" },
};

export default async function Contact() {
  const info = await publicInfo();
  const wa = waLink(info?.site, "Halo, saya mau tanya soal Traktiva.");
  const cards = [
    { icon: MessageCircle, title: "WhatsApp", text: "Pembelian, bantuan aktivasi, dan pertanyaan lisensi. Sebutkan email akun dan 4 karakter terakhir key supaya cepat dibantu.", href: wa, label: "Chat WhatsApp", external: true },
    { icon: BookOpen, title: "Panduan", text: "Cara pasang app, tempel key, ganti PC, hubungkan akun TikTok & Google, dan jadwal upload.", href: "/bantuan", label: "Buka panduan" },
    { icon: KeyRound, title: "Akun & lisensi", text: "Lihat key, masa aktif, PC yang terpakai, dan perpanjang sendiri dari akun member.", href: "/akun", label: "Masuk ke akun" },
  ];
  return (
    <main>
      <PageHero eyebrow="Kontak" title="Ada yang bisa kami bantu?" sub="Cara tercepat: WhatsApp. Banyak jawaban juga sudah ada di panduan dan FAQ." />
      <div className={`${WRAP} grid gap-4 pb-16 md:grid-cols-3`}>
        {cards.map(({ icon: I, title, text, href, label, external }) => (
          <div key={title} className="flex flex-col rounded-xl border bg-card p-6">
            <I className="size-5 text-leaf-ink" />
            <p className="mt-4 text-lg font-semibold">{title}</p>
            <p className="mt-1.5 flex-1 text-[0.9375rem] leading-relaxed text-muted-foreground">{text}</p>
            {href ? (
              external ? (
                <a href={href} target="_blank" rel="noreferrer" className="site-pill site-sm mt-5 self-start">{label}</a>
              ) : (
                <Link href={href} className="site-pill-outline site-sm mt-5 self-start">{label}</Link>
              )
            ) : (
              <span className="mt-5 text-sm text-muted-foreground">Segera tersedia</span>
            )}
          </div>
        ))}
      </div>
      <p className={`${WRAP} pb-16 text-sm text-muted-foreground`}>
        Pertanyaan umum? Cek <Link href="/faq" className="underline hover:text-foreground">FAQ</Link>. Soal data pribadi, lihat <Link href="/privasi" className="underline hover:text-foreground">Kebijakan Privasi</Link>.
      </p>
      <CtaBand />
    </main>
  );
}
