import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, Cpu, Download, Info, LayoutDashboard, LogOut, Megaphone, MessageCircle, Monitor, Receipt, ShieldCheck, TriangleAlert } from "lucide-react";
import { fmtDate, fmtTime, licenseState, nowSec, rupiah, STATE_LABEL } from "@/lib/format";
import { asMember, requireMember, waLink, type MemberLicense, type MemberOrder, type MemberView } from "@/lib/license-api";
import { logout } from "../actions";
import { BuyButton, ClaimForm, PasswordForm, ProfileForm, ReleaseDevice, TwoFaForm } from "./forms";

export const metadata: Metadata = { title: "Akun", robots: { index: false, follow: false } };

const TONE = {
  info: { icon: Info, cls: "border-[#4ea7fc]/30 text-[#9ccbff]" },
  warn: { icon: TriangleAlert, cls: "border-amber-300/30 text-amber-200" },
  critical: { icon: Megaphone, cls: "border-red-400/40 text-red-200" },
} as const;

function Avatar({ user }: { user: MemberView["user"] }) {
  // eslint-disable-next-line @next/next/no-img-element -- Google profile photo
  if (user.avatar) return <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="size-14 rounded-2xl object-cover" />;
  return <span className="grid size-14 place-items-center rounded-2xl bg-[var(--site-pine)] text-2xl font-light uppercase">{(user.name || user.email)[0]}</span>;
}

/** One license: status, time left, PCs (HWID-locked) with self-service release, renew via WhatsApp. */
function LicenseCard({ l, plans, site, now, buyOnline }: { l: MemberLicense; plans: MemberView["plans"]; site: MemberView["site"]; now: number; buyOnline: boolean }) {
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

const ORDER_LABEL: Record<MemberOrder["status"], [string, string]> = {
  pending: ["Menunggu bayar", "text-amber-200"],
  paid: ["Lunas", "text-[var(--site-signal)]"],
  expired: ["Kedaluwarsa", "text-[var(--site-muted)]"],
  cancelled: ["Dibatalkan", "text-[var(--site-muted)]"],
  mismatch: ["Perlu dicek penjual", "text-red-300"],
};

export default async function Account({ searchParams }: { searchParams: Promise<{ perlu2fa?: string; order?: string }> }) {
  const [v, q] = await Promise.all([requireMember(), searchParams]);
  const now = nowSec();
  const u = v.user;
  // ponytail: orders only exist once online payments were used; a failing list just hides the section
  const orders = await asMember<{ orders: MemberOrder[] }>("/internal/member/orders").then((r) => r.orders, () => [] as MemberOrder[]);
  const justPaid = q.order ? orders.find((o) => o.id === q.order) : undefined;
  const ending = v.licenses.filter((l) => l.status !== "revoked" && l.expires_at != null && l.expires_at - now < 7 * 86400);

  return (
    <main className="mx-auto max-w-[1260px] px-5 py-12 md:px-8 md:py-16">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar user={u} />
        <div className="min-w-0">
          <h1 className="truncate text-[32px] leading-[1.1] font-light tracking-[-0.02em] md:text-[44px]">{u.name || u.email.split("@")[0]}</h1>
          <p className="truncate text-[15px] text-[var(--site-body)]">
            {u.email}{u.google && " · terhubung Google"} · member sejak {fmtDate(u.created_at)}
          </p>
        </div>
        {u.isAdmin && (
          <Link href="/admin" className="site-pill-outline site-sm ml-auto"><LayoutDashboard className="size-4" /> Panel admin</Link>
        )}
        <form action={logout} className={u.isAdmin ? "" : "ml-auto"}>
          <button type="submit" className="site-pill-outline site-sm"><LogOut className="size-4" /> Keluar</button>
        </form>
      </div>

      {q.perlu2fa && (
        <p className="mt-8 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-[15px] text-amber-100" role="alert">
          Panel admin butuh verifikasi 2 langkah. Pasang dulu di bagian <a href="#keamanan" className="underline">Profil & keamanan</a>, lalu buka Panel admin lagi.
        </p>
      )}
      {justPaid && (
        <p className={`mt-8 rounded-2xl border px-4 py-3 text-[15px] ${justPaid.status === "paid" ? "border-[var(--site-signal)]/30 bg-[var(--site-signal)]/10 text-[var(--site-signal)]" : "border-white/15 bg-white/[0.03] text-[var(--site-body)]"}`} role="status">
          {justPaid.status === "paid"
            ? "Pembayaran diterima. Lisensimu sudah aktif/diperpanjang di bawah ini."
            : justPaid.status === "pending"
              ? "Pembayaran belum masuk. Kalau sudah bayar, tunggu 1 menit lalu muat ulang halaman ini."
              : `Pesanan ${ORDER_LABEL[justPaid.status][0].toLowerCase()}.`}
        </p>
      )}
      {ending.length > 0 && (
        <div className="mt-8 flex gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] px-4 py-3 text-[15px] text-amber-100">
          <BellRing className="mt-0.5 size-4 shrink-0" />
          <p>
            {ending.map((l) => {
              const d = Math.ceil((l.expires_at! - now) / 86400);
              return `Lisensi ${l.planLabel} (…${l.key_hint}) ${d > 0 ? `habis ${d} hari lagi` : "sudah habis"}`;
            }).join(" · ")}
            . Perpanjang supaya app tidak terkunci.
          </p>
        </div>
      )}

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

      <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="grid content-start gap-4" aria-label="Lisensi">
          {v.licenses.length ? (
            v.licenses.map((l) => <LicenseCard key={l.id} l={l} plans={v.plans} site={v.site} now={now} buyOnline={v.buyOnline} />)
          ) : (
            <div className="rounded-3xl bg-[var(--site-card)] p-7 md:p-9">
              <h2 className="text-[26px] font-[330] tracking-[-0.01em]">Belum ada lisensi di akun ini</h2>
              <p className="mt-2 max-w-lg text-[15px] text-[var(--site-body)]">Masukkan key yang kamu terima setelah membeli. Cukup sekali: setelah itu semua info lisensi dan PC-nya ada di sini.</p>
              <div className="mt-6 max-w-md"><ClaimForm big /></div>
              {v.buyOnline ? (
                <div className="mt-8 border-t border-white/8 pt-6">
                  <p className="text-[15px] font-medium">Belum punya key? Beli langsung, bayar QRIS, key aktif otomatis.</p>
                  <div className="mt-4 flex flex-wrap gap-4">
                    {v.plans.filter((p) => p.price >= 1000).map((p) => (
                      <BuyButton key={p.id} plan={p.id} label={`${p.label} · ${rupiah(p.price)}`} outline />
                    ))}
                  </div>
                </div>
              ) : (
                <Link href="/#harga" className="mt-4 inline-block text-[14px] text-[var(--site-body)] underline hover:text-white">Belum punya key? Lihat paket</Link>
              )}
            </div>
          )}
        </section>

        <aside className="grid content-start gap-4">
          {v.licenses.length > 0 && (
            <section className="rounded-3xl bg-[var(--site-card)] p-6">
              <h2 className="mb-4 text-[18px] font-[400]">Tambah lisensi</h2>
              <ClaimForm />
            </section>
          )}

          <section className="flex flex-col rounded-3xl bg-[var(--site-card)] p-6">
            <Download className="size-5 text-[var(--site-signal)]" />
            <h2 className="mt-3 text-[18px] font-[400]">Download Traktiva</h2>
            {v.latest ? (
              <>
                <p className="mt-1 text-[14px] text-[var(--site-body)]">Versi {v.latest.version} · {fmtDate(v.latest.created_at)} · Windows 10/11</p>
                {v.latest.notes && <p className="mt-3 line-clamp-3 whitespace-pre-line text-[14px] text-[var(--site-body)]">{v.latest.notes}</p>}
                <a href={v.latest.url} target="_blank" rel="noreferrer" className="site-pill site-sm mt-4 self-start"><Download className="size-4" /> Download v{v.latest.version}</a>
              </>
            ) : (
              <p className="mt-1 text-[14px] text-[var(--site-body)]">Link download belum tersedia. Hubungi penjual.</p>
            )}
          </section>

          {orders.length > 0 && (
            <section className="rounded-3xl bg-[var(--site-card)] p-6">
              <h2 className="flex items-center gap-2 text-[18px] font-[400]"><Receipt className="size-5 text-[var(--site-signal)]" /> Pesanan</h2>
              <ul className="mt-3 divide-y divide-white/8">
                {orders.map((o) => {
                  const [label, cls] = ORDER_LABEL[o.status];
                  return (
                    <li key={o.id} className="grid gap-0.5 py-3 text-[14px]">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{v.plans.find((p) => p.id === o.plan)?.label ?? o.plan}</span>
                        <span className={`ml-auto text-[13px] ${cls}`}>{label}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[12px] text-[var(--site-muted)]">
                        {rupiah(o.amount ?? o.base_amount)} · {fmtTime(o.created_at)}{!o.livemode && " · uji"}
                        {o.status === "pending" && o.pay_url && <a href={o.pay_url} className="ml-auto text-[var(--site-body)] underline hover:text-white">Bayar</a>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <details id="keamanan" open={!!q.perlu2fa} className="group scroll-mt-20 rounded-3xl bg-[var(--site-card)] p-6">
            <summary className="flex cursor-pointer list-none items-center justify-between text-[18px] font-[400]">
              Profil & keamanan <span className="text-[var(--site-muted)] transition-transform group-open:rotate-45" aria-hidden>+</span>
            </summary>
            <div className="mt-5 grid gap-6">
              <ProfileForm name={u.name} phone={u.phone} />
              <div className="border-t border-white/8 pt-5">
                <p className="mb-3 flex items-center gap-2 text-[14px] font-medium"><ShieldCheck className="size-4 text-[var(--site-signal)]" /> Verifikasi 2 langkah</p>
                <TwoFaForm on={u.totp} />
              </div>
              <div className="border-t border-white/8 pt-5">
                <p className="mb-3 text-[13px] text-[var(--site-muted)]">
                  {u.hasPassword ? "Ganti password akun." : "Akun ini masuk lewat Google. Buat password kalau mau bisa masuk pakai email juga."}
                </p>
                <PasswordForm hasPassword={u.hasPassword} />
              </div>
            </div>
          </details>
        </aside>
      </div>
    </main>
  );
}
