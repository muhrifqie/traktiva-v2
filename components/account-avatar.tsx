import Link from "next/link";
import { PlatformIcon } from "@/components/platform-icon";
import { accountColor } from "@/lib/account-color";
import type { PLATFORM } from "@/lib/platforms";

type Acc = { id: number; username: string; avatarUrl: string | null; platform?: keyof typeof PLATFORM; status: string };

/** Avatar (or initial) ringed in the account's fixed color, with its login status dot. */
export function AccountAvatar({ a, size = "size-8" }: { a: Acc; size?: string }) {
  const color = accountColor(a.id);
  return (
    <span className={`relative inline-block ${size} shrink-0`}>
      {a.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote avatar
        <img src={a.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-full rounded-full object-cover ring-2" style={{ ["--tw-ring-color" as string]: color }} />
      ) : (
        <span className="grid size-full place-items-center rounded-full text-[12px] font-semibold uppercase text-white" style={{ background: color }}>{a.username[0]}</span>
      )}
      {a.platform && <span className="absolute -right-0.5 -bottom-0.5 grid size-3.5 place-items-center rounded-full bg-background"><PlatformIcon platform={a.platform} className="size-2.5" /></span>}
      <span className={`absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-background ${a.status === "active" ? "bg-status-ok" : "bg-destructive"}`} />
    </span>
  );
}

/** Account chips on a page that shows one account at a time (Etalase, Performa); hidden with a single account. */
export function AccountTabs({ list, current, href }: { list: Acc[]; current: number; href: (id: number) => string }) {
  if (list.length < 2) return null;
  return (
    <nav className="flex flex-wrap gap-1.5" aria-label="Pilih akun">
      {list.map((a) => (
        <Link key={a.id} href={href(a.id)} className={`flex h-8 items-center gap-2 rounded-full border pr-3 pl-1 text-xs font-medium transition-colors ${a.id === current ? "border-primary/40 bg-primary/10 text-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}>
          <AccountAvatar a={a} size="size-6" />@{a.username}
          {a.status !== "active" && <span className="text-[10px] text-destructive">perlu login</span>}
        </Link>
      ))}
    </nav>
  );
}
