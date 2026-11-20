import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { fmtDate, fmtTime, licenseState, nowSec } from "@/lib/format";
import { ApiError, asAdmin, type AuditEvent, type Device, type License, type Plan } from "@/lib/license-api";
import { OnlineBadge, PageHead, StateBadge, EventList } from "../../ui";
import { DeviceReset, LicenseActions } from "./actions-ui";

type Detail = { license: License; plans: Plan[]; devices: Device[]; events: AuditEvent[] };

export default async function LicenseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  let d: Detail;
  try {
    d = await asAdmin<Detail>(`/internal/licenses/${id}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const { license: l, plans, devices, events } = d;
  const now = nowSec();
  const state = licenseState(l, now);
  const facts = [
    ["Paket", plans.find((p) => p.id === l.plan)?.label ?? l.plan],
    ["Berlaku sampai", fmtDate(l.expires_at)],
    ["Perangkat", `${l.used} dari ${l.max_devices}`],
    ["Dibuat", fmtTime(l.created_at)],
    ["Catatan", l.note ?? "—"],
    ["Akun pemilik", l.owner ?? "Belum diklaim"],
  ];

  return (
    <>
      <Link href="/admin/lisensi" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Lisensi
      </Link>
      <PageHead title={`#${l.id} · …${l.key_hint}`}>
        {l.role === "admin" && <span className="inline-flex h-[22px] items-center rounded-full bg-amber-300/12 px-2 text-[11px] font-semibold text-amber-200">Admin</span>}
        <StateBadge state={state} />
      </PageHead>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="grid content-start gap-4">
          <section className="rounded-xl border bg-card">
            <header className="border-b px-4 py-3 text-sm font-semibold">Perangkat</header>
            {devices.length ? (
              <ul className="divide-y">
                {devices.map((dv) => (
                  <li key={dv.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-[13px]">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{dv.name ?? "Tanpa nama"} {dv.status === "reset" && <StateBadge state="reset" />}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{dv.id.slice(0, 12)} · v{dv.app_version ?? "?"} · {dv.last_ip ?? "—"}</p>
                      <p className="text-[11px] text-muted-foreground">{dv.hw_locked ? "🔒 Terkunci ke hardware (Windows, motherboard, CPU, RAM, disk, BIOS)" : "Belum terkunci hardware (diaktifkan dari versi app lama)"}</p>
                    </div>
                    <OnlineBadge at={dv.last_seen} now={now} />
                    {dv.status === "active" && <DeviceReset id={dv.id} name={dv.name ?? "perangkat ini"} />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Key belum dipakai di perangkat mana pun.</p>
            )}
          </section>
          <section className="rounded-xl border bg-card">
            <header className="border-b px-4 py-3 text-sm font-semibold">Riwayat</header>
            <div className="px-4"><EventList events={events} withKey={false} /></div>
          </section>
        </div>
        <aside className="grid content-start gap-4">
          <dl className="grid gap-2.5 rounded-xl border bg-card p-4 text-[13px]">
            {facts.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right break-words">{v}</dd>
              </div>
            ))}
          </dl>
          <LicenseActions license={l} />
        </aside>
      </div>
    </>
  );
}
