"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export type Theme = "dark" | "light";
export type NavUser = { name: string; email: string; avatar: string | null; isAdmin: boolean } | null;
/** Origins of the two hosts: main = traktiva.site (marketing), app = app.traktiva.site (account). "" in dev. */
export type Hosts = { main: string; app: string };

const LINKS = [
  ["/fitur", "Fitur"],
  ["/platform", "Platform"],
  ["/cara-kerja", "Cara kerja"],
  ["/harga", "Harga"],
  ["/faq", "FAQ"],
] as const;

/** Mobile menu: closes on outside click, Escape, and navigation. */
function MobileMenu({ user, hosts }: { user: NavUser; hosts: Hosts }) {
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
  return (
    <div ref={ref} className="md:hidden">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Tutup menu" : "Buka menu"} className="grid size-10 place-items-center rounded-lg border">
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      {open && (
        <div className="absolute inset-x-0 top-16 border-b bg-background px-5 pt-2 pb-5 shadow-lg">
          <div className="grid">
            {LINKS.map(([href, label]) => (
              <Link key={href} href={hosts.main + href} onClick={() => setOpen(false)} className="border-b py-3 text-[15px]">{label}</Link>
            ))}
          </div>
          {user ? (
            <Link href={`${hosts.app}/akun`} className="site-pill site-sm mt-5 w-full"><LayoutGrid className="size-4" /> Dashboard</Link>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Link href={`${hosts.app}/masuk`} className="site-pill-outline site-sm">Masuk</Link>
              <Link href={`${hosts.app}/daftar`} className="site-pill site-sm">Daftar</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Site navbar (same on traktiva.site and the sign-in pages on app.). Links that cross hosts are absolute, so the logo
 * always opens the landing page and no prefetch hits a cross-origin redirect. Signed in = one "Dashboard" button.
 */
export function SiteNav({ user, theme, hosts }: { user: NavUser; theme: Theme; hosts: Hosts }) {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
      <nav className="relative mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 md:px-8" aria-label="Utama">
        <Link href={`${hosts.main}/`} className="flex items-center gap-2.5 text-[17px] font-semibold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className="size-7" />
          Traktiva
        </Link>
        <div className="hidden items-center gap-1 text-[15px] text-muted-foreground md:flex">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={hosts.main + href} className="rounded-lg px-3 py-1.5 hover:bg-muted hover:text-foreground">{label}</Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle initial={theme} className="size-10 rounded-lg" />
          {/* wrapper carries "hidden": .site-pill sets display itself and would win over a utility on the link */}
          <div className="hidden items-center gap-2 md:flex">
            {user ? (
              <Link href={`${hosts.app}/akun`} className="site-pill site-sm"><LayoutGrid className="size-4" /> Dashboard</Link>
            ) : (
              <>
                <Link href={`${hosts.app}/masuk`} className="site-pill-outline site-sm">Masuk</Link>
                <Link href={`${hosts.app}/daftar`} className="site-pill site-sm">Daftar</Link>
              </>
            )}
          </div>
          <MobileMenu user={user} hosts={hosts} />
        </div>
      </nav>
    </header>
  );
}
