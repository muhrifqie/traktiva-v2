import Link from "next/link";
import { fmtTime, rupiah } from "@/lib/format";
import { asAdmin, type MemberOrder, type Plan } from "@/lib/license-api";
import { PageHead } from "../ui";

type Order = MemberOrder & { email: string; wp_id: string | null };

const STATUS: Record<Order["status"], [string, string]> = {
  pending: ["Menunggu bayar", "bg-amber-300/12 text-amber-200"],
  paid: ["Lunas", "bg-status-ok/12 text-status-ok"],
  expired: ["Kedaluwarsa", "bg-muted text-muted-foreground"],
  cancelled: ["Dibatalkan", "bg-muted text-muted-foreground"],
  mismatch: ["Nominal tidak cocok", "bg-destructive/12 text-destructive"],
};

export default async function Orders() {
  const [{ orders }, { plans }] = await Promise.all([
    asAdmin<{ orders: Order[] }>("/internal/orders"),
    asAdmin<{ plans: Plan[] }>("/internal/settings"),
  ]);
  const paid = orders.filter((o) => o.status === "paid" && o.livemode);
  return (
    <>
      <PageHead title="Pesanan" sub={`${orders.length} pesanan terakhir · ${paid.length} lunas · ${rupiah(paid.reduce((n, o) => n + o.base_amount, 0))}`} />
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-[0.8125rem]">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium">
              <th>Pesanan</th><th>Pembeli</th><th>Paket</th><th>Nominal</th><th>Status</th><th>Dibuat</th><th>Lisensi</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orders.map((o) => {
              const [label, cls] = STATUS[o.status];
              return (
                <tr key={o.id} className="hover:bg-muted/40 [&>td]:px-4 [&>td]:py-2.5">
                  <td className="font-mono text-xs whitespace-nowrap">{o.id}{!o.livemode && <span className="ml-1.5 rounded bg-amber-300/15 px-1 font-sans text-[0.625rem] text-amber-200">uji</span>}</td>
                  <td className="max-w-56 truncate">{o.email}</td>
                  <td>{plans.find((p) => p.id === o.plan)?.label ?? o.plan}</td>
                  <td className="whitespace-nowrap tabular-nums">{rupiah(o.amount ?? o.base_amount)}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap ${cls}`}>{label}</span></td>
                  <td className="whitespace-nowrap text-muted-foreground">{fmtTime(o.created_at)}</td>
                  <td>{o.license_id ? <Link href={`/admin/lisensi/${o.license_id}`} className="font-mono hover:underline">#{o.license_id}</Link> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!orders.length && <p className="py-10 text-center text-sm text-muted-foreground">Belum ada pesanan online. Aktifkan bayar otomatis di Pengaturan.</p>}
      </div>
    </>
  );
}
