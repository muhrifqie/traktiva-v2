"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, KeyRound, LogOut, Megaphone, Receipt, Rocket, ScrollText, Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "../actions";

const NAV = [
  { href: "/admin", label: "Ringkasan", icon: House },
  { href: "/admin/lisensi", label: "Lisensi", icon: KeyRound },
  { href: "/admin/member", label: "Member", icon: Users },
  { href: "/admin/pesanan", label: "Pesanan", icon: Receipt },
  { href: "/admin/pengumuman", label: "Pengumuman", icon: Megaphone },
  { href: "/admin/rilis", label: "Rilis", icon: Rocket },
  { href: "/admin/log", label: "Log", icon: ScrollText },
  { href: "/admin/pengaturan", label: "Pengaturan", icon: Settings },
];

export function Sidebar({ name }: { name: string }) {
  const path = usePathname();
  const on = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  return (
    <aside className="flex gap-1 overflow-x-auto p-2 md:flex-col md:p-3">
      <div className="hidden items-center gap-2.5 px-2 pt-1 pb-4 md:flex">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="size-7" />
        <div className="leading-tight">
          <p className="text-sm font-semibold">Traktiva</p>
          <p className="text-[0.6875rem] text-muted-foreground">Admin lisensi</p>
        </div>
      </div>
      <nav className="flex gap-1 md:flex-col">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-[0.8125rem] transition-colors ${on(href) ? "bg-primary/18 text-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-foreground"}`}
          >
            <Icon className={`size-4 ${on(href) ? "text-brand-light" : ""}`} /> {label}
          </Link>
        ))}
      </nav>
      <form action={logout} className="ml-auto flex items-center gap-2 border-border md:mt-auto md:ml-0 md:border-t md:px-1 md:pt-3">
        <span className="grid size-7 place-items-center rounded-full bg-primary text-[0.6875rem] font-bold text-primary-foreground">{name.slice(0, 2).toUpperCase()}</span>
        <span className="hidden truncate text-xs md:inline">{name}</span>
        <Button type="submit" variant="ghost" size="icon-sm" className="md:ml-auto" title="Keluar" aria-label="Keluar">
          <LogOut />
        </Button>
      </form>
    </aside>
  );
}
