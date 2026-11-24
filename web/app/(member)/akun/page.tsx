import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Download, KeyRound, Megaphone, Monitor, Timer } from "lucide-react";
import { fmtDate, licenseState, nowSec } from "@/lib/format";
import { myOrders, requireMember } from "@/lib/license-api";
import { Hint } from "@/components/kit";
import { KeyBox, ResetHwidButton } from "@/app/(member)/_ui/forms";
import { NextStepCard } from "@/app/(member)/_ui/next-step";
import { PcSection } from "@/app/(member)/_ui/pc-cards";
import { daysLeftOf, EndingNotice, Notice, ORDER_LABEL, PageTitle, Panel, resetWaitText, StateBadge, TONE } from "@/app/(member)/_ui/ui";

export const metadata: Metadata = { title: "Ringkasan" };

/** Greeting by the hour in Jakarta (the buyers' time zone). */
function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(new Date()));
  return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam";
}

/** One row of the status card. */
function StatusRow({ icon: I, label, hint, value, warn }: { icon: React.ComponentType<{ className?: string }>; label: string; hint: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <I className="size-4 shrink-0 text-brand-light" />
      <span className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">{label} <Hint>{hint}</Hint></span>
      <span className={`ml-auto text-lg font-semibold tabular-nums ${warn ? "text-amber-600 dark:text-amber-300" : ""}`}>{value}</span>
    </div>
  );
}

/**
 * Ringkasan: what to do next + status → my PCs → the keys (copy, move to another PC) → news.
 * Orders and activity live on their own pages.
 */
export default async function Overview({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const [v, orders, q] = await Promise.all([requireMember(), myOrders(), searchParams]);
  const u = v.user;
  const now = nowSec();
  const active = v.licenses.filter((l) => licenseState(l, now) === "active");
  const used = active.reduce((n, l) => n + l.used, 0);
  const seats = active.reduce((n, l) => n + l.max_devices, 0);
  const soonest = active.filter((l) => l.expires_at != null).sort((a, b) => a.expires_at! - b.expires_at!)[0];
  const soonestDays = soonest ? daysLeftOf(soonest, now) : null;
  const justPaid = q.order ? orders.find((o) => o.id === q.order) : undefined;
  const paidLicense = justPaid?.status === "paid" ? v.licenses.find((l) => l.id === justPaid.license_id) : undefined;
  const news = v.announcements.filter((a) => a.level !== "critical");

  return (
    <div className="grid gap-5">
      <PageTitle title={`${greeting()}, ${(u.name || u.email.split("@")[0]).split(" ")[0]}`} sub={`Member sejak ${fmtDate(u.created_at)}${u.google ? " · terhubung Google" : ""}`} />

      {/* alerts (only when there is something to say) */}
      <div className="-mt-1 grid gap-2 empty:hidden">
        {justPaid && (
          <Notice tone={justPaid.status === "paid" ? "ok" : "info"}>
            {justPaid.status === "paid"
              ? `Pembayaran diterima. Lisensi ${paidLicense?.planLabel ?? ""} sudah aktif, key-nya ada di bawah.`
              : justPaid.status === "pending"
                ? "Pembayaran belum masuk. Kalau sudah bayar, tunggu ±1 menit lalu muat ulang halaman ini."
                : `Pesanan ${ORDER_LABEL[justPaid.status][0].toLowerCase()}.`}
          </Notice>
        )}
        <EndingNotice licenses={v.licenses} now={now} />
        {v.announcements.filter((a) => a.level === "critical").map((a) => (
          <Notice key={a.id} tone="bad" icon={Megaphone}><b>{a.title}</b>{a.body && <> · {a.body}</>}</Notice>
        ))}
      </div>

      {/* 1 · next step | status (equal height) */}
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <NextStepCard v={v} now={now} />
        <section className="grid grid-rows-3 divide-y rounded-xl border bg-card">
          <StatusRow icon={KeyRound} label="Lisensi aktif" hint="Lisensi yang masih berlaku. Lisensi yang habis atau dicabut tidak dihitung." value={`${active.length}`} />
          <StatusRow
            icon={Timer}
            label="Sisa masa aktif"
            hint="Dari lisensi yang paling cepat habis. Perpanjang sebelum habis supaya app tidak terkunci."
            value={soonestDays != null ? `${soonestDays} hari` : active.length ? "Selamanya" : "—"}
            warn={soonestDays != null && soonestDays <= 7}
          />
          <StatusRow icon={Monitor} label="PC terpakai" hint="Satu key bisa dipakai di beberapa PC sesuai paket. Ganti PC? Tekan Pindah PC, lalu tempel key di PC baru." value={seats ? `${used} dari ${seats}` : "—"} />
        </section>
      </div>

      {/* 2 · my PCs */}
      <PcSection v={v} now={now} />

      {/* 3 · keys: copy straight from here, move to another PC */}
      {v.licenses.length > 0 && (
        <Panel
          title="Key lisensi"
          icon={KeyRound}
          desc="Tempel key ini di app Traktiva saat diminta."
          action={<Link href="/lisensi" className="text-xs font-semibold text-muted-foreground hover:text-foreground">Lisensi →</Link>}
          bodyClass=""
        >
          <ul className="divide-y">
            {v.licenses.map((l) => {
              const days = daysLeftOf(l, now);
              return (
                <li key={l.id} className="grid items-center gap-3 px-4 py-3.5 lg:grid-cols-[13rem_minmax(0,1fr)_6rem_auto]">
                  <div className="flex flex-wrap items-center gap-2">
                    <StateBadge state={licenseState(l, now)} />
                    <span className="text-[0.8125rem] font-semibold">{l.planLabel}</span>
                    <span className={`text-xs tabular-nums ${days != null && days <= 7 ? "font-semibold text-amber-600 dark:text-amber-300" : "text-muted-foreground"}`}>
                      {days == null ? "selamanya" : `${days} hari lagi`}
                    </span>
                  </div>
                  <KeyBox licenseKey={l.key} hint={l.key_hint} compact />
                  <span className="text-xs text-muted-foreground tabular-nums"><Monitor className="mr-1 inline size-3.5" />{l.used}/{l.max_devices} PC</span>
                  <div className="flex items-center gap-2 lg:justify-end">
                    <ResetHwidButton licenseId={l.id} pcs={l.devices.length} waitText={resetWaitText(l, now)} />
                    <Link href={`/lisensi/${l.id}`} aria-label={`Detail lisensi ${l.planLabel}`} className="grid size-8 place-items-center rounded-lg border text-muted-foreground hover:text-foreground">
                      <ChevronRight className="size-4" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {/* 4 · news, only when there is any */}
      {(news.length > 0 || v.latest) && (
        <Panel title="Kabar terbaru" icon={Megaphone} bodyClass="divide-y">
          {news.map((a) => {
            const { icon: I } = TONE[a.level];
            return (
              <div key={a.id} className="flex gap-2.5 px-4 py-3 text-[0.8125rem]">
                <I className="mt-0.5 size-4 shrink-0 text-brand-light" />
                <div><p className="font-semibold">{a.title}</p>{a.body && <p className="mt-0.5 whitespace-pre-line text-muted-foreground">{a.body}</p>}</div>
              </div>
            );
          })}
          {v.latest && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[0.8125rem]">
              <Download className="size-4 text-brand-light" />
              <span className="font-semibold">Traktiva v{v.latest.version}</span>
              <span className="text-muted-foreground">rilis {fmtDate(v.latest.created_at)}</span>
              <Link href="/bantuan#download" className="ml-auto text-xs font-semibold text-muted-foreground hover:text-foreground">Download & catatan rilis →</Link>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
