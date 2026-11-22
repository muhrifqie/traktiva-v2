import type { Metadata } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { myOrders, requireMember } from "@/lib/license-api";
import { OrderTable, PageTitle, Panel } from "@/app/(member)/_ui/ui";

export const metadata: Metadata = { title: "Pesanan" };

export default async function Orders() {
  const [v, orders] = await Promise.all([requireMember(), myOrders()]);
  return (
    <div className="grid gap-5">
      <PageTitle title="Pesanan" sub="Pembelian dan perpanjangan yang dibayar online (QRIS)." />
      <Panel title="Riwayat pesanan" icon={Receipt} desc="Status diperbarui otomatis setiap menit setelah kamu membayar." bodyClass="">
        {orders.length ? (
          <OrderTable orders={orders} plans={v.plans} />
        ) : (
          <p className="p-4 text-[0.8125rem] text-muted-foreground">
            Belum ada pesanan online. Pembelian lewat WhatsApp tidak tercatat di sini; key-nya cukup ditautkan di{" "}
            <Link href="/lisensi#tautkan" className="underline hover:text-foreground">Lisensi & PC</Link>.
          </p>
        )}
      </Panel>
    </div>
  );
}
