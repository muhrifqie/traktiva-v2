import { Activity, BellRing, Cpu, Info, KeyRound, Megaphone, MessageCircle, Monitor, Receipt, TriangleAlert } from "lucide-react";
import { fmtDate, fmtTime, rupiah } from "@/lib/format";
import { waLink, type MemberEvent, type MemberLicense, type MemberOrder, type MemberView } from "@/lib/license-api";
import { describeMemberEvent, TONE_DOT } from "@/lib/member-events";
import { Meter, Notice, Panel } from "@/components/kit";
import { BuyButton, KeyBox, ReleaseDevice, ResetHwidButton } from "./forms";

export { PageHeader as PageTitle, Panel, StatCard as Stat, Notice, StatusBadge as StateBadge, EmptyState, DataTable, Meter } from "@/components/kit";


export const TONE = {
  info: { icon: Info, cls: "border-sky-500/25 bg-sky-500/5 text-sky-700 dark:text-sky-300" },
  warn: { icon: TriangleAlert, cls: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300" },
  critical: { icon: Megaphone, cls: "border-destructive/30 bg-destructive/5 text-destructive" },
} as const;

export function Avatar({ user, size = "lg" }: { user: MemberView["user"]; size?: "sm" | "lg" }) {
  const box = size === "sm" ? "size-8 rounded-full text-[0.8125rem]" : "size-12 rounded-xl text-lg";
  // eslint-disable-next-line @next/next/no-img-element -- Google profile photo
  if (user.avatar) return <img src={user.avatar} alt="" referrerPolicy="no-referrer" className={`${box} shrink-0 object-cover`} />;
  return <span className={`${box} grid shrink-0 place-items-center bg-primary font-semibold text-primary-foreground uppercase`}>{(user.name || user.email)[0]}</span>;
}

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

/** Renew button for a license: online (QRIS) when sold online, else WhatsApp. */
export function RenewAction({ l, plans, site, buyOnline }: { l: MemberLicense; plans: MemberView["plans"]; site: MemberView["site"]; buyOnline: boolean }) {
  const plan = plans.find((p) => p.id === l.plan);
  if (l.expires_at == null || l.status === "revoked") return null;
  if (buyOnline && plan?.price) return <BuyButton plan={plan.id} renew={l.id} label={`Perpanjang · ${rupiah(plan.price)}`} />;
  const wa = waLink(site, `Halo, saya mau perpanjang lisensi Traktiva (key …${l.key_hint}).`);
  return wa ? (
    <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-[0.8125rem] font-medium text-primary-foreground hover:bg-primary/80">
      <MessageCircle className="size-4" /> Perpanjang via WhatsApp
    </a>
  ) : null;
}

/** "5 jam" / "40 menit" until this license may reset its hardware lock again; null = allowed now. */
export function resetWaitText(l: MemberLicense, now: number) {
  if (!l.canResetAt || l.canResetAt <= now) return null;
  const s = l.canResetAt - now;
  return s >= 3600 ? `${Math.ceil(s / 3600)} jam` : `${Math.max(1, Math.ceil(s / 60))} menit`;
}

export const daysLeftOf = (l: MemberLicense, now: number) => (l.expires_at ? Math.max(0, Math.ceil((l.expires_at - now) / 86400)) : null);

/** Everything about one license, as a page: key + time left, PCs, payments, history. */
export function LicenseDetail({ l, plans, site, now, buyOnline, events, orders }: {
  l: MemberLicense; plans: MemberView["plans"]; site: MemberView["site"]; now: number; buyOnline: boolean; events: MemberEvent[]; orders: MemberOrder[];
}) {
  const plan = plans.find((p) => p.id === l.plan);
  const daysLeft = daysLeftOf(l, now);
  const total = plan?.days ? plan.days * 86400 : l.expires_at ? l.expires_at - l.created_at : 0;
  const left = l.expires_at == null ? 1 : total > 0 ? (l.expires_at - now) / total : 0;
  const help = waLink(site, `Halo, saya butuh bantuan reset perangkat untuk key Traktiva …${l.key_hint}.`);
  const resetWait = resetWaitText(l, now);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Key & masa aktif" icon={KeyRound} action={<RenewAction l={l} plans={plans} site={site} buyOnline={buyOnline} />}>
        <div className="grid gap-5">
          <KeyBox licenseKey={l.key} hint={l.key_hint} />
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-semibold tabular-nums">{daysLeft ?? "∞"}</p>
              <p className="text-muted-foreground">{daysLeft == null ? "aktif selamanya" : `hari tersisa · s/d ${fmtDate(l.expires_at)}`}</p>
            </div>
            <div className="mt-3"><Meter value={left} warn={daysLeft != null && daysLeft <= 7} label="Sisa masa aktif" /></div>
          </div>
          <dl className="grid grid-cols-3 gap-3 text-[0.8125rem]">
            <div><dt className="text-xs text-muted-foreground">Paket</dt><dd className="mt-0.5 font-semibold">{l.planLabel}</dd></div>
            <div><dt className="text-xs text-muted-foreground">PC</dt><dd className="mt-0.5 font-semibold">{l.used} dari {l.max_devices}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Dibuat</dt><dd className="mt-0.5 font-semibold">{fmtDate(l.created_at)}</dd></div>
          </dl>
        </div>
      </Panel>

      <Panel title={`PC yang memakai key ini (${l.used}/${l.max_devices})`} icon={Cpu} bodyClass="" action={<ResetHwidButton licenseId={l.id} pcs={l.devices.length} waitText={resetWait} />}>
        {l.devices.length ? (
          <ul className="divide-y">
            {l.devices.map((d) => {
              const online = d.last_seen && now - d.last_seen < 600;
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[0.8125rem]">
                  <Monitor className="size-4 text-muted-foreground" />
                  <span className="font-semibold">{d.name ?? "PC tanpa nama"}</span>
                  <span className="text-xs text-muted-foreground">v{d.app_version ?? "?"} · {d.hw_locked ? "terkunci ke hardware" : "belum terkunci hardware"}</span>
                  <span className={`ml-auto text-xs ${online ? "text-status-ok" : "text-muted-foreground"}`}>{online ? "● Sedang dipakai" : `Aktif ${fmtTime(d.last_seen)}`}</span>
                  <ReleaseDevice id={d.id} name={d.name ?? "PC ini"} allowed={!l.canResetAt} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="p-4 text-[0.8125rem] text-muted-foreground">Belum dipakai di PC mana pun. Buka app Traktiva di PC, lalu tempel key saat diminta.</p>
        )}
        <p className="border-t px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          Ganti PC atau upgrade RAM/disk/motherboard? Lepas PC lama (atau Pindah PC untuk melepas semuanya), lalu tempel key di PC baru. Bisa 1× per hari
          {resetWait ? <> · <span className="text-amber-600 dark:text-amber-300">bisa lagi dalam {resetWait}</span></> : null}
          {help && <> · <a href={help} target="_blank" rel="noreferrer" className="underline hover:text-foreground">butuh bantuan</a></>}.
        </p>
      </Panel>

      <Panel title="Riwayat" icon={Activity} bodyClass="">
        <ActivityList events={events} empty="Belum ada riwayat untuk lisensi ini." />
      </Panel>

      <Panel title="Pembayaran" icon={Receipt} bodyClass="">
        {orders.length ? <OrderTable orders={orders} plans={plans} /> : <p className="p-4 text-[0.8125rem] text-muted-foreground">Belum ada pembayaran online untuk lisensi ini.</p>}
      </Panel>
    </div>
  );
}

export const ORDER_LABEL: Record<MemberOrder["status"], [string, string]> = {
  pending: ["Menunggu bayar", "bg-amber-500/12 text-amber-600 dark:text-amber-300"],
  paid: ["Lunas", "bg-status-ok/12 text-status-ok"],
  expired: ["Kedaluwarsa", "bg-muted text-muted-foreground"],
  cancelled: ["Dibatalkan", "bg-muted text-muted-foreground"],
  mismatch: ["Perlu dicek penjual", "bg-destructive/12 text-destructive"],
};

export function OrderTable({ orders, plans }: { orders: MemberOrder[]; plans: MemberView["plans"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[0.8125rem]">
        <thead className="border-b text-left text-xs text-muted-foreground">
          <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium">
            <th>Pesanan</th><th>Paket</th><th>Nominal</th><th>Status</th><th>Dibuat</th><th className="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {orders.map((o) => {
            const [label, cls] = ORDER_LABEL[o.status];
            return (
              <tr key={o.id} className="[&>td]:px-4 [&>td]:py-2.5">
                <td className="font-mono text-xs whitespace-nowrap">{o.id}{!o.livemode && <span className="ml-1.5 rounded bg-amber-500/15 px-1 font-sans text-[0.625rem] text-amber-600 dark:text-amber-300">uji</span>}</td>
                <td>{plans.find((p) => p.id === o.plan)?.label ?? o.plan}{o.license_id ? <span className="text-muted-foreground"> · lisensi #{o.license_id}</span> : null}</td>
                <td className="whitespace-nowrap tabular-nums">{rupiah(o.amount ?? o.base_amount)}</td>
                <td><span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap ${cls}`}>{label}</span></td>
                <td className="whitespace-nowrap text-muted-foreground">{fmtTime(o.created_at)}</td>
                <td className="text-right">{o.status === "pending" && o.pay_url && <a href={o.pay_url} className="inline-flex h-7 items-center rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/80">Bayar</a>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Timeline of account/license events (newest first). */
export function ActivityList({ events, empty = "Belum ada aktivitas." }: { events: MemberEvent[]; empty?: string }) {
  if (!events.length) return <p className="p-4 text-[0.8125rem] text-muted-foreground">{empty}</p>;
  return (
    <ol className="divide-y">
      {events.map((e) => {
        const { label, tone, detail } = describeMemberEvent(e);
        return (
          <li key={e.id} className="grid grid-cols-[0.75rem_1fr_auto] items-start gap-3 px-4 py-2.5 text-[0.8125rem]">
            <span className={`mt-1.5 size-2 rounded-full ${TONE_DOT[tone]}`} />
            <div className="min-w-0">
              <p className="font-medium">{label}</p>
              {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
            </div>
            <time className="text-xs whitespace-nowrap text-muted-foreground">{fmtTime(e.at)}</time>
          </li>
        );
      })}
    </ol>
  );
}

/** Days left per license as bars on one scale (lifetime = full bar), soonest first. */
export function LicenseTimeline({ licenses, now }: { licenses: MemberLicense[]; now: number }) {
  const rows = licenses
    .filter((l) => l.status !== "revoked")
    .map((l) => ({ l, days: l.expires_at == null ? null : Math.max(0, Math.ceil((l.expires_at - now) / 86400)) }))
    .sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9));
  if (!rows.length) return <p className="p-4 text-[0.8125rem] text-muted-foreground">Belum ada lisensi.</p>;
  const max = Math.max(30, ...rows.map((r) => r.days ?? 0));
  return (
    <ul className="grid gap-3 p-4">
      {rows.map(({ l, days }) => (
        <li key={l.id} className="grid gap-1.5">
          <div className="flex items-center gap-2 text-[0.8125rem]">
            <span className="font-medium">{l.planLabel}</span>
            <span className="font-mono text-xs text-muted-foreground">…{l.key_hint}</span>
            <span className={`ml-auto tabular-nums ${days != null && days <= 7 ? "font-medium text-amber-600 dark:text-amber-300" : "text-muted-foreground"}`}>
              {days == null ? "Selamanya" : days === 0 ? "Habis" : `${days} hari · s/d ${fmtDate(l.expires_at)}`}
            </span>
          </div>
          <Meter value={days == null ? 1 : days / max} warn={days != null && days <= 7} label={`Sisa masa aktif ${l.planLabel}`} />
        </li>
      ))}
    </ul>
  );
}
