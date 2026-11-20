import type { Metadata } from "next";
import { CalendarClock, Captions, Check, Clapperboard, LayoutGrid, Mic, ShoppingBag, Sparkles, Store } from "lucide-react";
import { rupiah } from "@/lib/format";
import { publicInfo, waLink, type Plan } from "@/lib/license-api";

export const metadata: Metadata = {
  title: { absolute: "Traktiva · Video affiliate TikTok Shop otomatis" },
  description: "App Windows untuk bikin dan menjadwalkan video affiliate TikTok Shop dengan AI: ambil produk dari etalase, buat sampai 5 versi video, jadwalkan upload.",
};

const VERSIONS = [
  { tag: "A", angle: "Hook langsung", tint: "from-[#1b4d36] to-[#0b1f17]" },
  { tag: "B", angle: "Masalah → solusi", tint: "from-[#3a2f1a] to-[#141009]" },
  { tag: "C", angle: "Review jujur", tint: "from-[#1d2f4d] to-[#0a1220]" },
];

/** Hero art (code-native "floating product choreography"): product in → three vertical versions → scheduled. */
function Workflow() {
  return (
    <div className="site-stage relative isolate aspect-[4/5] w-full p-6 sm:aspect-[5/4] md:p-8" aria-hidden>
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_70%_40%,rgb(75_224_138/0.16),transparent_65%)]" />
      {/* input: a showcase product */}
      <div className="absolute top-[6%] left-[6%] w-[70%] rounded-xl sm:w-[46%] bg-white p-3 text-black shadow-2xl">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-black/50 uppercase"><Store className="size-3" /> Etalase TikTok Shop</div>
        <div className="mt-2 flex gap-2.5">
          <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-[#e8f5ee]"><ShoppingBag className="size-5 text-[#106e3a]" /></div>
          <div className="min-w-0 text-[12px] leading-tight">
            <p className="font-semibold">Blender portable 6 mata pisau</p>
            <p className="mt-1 text-black/55">Rp 89.000 · 4,8 ★</p>
          </div>
        </div>
      </div>
      {/* output: three versions */}
      <div className="absolute right-[5%] bottom-[14%] flex gap-2 sm:bottom-[9%] md:gap-3">
        {VERSIONS.map((v, i) => (
          <div key={v.tag} className={`site-float relative aspect-[9/16] w-[76px] overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b sm:w-[86px] md:w-[104px] ${v.tint}`} style={{ animationDelay: `${i * 0.6}s` }}>
            <Clapperboard className="absolute top-1/2 left-1/2 size-6 -translate-1/2 text-white/25" />
            <span className="absolute top-2 left-2 grid size-5 place-items-center rounded-md bg-black/55 text-[10px] font-bold">{v.tag}</span>
            <div className="absolute inset-x-2 bottom-2 space-y-1">
              <div className="h-1 w-3/4 rounded bg-white/70" />
              <div className="h-1 w-1/2 rounded bg-white/40" />
              <p className="pt-1 font-mono text-[8.5px] leading-tight text-[var(--site-signal)] uppercase">{v.angle}</p>
            </div>
          </div>
        ))}
      </div>
      {/* confirmation */}
      <div className="absolute bottom-[4%] left-[6%] flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-[12px] font-semibold text-black shadow-xl">
        <CalendarClock className="size-3.5 text-[#106e3a]" /> 3 video terjadwal · 19.00
      </div>
      <svg className="absolute top-[30%] left-[40%] h-[34%] w-[30%] text-white/25" viewBox="0 0 100 60" fill="none">
        <path d="M2 4 C 40 4, 50 56, 98 56" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
      </svg>
    </div>
  );
}

const STEPS_BRIDGE = ["Ambil produk dari etalase.", "Tulis naskah.", "Bikin videonya.", "Jadwalkan upload."];

const CAPABILITIES = [
  {
    icon: LayoutGrid,
    title: "Satu produk, sampai 5 video berbeda.",
    body: "Pilih produk dari etalase, Traktiva menulis naskah dengan sudut berbeda (hook langsung, masalah → solusi, review jujur, unboxing) lalu membuat semuanya bersamaan.",
    facts: [["Maks 5", "versi per produk"], ["8–10 dtk", "video pendek sekali jadi"]],
  },
  {
    icon: Mic,
    title: "Suara, subtitle, efek. Sudah dipasang.",
    body: "Voice-over AI satu tarikan napas, subtitle 1–2 kata yang pas dengan suara, musik bebas royalti, dan editor timeline kalau mau merapikan sendiri.",
    facts: [["Otomatis", "subtitle dari suara"], ["Editor", "timeline bawaan"]],
  },
  {
    icon: CalendarClock,
    title: "Upload terjadwal. PC yang kerja.",
    body: "Atur jam tayang, Traktiva mengunggah ke akun TikTok kamu lewat Chrome di PC sendiri. Kalau muncul verifikasi, app berhenti dan memberi tahu kamu.",
    facts: [["Chrome", "profil per akun"], ["Jadwal", "per jam & per akun"]],
  },
];

const FAQ = [
  ["Butuh PC seperti apa?", "Windows 10/11 dengan Google Chrome terpasang dan internet stabil. Pembuatan video berjalan di server AI, jadi PC biasa sudah cukup."],
  ["Satu key bisa dipakai di berapa PC?", "Sesuai paket (umumnya 1 PC). Satu akun bisa menyimpan banyak key, misalnya untuk beberapa PC atau tim."],
  ["Aman untuk akun TikTok saya?", "Traktiva memakai Chrome dan akun kamu sendiri dengan jeda wajar, tanpa trik melewati verifikasi. Tetap ada risiko limit dari platform kalau mengunggah terlalu banyak; mulai pelan dan naikkan bertahap."],
  ["Apa yang dibutuhkan selain key?", "Akun TikTok Shop affiliate, akun Google untuk pembuatan video, dan (opsional) kunci suara AI. Semua dipasang dari dalam app."],
  ["Kalau ada update?", "App memberi tahu otomatis saat versi baru tersedia. Link download selalu ada di halaman Akun."],
  ["Ganti PC atau upgrade hardware?", "Key terkunci ke hardware PC (termasuk RAM & disk). Lepas PC lama sendiri dari halaman Akun (1× per 7 hari), lalu aktifkan di PC baru. Lebih dari itu, hubungi kami."],
];

function PlanCard({ p, href }: { p: Plan; href: string | null }) {
  const perks = [`${p.days ? `${p.days} hari` : "Selamanya"} akses penuh`, `${p.devices} PC`, "Semua fitur & update", "Bantuan via WhatsApp"];
  return (
    <div className="flex min-w-[260px] flex-col rounded-3xl bg-[var(--site-card)] p-6 pb-8">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xl font-[450]">{p.label}</p>
        <p className="text-right text-xl font-[450] tabular-nums">{p.price ? rupiah(p.price) : "Hubungi kami"}</p>
      </div>
      <p className="mt-1 text-[15px] text-[var(--site-signal)]">{p.days ? (p.days >= 365 ? "Paling hemat per bulan" : "Coba dulu sebulan") : "Bayar sekali"}</p>
      {href ? (
        <a href={href} {...(href.startsWith("/") ? {} : { target: "_blank", rel: "noreferrer" })} className="site-pill-outline site-sm mt-6 w-full">Beli {p.label}</a>
      ) : (
        <span className="site-pill-outline site-sm mt-6 w-full opacity-50">Segera dibuka</span>
      )}
      <ul className="mt-6 divide-y divide-white/8 text-[15px] text-[var(--site-body)]">
        {perks.map((x) => (
          <li key={x} className="flex items-center gap-2.5 py-2.5"><Check className="size-4 text-[var(--site-signal)]" /> {x}</li>
        ))}
      </ul>
    </div>
  );
}

export default async function Landing() {
  const info = await publicInfo();
  const plans = info?.plans ?? [];
  const buy = (label?: string) => waLink(info?.site, `Halo, saya mau beli lisensi Traktiva${label ? ` paket ${label}` : ""}.`);

  return (
    <main>
      {/* 1 · promise + floating workflow */}
      <section className="mx-auto grid max-w-[1260px] items-center gap-10 px-5 pt-14 pb-20 md:px-8 lg:grid-cols-2 lg:pt-20">
        <div>
          <p className="font-mono text-[12px] tracking-[0.08em] text-[var(--site-signal)] uppercase">App Windows · TikTok Shop affiliate</p>
          <h1 className="mt-5 text-[44px] leading-[1.06] font-light tracking-[-0.03em] md:text-[64px]">Video affiliate jadi sendiri. Kamu tinggal posting.</h1>
          <p className="mt-6 max-w-[460px] text-[19px] leading-[1.4] text-[var(--site-body)]">
            Traktiva mengambil produk dari etalase, menulis naskah, membuat video dengan AI, lalu menjadwalkan upload ke TikTok. Semua dari PC kamu.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#harga" className="site-pill">Beli lisensi</a>
            <a href="#cara-kerja" className="site-pill-outline">Lihat cara kerjanya</a>
          </div>
        </div>
        <Workflow />
      </section>

      {/* 2 · statement bridge */}
      <section className="mx-auto max-w-[1260px] px-5 pb-20 md:px-8">
        <p className="text-[32px] leading-[1.1] font-[330] tracking-[-0.02em] md:text-[52px]">
          {STEPS_BRIDGE.map((s, i) => (
            <span key={s} className={i === 2 ? "text-white" : "text-[#5b6a63]"}>{s} </span>
          ))}
        </p>
      </section>

      {/* 3 · capabilities */}
      <section id="fitur" className="site-chapter scroll-mt-16 bg-[var(--site-pine)] py-20 md:py-28">
        <div className="mx-auto grid max-w-[1260px] gap-6 px-5 md:px-8">
          <h2 className="max-w-3xl text-[36px] leading-[1.08] font-[330] tracking-[-0.03em] md:text-[52px]">Semua pekerjaan konten affiliate, di satu app.</h2>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {CAPABILITIES.map(({ icon: Icon, title, body, facts }) => (
              <article key={title} className="site-stage flex flex-col p-7">
                <Icon className="size-6 text-[var(--site-signal)]" />
                <h3 className="mt-6 text-[24px] leading-[1.15] font-[400] tracking-[-0.01em]">{title}</h3>
                <p className="mt-3 text-[16px] leading-[1.5] text-[var(--site-body)]">{body}</p>
                <dl className="mt-auto grid grid-cols-2 gap-4 pt-8">
                  {facts.map(([k, v]) => (
                    <div key={k} className="border-t border-[var(--site-edge)] pt-3">
                      <dt className="text-[22px] font-light">{k}</dt>
                      <dd className="font-mono text-[11px] tracking-[0.04em] text-[var(--site-signal)] uppercase">{v}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
          <p className="mt-6 max-w-2xl border-l-2 border-[var(--site-signal)] pl-4 text-[16px] text-[var(--site-body)]">
            Ide produk juga ada: riset produk laris dan video terlaris langsung dari data KaloData, lalu jadikan proyek video dengan satu klik.
          </p>
        </div>
      </section>

      {/* 4 · how it works */}
      <section id="cara-kerja" className="scroll-mt-16 bg-[var(--site-pine)] pb-24">
        <div className="mx-auto grid max-w-[1260px] gap-10 px-5 md:px-8 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 className="text-[36px] leading-[1.08] font-[330] tracking-[-0.03em] md:text-[52px]">Mulai dalam tiga langkah.</h2>
            <p className="mt-4 max-w-md text-[17px] text-[var(--site-body)]">Tanpa server sendiri, tanpa setting rumit. Key lisensi mengaktifkan app di PC kamu.</p>
          </div>
          <ol className="divide-y divide-white/15">
            {[
              ["Beli key lisensi", "Pilih paket, bayar lewat WhatsApp, key langsung dikirim."],
              ["Daftar & tambahkan key", "Buat akun pakai email atau Google, masukkan key sekali. Download installer dari halaman Akun."],
              ["Aktifkan, lalu buat video", "Masukkan key saat app pertama dibuka, login TikTok & Google di dalam app, tekan Buat video."],
            ].map(([t, d], i) => (
              <li key={t} className="grid grid-cols-[56px_1fr] gap-2 py-7 first:pt-0">
                <span className="text-[22px] text-[var(--site-signal)] tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <p className="text-[26px] leading-[1.15] font-[330] tracking-[-0.01em] md:text-[32px]">{t}</p>
                  <p className="mt-2 text-[16px] text-[var(--site-body)]">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 5 · pricing */}
      <section id="harga" className="site-chapter scroll-mt-16 bg-[var(--site-canvas)] py-20 md:py-28">
        <div className="mx-auto max-w-[1260px] px-5 md:px-8">
          <h2 className="text-center text-[36px] leading-[1.08] font-[330] tracking-[-0.02em] md:text-[56px]">Pilih paket. Langsung jalan.</h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-[17px] text-[var(--site-body)]">Semua paket berisi fitur lengkap dan update. Bedanya cuma masa aktif.</p>
          {plans.length ? (
            <div className="mt-12 flex snap-x gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible">
              {plans.map((p) => (
                <div key={p.id} className="snap-start"><PlanCard p={p} href={info?.buyOnline && p.price >= 1000 ? `/beli?plan=${p.id}` : buy(p.label)} /></div>
              ))}
            </div>
          ) : (
            <p className="mt-12 text-center text-[var(--site-body)]">Daftar harga sedang dimuat ulang. Coba muat ulang halaman sebentar lagi.</p>
          )}
          {!buy() && plans.length > 0 && <p className="mt-6 text-center text-[13px] text-[var(--site-muted)]">Pembelian dibuka sebentar lagi.</p>}
        </div>
      </section>

      {/* 6 · questions */}
      <section id="faq" className="scroll-mt-16 bg-[var(--site-canvas)] pb-24">
        <div className="mx-auto grid max-w-[1260px] gap-10 px-5 md:px-8 lg:grid-cols-[1fr_2fr]">
          <h2 className="text-[36px] leading-[1.08] font-[330] tracking-[-0.03em] md:text-[44px]">Pertanyaan yang sering muncul</h2>
          <div className="grid gap-2">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group border-b border-white/20 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[20px] leading-[1.3] md:text-[22px]">
                  {q}
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-black transition-transform group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="mt-3 max-w-2xl text-[16px] leading-[1.5] text-[var(--site-body)]">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 7 · closing */}
      <section className="site-chapter bg-[radial-gradient(at_60%_30%,rgb(75_224_138/0.12),transparent_55%),#07100c] py-24 text-center">
        <Sparkles className="mx-auto size-6 text-[var(--site-signal)]" />
        <h2 className="mx-auto mt-5 max-w-3xl px-5 text-[36px] leading-[1.08] font-[330] tracking-[-0.02em] md:text-[60px]">Etalase kamu sudah penuh produk. Saatnya penuh video.</h2>
        <div className="mt-9 flex flex-wrap justify-center gap-3 px-5">
          <a href="#harga" className="site-pill">Beli lisensi</a>
          <a href="/daftar" className="site-pill-outline"><Captions className="size-4" /> Sudah punya key? Daftar</a>
        </div>
      </section>
    </main>
  );
}
