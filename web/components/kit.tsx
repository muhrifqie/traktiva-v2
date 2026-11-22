// Shared page building blocks for the member area and the admin panel, in the desktop app's style (cards with a
// border, 13px body text, green primary). All sizes are rem, so they follow the wide-screen scale in globals.css.
import { CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { STATE_CLASS, STATE_LABEL, type LicenseState } from "@/lib/format";

type Icon = React.ComponentType<{ className?: string }>;

/** Page title row (title, one-line description, actions on the right). */
export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 [.creator_&]:mb-0">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight [.creator_&]:text-4xl [.creator_&]:font-bold">{title}</h1>
        {sub && <p className="mt-0.5 text-[0.8125rem] text-muted-foreground [.creator_&]:mt-2 [.creator_&]:text-[0.9375rem]">{sub}</p>}
      </div>
      {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Card with a title bar; `bodyClass=""` for edge-to-edge content (tables, lists). */
export function Panel({ title, desc, icon: I, id, action, children, bodyClass = "p-4", className = "" }: {
  title: React.ReactNode; desc?: React.ReactNode; icon?: Icon; id?: string; action?: React.ReactNode; children: React.ReactNode; bodyClass?: string; className?: string;
}) {
  return (
    <section id={id} className={`rise scroll-mt-6 rounded-xl border bg-card [.creator_&]:flex [.creator_&]:flex-col ${className}`}>
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold [.creator_&]:font-display [.creator_&]:text-base [.creator_&]:font-bold">{I && <I className="size-4 text-brand-light" />} {title}</p>
          {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
        </div>
        {action && <div className="ml-auto">{action}</div>}
      </header>
      <div className={`[.creator_&]:flex-1 ${bodyClass}`}>{children}</div>
    </section>
  );
}

/** KPI tile. */
export function StatCard({ icon: I, label, value, hint, warn, children }: { icon: Icon; label: string; value: React.ReactNode; hint?: string; warn?: boolean; children?: React.ReactNode }) {
  return (
    <div className="rise lift rounded-xl border bg-card p-4 [.creator_&]:p-5">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground [.creator_&]:font-semibold"><I className="size-3.5" /> {label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums [.creator_&]:font-display [.creator_&]:text-4xl [.creator_&]:font-bold ${warn ? "text-amber-600 dark:text-amber-300" : ""}`}>{value}</p>
      {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

const NOTICE = {
  info: { icon: Info, cls: "border-sky-500/25 bg-sky-500/5 text-sky-700 dark:text-sky-300" },
  warn: { icon: TriangleAlert, cls: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300" },
  bad: { icon: TriangleAlert, cls: "border-destructive/30 bg-destructive/5 text-destructive" },
  ok: { icon: CheckCircle2, cls: "border-status-ok/30 bg-status-ok/5 text-status-ok" },
} as const;

/** One-line alert strip. */
export function Notice({ tone = "info", icon, children }: { tone?: keyof typeof NOTICE; icon?: Icon; children: React.ReactNode }) {
  const { icon: Def, cls } = NOTICE[tone];
  const I = icon ?? Def;
  return (
    <div className={`flex gap-2.5 rounded-lg border px-3 py-2.5 text-[0.8125rem] ${cls}`} role={tone === "warn" || tone === "bad" ? "alert" : "status"}>
      <I className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 text-foreground/90">{children}</div>
    </div>
  );
}

/** License state pill (Aktif / Kedaluwarsa / …). */
export function StatusBadge({ state }: { state: LicenseState | "reset" }) {
  return (
    <span className={`inline-flex h-[1.375rem] items-center gap-1.5 rounded-full px-2 text-[0.6875rem] font-semibold whitespace-nowrap ${STATE_CLASS[state]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {STATE_LABEL[state]}
    </span>
  );
}

/** Empty list placeholder with an optional action. */
export function EmptyState({ icon: I, title, text, children }: { icon: Icon; title: string; text?: string; children?: React.ReactNode }) {
  return (
    <div className="grid justify-items-center gap-1 rounded-xl border border-dashed p-8 text-center">
      <I className="size-6 text-brand-light" />
      <p className="mt-1 text-sm font-medium">{title}</p>
      {text && <p className="max-w-md text-[0.8125rem] text-muted-foreground">{text}</p>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** Table shell: header labels + body rows (cells styled by the caller). */
export function DataTable({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[0.8125rem]">
        <thead className="border-b text-left text-xs text-muted-foreground">
          <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium">{head.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y [&>tr>td]:px-4 [&>tr>td]:py-2.5">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

/** Thin progress bar (days left etc.). */
export function Meter({ value, warn, label }: { value: number; warn?: boolean; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={`grow-x h-full rounded-full ${warn ? "bg-amber-500" : "bg-primary [.creator_&]:bg-leaf-ink"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Small ⓘ with an explanation: shows on hover and on keyboard focus / tap (so it works on phones too). */
export function Hint({ children, side = "top" }: { children: React.ReactNode; side?: "top" | "bottom" }) {
  return (
    <span className="group/hint relative inline-flex align-middle">
      <button type="button" aria-label="Penjelasan" className="grid size-4 place-items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:text-foreground">
        <Info className="size-3.5" />
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-50 w-64 -translate-x-1/2 rounded-lg border bg-popover px-3 py-2 text-left text-xs leading-relaxed font-normal text-popover-foreground opacity-0 shadow-lg transition-opacity group-focus-within/hint:opacity-100 group-hover/hint:opacity-100 ${side === "top" ? "bottom-6" : "top-6"}`}
      >
        {children}
      </span>
    </span>
  );
}
