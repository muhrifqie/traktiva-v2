"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import { OPEN_COMMAND } from "@/components/command-menu";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Kbd } from "@/components/ui/kbd";
import { navBySlug } from "@/lib/nav";

// Global app bar: lives on the chrome above sidebar + page panel, never scrolls with the page.
// In the desktop app the window title bar is a separate strip above it (components/title-bar.tsx).
export function SiteHeader() {
  const pathname = usePathname();
  const slug = /^\/video\/\d+/.test(pathname) ? "proyek" : (pathname.split("/")[1] ?? ""); // Studio lives under Proyek
  const item = navBySlug(slug);
  const openSearch = () => window.dispatchEvent(new Event(OPEN_COMMAND));

  return (
    <header className="sticky top-0 z-50 flex h-(--header-height) w-full shrink-0 select-none items-center gap-3 border-b border-sidebar-border bg-sidebar px-3">
      {/* same column as the sidebar menu items (8px gutter each side), mark lined up with the menu icons */}
      <div className="flex shrink-0 items-center md:-ml-1 md:w-[calc(var(--sidebar-width)-1rem)]">
        <Link href="/beranda" className="flex h-10 w-full items-center gap-2.5 rounded-lg px-2 hover:bg-sidebar-accent">
          <Logo className="size-8 shrink-0" />
          <span className="text-lg font-semibold tracking-tight">Traktiva</span>
        </Link>
      </div>

      {item && (
        <nav aria-label="Breadcrumb" className="hidden shrink-0 items-center gap-1.5 text-[13px] sm:flex">
          {item.group !== "Utama" && (
            <>
              <span className="text-muted-foreground">{item.group}</span>
              <ChevronRight className="size-3.5 text-muted-foreground/60" />
            </>
          )}
          <item.icon className="size-4 text-black dark:text-white" />
          <span className="font-medium">{item.title}</span>
        </nav>
      )}


      <div className="ml-auto flex items-center gap-2 self-stretch">
        <button
          type="button"
          onClick={openSearch}
          aria-label="Cari menu atau aksi"
          className="flex h-8 items-center gap-2 rounded-lg border bg-background px-2 text-xs text-muted-foreground shadow-xs transition-colors hover:text-foreground lg:w-52 lg:px-2.5"
        >
          <Search className="size-4 shrink-0" />
          <span className="hidden lg:inline">Cari...</span>
          <Kbd className="ml-auto hidden lg:inline-flex">Ctrl K</Kbd>
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
