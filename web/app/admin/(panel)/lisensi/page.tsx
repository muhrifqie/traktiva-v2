import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { fmtDate, licenseState, nowSec } from "@/lib/format";
import { asAdmin, type License, type Plan } from "@/lib/license-api";
import { CreateKeyButton } from "../create-key";
import { OnlineBadge, PageHead, StateBadge } from "../ui";

const FILTERS = [
  ["", "Semua"],
  ["active", "Aktif"],
  ["expired", "Kedaluwarsa"],
  ["suspended", "Ditangguhkan"],
  ["revoked", "Dicabut"],
] as const;

export default async function Licenses({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q = "", status = "" } = await searchParams;
  const qs = new URLSearchParams({ q, status }).toString();
  const { licenses, plans } = await asAdmin<{ licenses: License[]; plans: Plan[] }>(`/internal/licenses?${qs}`);
  const now = nowSec();
  const planName = (id: string) => plans.find((p) => p.id === id)?.label ?? id;
  const href = (s: string) => `/admin/lisensi?${new URLSearchParams({ ...(q && { q }), ...(s && { status: s }) })}`;

  return (
    <>
      <PageHead title="Lisensi" sub={`${licenses.length}${licenses.length === 500 ? "+" : ""} key`}>
        <CreateKeyButton plans={plans} />
      </PageHead>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          {status && <input type="hidden" name="status" value={status} />}
          <Input name="q" defaultValue={q} placeholder="Cari catatan, 4 huruf akhir key, #id, perangkat" className="pl-8" />
        </form>
        <nav className="flex flex-wrap gap-1">
          {FILTERS.map(([s, label]) => (
            <Link
              key={s}
              href={href(s)}
              className={`h-8 rounded-lg border px-3 text-xs leading-8 ${s === status ? "border-primary bg-primary/18 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-[13px]">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium">
              <th>Key</th><th>Catatan</th><th>Paket</th><th>Status</th><th>Berlaku sampai</th><th>Perangkat</th><th>Terakhir aktif</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {licenses.map((l) => (
              <tr key={l.id} className="relative hover:bg-muted/40 [&>td]:px-4 [&>td]:py-2.5">
                <td className="font-mono font-semibold whitespace-nowrap">
                  <Link href={`/admin/lisensi/${l.id}`} className="after:absolute after:inset-0">#{l.id} …{l.key_hint}</Link>
                  {l.role === "admin" && <span className="ml-2 rounded-full bg-amber-300/12 px-1.5 py-px font-sans text-[10px] font-semibold text-amber-200">Admin</span>}
                </td>
                <td className="max-w-56 truncate text-muted-foreground">{l.note ?? "—"}</td>
                <td>{planName(l.plan)}</td>
                <td><StateBadge state={licenseState(l, now)} /></td>
                <td className="whitespace-nowrap">{fmtDate(l.expires_at)}</td>
                <td className="tabular-nums">{l.used}/{l.max_devices}</td>
                <td className="whitespace-nowrap"><OnlineBadge at={l.last_seen} now={now} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!licenses.length && <p className="py-10 text-center text-sm text-muted-foreground">{q || status ? "Tidak ada yang cocok." : "Belum ada key. Klik Buat key."}</p>}
      </div>
    </>
  );
}
