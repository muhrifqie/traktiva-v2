import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CalendarClock, Cpu, Download, KeyRound, LifeBuoy, MessageCircle, Rocket, ShieldAlert, Timer, UserRoundPlus } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { requireMember, waLink } from "@/lib/license-api";
import { PageTitle, Panel } from "@/app/(member)/_ui/ui";

export const metadata: Metadata = { title: "Bantuan" };

/** Short how-tos for the questions buyers ask most (kept in sync with the desktop app's menus). */
const GUIDES = [
  { icon: KeyRound, q: "Aktivasi pertama di PC", a: ["Download dan jalankan installer Traktiva.", "Saat app pertama dibuka, tempel key dari halaman Lisensi (tombol Salin).", "PC langsung terkunci ke key itu. Jumlah PC per key sesuai paket."] },
  { icon: Cpu, q: "Ganti PC atau upgrade RAM/disk/motherboard", a: ["Buka Lisensi → klik lisensinya → Reset HWID (atau Lepas PC pada PC lama). Bisa 1× per hari per lisensi.", "Aktifkan key di PC baru seperti aktivasi pertama.", "Muncul “hardware berubah” setelah upgrade? Lepas PC itu, lalu aktifkan ulang. Butuh lebih dari 1× seminggu? Hubungi kami."] },
  { icon: UserRoundPlus, q: "Hubungkan akun TikTok", a: ["Di app: Akun Sosial → Tambah akun, lalu login di jendela Chrome yang terbuka.", "Satu akun cukup login di satu PC saja. Login di dua PC sekaligus bisa memicu limit dari TikTok."] },
  { icon: Rocket, q: "Hubungkan akun Google (untuk membuat video)", a: ["Di app: Pengaturan → Akun Google → Tambah akun Google, lalu login.", "Kredit Flow akun itu dipakai untuk gambar & klip. Sisa kredit terlihat di Beranda app."] },
  { icon: CalendarClock, q: "Jadwalkan upload", a: ["Di app: Jadwal Upload → pilih video, akun, dan jam tayang.", "Traktiva memakai fitur Jadwalkan milik TikTok, jadi video tetap tayang walau PC sudah dimatikan.", "TikTok hanya menerima jadwal sampai ±10 hari ke depan; yang lebih jauh menunggu di antrean."] },
  { icon: ShieldAlert, q: "Muncul verifikasi / captcha", a: ["App berhenti dan memberi tahu: selesaikan verifikasinya sendiri di jendela Chrome.", "Kalau sering muncul, kurangi jumlah upload per hari dan beri jarak antar posting."] },
  { icon: Timer, q: "Lisensi habis atau app terkunci", a: ["Perpanjang di halaman Lisensi (QRIS) atau lewat WhatsApp.", "Setelah lunas, app terbuka lagi dalam ±5 menit tanpa perlu memasukkan key ulang."] },
  { icon: BookOpen, q: "Key dari penjual (beli lewat WhatsApp)", a: ["Buka Lisensi → Tautkan key, tempel key TRK-… sekali.", "Setelah itu masa aktif, PC, dan key-nya selalu terlihat di akun ini."] },
];

export default async function Help() {
  const v = await requireMember();
  const r = v.latest;
  const wa = waLink(v.site, "Halo, saya butuh bantuan soal Traktiva.");
  return (
    <div className="grid gap-5">
      <PageTitle title="Bantuan" sub="Download app, panduan singkat, dan cara menghubungi kami." />

      <Link href="/aplikasi" className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5">
        <span className="grid size-12 place-items-center rounded-lg bg-primary text-primary-foreground"><Download className="size-6" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Download app & status update</span>
          <span className="block text-sm text-muted-foreground">{r ? `Versi terbaru v${r.version} · ${fmtDate(r.created_at)}. ` : ""}Installer, versi di setiap PC, dan riwayat update ada di halaman Aplikasi.</span>
        </span>
        <span className="text-sm font-semibold text-brand-light">Buka Aplikasi →</span>
      </Link>

      <Panel title="Panduan singkat" icon={LifeBuoy} desc="Klik pertanyaan untuk membuka langkahnya." bodyClass="divide-y">
        {GUIDES.map(({ icon: I, q, a }) => (
          <details key={q} className="group px-4 py-3.5">
            <summary className="flex cursor-pointer list-none items-center gap-3 font-semibold">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted"><I className="size-[1.1rem] text-brand-light" /></span>
              <span className="flex-1">{q}</span>
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-foreground transition-transform group-open:rotate-45" aria-hidden>+</span>
            </summary>
            <ol className="mt-3 ml-12 grid list-decimal gap-2 pl-4 text-[0.8125rem] text-muted-foreground marker:font-semibold marker:text-brand-light">
              {a.map((x) => <li key={x}>{x}</li>)}
            </ol>
          </details>
        ))}
      </Panel>

      <div className="rise flex flex-wrap items-center gap-5 rounded-xl border bg-card p-6">
        <span className="grid size-12 place-items-center rounded-lg bg-primary text-primary-foreground"><MessageCircle className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">Masih bingung?</p>
          <p className="text-muted-foreground">Chat kami di WhatsApp. Sebutkan email akun dan 4 karakter terakhir key supaya cepat dibantu.</p>
        </div>
        {wa ? (
          <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[0.8125rem] font-medium text-primary-foreground hover:bg-primary/80">Chat WhatsApp</a>
        ) : (
          <Link href="/lisensi" className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[0.8125rem] font-medium hover:bg-muted">Ke Lisensi</Link>
        )}
      </div>
    </div>
  );
}
