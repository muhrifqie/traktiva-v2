import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, KeyRound, Link2, MonitorDown, ShoppingCart, Wallet } from "lucide-react";
import { fmtDate, licenseState, nowSec, rupiah } from "@/lib/format";
import { requireMember, waLink } from "@/lib/license-api";
import { BuyButton, ClaimForm } from "@/app/(member)/_ui/forms";
import { DataTable, daysLeftOf, EmptyState, EndingNotice, PageTitle, Panel, StateBadge } from "@/app/(member)/_ui/ui";

export const metadata: Metadata = { title: "Lisensi & PC" };

/** How a key gets here and where it is used: the three ways, side by side (they were easy to mix up). */
const WAYS = [
  { icon: ShoppingCart, title: "Beli di website", text: "Bayar QRIS, lisensi + key langsung masuk ke akun ini. Tidak perlu ditautkan." },
  { icon: Link2, title: "Beli lewat WhatsApp / penjual", text: "Kamu dapat key TRK-…. Tautkan sekali di bawah supaya masa aktif & PC-nya terlihat di sini." },
  { icon: MonitorDown, title: "Pakai di PC", text: "Buka app Traktiva di PC, tempel key saat diminta. Satu key = jumlah PC sesuai paket." },
];

export default async function Licenses() {
  const v = await requireMember();
  const now = nowSec();
  const buyable = v.buyOnline ? v.plans.filter((p) => p.price >= 1000) : [];
  const wa = waLink(v.site, "Halo, saya mau beli lisensi Traktiva.");

  return (
    <div className="grid gap-5">
      <PageTitle title="Lisensi & PC" sub="Key, masa aktif, dan PC yang terkunci ke tiap lisensi." />
      <div className="empty:hidden"><EndingNotice licenses={v.licenses} now={now} /></div>

      <div className="grid gap-4 md:grid-cols-3">
        {WAYS.map(({ icon: I, title, text }) => (
          <div key={title} className="rise flex gap-3 rounded-xl border bg-card p-4">
            <I className="mt-0.5 size-5 shrink-0 text-brand-light" />
            <div>
              <p className="text-[0.8125rem] font-semibold">{title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{text}</p>
            </div>
          </div>
        ))}
      </div>

      {v.licenses.length ? (
          <Panel title={`${v.licenses.length} lisensi`} icon={KeyRound} desc="Klik baris untuk melihat key, PC, riwayat, dan pembayaran." bodyClass="">
            <DataTable head={["Lisensi", "Key", "Sisa masa aktif", "Berlaku sampai", "PC", ""]}>
              {v.licenses.map((l) => {
                const days = daysLeftOf(l, now);
                return (
                  <tr key={l.id} className="relative hover:bg-muted/40">
                    <td>
                      <Link href={`/lisensi/${l.id}`} className="flex items-center gap-2.5 after:absolute after:inset-0">
                        <StateBadge state={licenseState(l, now)} />
                        <span className="font-medium">{l.planLabel}</span>
                        {l.role === "admin" && <span className="rounded-full bg-amber-500/12 px-1.5 text-[0.625rem] font-semibold text-amber-600 dark:text-amber-300">Admin</span>}
                      </Link>
                    </td>
                    <td className="font-mono text-xs text-muted-foreground">TRK-…-{l.key_hint}</td>
                    <td className={`tabular-nums ${days != null && days <= 7 ? "font-medium text-amber-600 dark:text-amber-300" : ""}`}>{days == null ? "Selamanya" : `${days} hari`}</td>
                    <td className="whitespace-nowrap text-muted-foreground">{fmtDate(l.expires_at)}</td>
                    <td className="tabular-nums">{l.used}/{l.max_devices}</td>
                    <td className="text-right"><ChevronRight className="ml-auto size-4 text-muted-foreground" /></td>
                  </tr>
                );
              })}
            </DataTable>
          </Panel>
        ) : (
          <EmptyState icon={KeyRound} title="Belum ada lisensi di akun ini" text="Beli paket di bawah, atau tautkan key dari penjual." />
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel id="beli" title="Beli paket" icon={Wallet} desc={buyable.length ? "Bayar QRIS dari semua e-wallet & m-banking. Lisensi + key otomatis masuk ke akun ini." : "Pembelian lewat WhatsApp penjual."} bodyClass="p-2">
            {buyable.length ? (
              <ul className="grid">
                {buyable.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/40">
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.8125rem] font-medium">{p.label}</p>
                      <p className="text-xs text-muted-foreground">{p.days ? `${p.days} hari` : "Selamanya"} · {p.devices} PC</p>
                    </div>
                    <BuyButton plan={p.id} label={rupiah(p.price)} variant="outline" />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-2">
                {wa ? <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-lg bg-primary px-2.5 text-[0.8125rem] font-medium text-primary-foreground">Beli via WhatsApp</a> : <Link href="/#harga" className="text-[0.8125rem] underline">Lihat paket</Link>}
              </div>
            )}
          </Panel>
          <Panel id="tautkan" title="Tautkan key" icon={Link2} desc="Hanya untuk key dari penjual (pembelian lewat WhatsApp). Key yang dibeli di website sudah otomatis ada di atas.">
            <ClaimForm />
          </Panel>
        </div>
    </div>
  );
}
