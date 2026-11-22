import Link from "next/link";
import { CircleAlert, Download, Monitor, Plus } from "lucide-react";
import { fmtTime, licenseState } from "@/lib/format";
import type { MemberView } from "@/lib/license-api";
import { appStatus, type AppStatus } from "@/lib/version";
import { Hint } from "@/components/kit";
import { ReleaseDevice } from "./forms";

/** Badge per app status; none while no release is published yet (nothing to compare the version with). */
const APP: Partial<Record<AppStatus, [string, string]>> = {
  latest: ["Versi terbaru", "bg-status-ok/12 text-status-ok"],
  update: ["Ada update", "bg-amber-500/12 text-amber-600 dark:text-amber-300"],
  required: ["Wajib update", "bg-destructive/12 text-destructive"],
};

/** "PC saya" on Ringkasan: every PC that uses a key of this account, as a card (online, app version, key, release). */
export function PcSection({ v, now }: { v: MemberView; now: number }) {
  const latest = v.releases[0] ?? v.latest;
  const pcs = v.licenses.flatMap((l) =>
    l.devices.map((d) => ({ ...d, license: l, status: appStatus(d.app_version, v.releases), online: !!d.last_seen && now - d.last_seen < 600 })),
  );
  const free = v.licenses.filter((l) => licenseState(l, now) === "active").reduce((n, l) => n + Math.max(0, l.max_devices - l.used), 0);
  const mustUpdate = pcs.filter((p) => p.status === "required").length;
  if (!pcs.length && !free) return null;

  return (
    <section className="grid gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Monitor className="size-4 text-brand-light" /> PC saya <span className="font-normal text-muted-foreground">({pcs.length})</span>
        <Hint>PC yang sudah memasukkan key dari akun ini. Status diperbarui tiap ±5 menit selama app terbuka.</Hint>
      </h2>
      {mustUpdate > 0 && (
        <div className="flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem]" role="alert">
          <CircleAlert className="size-4 shrink-0 text-destructive" />
          <span>{mustUpdate} PC memakai versi app yang sudah tidak didukung. Jalankan installer terbaru di PC itu; data & login tetap aman.</span>
          {latest && <a href={latest.url} target="_blank" rel="noreferrer" className="ml-auto shrink-0 font-semibold underline">Download</a>}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pcs.map((p) => {
          const badge = APP[p.status];
          return (
            <div key={p.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="relative grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                  <Monitor className="size-4" />
                  {p.online && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card bg-status-ok" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.8125rem] font-semibold">{p.name ?? "PC tanpa nama"}</p>
                  <p className={`text-xs ${p.online ? "text-status-ok" : "text-muted-foreground"}`}>{p.online ? "Sedang dipakai" : `Aktif ${fmtTime(p.last_seen)}`}</p>
                </div>
                <ReleaseDevice id={p.id} name={p.name ?? "PC ini"} allowed={!p.license.canResetAt || p.license.canResetAt <= now} />
              </div>
              <dl className="grid grid-cols-2 gap-2 border-t pt-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Versi app</dt>
                  <dd className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="font-medium tabular-nums">{p.app_version ? `v${p.app_version}` : "—"}</span>
                    {badge && <span className={`rounded-full px-1.5 py-px text-[0.625rem] font-semibold ${badge[1]}`}>{badge[0]}</span>}
                    {p.status !== "latest" && badge && latest && <a href={latest.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold underline"><Download className="size-3" />Update</a>}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Key</dt>
                  <dd className="mt-0.5 truncate"><Link href={`/lisensi/${p.license.id}`} className="font-medium hover:underline">{p.license.planLabel} · …{p.license.key_hint}</Link></dd>
                </div>
              </dl>
            </div>
          );
        })}
        {free > 0 && (
          <Link href="/bantuan#langkah" className="grid min-h-28 place-items-center content-center gap-1 rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground">
            <Plus className="size-5 text-brand-light" />
            <span className="text-[0.8125rem] font-semibold text-foreground">Pasang di PC lain</span>
            {free} slot PC masih kosong
          </Link>
        )}
      </div>
    </section>
  );
}
