import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { rupiah } from "@/lib/format";
import { requireMember } from "@/lib/license-api";
import { BuyButton } from "../akun/forms";
import { AuthShell } from "../masuk/shell";

export const metadata: Metadata = { title: "Beli lisensi", robots: { index: false, follow: false } };

/** Landing "Beli" when online payment is on: sign in first, confirm the plan, then pay by QRIS at WaroengPay. */
export default async function Buy({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const plan = String((await searchParams).plan ?? "").slice(0, 20);
  const v = await requireMember().catch(() => null);
  if (!v) redirect(`/masuk?next=${encodeURIComponent(`/beli?plan=${plan}`)}`);
  const p = v.plans.find((x) => x.id === plan && x.price >= 1000);
  if (!v.buyOnline || !p) redirect("/#harga");
  return (
    <AuthShell eyebrow="Beli lisensi" title={`Traktiva ${p.label}`} points={["Bayar QRIS dari semua e-wallet & m-banking", "Key otomatis masuk ke akunmu setelah lunas", "Tagihan berlaku 30 menit"]}>
      <div className="grid gap-5">
        <dl className="grid grid-cols-2 gap-4">
          {[
            ["Harga", rupiah(p.price)],
            ["Masa aktif", p.days ? `${p.days} hari` : "Selamanya"],
            ["PC", `${p.devices}`],
            ["Akun", v.user.email],
          ].map(([k, val]) => (
            <div key={k} className="border-t border-[var(--site-edge)] pt-2.5">
              <dt className="font-mono text-[11px] tracking-[0.04em] text-[var(--site-signal)] uppercase">{k}</dt>
              <dd className="mt-1 truncate text-[17px]">{val}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[13px] text-[var(--site-muted)]">Nominal di QRIS ditambah kode unik Rp100–250 supaya pembayaranmu terdeteksi otomatis.</p>
        <BuyButton plan={p.id} label={`Bayar ${rupiah(p.price)} dengan QRIS`} />
        <Link href="/#harga" className="text-[14px] text-[var(--site-muted)] underline hover:text-white">Pilih paket lain</Link>
      </div>
    </AuthShell>
  );
}
