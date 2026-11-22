"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, AppWindow, ChevronDown, KeyRound, LayoutDashboard, LayoutGrid, LifeBuoy, LogOut, Receipt, Settings } from "lucide-react";
import { logout } from "@/app/(site)/actions";

export const NAV = [
  { href: "/akun", label: "Ringkasan", icon: LayoutGrid },
  { href: "/lisensi", label: "Lisensi", icon: KeyRound },
  { href: "/aplikasi", label: "Aplikasi", icon: AppWindow },
  { href: "/pesanan", label: "Pesanan", icon: Receipt },
  { href: "/aktivitas", label: "Aktivitas", icon: Activity },
  { href: "/bantuan", label: "Bantuan", icon: LifeBuoy },
  { href: "/pengaturan", label: "Pengaturan", icon: Settings },
] as const;

type Badges = Partial<Record<string, string | number>>;

const useActive = () => {
  const path = usePathname();
  return (href: string) => (href === "/akun" ? path === "/akun" : path.startsWith(href));
};

/** Desktop: full-height sidebar with the section menu (fixed width, so the content never resizes). */
export function AccountSidebar({ badges, footer }: { badges: Badges; footer: React.ReactNode }) {
  const on = useActive();
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-card lg:flex">
      <Link href="/" className="flex h-20 shrink-0 items-center gap-3 px-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="size-9" />
        <span className="font-display text-2xl font-extrabold">Traktiva</span>
      </Link>
      <nav aria-label="Menu akun" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
        {NAV.map(({ href, label, icon: Icon }, i) => (
          <Link
            key={href}
            href={href}
            aria-current={on(href) ? "page" : undefined}
            style={{ "--i": i } as React.CSSProperties}
            className={`rise group flex h-11 items-center gap-3 rounded-lg px-3.5 text-[0.9375rem] font-semibold transition-colors ${
              on(href) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className={`size-[1.1rem] ${on(href) ? "" : "text-leaf-ink"}`} /> {label}
            {badges[href] != null && (
              <span className={`ml-auto grid min-w-5 place-items-center rounded-full px-1.5 text-[0.6875rem] font-bold ${on(href) ? "bg-[#fff] text-primary" : "bg-primary text-primary-foreground"}`}>{badges[href]}</span>
            )}
          </Link>
        ))}
      </nav>
      <div className="border-t p-3">{footer}</div>
    </aside>
  );
}

/** Phones: the same menu as a row of pills under the top bar. */
export function AccountTabs({ badges }: { badges: Badges }) {
  const on = useActive();
  return (
    <nav aria-label="Menu akun" className="flex gap-1.5 overflow-x-auto px-5 pb-3 [scrollbar-width:none] lg:hidden">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className={`flex h-9 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold ${on(href) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          <Icon className="size-4" /> {label}
          {badges[href] != null && <span className="size-1.5 rounded-full bg-leaf-ink" />}
        </Link>
      ))}
    </nav>
  );
}

/** Avatar button → name/email, admin panel, settings, sign out. */
export function AccountMenu({ name, email, avatar, isAdmin, up = false }: { name: string; email: string; avatar: string | null; isAdmin: boolean; up?: boolean }) {
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
  const item = "flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground";
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" className={`flex items-center gap-2.5 text-left ${up ? "w-full rounded-lg p-2 hover:bg-muted" : "h-10 rounded-lg border py-1 pr-2.5 pl-1 hover:border-foreground/40"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Google profile photo */}
        {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" className="size-8 rounded-full object-cover" /> : <span className="grid size-8 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground uppercase">{(name || email)[0]}</span>}
        {up ? (
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-bold">{name || email.split("@")[0]}</span>
            <span className="block truncate text-xs text-muted-foreground">{email}</span>
          </span>
        ) : (
          <span className="hidden max-w-32 truncate text-sm font-semibold sm:inline">{name || email.split("@")[0]}</span>
        )}
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className={`absolute z-50 w-64 rounded-xl border bg-popover p-2 shadow-2xl shadow-black/40 ${up ? "bottom-14 left-0" : "top-12 right-0"}`}>
          <div className="px-3 pt-2 pb-3">
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
