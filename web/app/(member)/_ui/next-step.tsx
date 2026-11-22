import Link from "next/link";
import { ArrowRight, Check, Download, KeyRound, MessageCircle, PartyPopper, RefreshCw, Timer, Wallet } from "lucide-react";
import { licenseState } from "@/lib/format";
import type { MemberView } from "@/lib/license-api";
import { appStatus } from "@/lib/version";
import { KeyBox } from "./forms";
import { daysLeftOf } from "./ui";

type Step = {
  icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  text: string;
  actions: { href: string; label: string; external?: boolean; primary?: boolean }[];
  keyFor?: MemberView["licenses"][number];
};

/** The three things every buyer goes through; the Ringkasan card and the Panduan page show the same progress. */
export function progressOf(v: MemberView) {
  return [
    { label: "Punya lisensi", done: v.licenses.length > 0 },
    { label: "Aktif di PC", done: v.licenses.some((l) => l.devices.length > 0) },
    { label: "Nomor WhatsApp", done: !!v.user.phone },
  ];
}

/** The single most useful thing to do now, in priority order. */
function nextStep(v: MemberView, now: number): Step {
  const live = v.licenses.filter((l) => l.status !== "revoked");
  const latest = v.releases[0] ?? v.latest;
  const download = latest ? { href: latest.url, label: `Download app v${latest.version}`, external: true, primary: true } : { href: "/bantuan#download", label: "Download app", primary: true };

  if (!live.length)
    return {
      icon: Wallet, eyebrow: "Langkah 1 · Dapatkan lisensi", title: "Beli lisensi untuk mulai",
      text: "Bayar QRIS di website, key langsung masuk ke akun ini. Sudah beli lewat WhatsApp? Tautkan key dari penjual.",
      actions: [{ href: "/lisensi#beli", label: "Lihat paket", primary: true }, { href: "/lisensi#tautkan", label: "Punya key dari penjual" }],
    };

  const expiring = live
    .map((l) => ({ l, days: daysLeftOf(l, now) }))
    .filter(({ days }) => days != null && days <= 7)
    .sort((a, b) => a.days! - b.days!)[0];
  if (expiring)
    return {
      icon: Timer, eyebrow: "Perlu perhatian", title: expiring.days ? `Lisensi ${expiring.l.planLabel} habis ${expiring.days} hari lagi` : `Lisensi ${expiring.l.planLabel} sudah habis`,
      text: "Perpanjang sekarang supaya app tidak terkunci. Setelah lunas, app terbuka lagi sendiri dalam ±5 menit, tanpa memasukkan key ulang.",
      actions: [{ href: `/lisensi/${expiring.l.id}`, label: "Perpanjang", primary: true }],
    };

  const usable = live.find((l) => licenseState(l, now) === "active");
  if (usable && !live.some((l) => l.devices.length))
    return {
      icon: KeyRound, eyebrow: "Langkah 2 · Pasang di PC", title: "Pasang app, lalu tempel key ini",
      text: "Download dan jalankan installer di PC Windows. Saat app pertama dibuka, tempel key di bawah. Selesai.",
      actions: [download, { href: "/bantuan", label: "Lihat panduan" }],
      keyFor: usable,
    };

  const pcs = live.flatMap((l) => l.devices);
  const outdated = pcs.filter((d) => appStatus(d.app_version, v.releases) === "required").length;
  if (outdated)
    return {
      icon: RefreshCw, eyebrow: "Perlu perhatian", title: `Update app di ${outdated} PC`,
      text: "Versi app di PC itu sudah tidak didukung. Jalankan installer terbaru di sana; data dan login tetap aman.",
      actions: [download],
    };

  if (!v.user.phone)
    return {
      icon: MessageCircle, eyebrow: "Langkah 3 · Pengingat", title: "Isi nomor WhatsApp",
      text: "Kami kirim pengingat sebelum lisensi habis, supaya app tidak tiba-tiba terkunci saat kamu sedang upload.",
      actions: [{ href: "/pengaturan#profil", label: "Isi nomor", primary: true }],
    };

  const free = live.reduce((n, l) => n + Math.max(0, l.max_devices - l.used), 0);
  return {
    icon: PartyPopper, eyebrow: "Semua beres", title: "Traktiva siap dipakai",
    text: free ? `Masih ada ${free} slot PC kosong. Mau pakai di PC lain? Pasang app di sana lalu tempel key yang sama.` : "Lisensi aktif dan app sudah terpasang. Cek panduan untuk tips video yang laris.",
    actions: [{ href: "/bantuan#tips", label: "Tips & panduan", primary: true }, { href: "/lisensi", label: "Lisensi" }],
  };
}

const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[0.8125rem] font-semibold";

/** Ringkasan's main card: what to do next + progress through the three setup steps. */
export function NextStepCard({ v, now }: { v: MemberView; now: number }) {
  const s = nextStep(v, now);
  const steps = progressOf(v);
  const I = s.icon;
  return (
    <section className="flex flex-col rounded-xl bg-primary p-6 text-primary-foreground">
      <p className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase opacity-80"><I className="size-4" /> {s.eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold">{s.title}</h2>
      <p className="mt-1.5 max-w-xl text-[0.8125rem] leading-relaxed opacity-85">{s.text}</p>
      {s.keyFor && (
        <div className="mt-4 max-w-xl rounded-lg bg-card p-1.5 text-card-foreground">
          <KeyBox licenseKey={s.keyFor.key} hint={s.keyFor.key_hint} compact />
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        {s.actions.map((a) => {
          const cls = `${btn} ${a.primary ? "bg-[#fff] text-[#106e3a] hover:opacity-90" : "border border-[#fff]/40 hover:border-[#fff]"}`;
          const inner = <>{a.external && <Download className="size-4" />}{a.label}{a.primary && !a.external && <ArrowRight className="size-4" />}</>;
          return a.external
            ? <a key={a.href} href={a.href} target="_blank" rel="noreferrer" className={cls}>{inner}</a>
            : <Link key={a.href} href={a.href} className={cls}>{inner}</Link>;
        })}
      </div>
      {steps.some((x) => !x.done) && (
        <ol className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#fff]/20 pt-4 text-xs font-medium">
          {steps.map((x, n) => (
            <li key={x.label} className={`flex items-center gap-1.5 ${x.done ? "opacity-70" : ""}`}>
              <span className={`grid size-5 place-items-center rounded-full text-[0.6875rem] font-bold ${x.done ? "bg-[#fff] text-[#106e3a]" : "border border-[#fff]/50"}`}>
                {x.done ? <Check className="size-3" strokeWidth={3} /> : n + 1}
              </span>
              {x.label}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
