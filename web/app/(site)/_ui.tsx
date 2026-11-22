import Link from "next/link";
import { ArrowRight } from "lucide-react";

const wrap = "mx-auto max-w-6xl px-5 md:px-8";

/** Top of every marketing page: small label, title, one-line intro. */
export function PageHero({ eyebrow, title, sub, children }: { eyebrow: string; title: React.ReactNode; sub: string; children?: React.ReactNode }) {
  return (
    <section className={`${wrap} pt-14 pb-10 md:pt-20`}>
      <p className="rise text-xs font-semibold tracking-wide text-leaf-ink uppercase">{eyebrow}</p>
      <h1 style={{ "--i": 1 } as React.CSSProperties} className="rise mt-3 max-w-3xl text-3xl leading-tight font-semibold md:text-5xl">{title}</h1>
      <p style={{ "--i": 2 } as React.CSSProperties} className="rise mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">{sub}</p>
      {children && <div style={{ "--i": 3 } as React.CSSProperties} className="rise mt-7 flex flex-wrap items-center gap-3">{children}</div>}
    </section>
  );
}

/** A titled block of a page; `action` = a "see more" link on the right. */
export function Section({ id, title, sub, action, children, tint }: { id?: string; title: string; sub?: string; action?: { href: string; label: string }; children: React.ReactNode; tint?: boolean }) {
  return (
    <section id={id} className={`scroll-mt-20 py-16 md:py-20 ${tint ? "border-y bg-card" : ""}`}>
      <div className={wrap}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="max-w-2xl text-2xl leading-tight font-semibold md:text-3xl">{title}</h2>
            {sub && <p className="mt-2 max-w-xl text-muted-foreground">{sub}</p>}
          </div>
          {action && (
            <Link href={action.href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-leaf-ink hover:underline">
              {action.label} <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

/** Expandable questions. */
export function FaqList({ items }: { items: [string, string][] }) {
  return (
    <div className="grid gap-2.5">
      {items.map(([q, a]) => (
        <details key={q} className="group rounded-xl border bg-card px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
            {q}
            <span className="grid size-7 shrink-0 place-items-center rounded-full border text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>+</span>
          </summary>
          <p className="mt-3 max-w-3xl text-[0.9375rem] leading-relaxed text-muted-foreground">{a}</p>
        </details>
      ))}
    </div>
  );
}

/** Closing call to action, the same on every page. */
export function CtaBand({ title = "Produk sudah ada. Tinggal videonya.", sub = "Daftar gratis, pilih paket, dan buat video pertamamu hari ini." }: { title?: string; sub?: string }) {
  return (
    <section className={`${wrap} pb-20`}>
      <div className="flex flex-col gap-6 rounded-xl bg-leaf px-7 py-10 text-[#fff] md:flex-row md:items-center md:px-10">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl leading-tight font-semibold md:text-3xl">{title}</h2>
          <p className="mt-2 opacity-80">{sub}</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/harga" className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#fff] px-5 text-sm font-semibold text-[#106e3a] hover:opacity-90">Lihat paket <ArrowRight className="size-4" /></Link>
          <Link href="/daftar" className="inline-flex h-11 items-center rounded-lg border border-[#fff]/40 px-5 text-sm font-semibold hover:border-[#fff]">Daftar gratis</Link>
        </div>
      </div>
    </section>
  );
}

/** Long-form text (privacy, terms): readable column with numbered sections. */
export function Prose({ updated, children }: { updated: string; children: React.ReactNode }) {
  return (
    <article className={`${wrap} pb-20`}>
      <div className="max-w-3xl rounded-xl border bg-card p-6 md:p-10 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2:first-child]:mt-0 [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 text-[0.9375rem] leading-relaxed text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground [&_h2]:text-foreground">
        {children}
        <p className="mt-10 border-t pt-5 text-xs">Terakhir diperbarui: {updated}</p>
      </div>
    </article>
  );
}

export const WRAP = wrap;
