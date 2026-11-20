import { BellRing, Cpu, Info, Megaphone, MessageCircle, Monitor, ShieldCheck, TriangleAlert } from "lucide-react";
import { fmtDate, fmtTime, licenseState, rupiah, STATE_LABEL } from "@/lib/format";
import { waLink, type MemberLicense, type MemberOrder, type MemberView } from "@/lib/license-api";
import { BuyButton, ReleaseDevice } from "./forms";

export const TONE = {
  info: { icon: Info, cls: "border-sky-400/30 text-sky-200" },
  warn: { icon: TriangleAlert, cls: "border-amber-300/30 text-amber-200" },
  critical: { icon: Megaphone, cls: "border-red-400/40 text-red-200" },
} as const;

export function Avatar({ user, size = "lg" }: { user: MemberView["user"]; size?: "sm" | "lg" }) {
  const box = size === "sm" ? "size-11 rounded-xl text-lg" : "size-14 rounded-2xl text-2xl";
  // eslint-disable-next-line @next/next/no-img-element -- Google profile photo
  if (user.avatar) return <img src={user.avatar} alt="" referrerPolicy="no-referrer" className={`${box} shrink-0 object-cover`} />;
  return <span className={`${box} grid shrink-0 place-items-center bg-[var(--site-pine)] font-light uppercase`}>{(user.name || user.email)[0]}</span>;
}

/** One license: status, time left, PCs (HWID-locked) with self-service release, renew via WhatsApp. */
export function LicenseCard({ l, plans, site, now, buyOnline }: { l: MemberLicense; plans: MemberView["plans"]; site: MemberView["site"]; now: number; buyOnline: boolean }) {
  const state = licenseState(l, now);
  const plan = plans.find((p) => p.id === l.plan);
  const daysLeft = l.expires_at ? Math.max(0, Math.ceil((l.expires_at - now) / 86400)) : null;
  const total = plan?.days ? plan.days * 86400 : l.expires_at ? l.expires_at - l.created_at : 0;
  const left = l.expires_at == null ? 1 : total > 0 ? Math.min(1, Math.max(0, (l.expires_at - now) / total)) : 0;
  const renew = waLink(site, `Halo, saya mau perpanjang lisensi Traktiva (key …${l.key_hint}).`);
  const help = waLink(site, `Halo, saya butuh bantuan reset perangkat untuk key Traktiva …${l.key_hint}.`);
  const resetDays = l.canResetAt ? Math.ceil((l.canResetAt - now) / 86400) : 0;

  return (
    <article className="site-stage p-6 md:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${state === "active" ? "bg-[var(--site-signal)]/15 text-[var(--site-signal)]" : "bg-red-400/15 text-red-200"}`}>{STATE_LABEL[state]}</span>
        <h2 className="text-[22px] font-[400]">Lisensi {l.planLabel}</h2>
        {l.role === "admin" && <span className="rounded-full bg-amber-300/12 px-2.5 py-1 text-[12px] font-semibold text-amber-200">Admin</span>}
        <span className="ml-auto font-mono text-[13px] text-[var(--site-body)]">Key …{l.key_hint}</span>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_1.3fr]">
        <div>
          <div className="flex items-end gap-3">
            <p className="text-[64px] leading-[0.95] font-light tabular-nums">{daysLeft ?? "∞"}</p>
            <p className="pb-1.5 text-[18px] font-[330] text-[var(--site-body)]">{daysLeft == null ? "selamanya" : "hari tersisa"}</p>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(left * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Sisa masa aktif">
            <div className={`h-full rounded-full ${daysLeft != null && daysLeft <= 7 ? "bg-amber-300" : "bg-[var(--site-signal)]"}`} style={{ width: `${left * 100}%` }} />
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-4">
            {[
              ["Berlaku sampai", fmtDate(l.expires_at)],
              ["PC dipakai", `${l.used} dari ${l.max_devices}`],
            ].map(([k, v]) => (
              <div key={k} className="border-t border-[var(--site-edge)] pt-2.5">
                <dt className="font-mono text-[11px] tracking-[0.04em] text-[var(--site-signal)] uppercase">{k}</dt>
                <dd className="mt-1 text-[17px]">{v}</dd>
              </div>
            ))}
          </dl>
          {daysLeft != null && buyOnline && plan?.price && l.status !== "revoked" ? (
            <div className="mt-6"><BuyButton plan={plan.id} renew={l.id} label={`Perpanjang ${rupiah(plan.price)} (QRIS)`} /></div>
          ) : daysLeft != null && renew ? (
            <a href={renew} target="_blank" rel="noreferrer" className="site-pill site-sm mt-6"><MessageCircle className="size-4" /> Perpanjang via WhatsApp</a>
          ) : null}
        </div>

        <div>
          <p className="flex items-center gap-2 text-[15px] font-medium"><Cpu className="size-4 text-[var(--site-signal)]" /> PC yang memakai key ini</p>
          {l.devices.length ? (
            <ul className="mt-3 divide-y divide-white/8">
              {l.devices.map((d) => {
                const online = d.last_seen && now - d.last_seen < 600;
                return (
                  <li key={d.id} className="grid gap-2 py-3.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px]">
                      <Monitor className="size-4 text-[var(--site-body)]" />
                      <span className="font-medium">{d.name ?? "PC tanpa nama"}</span>
                      <span className="text-[13px] text-[var(--site-muted)]">v{d.app_version ?? "?"}</span>
                      <span className={`ml-auto text-[13px] ${online ? "text-[var(--site-signal)]" : "text-[var(--site-muted)]"}`}>{online ? "● Sedang dipakai" : `Aktif ${fmtTime(d.last_seen)}`}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pl-7">
                      <span className="flex items-center gap-1.5 text-[12px] text-[var(--site-muted)]">
                        <ShieldCheck className="size-3.5" /> {d.hw_locked ? "Terkunci ke hardware PC ini" : "Belum terkunci hardware (versi app lama)"}
                      </span>
                      <span className="ml-auto"><ReleaseDevice id={d.id} name={d.name ?? "PC ini"} allowed={!l.canResetAt} /></span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-[14px] text-[var(--site-body)]">Belum ada PC. Pasang Traktiva lalu masukkan key ini saat app pertama dibuka.</p>
          )}
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--site-muted)]">
            Ganti PC atau upgrade RAM/disk/motherboard? Lepas PC lama di sini lalu aktifkan di PC baru. Bisa 1× per 7 hari per lisensi
            {resetDays ? <> · <span className="text-amber-200">bisa lagi {resetDays} hari lagi</span></> : null}
            {help && <> · <a href={help} target="_blank" rel="noreferrer" className="underline hover:text-white">butuh bantuan</a></>}.
          </p>
        </div>
      </div>
    </article>
  );
}

export const ORDER_LABEL: Record<MemberOrder["status"], [string, string]> = {
  pending: ["Menunggu bayar", "text-amber-200"],
  paid: ["Lunas", "text-[var(--site-signal)]"],
  expired: ["Kedaluwarsa", "text-[var(--site-muted)]"],
  cancelled: ["Dibatalkan", "text-[var(--site-muted)]"],
  mismatch: ["Perlu dicek penjual", "text-red-300"],
};

/** Page heading inside the account area. */
export function PageTitle({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-[1.1] font-light tracking-[-0.02em] md:text-[36px]">{title}</h1>
        {sub && <p className="mt-1.5 text-[15px] text-[var(--site-body)]">{sub}</p>}
      </div>
      {children && <div className="ml-auto flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/** Card section with a title row (settings, side panels). */
export function Panel({ title, desc, icon: Icon, id, children }: { title: string; desc?: string; icon?: React.ComponentType<{ className?: string }>; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-3xl bg-[var(--site-card)] p-6 md:p-7">
      <h2 className="flex items-center gap-2 text-[18px] font-[400]">{Icon && <Icon className="size-[18px] text-[var(--site-signal)]" />} {title}</h2>
      {desc && <p className="mt-1 text-[14px] text-[var(--site-body)]">{desc}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Alert strip (warn / ok / info). */
export function Notice({ tone = "info", icon: Icon = Info, children }: { tone?: "info" | "warn" | "ok"; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  const cls = { info: "border-white/12 bg-white/[0.03] text-[var(--site-body)]", warn: "border-amber-300/30 bg-amber-300/[0.07] text-amber-100", ok: "border-[var(--site-signal)]/30 bg-[var(--site-signal)]/10 text-[var(--site-signal)]" }[tone];
  return (
    <div className={`flex gap-3 rounded-2xl border px-4 py-3 text-[15px] ${cls}`} role={tone === "warn" ? "alert" : "status"}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Licenses running out within 7 days (or already out), for the reminder banner. */
export function EndingNotice({ licenses, now }: { licenses: MemberLicense[]; now: number }) {
  const ending = licenses.filter((l) => l.status !== "revoked" && l.expires_at != null && l.expires_at - now < 7 * 86400);
  if (!ending.length) return null;
  return (
    <Notice tone="warn" icon={BellRing}>
      {ending.map((l) => {
        const d = Math.ceil((l.expires_at! - now) / 86400);
        return `Lisensi ${l.planLabel} (…${l.key_hint}) ${d > 0 ? `habis ${d} hari lagi` : "sudah habis"}`;
      }).join(" · ")}
      . Perpanjang supaya app tidak terkunci.
    </Notice>
  );
}

export function OrderList({ orders, plans }: { orders: MemberOrder[]; plans: MemberView["plans"] }) {
  return (
    <ul className="divide-y divide-white/8">
      {orders.map((o) => {
        const [label, cls] = ORDER_LABEL[o.status];
        return (
          <li key={o.id} className="grid gap-1 py-3.5 text-[15px] sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-6">
            <div className="min-w-0">
              <p className="font-medium">{plans.find((p) => p.id === o.plan)?.label ?? o.plan}{o.license_id ? <span className="text-[var(--site-muted)]"> · lisensi #{o.license_id}</span> : null}</p>
              <p className="font-mono text-[12px] text-[var(--site-muted)]">{o.id} · {fmtTime(o.created_at)}{!o.livemode && " · uji"}</p>
            </div>
            <span className="tabular-nums">{rupiah(o.amount ?? o.base_amount)}</span>
            <span className={`flex items-center gap-3 text-[14px] ${cls}`}>
              {label}
              {o.status === "pending" && o.pay_url && <a href={o.pay_url} className="site-pill site-sm">Bayar</a>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

