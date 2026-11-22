import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { licenseState, nowSec } from "@/lib/format";
import { myActivity, myOrders, requireMember } from "@/lib/license-api";
import { LicenseDetail, PageTitle, StateBadge } from "@/app/(member)/_ui/ui";

export const metadata: Metadata = { title: "Detail lisensi" };

/** One license on its own page: key, time left, PCs, history, payments. */
export default async function LicensePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, v, events, orders] = await Promise.all([params, requireMember(), myActivity(), myOrders()]);
  const l = v.licenses.find((x) => x.id === Number(id));
  if (!l) notFound();
  const now = nowSec();
  return (
    <div className="grid gap-5">
      <Link href="/lisensi" className="rise -mb-2 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> PC & lisensi
      </Link>
      <PageTitle title={`Lisensi ${l.planLabel}`} sub={`Key …${l.key_hint} · #${l.id}${l.role === "admin" ? " · Admin" : ""}`}>
        <StateBadge state={licenseState(l, now)} />
      </PageTitle>
      <LicenseDetail
        l={l} plans={v.plans} site={v.site} now={now} buyOnline={v.buyOnline}
        events={events.filter((e) => e.license_id === l.id)}
        orders={orders.filter((o) => o.license_id === l.id)}
      />
    </div>
  );
}
