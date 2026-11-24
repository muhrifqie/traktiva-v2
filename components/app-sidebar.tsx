"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { UserCard, type UserInfo } from "@/components/user-card";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { NAV, NAV_GROUPS, PERFORMA_PAGES, type NavCounts, type NavItem } from "@/lib/nav";

type Group = (typeof NAV_GROUPS)[number];
/**
 * One flat list, no sub-menus: what every seller does first (Beranda, Video Saya, Jadwal Posting), then "Lainnya";
 * Pengaturan sits at the bottom next to the user card. Accounts and platform pages are reached from Akun dan Performa.
 */
const SECTIONS: { label: string | null; groups: Group[] }[] = [
  { label: null, groups: ["Utama"] },
  { label: "Lainnya", groups: ["Lainnya"] },
  { label: null, groups: ["Pengaturan"] },
];

// pages without their own menu light up the menu they belong to
const owner = (pathname: string) => {
  const first = pathname.split("/")[1] ?? "";
  if (/^\/video\/\d+/.test(pathname)) return "proyek"; // the Studio belongs to Video Saya
  if (first === "galeri-video") return "galeri";
  if (PERFORMA_PAGES.includes(first)) return "performa";
  return first;
};

const visible = (groups: readonly Group[]) => NAV.filter((n) => groups.includes(n.group) && !("sidebar" in n && n.sidebar === false));

function NavItems({ items, counts, rail }: { items: readonly NavItem[]; counts: NavCounts; rail: boolean }) {
  const here = owner(usePathname());
  return (
    <SidebarMenu className="gap-0.5">
      {items.map((item) => {
        const label = "short" in item ? item.short : item.title;
        return (
          <SidebarMenuItem key={item.slug}>
            <SidebarMenuButton
              isActive={here === item.slug}
              className={`h-9 gap-3 text-[13.5px] text-sidebar-foreground/80 data-active:font-medium data-active:text-sidebar-foreground ${rail ? "justify-center px-0" : "px-2.5"}`}
              render={<Link href={`/${item.slug}`} title={rail ? item.title : undefined} aria-label={item.title} />}
            >
              <item.icon className="size-[18px] shrink-0 text-black dark:text-white" />
              {!rail && <span className="truncate">{label}</span>}
            </SidebarMenuButton>
            {!rail && !!counts[item.slug] && (
              <SidebarMenuBadge className="top-2 rounded-full bg-sidebar-accent px-1.5 text-[11px] tabular-nums text-muted-foreground">{counts[item.slug]}</SidebarMenuBadge>
            )}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

// Open sidebar: "Buat video" on top, then the sections above; settings at the bottom next to the user card.
// Closed (the video editor folds it for room) = a narrow icon rail with the same links.
export function AppSidebar({ counts = {}, user, className }: { counts?: NavCounts; user: UserInfo; className?: string }) {
  const { open, setOpen } = useSidebar();
  const rail = !open;
  return (
    <Sidebar collapsible="none" className={`shrink-0 border-r border-sidebar-border transition-[width] duration-200 ${rail ? "w-[52px]" : ""} ${className ?? ""}`}>
      <SidebarContent className="gap-0 py-1">
        <div className={rail ? "px-2 pt-1.5" : "px-3 pt-2 pb-1"}>
          <Link
            href="/video"
            title={rail ? "Buat video" : undefined}
            aria-label="Buat video"
            className={`flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 ${rail ? "w-9" : "w-full"}`}
          >
            <Plus className="size-4" />
            {!rail && "Buat video"}
          </Link>
        </div>
        {SECTIONS.map((s, i) => (
          <SidebarGroup key={i} className={`px-2 ${i === SECTIONS.length - 1 ? "mt-auto" : ""} ${rail ? "py-1" : "py-1.5"}`}>
            {s.label && !rail && <SidebarGroupLabel className="h-7 px-2.5 text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase">{s.label}</SidebarGroupLabel>}
            <SidebarGroupContent className="flex flex-col gap-0.5">
              <NavItems items={visible(s.groups)} counts={counts} rail={rail} />
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        {rail ? (
          <button type="button" onClick={() => setOpen(true)} className="grid h-8 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground" title="Buka menu" aria-label="Buka menu">
            <PanelLeftOpen className="size-4" />
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1"><UserCard info={user} /></div>
            <button type="button" onClick={() => setOpen(false)} className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground" title="Ciutkan menu" aria-label="Ciutkan menu">
              <PanelLeftClose className="size-4" />
            </button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
