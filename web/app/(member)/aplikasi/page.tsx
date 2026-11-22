import type { Metadata } from "next";
import Link from "next/link";
import { AppWindow, CheckCircle2, CircleAlert, Download, History, Monitor, MonitorDown, RefreshCw, Wifi } from "lucide-react";
import { fmtDate, fmtTime, nowSec } from "@/lib/format";
import { requireMember } from "@/lib/license-api";
import { appStatus, type AppStatus } from "@/lib/version";
import { DataTable, EmptyState, PageTitle, Panel } from "@/app/(member)/_ui/ui";

export const metadata: Metadata = { title: "Aplikasi" };

const STATUS: Record<AppStatus, [string, string]> = {
  latest: ["Terbaru", "bg-status-ok/12 text-status-ok"],
  update: ["Update tersedia", "bg-amber-500/12 text-amber-600 dark:text-amber-300"],
  required: ["Wajib update", "bg-destructive/12 text-destructive"],
  unknown: ["Versi tidak diketahui", "bg-muted text-muted-foreground"],
};

const NEEDS = ["Windows 10/11 64-bit", "Google Chrome terpasang", "Internet stabil", "Pembuatan video jalan di server AI, PC biasa cukup"];

/** The desktop app: installer, the app on each of the member's PCs (version, update status, online), release history. */
export default async function Apps() {
  const v = await requireMember();
  const now = nowSec();
  const latest = v.releases[0] ?? v.latest;
  const pcs = v.licenses.flatMap((l) => l.devices.map((d) => ({ ...d, plan: l.planLabel, hint: l.key_hint, status: appStatus(d.app_version, v.releases) })));
  const count = (s: AppStatus) => pcs.filter((p) => p.status === s).length;
  const online = pcs.filter((p) => p.last_seen && now - p.last_seen < 600).length;
  const behind = count("update") + count("required");

  return (
    <div className="grid gap-5">
      <PageTitle title="Aplikasi" sub="Installer Traktiva untuk Windows, status aplikasi di setiap PC, dan riwayat update." />

      {/* 1 · installer | status (equal height) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rise flex flex-col rounded-xl bg-primary p-7 text-primary-foreground">
          <p className="flex items-center gap-2 text-sm font-semibold opacity-80"><MonitorDown className="size-4" /> Installer</p>
          <h2 className="mt-3 text-4xl font-bold">{latest ? `Traktiva v${latest.version}` : "Segera tersedia"}</h2>
          <p className="mt-2 font-medium opacity-80">
            {latest ? `Dirilis ${fmtDate(latest.created_at)}${latest.mandatory ? " · wajib update" : ""}` : "Link installer belum tersedia. Hubungi kami untuk link download."}
          </p>
          <ul className="mt-5 grid gap-1.5 text-sm font-medium opacity-90 sm:grid-cols-2">
            {NEEDS.map((n) => <li key={n} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /> {n}</li>)}
          </ul>
          {latest && (
            <div className="mt-auto pt-6">
              <a href={latest.url} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#fff] px-5 font-bold text-[#106e3a] hover:opacity-90">
                <Download className="size-5" /> Download v{latest.version}
              </a>
            </div>
          )}
        </section>

        <Panel title="Status aplikasi" icon={AppWindow} desc="Dari laporan app di setiap PC (diperbarui tiap ±5 menit saat app terbuka)." bodyClass="grid grid-cols-2 gap-px bg-border">
          {[
            { icon: Monitor, label: "PC terpasang", value: pcs.length, tone: "" },
            { icon: Wifi, label: "Sedang dipakai", value: online, tone: online ? "text-status-ok" : "" },
            { icon: CheckCircle2, label: "Versi terbaru", value: count("latest"), tone: "" },
            { icon: RefreshCw, label: "Perlu update", value: behind, tone: behind ? "text-amber-600 dark:text-amber-300" : "" },
          ].map(({ icon: I, label, value, tone }) => (
            <div key={label} className="bg-card p-5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><I className="size-3.5" /> {label}</p>
              <p className={`mt-2 font-display text-4xl font-bold tabular-nums ${tone}`}>{value}</p>
            </div>
          ))}
        </Panel>
      </div>

      {count("required") > 0 && (
        <div className="rise flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive" role="alert">
          <CircleAlert className="size-4 shrink-0" />
          <span className="text-foreground/90">{count("required")} PC memakai versi lama yang wajib diperbarui. Download installer terbaru lalu jalankan di PC itu; data & login tetap aman.</span>
        </div>
      )}

      {/* 2 · the app on every PC */}
      <Panel title="Aplikasi di setiap PC" icon={Monitor} desc="Semua PC yang memakai key di akun ini." bodyClass="">
        {pcs.length ? (
          <DataTable head={["PC", "Lisensi", "Versi terpasang", "Status", "Terakhir aktif"]}>
            {pcs.map((p) => {
              const on = p.last_seen && now - p.last_seen < 600;
              const [label, cls] = STATUS[p.status];
              return (
                <tr key={p.id}>
                  <td className="font-semibold">{p.name ?? "PC tanpa nama"}</td>
                  <td className="text-muted-foreground">{p.plan} · <span className="font-mono text-xs">…{p.hint}</span></td>
                  <td className="font-mono tabular-nums">{p.app_version ? `v${p.app_version}` : "—"}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap ${cls}`}>{label}</span></td>
                  <td className={`whitespace-nowrap ${on ? "font-semibold text-status-ok" : "text-muted-foreground"}`}>{on ? "● Sedang dipakai" : fmtTime(p.last_seen)}</td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <div className="p-4"><EmptyState icon={Monitor} title="Belum ada PC" text="Download installer di atas, lalu tempel key dari halaman Lisensi saat app pertama dibuka." /></div>
        )}
      </Panel>

      {/* 3 · release history */}
      <Panel title="Riwayat update" icon={History} desc="App memberi tahu otomatis saat versi baru keluar. Update = jalankan installer terbaru; data & login tetap." bodyClass="divide-y">
        {v.releases.length ? (
          v.releases.map((r, n) => (
            <details key={r.version} open={n === 0} className="group px-4 py-3.5">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-display text-lg font-bold">v{r.version}</span>
                {n === 0 && <span className="rounded-full bg-status-ok/12 px-2 py-0.5 text-[0.6875rem] font-semibold text-status-ok">Terbaru</span>}
                {!!r.mandatory && <span className="rounded-full bg-destructive/12 px-2 py-0.5 text-[0.6875rem] font-semibold text-destructive">Wajib</span>}
                <span className="text-sm text-muted-foreground">{fmtDate(r.created_at)}</span>
                <a href={r.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[0.8125rem] font-semibold hover:bg-muted">
                  <Download className="size-4" /> Installer
                </a>
              </summary>
              <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">{r.notes || "Tidak ada catatan rilis."}</p>
            </details>
          ))
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Belum ada rilis. <Link href="/bantuan" className="underline hover:text-foreground">Hubungi kami</Link> untuk link installer.</p>
        )}
      </Panel>
    </div>
  );
}
