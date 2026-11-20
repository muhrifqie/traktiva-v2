import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, Wallet } from "lucide-react";
import { nowSec, rupiah } from "@/lib/format";
import { requireMember } from "@/lib/license-api";
import { BuyButton, ClaimForm } from "../forms";
import { EndingNotice, LicenseCard, PageTitle, Panel } from "../ui";

export const metadata: Metadata = { title: "Lisensi & PC" };

export default async function Licenses() {
  const v = await requireMember();
  const now = nowSec();
  const buyable = v.buyOnline ? v.plans.filter((p) => p.price >= 1000) : [];
  return (
    <>
      <PageTitle title="Lisensi & PC" sub="Masa aktif, PC yang terkunci ke tiap key, dan perpanjangan." />
      <div className="mb-4 empty:hidden"><EndingNotice licenses={v.licenses} now={now} /></div>
      <div className="grid gap-4">
        <div className="grid content-start gap-4">
          {v.licenses.length ? (
            v.licenses.map((l) => <LicenseCard key={l.id} l={l} plans={v.plans} site={v.site} now={now} buyOnline={v.buyOnline} />)
          ) : (
            <div className="rounded-3xl border border-dashed border-white/15 p-8 text-center">
              <KeyRound className="mx-auto size-6 text-[var(--site-signal)]" />
              <p className="mt-3 text-[18px]">Belum ada lisensi di akun ini</p>
              <p className="mt-1 text-[14px] text-[var(--site-body)]">Tambahkan key di samping, atau beli paket baru.</p>
            </div>
          )}
        </div>
        <div className="grid items-start gap-4 md:grid-cols-2">
          <Panel title="Tambah lisensi" icon={KeyRound} desc="Punya key dari penjual? Masukkan sekali di sini.">
            <ClaimForm />
          </Panel>
          {buyable.length > 0 ? (
            <Panel title="Beli paket baru" icon={Wallet} desc="Bayar QRIS, key langsung masuk ke akun ini.">
              <div className="grid gap-3">
                {buyable.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-white/10 p-3 pl-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{p.label}</p>
                      <p className="text-[13px] text-[var(--site-muted)]">{p.days ? `${p.days} hari` : "Selamanya"} · {p.devices} PC</p>
                    </div>
                    <BuyButton plan={p.id} label={rupiah(p.price)} outline />
                  </div>
                ))}
              </div>
            </Panel>
          ) : (
            <Link href="/#harga" className="rounded-3xl bg-[var(--site-card)] p-6 text-[15px] text-[var(--site-body)] hover:text-white">Lihat paket & harga →</Link>
          )}
        </div>
      </div>
    </>
  );
}
