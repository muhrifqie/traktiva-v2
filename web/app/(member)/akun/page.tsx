import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArrowRight, Check, ChevronRight, Download, KeyRound, Lightbulb, Megaphone, Monitor, Receipt, Timer, Wallet } from "lucide-react";
import { fmtDate, licenseState, nowSec } from "@/lib/format";
import { myActivity, myOrders, requireMember } from "@/lib/license-api";
import { KeyBox, ResetHwidButton } from "@/app/(member)/_ui/forms";
import { ActivityList, daysLeftOf, EndingNotice, Notice, ORDER_LABEL, OrderTable, PageTitle, Panel, resetWaitText, Stat, StateBadge, TONE } from "@/app/(member)/_ui/ui";

export const metadata: Metadata = { title: "Ringkasan" };

const btn = "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold";
const i = (n: number) => ({ "--i": n }) as React.CSSProperties;

/** One tip per day (same for everyone that day), about getting more out of Traktiva. */
const TIPS = [
  "Hook di 3 detik pertama menentukan. Buat 3–5 versi dengan hook berbeda dari produk yang sama, lalu lihat mana yang ditonton paling lama.",
  "Posting di jam ramai: cek kartu \"Jam terbaik\" di Beranda app, lalu jadwalkan video di jam itu.",
  "Produk dengan rating ≥ 4,7 dan terjual ribuan lebih mudah dikonversi. Mulai dari Riset Produk di app.",
  "Jangan upload terlalu banyak sekaligus dari akun baru. Naikkan jumlah posting per hari bertahap.",
  "Subtitle 1–2 kata yang mengikuti suara membuat penonton bertahan lebih lama.",
  "Akun dengan rata-rata penonton di bawah 60 selama seminggu? Ganti sudut konten atau istirahatkan akunnya sebentar.",
  "Ucapkan ajakan \"cek keranjang di bawah\" di akhir video, jangan cuma ditulis.",
];

/** Greeting by the hour in Jakarta (the buyers' time zone). */
function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(new Date()));
  return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam";
}

/**
 * Ringkasan: one column of full-width rows; rows with two cards always have equal heights (no ragged gaps).
 * Order: status + tip → numbers → keys (copy, reset HWID) → activity + news → orders.
 */
export default async function Overview({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const [v, orders, events, q] = await Promise.all([requireMember(), myOrders(), myActivity(), searchParams]);
  const u = v.user;
  const now = nowSec();
  const active = v.licenses.filter((l) => licenseState(l, now) === "active");
  const used = active.reduce((n, l) => n + l.used, 0);
  const seats = active.reduce((n, l) => n + l.max_devices, 0);
  const soonest = active.filter((l) => l.expires_at != null).sort((a, b) => a.expires_at! - b.expires_at!)[0];
  const soonestDays = soonest ? daysLeftOf(soonest, now) : null;
  const justPaid = q.order ? orders.find((o) => o.id === q.order) : undefined;
  const paidLicense = justPaid?.status === "paid" ? v.licenses.find((l) => l.id === justPaid.license_id) : undefined;
  const steps = [
    { done: v.licenses.length > 0, label: "Punya lisensi", href: "/lisensi" },
    { done: v.licenses.some((l) => l.devices.length > 0), label: "Aktif di PC", href: "/aplikasi" },
    { done: !!u.phone, label: "Nomor WhatsApp", href: "/pengaturan#profil" },
  ];
  const news = v.announcements.filter((a) => a.level !== "critical");

  return (
    <div className="grid gap-5">
      <PageTitle title={`${greeting()}, ${(u.name || u.email.split("@")[0]).split(" ")[0]}`} sub={`Member sejak ${fmtDate(u.created_at)}${u.google ? " · terhubung Google" : ""}`}>
        <Link href="/aplikasi" className={`${btn} border hover:border-foreground/40`}><Download className="size-4" /> Download app</Link>
        <Link href="/lisensi#beli" className={`${btn} bg-primary text-primary-foreground hover:opacity-90`}><Wallet className="size-4" /> {v.licenses.length ? "Beli / perpanjang" : "Beli lisensi"}</Link>
      </PageTitle>

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

      {/* 1 · status + tip (equal height) */}
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="rise relative overflow-hidden rounded-xl bg-primary p-7 text-primary-foreground">
          {active.length ? (
            <>
              <p className="text-sm font-semibold opacity-80">{soonest ? `Lisensi ${soonest.planLabel} · key …${soonest.key_hint}` : "Lisensi selamanya"}</p>
              <p className="mt-3 font-display text-6xl leading-none font-bold tabular-nums">
                {soonestDays ?? "∞"}<span className="ml-3 text-2xl font-semibold opacity-80">{soonestDays == null ? "aktif selamanya" : "hari lagi"}</span>
              </p>
              <p className="mt-3 font-medium opacity-80">
                {soonest ? `Berlaku sampai ${fmtDate(soonest.expires_at)}. ` : ""}{active.length} lisensi aktif · {used} dari {seats} PC terpakai.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold opacity-80">Belum ada lisensi aktif</p>
              <p className="mt-3 font-display text-4xl leading-tight font-bold">Mulai bikin video affiliate hari ini.</p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link href="/lisensi#beli" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#fff] px-4 font-bold text-[#106e3a] hover:opacity-90">Beli lisensi <ArrowRight className="size-4" /></Link>
                <Link href="/lisensi#tautkan" className="inline-flex h-10 items-center rounded-lg border border-[#fff]/40 px-4 font-bold hover:border-[#fff]">Punya key? Tautkan</Link>
              </div>
            </>
          )}
          <KeyRound className="pointer-events-none absolute -right-6 -bottom-8 size-44 opacity-10" aria-hidden />
        </div>
        <div style={i(1)} className="rise flex flex-col rounded-xl border bg-card p-7">
          <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Lightbulb className="size-4 text-leaf-ink" /> Tips hari ini</p>
          <p className="mt-3 text-lg leading-snug font-semibold">{TIPS[Math.floor(now / 86400) % TIPS.length]}</p>
          <Link href="/bantuan" className="mt-auto pt-5 text-sm font-semibold text-leaf-ink hover:underline">Panduan lainnya →</Link>
        </div>
      </div>

      {/* 2 · numbers */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={KeyRound} label="Lisensi aktif" value={`${active.length}`} hint={v.licenses.length > active.length ? `${v.licenses.length - active.length} tidak aktif` : v.licenses.length ? "Semua aktif" : "Belum ada"} />
        <Stat icon={Timer} label="Sisa masa aktif terdekat" value={soonestDays != null ? `${soonestDays} hari` : active.length ? "∞" : "—"} hint={soonest ? `${soonest.planLabel} · s/d ${fmtDate(soonest.expires_at)}` : undefined} warn={soonestDays != null && soonestDays <= 7} />
        <Stat icon={Monitor} label="PC terpakai" value={`${used}/${seats}`} hint={seats > used ? `${seats - used} slot kosong` : seats ? "Semua slot terpakai" : undefined} />
        <Stat icon={Wallet} label="Pesanan" value={`${orders.length}`} hint={orders.some((o) => o.status === "pending") ? "Ada yang belum dibayar" : orders.length ? "Semua beres" : "Belum ada"} warn={orders.some((o) => o.status === "pending")} />
      </div>

      {/* setup progress, only until done: one tidy strip */}
      {steps.some((s) => !s.done) && (
        <div className="rise grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
          {steps.map((s, n) => (
            <Link key={s.label} href={s.href} className="flex items-center gap-3 bg-card px-4 py-3.5 text-sm hover:bg-muted/50">
              <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${s.done ? "bg-primary text-primary-foreground" : "border text-muted-foreground"}`}>
                {s.done ? <Check className="size-3.5" strokeWidth={3} /> : n + 1}
              </span>
              <span className={`font-semibold ${s.done ? "text-muted-foreground line-through" : ""}`}>{s.label}</span>
            </Link>
          ))}
        </div>
      )}

      {/* 3 · keys: copy straight from here, reset HWID for a new PC */}
      <Panel title="Key lisensi" icon={KeyRound} desc="Tempel key di app Traktiva saat diminta. Ganti PC? Tekan Reset HWID (1× per hari per lisensi), lalu aktifkan di PC baru." action={<Link href="/lisensi" className="text-xs font-semibold text-muted-foreground hover:text-foreground">Kelola lisensi →</Link>} bodyClass="">
        {v.licenses.length ? (
          <ul className="divide-y">
            {v.licenses.map((l) => {
              const days = daysLeftOf(l, now);
              return (
                <li key={l.id} className="grid items-center gap-4 px-4 py-4 lg:grid-cols-[14rem_minmax(0,1fr)_9rem_auto]">
                  <div className="flex flex-wrap items-center gap-2">
                    <StateBadge state={licenseState(l, now)} />
                    <span className="font-semibold">{l.planLabel}</span>
                    <span className={`text-sm tabular-nums ${days != null && days <= 7 ? "font-semibold text-amber-600 dark:text-amber-300" : "text-muted-foreground"}`}>
                      {days == null ? "selamanya" : `${days} hari lagi`}
                    </span>
                  </div>
                  <KeyBox licenseKey={l.key} hint={l.key_hint} compact />
                  <span className="text-sm text-muted-foreground tabular-nums"><Monitor className="mr-1.5 inline size-4" />{l.used}/{l.max_devices} PC</span>
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
        ) : (
          <div className="flex flex-wrap items-center gap-3 p-4 text-sm text-muted-foreground">
            Belum ada lisensi. Beli di website (key otomatis muncul di sini) atau tautkan key dari penjual.
            <Link href="/lisensi" className={`${btn} ml-auto bg-primary text-primary-foreground hover:opacity-90`}>Ke Lisensi</Link>
          </div>
        )}
      </Panel>

      {/* 4 · activity + news (equal height) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="flex flex-col" title="Aktivitas terbaru" icon={Activity} action={events.length > 5 ? <Link href="/aktivitas" className="text-xs font-semibold text-muted-foreground hover:text-foreground">Semua →</Link> : undefined} bodyClass="flex-1">
          <ActivityList events={events.slice(0, 5)} />
        </Panel>
        <Panel className="flex flex-col" title="Kabar terbaru" icon={Megaphone} bodyClass="flex-1 divide-y">
          {news.map((a) => {
            const { icon: I } = TONE[a.level];
            return (
              <div key={a.id} className="flex gap-2.5 px-4 py-3 text-sm">
                <I className="mt-0.5 size-4 shrink-0 text-leaf-ink" />
                <div><p className="font-semibold">{a.title}</p>{a.body && <p className="mt-0.5 whitespace-pre-line text-muted-foreground">{a.body}</p>}</div>
              </div>
            );
          })}
          {v.latest ? (
            <div className="px-4 py-3 text-sm">
              <p className="flex items-center gap-2 font-semibold"><Download className="size-4 text-leaf-ink" /> Traktiva v{v.latest.version} <span className="font-normal text-muted-foreground">· {fmtDate(v.latest.created_at)}</span></p>
              {v.latest.notes && <p className="mt-1 line-clamp-4 whitespace-pre-line text-muted-foreground">{v.latest.notes}</p>}
              <Link href="/aplikasi" className="mt-2 inline-block text-xs font-semibold text-muted-foreground underline hover:text-foreground">Download & cara pasang</Link>
            </div>
          ) : (
            !news.length && <p className="px-4 py-3 text-sm text-muted-foreground">Belum ada kabar baru.</p>
          )}
        </Panel>
      </div>

      {/* 5 · orders, only when there are any */}
      {orders.length > 0 && (
        <Panel title="Pesanan terakhir" icon={Receipt} action={<Link href="/pesanan" className="text-xs font-semibold text-muted-foreground hover:text-foreground">Semua →</Link>} bodyClass="">
          <OrderTable orders={orders.slice(0, 5)} plans={v.plans} />
        </Panel>
      )}
    </div>
  );
}
