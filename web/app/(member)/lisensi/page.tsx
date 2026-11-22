import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, CircleAlert, Download, KeyRound, Link2, Monitor, Plus, Wallet } from "lucide-react";
import { fmtDate, fmtTime, licenseState, nowSec, rupiah } from "@/lib/format";
import { requireMember, waLink } from "@/lib/license-api";
import { appStatus, type AppStatus } from "@/lib/version";
import { Hint } from "@/components/kit";
import { BuyButton, ClaimForm, ReleaseDevice } from "@/app/(member)/_ui/forms";
import { DataTable, daysLeftOf, EmptyState, EndingNotice, PageTitle, Panel, StateBadge } from "@/app/(member)/_ui/ui";

export const metadata: Metadata = { title: "PC & lisensi" };

const APP: Record<AppStatus, [string, string]> = {
  latest: ["Versi terbaru", "bg-status-ok/12 text-status-ok"],
  update: ["Ada update", "bg-amber-500/12 text-amber-600 dark:text-amber-300"],
  required: ["Wajib update", "bg-destructive/12 text-destructive"],
  unknown: ["Versi belum terbaca", "bg-muted text-muted-foreground"],
};

/**
 * Buyers think per PC, so this page starts there: every PC with its app version and the key it uses, then the
 * licenses (time left, slots), then buy / link a key from a reseller.
 */
export default async function PcsAndLicenses() {
  const v = await requireMember();
  const now = nowSec();
  const latest = v.releases[0] ?? v.latest;
  const pcs = v.licenses.flatMap((l) =>
    l.devices.map((d) => ({ ...d, license: l, status: appStatus(d.app_version, v.releases), online: !!d.last_seen && now - d.last_seen < 600 })),
  );
  const free = v.licenses.filter((l) => licenseState(l, now) === "active").reduce((n, l) => n + Math.max(0, l.max_devices - l.used), 0);
  const mustUpdate = pcs.filter((p) => p.status === "required").length;
  const buyable = v.buyOnline ? v.plans.filter((p) => p.price >= 1000) : [];
  const wa = waLink(v.site, "Halo, saya mau beli lisensi Traktiva.");

  return (
    <div className="grid gap-5">
      <PageTitle title="PC & lisensi" sub="PC yang memakai Traktiva, key-nya, dan sisa masa aktif." />
      <div className="-mt-1 grid gap-2 empty:hidden">
        <EndingNotice licenses={v.licenses} now={now} />
        {mustUpdate > 0 && (
          <div className="flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem]" role="alert">
            <CircleAlert className="size-4 shrink-0 text-destructive" />
            <span>{mustUpdate} PC memakai versi app yang sudah tidak didukung. Jalankan installer terbaru di PC itu; data & login tetap aman.</span>
            {latest && <a href={latest.url} target="_blank" rel="noreferrer" className="ml-auto shrink-0 font-semibold underline">Download</a>}
          </div>
        )}
      </div>

      {/* 1 · my PCs */}
      <section className="grid gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Monitor className="size-4 text-brand-light" /> PC saya <span className="font-normal text-muted-foreground">({pcs.length})</span>
          <Hint>PC yang sudah memasukkan key dari akun ini. Status diperbarui tiap ±5 menit selama app terbuka.</Hint>
        </h2>
        {pcs.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pcs.map((p) => {
              const [label, cls] = APP[p.status];
              return (
                <div key={p.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <span className="relative grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                      <Monitor className="size-4" />
                      {p.online && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card bg-status-ok" />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[0.8125rem] font-semibold">{p.name ?? "PC tanpa nama"}</p>
                      <p className={`text-xs ${p.online ? "text-status-ok" : "text-muted-foreground"}`}>{p.online ? "Sedang dipakai" : `Aktif ${fmtTime(p.last_seen)}`}</p>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">App</dt>
                      <dd className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="font-mono">{p.app_version ? `v${p.app_version}` : "—"}</span>
                        <span className={`rounded-full px-1.5 py-px text-[0.625rem] font-semibold ${cls}`}>{label}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Key</dt>
                      <dd className="mt-0.5"><Link href={`/lisensi/${p.license.id}`} className="hover:underline">{p.license.planLabel} · <span className="font-mono">…{p.license.key_hint}</span></Link></dd>
                    </div>
                  </dl>
                  <div className="mt-auto flex items-center gap-2 border-t pt-3">
                    {p.status !== "latest" && p.status !== "unknown" && latest && (
                      <a href={latest.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium hover:bg-muted"><Download className="size-3.5" /> Update</a>
                    )}
                    <span className="ml-auto"><ReleaseDevice id={p.id} name={p.name ?? "PC ini"} allowed={!p.license.canResetAt || p.license.canResetAt <= now} /></span>
                  </div>
                </div>
              );
            })}
            {free > 0 && (
              <Link href="/bantuan#langkah" className="grid place-items-center gap-1 rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground">
                <Plus className="size-5 text-brand-light" />
                <span className="text-[0.8125rem] font-semibold text-foreground">Pasang di PC lain</span>
                {free} slot PC masih kosong
              </Link>
            )}
          </div>
        ) : (
          <EmptyState icon={Monitor} title="Belum ada PC" text={v.licenses.length ? "Download app, jalankan di PC Windows, lalu tempel key dari daftar di bawah saat app pertama dibuka." : "Setelah punya lisensi, pasang app di PC dan PC-nya muncul di sini."}>
            {latest && v.licenses.length > 0 && (
              <a href={latest.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[0.8125rem] font-medium text-primary-foreground hover:bg-primary/80"><Download className="size-4" /> Download app v{latest.version}</a>
            )}
          </EmptyState>
        )}
      </section>

      {/* 2 · licenses */}
      {v.licenses.length > 0 && (
        <Panel title={`Lisensi (${v.licenses.length})`} icon={KeyRound} desc="Klik lisensi untuk melihat key lengkap, riwayat, pembayaran, dan perpanjangan." bodyClass="">
          <DataTable head={["Lisensi", "Key", "Sisa masa aktif", "Berlaku sampai", <span key="pc" className="inline-flex items-center gap-1">PC <Hint side="bottom">Terpakai / jumlah PC yang boleh memakai key ini.</Hint></span>, ""]}>
            {v.licenses.map((l) => {
              const days = daysLeftOf(l, now);
              return (
                <tr key={l.id} className="relative hover:bg-muted/40">
                  <td>
                    <Link href={`/lisensi/${l.id}`} className="flex items-center gap-2.5 after:absolute after:inset-0">
                      <StateBadge state={licenseState(l, now)} />
                      <span className="font-medium">{l.planLabel}</span>
                      {l.role === "admin" && <span className="rounded-full bg-amber-500/12 px-1.5 text-[0.625rem] font-semibold text-amber-600 dark:text-amber-300">Admin</span>}
                    </Link>
                  </td>
                  <td className="font-mono text-xs text-muted-foreground">TRK-…-{l.key_hint}</td>
                  <td className={`tabular-nums ${days != null && days <= 7 ? "font-medium text-amber-600 dark:text-amber-300" : ""}`}>{days == null ? "Selamanya" : `${days} hari`}</td>
                  <td className="whitespace-nowrap text-muted-foreground">{fmtDate(l.expires_at)}</td>
                  <td className="tabular-nums">{l.used}/{l.max_devices}</td>
                  <td className="text-right"><ChevronRight className="ml-auto size-4 text-muted-foreground" /></td>
                </tr>
              );
            })}
          </DataTable>
        </Panel>
      )}

      {/* 3 · buy | link a reseller key (equal height) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel id="beli" title={v.licenses.length ? "Beli lisensi lagi" : "Beli lisensi"} icon={Wallet} desc={buyable.length ? "Bayar QRIS (semua e-wallet & m-banking). Key langsung masuk ke akun ini." : "Pembelian lewat WhatsApp penjual."} bodyClass="p-2">
          {buyable.length ? (
            <ul className="grid">
              {buyable.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.8125rem] font-medium">{p.label}</p>
                    <p className="text-xs text-muted-foreground">{p.days ? `${p.days} hari` : "Selamanya"} · {p.devices} PC</p>
                  </div>
                  <BuyButton plan={p.id} label={rupiah(p.price)} variant="outline" />
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-2">
              {wa ? <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-lg bg-primary px-2.5 text-[0.8125rem] font-medium text-primary-foreground">Beli via WhatsApp</a> : <Link href="/harga" className="text-[0.8125rem] underline">Lihat paket</Link>}
            </div>
          )}
        </Panel>
        <Panel id="tautkan" title="Punya key dari penjual?" icon={Link2} desc="Beli lewat WhatsApp atau reseller? Tempel key TRK-… sekali di sini supaya masa aktif & PC-nya tampil di akun ini. Key yang dibeli di website sudah otomatis masuk.">
          <ClaimForm />
        </Panel>
      </div>
    </div>
  );
}
