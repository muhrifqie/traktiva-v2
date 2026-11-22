"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, KeyRound, LayoutDashboard, LayoutGrid, LogOut, Menu, Receipt, Settings, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { logout } from "./actions";

export type Theme = "dark" | "light";
export type NavUser = { name: string; email: string; avatar: string | null; isAdmin: boolean; alert: boolean } | null;

const LINKS = [
  ["/#fitur", "Fitur"],
  ["/#cara-kerja", "Cara kerja"],
  ["/harga", "Harga"],
  ["/#faq", "FAQ"],
] as const;

const ACCOUNT = [
  ["/akun", "Ringkasan", LayoutGrid],
  ["/lisensi", "Lisensi & PC", KeyRound],
  ["/pesanan", "Pesanan", Receipt],
  ["/pengaturan", "Pengaturan", Settings],
] as const;

/** Popover that closes on outside click, Escape, and navigation. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  const [seenPath, setSeenPath] = useState(path);
  if (seenPath !== path) {
    setSeenPath(path);
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
  return { open, setOpen, ref };
}

function Initial({ user, size = "size-8" }: { user: NonNullable<NavUser>; size?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- Google profile photo
  if (user.avatar) return <img src={user.avatar} alt="" referrerPolicy="no-referrer" className={`${size} rounded-full object-cover`} />;
  return <span className={`${size} grid place-items-center rounded-full bg-[var(--site-glow)] text-[13px] font-semibold uppercase`}>{(user.name || user.email)[0]}</span>;
}

const item = "flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground";

function AccountItems({ user }: { user: NonNullable<NavUser> }) {
  return (
    <>
      {ACCOUNT.map(([href, label, Icon]) => (
        <Link key={href} href={href} className={item}>
          <Icon className="size-4" /> {label}
          {href === "/pengaturan" && user.alert && <span className="ml-auto size-2 rounded-full bg-amber-300" />}
        </Link>
      ))}
      {user.isAdmin && (
        <Link href="/admin" className={item}><LayoutDashboard className="size-4" /> Panel admin</Link>
      )}
      <form action={logout} className="mt-1 border-t border-white/8 pt-1">
        <button type="submit" className={`${item} w-full`}><LogOut className="size-4" /> Keluar</button>
      </form>
    </>
  );
}

function UserMenu({ user }: { user: NonNullable<NavUser> }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-10 items-center gap-2 rounded-lg border border-white/12 py-1 pr-3 pl-1 hover:border-white/30"
      >
        <span className="relative">
          <Initial user={user} />
          {user.alert && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[var(--site-canvas)] bg-amber-300" />}
        </span>
        <span className="max-w-32 truncate text-[14px]">{user.name || user.email.split("@")[0]}</span>
        <ChevronDown className={`size-4 text-[var(--site-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute top-12 right-0 w-64 rounded-xl border border-white/10 bg-[var(--site-card)] p-2 shadow-2xl shadow-black/60">
          <div className="px-3 pt-2 pb-3">
            <p className="truncate text-[14px] font-medium">{user.name || "Akun Traktiva"}</p>
            <p className="truncate text-[12px] text-[var(--site-muted)]">{user.email}</p>
          </div>
          <AccountItems user={user} />
        </div>
      )}
    </div>
  );
}

function MobileMenu({ user }: { user: NavUser }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div ref={ref} className="md:hidden">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Tutup menu" : "Buka menu"} className="relative grid size-10 place-items-center rounded-full border border-white/12">
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
        {!open && user?.alert && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-amber-300" />}
      </button>
      {open && (
        <div className="absolute inset-x-0 top-16 border-b border-white/8 bg-[var(--site-canvas)] px-5 pt-2 pb-5 shadow-2xl shadow-black/60">
          {!user && (
            <div className="grid">
              {LINKS.map(([href, label]) => (
                <Link key={href} href={href} onClick={() => setOpen(false)} className="border-b border-white/6 py-3 text-[16px]">{label}</Link>
              ))}
            </div>
          )}
          {user ? (
            <div className="mt-2 grid gap-0.5">
              <div className="mb-2 flex items-center gap-3 px-3">
                <Initial user={user} size="size-9" />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{user.name || "Akun Traktiva"}</p>
                  <p className="truncate text-[12px] text-[var(--site-muted)]">{user.email}</p>
                </div>
              </div>
              <AccountItems user={user} />
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Link href="/masuk" className="site-pill-outline site-sm">Masuk</Link>
              <Link href="/daftar" className="site-pill site-sm">Daftar</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SiteNav({ user, theme }: { user: NavUser; theme: Theme }) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[var(--site-canvas)]/85 backdrop-blur">
      <nav className="relative mx-auto flex h-16 max-w-[1260px] items-center gap-6 px-5 md:px-8" aria-label="Utama">
        <Link href="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className="size-7" />
          Traktiva
        </Link>
        {!user && (
          <div className="hidden items-center gap-1 text-[15px] text-[var(--site-body)] md:flex">
            {LINKS.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-full px-3 py-1.5 hover:bg-white/[0.05] hover:text-white">{label}</Link>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <ThemeToggle initial={theme} className="size-10 rounded-lg" />
          {user ? (
            <UserMenu user={user} />
          ) : (
            <>
              <Link href="/masuk" className="hidden text-[15px] text-[var(--site-body)] hover:text-white md:inline">Masuk</Link>
              <Link href="/#harga" className="site-pill site-sm">Beli lisensi</Link>
            </>
          )}
          <MobileMenu user={user} />
        </div>
      </nav>
    </header>
  );
}
