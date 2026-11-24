import Link from "next/link";
import { asAdmin, type AuditEvent } from "@/lib/license-api";
import { EventList, PageHead } from "../ui";

export default async function Log({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const before = Number((await searchParams).before) || 0;
  const { events } = await asAdmin<{ events: AuditEvent[] }>(`/internal/audit${before ? `?before=${before}` : ""}`);
  const last = events.at(-1);
  return (
    <>
      <PageHead title="Log" sub="Semua kejadian lisensi & admin, terbaru di atas" />
      <section className="rounded-xl border bg-card px-4">
        <EventList events={events} />
      </section>
      <div className="mt-3 flex gap-3 text-xs">
        {before > 0 && <Link href="/admin/log" className="text-muted-foreground hover:text-foreground">← Terbaru</Link>}
        {events.length === 100 && last && <Link href={`/admin/log?before=${last.id}`} className="ml-auto text-muted-foreground hover:text-foreground">Lebih lama →</Link>}
      </div>
    </>
  );
}
