import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpen, CalendarClock, Check, CheckCircle2, Cpu, Download, History, KeyRound, Lightbulb, LifeBuoy, MessageCircle, MonitorDown, Rocket,
  ShieldAlert, Timer, UserRoundPlus, Wallet,
} from "lucide-react";
import { fmtDate, licenseState, nowSec } from "@/lib/format";
import { requireMember, waLink } from "@/lib/license-api";
import { KeyBox } from "@/app/(member)/_ui/forms";
import { TIPS } from "@/app/(member)/_ui/tips";
import { PageTitle, Panel } from "@/app/(member)/_ui/ui";

export const metadata: Metadata = { title: "Panduan" };

const NEEDS = ["Windows 10/11 64-bit", "Google Chrome terpasang", "Internet stabil", "Video dibuat di server AI, PC biasa cukup"];

/** Short how-tos for the questions buyers ask most (kept in sync with the desktop app's menus). */
const GUIDES = [
  { icon: Cpu, q: "Ganti PC atau upgrade RAM/disk/motherboard", a: ["Di Ringkasan: tekan Lepas PC pada kartu PC lama (atau Pindah PC pada key-nya untuk melepas semua PC). Bisa 1× per hari per lisensi.", "Buka app di PC baru dan tempel key yang sama.", "Muncul “hardware berubah” setelah upgrade? Lepas PC itu, lalu tempel key lagi. Butuh lebih sering? Hubungi kami."] },
  { icon: UserRoundPlus, q: "Hubungkan akun TikTok", a: ["Di app: Akun Sosial → Tambah akun, lalu login di jendela Chrome yang terbuka.", "Satu akun cukup login di satu PC saja. Login di dua PC sekaligus bisa memicu limit dari TikTok."] },
  { icon: Rocket, q: "Hubungkan akun Google (untuk membuat video)", a: ["Di app: Pengaturan → Akun Google → Tambah akun Google, lalu login.", "Kredit Flow akun itu dipakai untuk gambar & klip. Sisa kredit terlihat di Beranda app."] },
  { icon: CalendarClock, q: "Jadwalkan upload", a: ["Di app: Jadwal Upload → pilih video, akun, dan jam tayang.", "Traktiva memakai fitur Jadwalkan milik TikTok, jadi video tetap tayang walau PC sudah dimatikan.", "TikTok hanya menerima jadwal sampai ±10 hari ke depan; yang lebih jauh menunggu di antrean."] },
  { icon: ShieldAlert, q: "Muncul verifikasi / captcha", a: ["App berhenti dan memberi tahu: selesaikan verifikasinya sendiri di jendela Chrome.", "Kalau sering muncul, kurangi jumlah upload per hari dan beri jarak antar posting."] },
  { icon: Timer, q: "Lisensi habis atau app terkunci", a: ["Buka Lisensi → klik lisensinya → Perpanjang (QRIS), atau lewat WhatsApp.", "Setelah lunas, app terbuka lagi dalam ±5 menit tanpa memasukkan key ulang."] },
  { icon: BookOpen, q: "Key dari penjual (beli lewat WhatsApp)", a: ["Buka Lisensi → Punya key dari penjual?, tempel key TRK-… sekali.", "Setelah itu masa aktif, PC, dan key-nya selalu terlihat di akun ini."] },
];

/** Panduan: the three setup steps (with live progress), the installer + update history, tips, FAQ, contact. */
export default async function Guide() {
  const v = await requireMember();
  const now = nowSec();
  const latest = v.releases[0] ?? v.latest;
  const key = v.licenses.find((l) => licenseState(l, now) === "active");
  const hasPc = v.licenses.some((l) => l.devices.length > 0);
  const steps = [
    {
      icon: Wallet, title: "Dapatkan lisensi", done: v.licenses.length > 0,
      text: "Beli di website (QRIS), key langsung masuk ke akun. Beli lewat WhatsApp? Tautkan key-nya.",
      action: v.licenses.length ? null : <Link href="/lisensi#beli" className="font-semibold text-brand-light hover:underline">Lihat paket →</Link>,
    },
    {
      icon: MonitorDown, title: "Pasang app di PC", done: hasPc,
      text: "Download installer, lalu jalankan di PC Windows. Ikuti langkahnya sampai app terbuka.",
      action: latest ? <a href={latest.url} target="_blank" rel="noreferrer" className="font-semibold text-brand-light hover:underline">Download v{latest.version} →</a> : <a href="#download" className="font-semibold text-brand-light hover:underline">Lihat download →</a>,
    },
    {
      icon: KeyRound, title: "Tempel key & mulai", done: hasPc,
      text: "Saat app pertama dibuka, tempel key. PC langsung aktif dan muncul di Ringkasan.",
      action: null,
    },
  ];
  const current = steps.findIndex((s) => !s.done);
  const wa = waLink(v.site, "Halo, saya butuh bantuan soal Traktiva.");

  return (
    <div className="grid gap-5">
      <PageTitle title="Panduan" sub="Mulai pakai Traktiva dalam 3 langkah, download app, dan jawaban pertanyaan yang sering muncul." />

      {/* 1 · three steps, with progress from the account itself */}
      <section id="langkah" className="scroll-mt-6 rounded-xl border bg-card">
        <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold"><Rocket className="size-4 text-brand-light" /> Mulai dalam 3 langkah</p>
          <span className="ml-auto text-xs text-muted-foreground">{current === -1 ? "Semua langkah selesai" : `Langkah ${current + 1} dari 3`}</span>
        </header>
        <ol className="grid divide-y md:grid-cols-3 md:divide-x md:divide-y-0">
          {steps.map((s, n) => {
            const now = n === current;
            return (
              <li key={s.title} className={`flex flex-col gap-2 p-5 ${now ? "bg-primary/8" : ""}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${s.done ? "bg-primary text-primary-foreground" : now ? "border-2 border-brand-light text-brand-light" : "border text-muted-foreground"}`}>
                    {s.done ? <Check className="size-3.5" strokeWidth={3} /> : n + 1}
                  </span>
                  <p className={`text-[0.8125rem] font-semibold ${s.done ? "text-muted-foreground" : ""}`}>{s.title}</p>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{s.text}</p>
                {n === 2 && key && !s.done && <KeyBox licenseKey={key.key} hint={key.key_hint} compact />}
                {s.action && !s.done && <p className="mt-auto pt-1 text-xs">{s.action}</p>}
              </li>
            );
          })}
        </ol>
      </section>

      {/* 2 · installer | update history (equal height) */}
      <div id="download" className="grid scroll-mt-6 gap-4 lg:grid-cols-2">
        <section className="flex flex-col rounded-xl bg-primary p-6 text-primary-foreground">
          <p className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase opacity-80"><MonitorDown className="size-4" /> Installer Windows</p>
          <h2 className="mt-2 text-xl font-semibold">{latest ? `Traktiva v${latest.version}` : "Segera tersedia"}</h2>
          <p className="mt-1 text-[0.8125rem] opacity-85">
            {latest ? `Dirilis ${fmtDate(latest.created_at)}${latest.mandatory ? " · wajib update" : ""}. Update = jalankan installer terbaru; data & login tetap.` : "Link installer belum tersedia. Hubungi kami untuk link download."}
          </p>
          <ul className="mt-4 grid gap-1.5 text-xs font-medium opacity-90 sm:grid-cols-2">
            {NEEDS.map((n) => <li key={n} className="flex items-start gap-2"><CheckCircle2 className="mt-px size-3.5 shrink-0" /> {n}</li>)}
          </ul>
          {latest && (
            <div className="mt-auto pt-5">
              <a href={latest.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#fff] px-3.5 text-[0.8125rem] font-semibold text-[#106e3a] hover:opacity-90">
                <Download className="size-4" /> Download v{latest.version}
              </a>
            </div>
          )}
        </section>

        <Panel title="Riwayat update" icon={History} desc="App memberi tahu otomatis saat versi baru keluar." bodyClass="max-h-80 divide-y overflow-y-auto">
          {v.releases.length ? (
            v.releases.map((r, n) => (
              <details key={r.version} open={n === 0} className="px-4 py-3">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem]">
                  <span className="font-semibold">v{r.version}</span>
                  {n === 0 && <span className="rounded-full bg-status-ok/12 px-1.5 py-px text-[0.625rem] font-semibold text-status-ok">Terbaru</span>}
                  {!!r.mandatory && <span className="rounded-full bg-destructive/12 px-1.5 py-px text-[0.625rem] font-semibold text-destructive">Wajib</span>}
                  <span className="text-xs text-muted-foreground">{fmtDate(r.created_at)}</span>
                  <a href={r.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"><Download className="size-3.5" /> Installer</a>
                </summary>
                <p className="mt-1.5 text-xs whitespace-pre-line text-muted-foreground">{r.notes || "Tidak ada catatan rilis."}</p>
              </details>
            ))
          ) : (
            <p className="p-4 text-[0.8125rem] text-muted-foreground">Belum ada rilis.</p>
          )}
        </Panel>
      </div>

      {/* 3 · tips | FAQ */}
      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Panel id="tips" title="Tips biar video laris" icon={Lightbulb} bodyClass="divide-y">
          {TIPS.map((t) => <p key={t} className="px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">{t}</p>)}
        </Panel>
        <Panel title="Pertanyaan yang sering muncul" icon={LifeBuoy} desc="Klik pertanyaan untuk membuka langkahnya." bodyClass="divide-y">
          {GUIDES.map(({ icon: I, q, a }) => (
            <details key={q} className="group px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center gap-3 text-[0.8125rem] font-semibold">
                <I className="size-4 shrink-0 text-brand-light" />
                <span className="flex-1">{q}</span>
                <span className="text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <ol className="mt-2 ml-7 grid list-decimal gap-1.5 pl-4 text-xs leading-relaxed text-muted-foreground marker:font-semibold marker:text-brand-light">
                {a.map((x) => <li key={x}>{x}</li>)}
              </ol>
            </details>
          ))}
        </Panel>
      </div>

      {/* 4 · contact */}
      <section className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5">
        <span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground"><MessageCircle className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Masih bingung?</p>
          <p className="text-[0.8125rem] text-muted-foreground">Chat kami di WhatsApp. Sebutkan email akun dan 4 karakter terakhir key supaya cepat dibantu.</p>
        </div>
        {wa && <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[0.8125rem] font-medium text-primary-foreground hover:bg-primary/80">Chat WhatsApp</a>}
      </section>
    </div>
  );
}
