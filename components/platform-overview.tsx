import Link from "next/link";
import { ExternalLink, type LucideIcon } from "lucide-react";
import { AccountAvatar } from "@/components/account-avatar";
import type { PLATFORM } from "@/lib/platforms";

// Shared building blocks of every platform's Ringkasan page (TikTok Shop, YouTube, later Shopee…): the same tiles on
// top and the same account card, so each platform overview reads the same way.

export type Tile = { icon: LucideIcon; label: string; value: string | number; sub?: string };

/** Summary tiles: icon in the platform's color, label, big number, small note. */
export function OverviewTiles({ tiles, color }: { tiles: Tile[]; color: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: `${color}1a`, color }}>
            <t.icon className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{t.label}</p>
            <p className="truncate text-lg leading-tight font-semibold tabular-nums">
              {t.value}
              {t.sub && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{t.sub}</span>}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export type CardAction = { href: string; label: string; icon: LucideIcon; primary?: boolean; external?: boolean };
type CardAccount = { id: number; username: string; displayName: string | null; avatarUrl: string | null; status: string; platform: keyof typeof PLATFORM };

/** One account/channel: who, login state, six numbers, an optional warning, and its actions. */
export function AccountOverviewCard({
  a, stats, warning, actions, loginHref, note, href, children,
}: {
  a: CardAccount;
  stats: { icon: LucideIcon; label: string; value: string | number }[];
  warning?: React.ReactNode;
  actions: CardAction[];
  loginHref: string; // where "Perlu login" leads
  note?: string; // small line under the numbers (e.g. when the data was refreshed)
  href?: string; // the account's own page: avatar and name open it
  children?: React.ReactNode; // platform-specific block above the buttons (Facebook: post as)
}) {
  const handle = a.username.includes("@") ? a.username : `@${a.username}`;
  return (
    <section className="flex flex-col gap-2.5 rounded-xl border bg-card p-3 transition-colors hover:border-ring/30">
      <header className="flex items-center gap-2.5">
        {href ? (
          <Link href={href} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg hover:opacity-80">
            <AccountAvatar a={a} size="size-9" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">{a.displayName || handle}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{handle}</span>
            </span>
          </Link>
        ) : (
          <>
            <AccountAvatar a={a} size="size-9" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">{a.displayName || handle}</p>
              <p className="truncate text-[11px] text-muted-foreground">{handle}</p>
            </div>
          </>
        )}
        {a.status === "active" ? (
          <span className="rounded-full bg-status-ok/10 px-2 py-0.5 text-[11px] font-medium text-status-ok">Login</span>
        ) : (
          <Link href={loginHref} className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive hover:underline">Perlu login</Link>
        )}
      </header>
      {/* numbers as one compact row of chips (they wrap), so many accounts still fit on one screen */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {stats.map((s) => (
          <span key={s.label} className="flex items-center gap-1 whitespace-nowrap" title={s.label}>
            <s.icon className="size-3 shrink-0 text-muted-foreground" />
            <b className="font-semibold tabular-nums">{s.value}</b>
            <span className="text-muted-foreground">{s.label}</span>
          </span>
        ))}
      </div>
      {(note || warning) && (
        <p className="truncate text-[11px] text-muted-foreground" title={typeof warning === "string" ? warning : undefined}>
          {warning ? <span className="text-amber-600 dark:text-amber-300">{warning}</span> : note}
          {warning && note ? <span> · {note}</span> : null}
        </p>
      )}
      {children}
      <div className="mt-auto grid gap-1.5 text-[11px] font-medium" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
        {actions.map((x) => {
          const cls = `flex h-7 items-center justify-center gap-1 rounded-md ${x.primary ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border hover:bg-accent"}`;
          const body = (
            <>
              <x.icon className="size-3" /> {x.label}
              {x.external && <ExternalLink className="size-3 opacity-60" />}
            </>
          );
          return x.external ? (
            <a key={x.label} href={x.href} target="_blank" rel="noreferrer" className={cls}>{body}</a>
          ) : (
            <Link key={x.label} href={x.href} className={cls}>{body}</Link>
          );
        })}
      </div>
    </section>
  );
}

/** Empty state of a platform overview: centered, with its connect button. */
export function OverviewEmpty({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center">
      {icon}
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{text}</p>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
