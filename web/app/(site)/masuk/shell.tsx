import { Check } from "lucide-react";

/** Input style shared by every sign-in form (masuk, daftar, lupa & atur password). */
export const field =
  "h-11 w-full rounded-lg border bg-background px-3.5 text-[15px] outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-[var(--site-signal)] focus:ring-2 focus:ring-[var(--site-signal)]/20";

/**
 * Shared frame of /masuk, /daftar, /lupa-password, /atur-password: the same width and type scale as the rest of the
 * site; promise on the left, the form card on the right.
 */
export function AuthShell({ eyebrow, title, points, card, children }: { eyebrow: string; title: string; points: string[]; card?: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 px-5 py-14 md:px-8 lg:grid-cols-[1fr_27rem] lg:gap-16">
      <div className="hidden lg:block">
        <p className="text-xs font-semibold tracking-wide text-leaf-ink uppercase">{eyebrow}</p>
        <h1 className="mt-3 max-w-md text-4xl leading-tight font-semibold">{title}</h1>
        <ul className="mt-8 grid gap-3 text-[0.9375rem] text-muted-foreground">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-3">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-leaf text-[#fff]"><Check className="size-3" strokeWidth={3} /></span>
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border bg-card p-6 md:p-8">
        {card && <h2 className="mb-6 text-xl font-semibold">{card}</h2>}
        {children}
      </div>
    </main>
  );
}
