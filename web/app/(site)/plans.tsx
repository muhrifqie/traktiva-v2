import Link from "next/link";
import { Check } from "lucide-react";
import { rupiah } from "@/lib/format";
import { waLink, type Plan, type PublicInfo } from "@/lib/license-api";

/** Where a plan's buy button goes: online checkout (QRIS) when sold online, else the seller's WhatsApp. */
export function buyHref(info: PublicInfo | null, p: Plan) {
  if (info?.buyOnline && p.price >= 1000) return `/beli?plan=${p.id}`;
  return waLink(info?.site, `Halo, saya mau beli lisensi Traktiva paket ${p.label}.`);
}

const perMonth = (p: Plan) => (p.days && p.days >= 60 && p.price ? Math.round(p.price / (p.days / 30)) : null);
/** The "best value" plan: the cheapest per month among the timed ones. */
export const featuredId = (plans: Plan[]) =>
  plans.filter((p) => p.price && p.days).sort((a, b) => a.price / a.days! - b.price / b.days!)[0]?.id ?? plans[1]?.id;

export function PlanCard({ p, href, featured }: { p: Plan; href: string | null; featured?: boolean }) {
  const monthly = perMonth(p);
  const perks = [`${p.days ? `${p.days} hari` : "Selamanya"} akses penuh`, `${p.devices} PC`, "Semua fitur & update", "Bantuan via WhatsApp"];
  return (
    <div className={`reveal lift relative flex flex-col rounded-[1.75rem] border p-7 ${featured ? "border-transparent bg-primary text-primary-foreground" : "bg-card"}`}>
      {featured && <span className="absolute -top-3 left-7 rounded-full bg-foreground px-3 py-1 text-xs font-bold text-background">Paling hemat</span>}
      <p className="font-display text-2xl font-bold">{p.label}</p>
      <p className={`mt-1 text-sm ${featured ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
        {p.days ? (p.days >= 365 ? "Setahun penuh, bayar sekali" : `${p.days} hari, cocok untuk mencoba`) : "Bayar sekali, pakai terus"}
      </p>
      <p className="mt-6 font-display text-4xl font-bold tabular-nums">{p.price ? rupiah(p.price) : "Hubungi kami"}</p>
      <p className={`mt-1 h-5 text-sm ${featured ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{monthly ? `≈ ${rupiah(monthly)} / bulan` : ""}</p>
      {href ? (
        href.startsWith("/") ? (
          <Link href={href} className={`mt-6 inline-flex h-12 items-center justify-center rounded-lg font-semibold ${featured ? "bg-primary-foreground text-primary hover:opacity-90" : "bg-foreground text-background hover:opacity-90"}`}>Beli {p.label}</Link>
        ) : (
          <a href={href} target="_blank" rel="noreferrer" className={`mt-6 inline-flex h-12 items-center justify-center rounded-lg font-semibold ${featured ? "bg-primary-foreground text-primary hover:opacity-90" : "bg-foreground text-background hover:opacity-90"}`}>Beli {p.label}</a>
        )
      ) : (
        <span className="mt-6 inline-flex h-12 items-center justify-center rounded-lg border font-semibold opacity-60">Segera dibuka</span>
      )}
      <ul className="mt-7 grid gap-3 text-sm">
        {perks.map((x) => (
          <li key={x} className="flex items-center gap-2.5"><Check className={`size-4 shrink-0 ${featured ? "" : "text-leaf-ink"}`} /> {x}</li>
        ))}
      </ul>
    </div>
  );
}
