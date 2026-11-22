import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ThemeToggle } from "@/components/theme-toggle";
import { nowSec } from "@/lib/format";
import { myOrders, requireMember } from "@/lib/license-api";
import { AccountMenu, AccountSidebar, AccountTabs } from "./_ui/nav";

export const metadata: Metadata = { title: { template: "%s · Akun Traktiva", default: "Akun" }, robots: { index: false, follow: false } };

/**
 * Member area, full screen in the website's own style: a fixed-width sidebar on the left (menu, theme, account) and
 * one wide content column. Phones: a top bar + menu pills instead of the sidebar.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const [v, orders, jar] = await Promise.all([requireMember(), myOrders(), cookies()]);
  const u = v.user;
  const now = nowSec();
  const ending = v.licenses.filter((l) => l.status !== "revoked" && l.expires_at != null && l.expires_at - now < 7 * 86400).length;
  const unpaid = orders.filter((o) => o.status === "pending").length;
  const badges = { "/lisensi": ending || undefined, "/pesanan": unpaid || undefined, "/pengaturan": u.isAdmin && !u.totp ? "!" : undefined };
  const theme = jar.get("trk_theme")?.value === "light" ? "light" : "dark";
  const menu = { name: u.name ?? "", email: u.email, avatar: u.avatar, isAdmin: u.isAdmin };

  return (
    <div className="creator flex min-h-screen">
      <AccountSidebar
        badges={badges}
        footer={
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1"><AccountMenu {...menu} up /></div>
            <ThemeToggle initial={theme} className="size-10 rounded-lg" />
          </div>
        }
      />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur lg:hidden">
          <div className="flex h-16 items-center gap-3 px-5">
            <Link href="/" className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="" className="size-8" />
              <span className="font-display text-xl font-extrabold">Traktiva</span>
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle initial={theme} className="size-10 rounded-lg" />
              <AccountMenu {...menu} />
            </div>
          </div>
          <AccountTabs badges={badges} />
        </header>
        <main className="w-full px-5 py-8 md:px-10 md:py-10 2xl:px-14">{children}</main>
      </div>
    </div>
  );
}
