import type { Metadata } from "next";
import Link from "next/link";
import { LayoutDashboard, LogOut, MessageCircle } from "lucide-react";
import { nowSec } from "@/lib/format";
import { myOrders, requireMember, waLink } from "@/lib/license-api";
import { logout } from "../actions";
import { AccountNav } from "./nav";
import { Avatar } from "./ui";

export const metadata: Metadata = { title: { template: "%s · Akun Traktiva", default: "Akun" }, robots: { index: false, follow: false } };

/** Member area frame: who is signed in + section menu on the left, the page on the right. */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const [v, orders] = await Promise.all([requireMember(), myOrders()]);
  const u = v.user;
  const now = nowSec();
  const ending = v.licenses.filter((l) => l.status !== "revoked" && l.expires_at != null && l.expires_at - now < 7 * 86400).length;
  const unpaid = orders.filter((o) => o.status === "pending").length;
  const help = waLink(v.site, "Halo, saya butuh bantuan soal akun Traktiva.");

  return (
    <div className="mx-auto grid max-w-[1260px] gap-8 px-5 py-8 md:px-8 md:py-12 lg:grid-cols-[248px_1fr] lg:gap-10">
      <aside className="grid content-start gap-5 lg:sticky lg:top-24 lg:self-start">
        <div className="flex items-center gap-3">
          <Avatar user={u} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-[16px] font-medium">{u.name || u.email.split("@")[0]}</p>
            <p className="truncate text-[13px] text-[var(--site-muted)]">{u.email}</p>
          </div>
        </div>
        <AccountNav badges={{ "/akun/lisensi": ending || undefined, "/akun/pesanan": unpaid || undefined, "/akun/pengaturan": u.isAdmin && !u.totp ? "!" : undefined }} />
        <div className="hidden gap-1 border-t border-white/8 pt-4 lg:grid">
          {u.isAdmin && (
            <Link href="/admin" className="flex h-10 items-center gap-3 rounded-xl px-4 text-[14px] text-[var(--site-body)] hover:bg-white/[0.04] hover:text-white">
              <LayoutDashboard className="size-4" /> Panel admin
            </Link>
          )}
          {help && (
            <a href={help} target="_blank" rel="noreferrer" className="flex h-10 items-center gap-3 rounded-xl px-4 text-[14px] text-[var(--site-body)] hover:bg-white/[0.04] hover:text-white">
              <MessageCircle className="size-4" /> Bantuan
            </a>
          )}
          <form action={logout}>
            <button type="submit" className="flex h-10 w-full items-center gap-3 rounded-xl px-4 text-[14px] text-[var(--site-body)] hover:bg-white/[0.04] hover:text-white">
              <LogOut className="size-4" /> Keluar
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
