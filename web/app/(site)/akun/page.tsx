import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Download, KeyRound, Monitor, ShieldCheck, Timer } from "lucide-react";
import { fmtDate, licenseState, nowSec, STATE_LABEL } from "@/lib/format";
import { myOrders, requireMember } from "@/lib/license-api";
import { ClaimForm } from "./forms";
import { EndingNotice, Notice, ORDER_LABEL, PageTitle, Panel, TONE } from "./ui";

export const metadata: Metadata = { title: "Ringkasan" };

function Stat({ icon: Icon, label, value, hint, warn }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl bg-[var(--site-card)] p-5">
      <p className="flex items-center gap-2 font-mono text-[11px] tracking-[0.06em] text-[var(--site-signal)] uppercase"><Icon className="size-3.5" /> {label}</p>
      <p className={`mt-3 text-[30px] leading-none font-light tabular-nums ${warn ? "text-amber-200" : ""}`}>{value}</p>
      {hint && <p className="mt-2 truncate text-[13px] text-[var(--site-muted)]">{hint}</p>}
    </div>
  );
}

export default async function Overview({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const [v, orders, q] = await Promise.all([requireMember(), myOrders(), searchParams]);
  const u = v.user;
  const now = nowSec();
  const active = v.licenses.filter((l) => licenseState(l, now) === "active");
  const used = active.reduce((n, l) => n + l.used, 0);
  const seats = active.reduce((n, l) => n + l.max_devices, 0);
  const soonest = active.filter((l) => l.expires_at != null).sort((a, b) => a.expires_at! - b.expires_at!)[0];
  const soonestDays = soonest ? Math.max(0, Math.ceil((soonest.expires_at! - now) / 86400)) : null;
  const justPaid = q.order ? orders.find((o) => o.id === q.order) : undefined;
  const steps = [
    { done: v.licenses.length > 0, label: "Tambahkan key lisensi", href: "/akun/lisensi" },
    { done: v.licenses.some((l) => l.devices.length > 0), label: "Pasang app & aktifkan di PC", href: v.latest?.url ?? "/akun/lisensi" },
    { done: !!u.phone, label: "Isi nomor WhatsApp untuk pengingat", href: "/akun/pengaturan#profil" },
    { done: u.totp, label: "Pasang verifikasi 2 langkah", href: "/akun/pengaturan#keamanan" },
  ];
  const left = steps.filter((s) => !s.done).length;

  return (
    <>
      <PageTitle title={`Halo, ${(u.name || u.email.split("@")[0]).split(" ")[0]}`} sub={`Member sejak ${fmtDate(u.created_at)}${u.google ? " · terhubung Google" : ""}`} />

      <div className="grid gap-3 empty:hidden">
        {justPaid && (
          <Notice tone={justPaid.status === "paid" ? "ok" : "info"}>
            {justPaid.status === "paid"
              ? <>Pembayaran diterima. Lisensimu sudah aktif. <Link href="/akun/lisensi" className="underline">Lihat lisensi</Link></>
              : justPaid.status === "pending"
                ? "Pembayaran belum masuk. Kalau sudah bayar, tunggu 1 menit lalu muat ulang halaman ini."
                : `Pesanan ${ORDER_LABEL[justPaid.status][0].toLowerCase()}.`}
          </Notice>
        )}
        {u.isAdmin && !u.totp && (
          <Notice tone="warn" icon={ShieldCheck}>
            Akun admin wajib verifikasi 2 langkah sebelum membuka panel. <Link href="/akun/pengaturan#keamanan" className="underline">Pasang sekarang</Link>
          </Notice>
        )}
        <EndingNotice licenses={v.licenses} now={now} />
        {v.announcements.map((a) => {
          const { icon: Icon, cls } = TONE[a.level];
          return (
            <div key={a.id} className={`flex gap-3 rounded-2xl border bg-white/[0.03] px-4 py-3 text-[15px] ${cls}`}>
              <Icon className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">{a.title}</p>
                {a.body && <p className="mt-0.5 whitespace-pre-line opacity-85">{a.body}</p>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat icon={KeyRound} label="Lisensi aktif" value={`${active.length}`} hint={v.licenses.length > active.length ? `${v.licenses.length - active.length} tidak aktif` : v.licenses.length ? "Semua aktif" : "Belum ada"} />
        <Stat icon={Timer} label="Sisa terdekat" value={soonestDays != null ? `${soonestDays} hari` : active.length ? "∞" : "—"} hint={soonest ? `${soonest.planLabel} · s/d ${fmtDate(soonest.expires_at)}` : active.length ? "Lisensi selamanya" : undefined} warn={soonestDays != null && soonestDays <= 7} />
        <Stat icon={Monitor} label="PC terpakai" value={`${used}/${seats}`} hint={seats > used ? `${seats - used} slot kosong` : seats ? "Semua slot terpakai" : undefined} />
        <Stat icon={ShieldCheck} label="Keamanan" value={u.totp ? "2FA aktif" : "Dasar"} hint={u.totp ? "Kode authenticator saat masuk" : "Pasang 2FA di Pengaturan"} warn={u.isAdmin && !u.totp} />
      </div>

      <div className="mt-6 grid items-start gap-4 xl:grid-cols-[1fr_340px]">
        <Panel title="Lisensi kamu" icon={KeyRound}>
          {v.licenses.length ? (
            <ul className="-my-1 divide-y divide-white/8">
              {v.licenses.map((l) => {
                const state = licenseState(l, now);
                const days = l.expires_at ? Math.max(0, Math.ceil((l.expires_at - now) / 86400)) : null;
                return (
                  <li key={l.id}>
                    <Link href="/akun/lisensi" className="group flex flex-wrap items-center gap-x-4 gap-y-1 py-3.5">
                      <span className={`size-2 rounded-full ${state === "active" ? "bg-[var(--site-signal)]" : "bg-red-300"}`} />
                      <span className="font-medium">{l.planLabel}</span>
                      <span className="font-mono text-[13px] text-[var(--site-muted)]">…{l.key_hint}</span>
                      <span className="ml-auto text-[14px] text-[var(--site-body)] tabular-nums">
                        {state !== "active" ? STATE_LABEL[state] : days == null ? "Selamanya" : `${days} hari lagi`} · {l.used}/{l.max_devices} PC
                      </span>
                      <ArrowRight className="size-4 text-[var(--site-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="grid gap-4">
              <p className="text-[15px] text-[var(--site-body)]">Masukkan key yang kamu terima setelah membeli. Cukup sekali, setelah itu semua lisensi dan PC-nya ada di sini.</p>
              <div className="max-w-md"><ClaimForm /></div>
              <Link href={v.buyOnline ? "/akun/lisensi" : "/#harga"} className="text-[14px] text-[var(--site-body)] underline hover:text-white">Belum punya key? Lihat paket</Link>
            </div>
          )}
        </Panel>

        <div className="grid content-start gap-4">
          {left > 0 && (
            <Panel title="Langkah awal" desc={`${steps.length - left} dari ${steps.length} selesai`}>
              <ol className="-my-1 grid gap-1">
                {steps.map((s) => (
                  <li key={s.label}>
                    <Link href={s.href} className={`flex items-center gap-3 rounded-xl px-2 py-2 text-[14px] hover:bg-white/[0.04] ${s.done ? "text-[var(--site-muted)] line-through" : ""}`}>
                      <span className={`grid size-5 shrink-0 place-items-center rounded-full border ${s.done ? "border-[var(--site-signal)] bg-[var(--site-signal)] text-black" : "border-white/25"}`}>
                        {s.done && <Check className="size-3" strokeWidth={3} />}
                      </span>
                      {s.label}
                    </Link>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
          <Panel title="Download Traktiva" icon={Download} desc={v.latest ? `Versi ${v.latest.version} · ${fmtDate(v.latest.created_at)} · Windows 10/11` : "Link download belum tersedia. Hubungi penjual."}>
            {v.latest && (
              <>
                {v.latest.notes && <p className="mb-4 line-clamp-3 text-[14px] whitespace-pre-line text-[var(--site-body)]">{v.latest.notes}</p>}
                <a href={v.latest.url} target="_blank" rel="noreferrer" className="site-pill site-sm"><Download className="size-4" /> Download v{v.latest.version}</a>
              </>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
