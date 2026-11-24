import Link from "next/link";
import { asc } from "drizzle-orm";
import { CircleAlert, CircleCheck, CircleDashed, Clock, KeyRound, LogIn, ShieldOff } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PlatformIcon } from "@/components/platform-icon";
import { PLATFORM } from "@/lib/platforms";
import { db } from "@/lib/db";
import { accounts, PLATFORMS, type Account } from "@/lib/db/schema";
import { AccountActions } from "./row-actions";
import { ConnectTile, TikTokConnectButton } from "./tiktok-connect";

export const dynamic = "force-dynamic";

const STATUS = {
  active: { label: "Aktif", icon: CircleCheck, cls: "text-status-ok bg-status-ok/10 border-status-ok/25" },
  need_login: { label: "Perlu login", icon: CircleAlert, cls: "text-status-progress bg-status-progress/10 border-status-progress/30" },
  disabled: { label: "Nonaktif", icon: CircleDashed, cls: "text-muted-foreground bg-muted border-border" },
} as const;

const TZ = "Asia/Jakarta";
const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
const rtf = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });

function ago(d: Date | null) {
  if (!d) return "Belum pernah";
  const s = Math.round((d.getTime() - Date.now()) / 1000);
  if (s > -60) return "Baru saja";
  if (s > -3600) return rtf.format(Math.round(s / 60), "minute");
  if (s > -86400) return rtf.format(Math.round(s / 3600), "hour");
  return dateFmt.format(d);
}

function AccountCard({ a }: { a: Account }) {
  const s = STATUS[a.status];
  const hasSession = !!a.sessionKey?.startsWith("cfx_");
  const needsLogin = a.status === "need_login" || !hasSession;
  return (
    <article
      className={`flex flex-col rounded-xl border bg-card p-4 transition-colors hover:border-ring/30 ${needsLogin ? "border-status-progress/40" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          {a.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote CDN avatar, may expire; plain img fails soft
            <img src={a.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-12 rounded-full border bg-muted object-cover" />
          ) : (
            <span className="grid size-12 place-items-center rounded-full border bg-muted text-base font-semibold uppercase text-muted-foreground">
              {a.username.slice(0, 1)}
            </span>
          )}
          <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full border bg-card">
            <PlatformIcon platform={a.platform} className="size-3" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{a.displayName || a.username}</p>
          <p className="truncate text-xs text-muted-foreground">{a.username.includes("@") ? a.username : `@${a.username}`}</p>
        </div>
        <span className={`flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium ${s.cls}`}>
          <s.icon className="size-3" />
          {s.label}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-muted/60 px-2.5 py-2">
          <dt className="flex items-center gap-1 text-muted-foreground"><LogIn className="size-3" /> Login</dt>
          <dd className="mt-0.5 font-medium">{ago(a.lastLoginAt)}</dd>
        </div>
        <div className="rounded-lg bg-muted/60 px-2.5 py-2">
          <dt className="flex items-center gap-1 text-muted-foreground"><Clock className="size-3" /> Dicek</dt>
          <dd className="mt-0.5 font-medium">{ago(a.lastCheckAt)}</dd>
        </div>
      </dl>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        {hasSession ? (
          <><KeyRound className="size-3.5 text-status-ok" /> Profil browser + sidik jari sendiri</>
        ) : (
          <><ShieldOff className="size-3.5" /> Belum ada sesi login</>
        )}
      </p>

      <div className="mt-auto pt-4">
        <AccountActions id={a.id} platform={a.platform} username={a.username} hasSession={hasSession} needsLogin={needsLogin} />
      </div>
    </article>
  );
}

export default async function AkunPage({ searchParams }: PageProps<"/akun">) {
  const { platform } = await searchParams;
  const filter = PLATFORMS.find((p) => p === platform);
  const all = await db.select().from(accounts).orderBy(asc(accounts.platform), asc(accounts.username));
  const rows = filter ? all.filter((a) => a.platform === filter) : all;
  const counts = PLATFORMS.map((p) => ({ p, n: all.filter((a) => a.platform === p).length })).filter((x) => x.n);
  const attention = all.filter((a) => a.status !== "active" || !a.sessionKey?.startsWith("cfx_")).length;

  const chip = (active: boolean) =>
    `flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${active ? "border-primary/40 bg-primary/10 text-brand-light" : "bg-background text-muted-foreground hover:text-foreground"}`;

  return (
    <>
      <PageHeader slug="akun">
        <TikTokConnectButton />
      </PageHeader>

      <div className="-mt-2 flex flex-wrap items-center gap-2">
        <Link href="/akun" className={chip(!filter)}>
          Semua <span className="tabular-nums opacity-70">{all.length}</span>
        </Link>
        {counts.map(({ p, n }) => (
          <Link key={p} href={`/akun?platform=${p}`} className={chip(filter === p)}>
            <PlatformIcon platform={p} className="size-3.5" />
            {PLATFORM[p].label} <span className="tabular-nums opacity-70">{n}</span>
          </Link>
        ))}
        {attention > 0 && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-status-progress">
            <CircleAlert className="size-3.5" /> {attention} akun perlu login
          </span>
        )}
      </div>

      <div className="grid flex-1 content-start gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {rows.map((a) => <AccountCard key={a.id} a={a} />)}
        <ConnectTile />
      </div>
    </>
  );
}
