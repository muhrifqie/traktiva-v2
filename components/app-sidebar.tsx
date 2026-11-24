"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { PlatformIcon } from "@/components/platform-icon";
import { UserCard, type UserInfo } from "@/components/user-card";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { NAV, NAV_GROUPS, type NavCounts, type NavItem } from "@/lib/nav";

type Group = (typeof NAV_GROUPS)[number];
/** Groups that belong to one platform get its mark next to the label, and the label opens that platform's page. */
const GROUP_PLATFORM: Partial<Record<Group, "tiktok">> = { "TikTok Shop": "tiktok" };
const GROUP_HREF: Partial<Record<Group, string>> = { "TikTok Shop": "/showcase" };
/** Groups with one menu need no folding (the label alone would hide a single link). */
const FOLDABLE = (n: number) => n > 1;

// folded groups, remembered per PC (localStorage; the server renders everything open)
const KEY = "trk-sidebar-folded";
const read = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => (listeners.add(cb), window.addEventListener("storage", cb), () => (listeners.delete(cb), window.removeEventListener("storage", cb)));
function toggleFolded(name: string) {
  const set = new Set(read().split("|").filter(Boolean));
  if (set.has(name)) set.delete(name);
  else set.add(name);
  try {
    localStorage.setItem(KEY, [...set].join("|"));
  } catch {}
  listeners.forEach((l) => l());
}

function NavItems({ items, counts, rail }: { items: readonly NavItem[]; counts: NavCounts; rail: boolean }) {
  const pathname = usePathname();
  return (
    <SidebarMenu className="gap-0.5">
      {items.map((item) => {
        // the Studio (/video/<id>) belongs to Proyek Video, not to the concept gallery
        const path = /^\/video\/\d+/.test(pathname) ? "/proyek" : pathname;
        const active = path === `/${item.slug}` || path.startsWith(`/${item.slug}/`);
        const label = "short" in item ? item.short : item.title;
        const platform = "platform" in item ? item.platform : null;
        return (
          <SidebarMenuItem key={item.slug}>
            <SidebarMenuButton
              isActive={active}
              className={`h-8 gap-2.5 text-[13px] text-sidebar-foreground/85 data-active:font-medium data-active:text-sidebar-foreground ${rail ? "justify-center px-0" : ""} ${platform ? "text-sidebar-foreground/60" : ""}`}
              render={<Link href={`/${item.slug}`} title={rail ? item.title : undefined} aria-label={item.title} />}
            >
              {platform ? <PlatformIcon platform={platform} className="size-4 shrink-0" /> : <item.icon className="size-4 shrink-0 text-black dark:text-white" />}
              {!rail && <span className="truncate">{label}</span>}
            </SidebarMenuButton>
            {!rail && "status" in item && (
              <SidebarMenuBadge className={`rounded px-1.5 text-[10px] ${item.status === "Segera" ? "bg-amber-500/12 text-amber-600 dark:text-amber-300" : "bg-sidebar-accent text-muted-foreground"}`}>{item.status}</SidebarMenuBadge>
            )}
            {!rail && !("status" in item) && !!counts[item.slug] && (
              <SidebarMenuBadge className="rounded bg-sidebar-accent px-1.5 text-[11px] text-muted-foreground">{counts[item.slug]}</SidebarMenuBadge>
            )}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function Group({ name, counts, rail, className = "" }: { name: Group; counts: NavCounts; rail: boolean; className?: string }) {
  const pathname = usePathname();
  const folded = useSyncExternalStore(subscribe, read, () => "").split("|").includes(name);
  const items = NAV.filter((n) => n.group === name && !("sidebar" in n && n.sidebar === false));
  if (!items.length) return null;
  const platform = GROUP_PLATFORM[name];
  const href = GROUP_HREF[name];
  const foldable = FOLDABLE(items.length) && !rail;
  // the group of the page you are on stays open, even when folded
  const here = items.some((n) => pathname === `/${n.slug}` || pathname.startsWith(`/${n.slug}/`));
  const open = !foldable || !folded || here;
  const labelCls = "flex min-w-0 flex-1 items-center gap-1.5 truncate";
  return (
    <SidebarGroup className={`px-2 py-1.5 ${className}`}>
      {/* the first group (Beranda, Riset, Kalender) needs no label */}
      {name !== "Utama" && !rail && (
        <SidebarGroupLabel className="group/label h-6 gap-1 px-2 text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase">
          {href ? (
            <Link href={href} className={`${labelCls} rounded hover:text-foreground`} title={`Buka ${name}`}>
              {platform && <PlatformIcon platform={platform} className="size-3" />}
              {name}
            </Link>
          ) : foldable ? (
            <button type="button" onClick={() => toggleFolded(name)} className={`${labelCls} text-left uppercase hover:text-foreground`} aria-expanded={open}>
              {name}
            </button>
          ) : (
            <span className={labelCls}>{name}</span>
          )}
          {foldable && !open && <span className="text-[10px] font-normal tracking-normal text-muted-foreground/70 normal-case">{items.length}</span>}
          {foldable && (
            <button
              type="button"
              onClick={() => toggleFolded(name)}
              aria-label={open ? `Lipat ${name}` : `Buka ${name}`}
              aria-expanded={open}
              className="grid size-5 shrink-0 place-items-center rounded hover:bg-sidebar-accent hover:text-foreground"
            >
              <ChevronDown className={`size-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
            </button>
          )}
        </SidebarGroupLabel>
      )}
      {open && (
        <SidebarGroupContent>
          <NavItems items={items} counts={counts} rail={rail} />
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
}

// Open sidebar: "Buat video" on top, then the groups of lib/nav.ts; settings at the bottom next to the user card.
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
