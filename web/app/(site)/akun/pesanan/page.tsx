import type { Metadata } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { myOrders, requireMember } from "@/lib/license-api";
import { OrderList, PageTitle, Panel } from "../ui";

export const metadata: Metadata = { title: "Pesanan" };

export default async function Orders() {
  const [v, orders] = await Promise.all([requireMember(), myOrders()]);
  return (
    <>
      <PageTitle title="Pesanan" sub="Pembelian dan perpanjangan yang dibayar online (QRIS)." />
      <Panel title="Riwayat" icon={Receipt}>
        {orders.length ? (
          <OrderList orders={orders} plans={v.plans} />
        ) : (
          <p className="text-[15px] text-[var(--site-body)]">
            Belum ada pesanan online. Pembelian lewat WhatsApp tidak tercatat di sini; key-nya cukup ditambahkan di <Link href="/akun/lisensi" className="underline hover:text-white">Lisensi & PC</Link>.
          </p>
        )}
      </Panel>
    </>
  );
}
