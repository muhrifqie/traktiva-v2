import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArrowLeft } from "lucide-react";
import { myActivity } from "@/lib/license-api";
import { ActivityList, PageTitle, Panel } from "@/app/(member)/_ui/ui";

export const metadata: Metadata = { title: "Aktivitas" };

export default async function ActivityPage() {
  const events = await myActivity();
  return (
    <div className="grid gap-5">
      <Link href="/pengaturan" className="-mb-2 inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Pengaturan
      </Link>
      <PageTitle title="Aktivitas" sub="Masuk ke website, aktivasi PC, pembayaran, dan perubahan keamanan di akun ini. Ada yang tidak kamu kenal? Ganti password dan keluarkan perangkat lain di Pengaturan." />
      <Panel title={`${events.length}${events.length === 200 ? "+" : ""} kejadian terakhir`} icon={Activity} bodyClass="">
        <ActivityList events={events} />
      </Panel>
    </div>
  );
}
