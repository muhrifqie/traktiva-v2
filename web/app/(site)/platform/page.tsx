import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { publicInfo, waLink } from "@/lib/license-api";
import { PLATFORM_STATUS, PLATFORMS, type PlatformStatus } from "@/lib/platforms";
import { PlatformIcon } from "../platforms-ui";
import { CtaBand, PageHero, WRAP } from "../_ui";

export const metadata: Metadata = {
  title: "Platform",
  description: "Platform yang didukung Traktiva: TikTok sekarang, Shopee Video segera, lalu Instagram, Facebook, YouTube Shorts, dan lainnya.",
  alternates: { canonical: "https://traktiva.site/platform" },
};

const GROUPS: { status: PlatformStatus; title: string; text: string }[] = [
  { status: "aktif", title: "Sudah bisa dipakai", text: "Ada di app sekarang, untuk semua paket." },
  { status: "segera", title: "Sedang dikerjakan", text: "Masuk ke app lewat update; pemilik lisensi aktif dapat otomatis." },
  { status: "rencana", title: "Direncanakan", text: "Urutan bisa berubah sesuai permintaan pengguna." },
];

/** Roadmap per platform, from the one list in lib/platforms.ts. */
export default async function Platforms() {
  const info = await publicInfo();
  const wa = waLink(info?.site, "Halo, saya mau usul platform untuk Traktiva: ");
  return (
    <main>
      <PageHero eyebrow="Platform" title="Satu video, banyak platform." sub="Buat videonya sekali di Traktiva, tayangkan di tempat pembelimu berada. Ini status tiap platform saat ini." />
      <div className={`${WRAP} grid gap-10 pb-16`}>
        {GROUPS.map((g) => {
          const list = PLATFORMS.filter((p) => p.status === g.status);
          if (!list.length) return null;
          return (
            <section key={g.status}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-lg font-semibold">{g.title}</h2>
                <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${PLATFORM_STATUS[g.status].cls}`}>{list.length} platform</span>
                <p className="w-full text-sm text-muted-foreground">{g.text}</p>
              </div>
              <ul className={`mt-4 grid gap-3 ${g.status === "rencana" ? "sm:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2"}`}>
                {list.map((p) => (
                  <li key={p.id} className={`flex items-center gap-4 rounded-xl border p-5 ${g.status === "rencana" ? "" : "bg-card"}`}>
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-muted"><PlatformIcon p={p} className="size-6" /></span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{p.name}</span>
                      <span className="block text-sm text-muted-foreground">{p.note}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" className="flex items-center gap-4 rounded-xl border bg-card p-5 hover:border-foreground/40">
            <MessageCircle className="size-5 text-leaf-ink" />
            <span className="flex-1"><b className="font-semibold">Platform yang kamu butuhkan belum ada?</b> <span className="text-muted-foreground">Usulkan lewat WhatsApp; permintaan terbanyak dikerjakan duluan.</span></span>
          </a>
        )}
        <p className="text-xs text-muted-foreground">Nama dan logo platform milik pemiliknya masing-masing. Traktiva tidak berafiliasi dengan platform tersebut.</p>
      </div>
      <CtaBand />
    </main>
  );
}
