import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { kaloTopProducts } from "@/app/(dashboard)/kalodata/actions";
import { autopilotState } from "@/lib/autopilot";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { getKv } from "@/lib/kalo";
import type { KaloTopProduct } from "@/lib/kalodata";
import { getSettings } from "@/lib/settings";
import { AutopilotBoard } from "./board";

export const dynamic = "force-dynamic";

export default async function AutopilotPage() {
  const [state, tops, tiktok] = await Promise.all([
    autopilotState(),
    kaloTopProducts("ID")
      .then((r) => r.rows)
      .catch(async () => (await getKv<KaloTopProduct[]>("kalo:tops:product:ID:p1"))?.data ?? []),
    db.select({ id: accounts.id, username: accounts.username }).from(accounts).where(eq(accounts.platform, "tiktok")),
  ]);
  return (
    <>
      <header className="flex shrink-0 flex-wrap items-center gap-3">
        <Link href="/proyek" className="grid size-9 place-items-center rounded-lg border bg-card hover:bg-accent" aria-label="Kembali ke Proyek Video"><ArrowLeft className="size-4" /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Autopilot</h1>
          <p className="text-[13px] text-muted-foreground">Pilih produk laris, AI membuat videonya satu per satu sampai siap diekspor. Pagi tinggal review, export & jadwalkan.</p>
        </div>
      </header>
      <AutopilotBoard
        initial={state}
        products={tops.slice(0, 20).map((r) => ({ productId: r.id, title: r.product_title, revenue: r.revenue, sale: r.sale, price: r.unit_price, commission: r.commission_rate }))}
        accounts={tiktok}
        hasVoice={!!getSettings().voice?.cartesiaKey}
      />
    </>
  );
}
