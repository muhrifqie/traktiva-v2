import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ThemeToggle } from "@/components/theme-toggle";
import { nowSec } from "@/lib/format";
import { myOrders, requireMember } from "@/lib/license-api";
import { AccountMenu, AccountSidebar } from "./_ui/nav";

export const metadata: Metadata = { title: { template: "%s · Akun Traktiva", default: "Akun" }, robots: { index: false, follow: false } };

/** Member area in the admin panel's style: sidebar on the chrome colour, content in an inset panel (max-w-6xl like the admin). */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const [v, orders, jar] = await Promise.all([requireMember(), myOrders(), cookies()]);
  const u = v.user;
  const now = nowSec();
  const ending = v.licenses.filter((l) => l.status !== "revoked" && l.expires_at != null && l.expires_at - now < 7 * 86400).length;
  const unpaid = orders.filter((o) => o.status === "pending").length;
  const badges = { "/lisensi": ending || undefined, "/pesanan": unpaid || undefined };
  const theme = jar.get("trk_theme")?.value === "light" ? "light" : "dark";
  const menu = { name: u.name ?? "", email: u.email, avatar: u.avatar, isAdmin: u.isAdmin };

  return (
    <div className="grid h-screen grid-cols-1 grid-rows-[auto_1fr] bg-sidebar md:grid-cols-[224px_1fr] md:grid-rows-1">
      <AccountSidebar
        badges={badges}
        footer={
          <div className="flex items-center gap-1">
            <div className="min-w-0 md:flex-1"><AccountMenu {...menu} /></div>
            <ThemeToggle initial={theme} className="size-8 border-0 bg-transparent shadow-none hover:bg-sidebar-accent" />
          </div>
        }
      />
      <main className="overflow-auto rounded-none border-border bg-background md:m-2 md:ml-0 md:rounded-2xl md:border">
        <div className="mx-auto max-w-6xl px-5 py-6 md:px-7">{children}</div>
      </main>
    </div>
  );
}
