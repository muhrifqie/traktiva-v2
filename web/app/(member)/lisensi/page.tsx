import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, KeyRound, Link2, Wallet } from "lucide-react";
import { fmtDate, licenseState, nowSec, rupiah } from "@/lib/format";
import { requireMember, waLink } from "@/lib/license-api";
import { Hint } from "@/components/kit";
import { BuyButton, ClaimForm } from "@/app/(member)/_ui/forms";
import { DataTable, daysLeftOf, EmptyState, EndingNotice, PageTitle, Panel, StateBadge } from "@/app/(member)/_ui/ui";

export const metadata: Metadata = { title: "Lisensi" };

/** Licenses: time left and PC slots per key, then buy / link a key from a reseller. The PCs themselves are on Ringkasan. */
export default async function Licenses() {
  const v = await requireMember();
  const now = nowSec();
  const buyable = v.buyOnline ? v.plans.filter((p) => p.price >= 1000) : [];
  const wa = waLink(v.site, "Halo, saya mau beli lisensi Traktiva.");

  return (
    <div className="grid gap-5">
      <PageTitle title="Lisensi" sub="Key, sisa masa aktif, dan jumlah PC per lisensi. Beli atau perpanjang di sini." />
      <div className="-mt-1 grid gap-2 empty:hidden">
        <EndingNotice licenses={v.licenses} now={now} />
      </div>

      {/* 1 · licenses */}
      {v.licenses.length > 0 ? (
        <Panel title={`Lisensi (${v.licenses.length})`} icon={KeyRound} desc="Klik lisensi untuk melihat key lengkap, riwayat, pembayaran, dan perpanjangan." bodyClass="">
          <DataTable head={["Lisensi", "Key", "Sisa masa aktif", "Berlaku sampai", <span key="pc" className="inline-flex items-center gap-1">PC <Hint side="bottom">Terpakai / jumlah PC yang boleh memakai key ini.</Hint></span>, ""]}>
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
        <EmptyState icon={KeyRound} title="Belum ada lisensi di akun ini" text="Beli paket di bawah, atau tempel key dari penjual." />
      )}

      {/* 2 · buy | link a reseller key (equal height) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel id="beli" title={v.licenses.length ? "Beli lisensi lagi" : "Beli lisensi"} icon={Wallet} desc={buyable.length ? "Bayar QRIS (semua e-wallet & m-banking). Key langsung masuk ke akun ini." : "Pembelian lewat WhatsApp penjual."} bodyClass="p-2">
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
              {wa ? <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-lg bg-primary px-2.5 text-[0.8125rem] font-medium text-primary-foreground">Beli via WhatsApp</a> : <Link href="/harga" className="text-[0.8125rem] underline">Lihat paket</Link>}
            </div>
          )}
        </Panel>
        <Panel id="tautkan" title="Punya key dari penjual?" icon={Link2} desc="Beli lewat WhatsApp atau reseller? Tempel key TRK-… sekali di sini supaya masa aktif & PC-nya tampil di akun ini. Key yang dibeli di website sudah otomatis masuk.">
          <ClaimForm />
        </Panel>
      </div>
    </div>
  );
}
