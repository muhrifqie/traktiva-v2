"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { UserCard, type UserInfo } from "@/components/user-card";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { NAV, NAV_GROUPS, type NavCounts, type NavItem } from "@/lib/nav";

function NavItems({ items, counts, rail }: { items: readonly NavItem[]; counts: NavCounts; rail: boolean }) {
  const pathname = usePathname();
  return (
    <SidebarMenu className="gap-0.5">
      {items.map((item) => {
        // the Studio (/video/<id>) belongs to Proyek Video, not to the concept gallery
        const path = /^\/video\/\d+/.test(pathname) ? "/proyek" : pathname;
        const active = path === `/${item.slug}` || path.startsWith(`/${item.slug}/`);
        return (
          <SidebarMenuItem key={item.slug}>
            <SidebarMenuButton
              isActive={active}
              className={`h-8 gap-2.5 text-[13px] text-sidebar-foreground/85 data-active:font-medium data-active:text-sidebar-foreground ${rail ? "justify-center px-0" : ""}`}
              render={<Link href={`/${item.slug}`} title={rail ? item.title : undefined} aria-label={item.title} />}
            >
              <item.icon className="size-4 shrink-0 text-black dark:text-white" />
              {!rail && <span className="truncate">{item.title}</span>}
            </SidebarMenuButton>
            {!rail && !!counts[item.slug] && (
              <SidebarMenuBadge className="rounded bg-sidebar-accent px-1.5 text-[11px] text-muted-foreground">{counts[item.slug]}</SidebarMenuBadge>
            )}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function Group({ name, counts, rail, className = "" }: { name: (typeof NAV_GROUPS)[number]; counts: NavCounts; rail: boolean; className?: string }) {
  const items = NAV.filter((n) => n.group === name);
  return (
    <SidebarGroup className={`px-2 py-1.5 ${className}`}>
      {/* "Utama" holds only Beranda; a label would just add noise */}
      {name !== "Utama" && !rail && <SidebarGroupLabel className="h-6 px-2 text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase">{name}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <NavItems items={items} counts={counts} rail={rail} />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

// Open sidebar with every menu grouped by workflow; settings at the bottom next to the user card.
// Closed (the video editor folds it for room) = a narrow icon rail with the same links.
export function AppSidebar({ counts = {}, user, className }: { counts?: NavCounts; user: UserInfo; className?: string }) {
  const { open, setOpen } = useSidebar();
  const rail = !open;
  return (
    <Sidebar collapsible="none" className={`shrink-0 border-r border-sidebar-border transition-[width] duration-200 ${rail ? "w-[52px]" : ""} ${className ?? ""}`}>
      <SidebarContent className="gap-0 py-1">
        {NAV_GROUPS.filter((g) => g !== "Pengaturan").map((g) => (
          <Group key={g} name={g} counts={counts} rail={rail} />
        ))}
        <Group name="Pengaturan" counts={counts} rail={rail} className="mt-auto" />
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
