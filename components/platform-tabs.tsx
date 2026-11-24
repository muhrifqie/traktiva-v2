import Link from "next/link";
import { ChevronLeft } from "lucide-react";

// Numbered page tabs under a platform page header, so a platform reads as one place with a few pages:
// TikTok = one account's 1 Profil · 2 Etalase (from the account cards on /tiktok-shop);
// YouTube = one channel's 1 Channel · 2 Performa · 3 Unduh Shorts (from the channel cards on /youtube).

function Tabs({ tabs, back }: { tabs: { href: string; label: string; on: boolean }[]; back?: { href: string; label: string } }) {
  return (
    <nav aria-label="Halaman" className="-mt-2 flex w-full items-center gap-2">
      {back && (
        <Link href={back.href} className="flex h-11 shrink-0 items-center gap-1 rounded-lg border bg-card px-3 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground">
          <ChevronLeft className="size-4" /> {back.label}
        </Link>
      )}
      <div className="flex min-w-0 flex-1 rounded-lg border bg-card p-1">
        {tabs.map((t, i) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.on ? "page" : undefined}
            className={`flex h-9 min-w-0 flex-1 items-center justify-center gap-2 rounded-md px-3 text-[13px] font-medium ${t.on ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <span className={`grid size-5 place-items-center rounded-full text-[11px] tabular-nums ${t.on ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{i + 1}</span>
            <span className="truncate">{t.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** One TikTok account: 1 Profil, 2 Etalase; back to every account. */
export function TikTokTabs({ accountId, current }: { accountId: number; current: "profil" | "showcase" }) {
  return (
    <Tabs
      back={{ href: "/tiktok-shop", label: "Semua akun TikTok" }}
      tabs={[
        { href: `/profil?akun=${accountId}`, label: "Profil", on: current === "profil" },
        { href: `/showcase?akun=${accountId}`, label: "Etalase", on: current === "showcase" },
      ]}
    />
  );
}

/** One YouTube channel: 1 Channel, 2 Performa, 3 Unduh Shorts; back to every channel. */
export function YouTubeTabs({ accountId, current }: { accountId: number; current: "performa" | "channel" | "shorts" }) {
  return (
    <Tabs
      back={{ href: "/youtube", label: "Semua channel YouTube" }}
      tabs={[
        { href: `/youtube-channel?akun=${accountId}`, label: "Channel", on: current === "channel" },
        { href: `/youtube-performa?akun=${accountId}`, label: "Performa", on: current === "performa" },
        { href: `/youtube-shorts?akun=${accountId}`, label: "Unduh Shorts", on: current === "shorts" },
      ]}
    />
  );
}
