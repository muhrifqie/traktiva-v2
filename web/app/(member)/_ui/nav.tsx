"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronDown, KeyRound, LayoutDashboard, LayoutGrid, LogOut, Receipt, Settings } from "lucide-react";
import { logout } from "@/app/(site)/actions";

export const NAV = [
  { href: "/akun", label: "Ringkasan", icon: LayoutGrid },
  { href: "/lisensi", label: "Lisensi", icon: KeyRound },
  { href: "/pesanan", label: "Pesanan", icon: Receipt },
  { href: "/bantuan", label: "Panduan", icon: BookOpen },
  { href: "/pengaturan", label: "Pengaturan", icon: Settings },
] as const;

type Badges = Partial<Record<string, string | number>>;

const useActive = () => {
  const path = usePathname();
  return (href: string) => (href === "/akun" ? path === "/akun" : href === "/pengaturan" ? path.startsWith(href) || path.startsWith("/aktivitas") : path.startsWith(href));
};

/**
 * Same shell as the admin panel: sidebar on the chrome colour (logo, menu, account), content in an inset panel.
 * Phones: the sidebar becomes one scrollable row on top.
 */
export function AccountSidebar({ badges, footer }: { badges: Badges; footer: React.ReactNode }) {
  const on = useActive();
  return (
    <aside className="flex min-w-0 items-center gap-1 p-2 md:flex-col md:items-stretch md:p-3">
      <Link href="/" className="hidden items-center gap-2.5 px-2 pt-1 pb-4 md:flex">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="size-7" />
        <div className="leading-tight">
          <p className="text-sm font-semibold">Traktiva</p>
          <p className="text-[0.6875rem] text-muted-foreground">Area member</p>
        </div>
      </Link>
      <nav aria-label="Menu akun" className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] md:flex-none md:flex-col md:overflow-visible">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={on(href) ? "page" : undefined}
            className={`flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-[0.8125rem] transition-colors ${on(href) ? "bg-primary/18 text-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-foreground"}`}
          >
            <Icon className={`size-4 ${on(href) ? "text-brand-light" : ""}`} /> {label}
            {badges[href] != null && (
              <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[0.6875rem] font-semibold text-primary-foreground">{badges[href]}</span>
            )}
          </Link>
        ))}
      </nav>
      <div className="shrink-0 border-l pl-1 md:mt-auto md:border-t md:border-l-0 md:pt-3 md:pl-0">{footer}</div>
    </aside>
  );
}

/** Avatar button → name/email, admin panel, settings, sign out. */
export function AccountMenu({ name, email, avatar, isAdmin }: { name: string; email: string; avatar: string | null; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  const [seen, setSeen] = useState(path);
  if (seen !== path) {
    setSeen(path);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const item = "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[0.8125rem] text-muted-foreground hover:bg-muted hover:text-foreground";
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" className="flex w-full items-center gap-2 rounded-lg p-1 text-left hover:bg-sidebar-accent md:p-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- Google profile photo */}
        {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" className="size-7 rounded-full object-cover" /> : <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[0.6875rem] font-bold text-primary-foreground uppercase">{(name || email).slice(0, 2)}</span>}
        <span className="hidden min-w-0 flex-1 leading-tight md:block">
          <span className="block truncate text-xs font-semibold">{name || email.split("@")[0]}</span>
          <span className="block truncate text-[0.6875rem] text-muted-foreground">{email}</span>
        </span>
        <ChevronDown className={`hidden size-4 text-muted-foreground transition-transform md:block ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className={`absolute z-50 w-64 rounded-xl border bg-popover p-1.5 shadow-lg top-11 right-0 md:top-auto md:right-auto md:bottom-12 md:left-0`}>
          <div className="px-2.5 pt-1.5 pb-2">
            <p className="truncate text-sm font-semibold">{name || "Akun Traktiva"}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
          {isAdmin && <Link href="/admin" className={item}><LayoutDashboard className="size-4" /> Panel admin</Link>}
          <Link href="/pengaturan" className={item}><Settings className="size-4" /> Pengaturan</Link>
          <form action={logout} className="mt-1 border-t pt-1">
            <button type="submit" className={`${item} w-full`}><LogOut className="size-4" /> Keluar</button>
          </form>
        </div>
      )}
    </div>
  );
}
