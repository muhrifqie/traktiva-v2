import type { Metadata } from "next";
import { Download, Info, LogOut, Megaphone, MessageCircle, Monitor, TriangleAlert } from "lucide-react";
import { fmtDate, fmtTime, licenseState, nowSec, STATE_LABEL } from "@/lib/format";
import { requireBuyer, waLink } from "@/lib/license-api";
import { buyerLogout } from "../actions";

export const metadata: Metadata = { title: "Akun", robots: { index: false, follow: false } };

const TONE = {
  info: { icon: Info, cls: "border-[#4ea7fc]/30 text-[#9ccbff]" },
  warn: { icon: TriangleAlert, cls: "border-amber-300/30 text-amber-200" },
  critical: { icon: Megaphone, cls: "border-red-400/40 text-red-200" },
} as const;

export default async function Account() {
  const v = await requireBuyer();
  const l = v.license;
  const now = nowSec();
  const state = licenseState(l, now);
  const plan = v.plans.find((p) => p.id === l.plan);
  const daysLeft = l.expires_at ? Math.max(0, Math.ceil((l.expires_at - now) / 86400)) : null;
  // share of the period still left (for the bar); lifetime = full
  const total = plan?.days ? plan.days * 86400 : l.expires_at ? l.expires_at - l.created_at : 0;
  const left = l.expires_at == null ? 1 : total > 0 ? Math.min(1, Math.max(0, (l.expires_at - now) / total)) : 0;
  const renew = waLink(v.site, `Halo, saya mau perpanjang lisensi Traktiva (key …${l.key_hint}).`);
  const reset = waLink(v.site, `Halo, saya mau reset perangkat untuk key Traktiva …${l.key_hint}.`);

  return (
    <main className="mx-auto max-w-[1260px] px-5 py-12 md:px-8 md:py-16">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="font-mono text-[12px] tracking-[0.08em] text-[var(--site-signal)] uppercase">Key …{l.key_hint}</p>
          <h1 className="mt-3 text-[36px] leading-[1.08] font-light tracking-[-0.03em] md:text-[52px]">Lisensi {plan?.label ?? l.plan}</h1>
        </div>
        <form action={buyerLogout} className="ml-auto">
          <button type="submit" className="site-pill-outline site-sm"><LogOut className="size-4" /> Keluar</button>
        </form>
      </div>

      {v.announcements.length > 0 && (
        <div className="mt-8 grid gap-2">
          {v.announcements.map((a) => {
            const { icon: Icon, cls } = TONE[a.level];
            return (
              <div key={a.id} className={`flex gap-3 rounded-2xl border bg-white/[0.03] px-4 py-3 text-[15px] ${cls}`}>
                <Icon className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="font-medium">{a.title}</p>
                  {a.body && <p className="mt-0.5 whitespace-pre-line opacity-85">{a.body}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* license status */}
        <section className="site-stage p-7 md:p-8">
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${state === "active" ? "bg-[var(--site-signal)]/15 text-[var(--site-signal)]" : "bg-red-400/15 text-red-200"}`}>{STATE_LABEL[state]}</span>
            <span className="text-[14px] text-[var(--site-body)]">Aktif sejak {fmtDate(l.created_at)}</span>
          </div>
          <div className="mt-8 flex items-end gap-3">
            <p className="text-[72px] leading-[0.95] font-light tabular-nums md:text-[88px]">{daysLeft ?? "∞"}</p>
            <p className="pb-2 text-[20px] font-[330] text-[var(--site-body)]">{daysLeft == null ? "selamanya" : "hari tersisa"}</p>
          </div>
          <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(left * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Sisa masa aktif">
            <div className={`h-full rounded-full ${daysLeft != null && daysLeft <= 7 ? "bg-amber-300" : "bg-[var(--site-signal)]"}`} style={{ width: `${left * 100}%` }} />
          </div>
          <dl className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-3">
            {[
              ["Berlaku sampai", fmtDate(l.expires_at)],
              ["Perangkat", `${l.used} dari ${l.max_devices}`],
              ["Paket", plan?.label ?? l.plan],
            ].map(([k, val]) => (
              <div key={k} className="border-t border-[var(--site-edge)] pt-3">
                <dt className="font-mono text-[11px] tracking-[0.04em] text-[var(--site-signal)] uppercase">{k}</dt>
                <dd className="mt-1 text-[18px]">{val}</dd>
              </div>
            ))}
          </dl>
          {daysLeft != null && (
            <div className="mt-8">
              {renew ? (
                <a href={renew} target="_blank" rel="noreferrer" className="site-pill site-sm"><MessageCircle className="size-4" /> Perpanjang via WhatsApp</a>
              ) : (
                <p className="text-[14px] text-[var(--site-muted)]">Hubungi penjual untuk perpanjang.</p>
              )}
            </div>
          )}
        </section>

        {/* download */}
        <section className="flex flex-col rounded-3xl bg-[var(--site-card)] p-7 md:p-8">
          <Download className="size-6 text-[var(--site-signal)]" />
          <h2 className="mt-5 text-[26px] leading-[1.15] font-[330] tracking-[-0.01em]">Download Traktiva</h2>
          {v.latest ? (
            <>
              <p className="mt-2 text-[15px] text-[var(--site-body)]">Versi {v.latest.version} · {fmtDate(v.latest.created_at)} · Windows 10/11</p>
              {v.latest.notes && <p className="mt-4 line-clamp-4 whitespace-pre-line text-[15px] text-[var(--site-body)]">{v.latest.notes}</p>}
              <a href={v.latest.url} target="_blank" rel="noreferrer" className="site-pill site-sm mt-auto self-start">
                <Download className="size-4" /> Download v{v.latest.version}
              </a>
            </>
          ) : (
            <p className="mt-2 text-[15px] text-[var(--site-body)]">Link download belum tersedia. Hubungi penjual.</p>
          )}
        </section>
      </div>

      {/* devices */}
      <section className="mt-4 rounded-3xl bg-[var(--site-card)] p-7 md:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[22px] font-[400]">PC yang memakai key ini</h2>
          {reset && <a href={reset} target="_blank" rel="noreferrer" className="ml-auto text-[14px] text-[var(--site-body)] underline hover:text-white">Ganti PC? Minta reset</a>}
        </div>
        {v.devices.length ? (
          <ul className="mt-4 divide-y divide-white/8">
            {v.devices.map((d, i) => {
              const online = d.last_seen && now - d.last_seen < 600;
              return (
                <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-4 text-[15px]">
                  <Monitor className="size-5 text-[var(--site-body)]" />
                  <span className="font-medium">{d.name ?? "PC tanpa nama"}</span>
                  <span className="text-[var(--site-muted)]">v{d.app_version ?? "?"}</span>
                  <span className={`ml-auto text-[14px] ${online ? "text-[var(--site-signal)]" : "text-[var(--site-muted)]"}`}>
                    {online ? "● Sedang dipakai" : `Terakhir aktif ${fmtTime(d.last_seen)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 text-[15px] text-[var(--site-body)]">Belum ada PC. Pasang Traktiva lalu masukkan key ini saat app pertama dibuka.</p>
        )}
      </section>
    </main>
  );
}
