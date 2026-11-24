"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { PlatformIcon } from "@/components/platform-icon";
import { UserCard, type UserInfo } from "@/components/user-card";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuAction, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, useSidebar,
} from "@/components/ui/sidebar";
import { NAV, NAV_GROUPS, type NavCounts, type NavItem } from "@/lib/nav";

type Group = (typeof NAV_GROUPS)[number];
/** Groups that belong to one platform get its mark next to the label, and the label opens that platform's page. */
const GROUP_PLATFORM: Partial<Record<Group, "tiktok">> = { "TikTok Shop": "tiktok" };
const GROUP_HREF: Partial<Record<Group, string>> = { "TikTok Shop": "/tiktok-shop" };
/**
 * Sidebar sections, top to bottom, each with a small label. A live platform (TikTok Shop) is a button with its menus on
 * a branch line; platforms not live yet are listed right under it, so the roadmap shows without opening anything.
 * The last section sits at the bottom next to the user card.
 */
const SECTIONS: { label: string | null; groups: Group[]; tree?: Group[] }[] = [
  { label: null, groups: ["Utama"] },
  { label: "Konten", groups: ["Buat Konten", "Pustaka"] },
  { label: "Platform", tree: ["TikTok Shop"], groups: ["Segera hadir"] },
  { label: null, groups: ["Akun", "Pengaturan"] },
];

// folded platform groups, remembered per PC (localStorage; the server renders everything open)
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

// the Studio (/video/<id>) belongs to Proyek Video; Galeri's video tab lives on its own route
const isHere = (pathname: string, slug: string) => {
  const path = /^\/video\/\d+/.test(pathname) ? "/proyek" : pathname.startsWith("/galeri-video") ? "/galeri" : pathname;
  return path === `/${slug}` || path.startsWith(`/${slug}/`);
};

function NavItems({ items, counts, rail }: { items: readonly NavItem[]; counts: NavCounts; rail: boolean }) {
  const pathname = usePathname();
  return (
    <SidebarMenu className="gap-0.5">
      {items.map((item) => {
        const active = isHere(pathname, item.slug);
        const label = "short" in item ? item.short : item.title;
        const platform = "platform" in item ? item.platform : null;
        return (
          <SidebarMenuItem key={item.slug}>
            <SidebarMenuButton
              isActive={active}
              className={`h-9 gap-3 text-[13.5px] text-sidebar-foreground/80 data-active:font-medium data-active:text-sidebar-foreground ${rail ? "justify-center px-0" : "px-2.5"} ${"status" in item ? "text-sidebar-foreground/55" : ""}`}
              render={<Link href={`/${item.slug}`} title={rail ? item.title : undefined} aria-label={item.title} />}
            >
              {platform ? <PlatformIcon platform={platform} className={`size-[18px] shrink-0 ${"status" in item ? "opacity-70" : ""}`} /> : <item.icon className="size-[18px] shrink-0 text-black dark:text-white" />}
              {!rail && <span className="truncate">{label}</span>}
            </SidebarMenuButton>
            {!rail && "status" in item && (
              <SidebarMenuBadge className={`top-2 rounded px-1.5 text-[10px] ${item.status === "Segera" ? "bg-amber-500/12 text-amber-600 dark:text-amber-300" : "bg-sidebar-accent text-muted-foreground"}`}>{item.status}</SidebarMenuBadge>
            )}
            {!rail && !("status" in item) && !!counts[item.slug] && (
              <SidebarMenuBadge className="top-2 rounded-full bg-sidebar-accent px-1.5 text-[11px] tabular-nums text-muted-foreground">{counts[item.slug]}</SidebarMenuBadge>
            )}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}


/** One child of a group: indented under the group button, on the branch line. */
function SubItem({ item, counts }: { item: NavItem; counts: NavCounts }) {
  const pathname = usePathname();
  const label = "short" in item ? item.short : item.title;
  const platform = "platform" in item ? item.platform : null;
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton isActive={isHere(pathname, item.slug)} className="h-8 gap-2.5 text-[13px] text-sidebar-foreground/80 data-active:font-medium" render={<Link href={`/${item.slug}`} aria-label={item.title} />}>
        {platform ? <PlatformIcon platform={platform} className="size-4 shrink-0" /> : <item.icon className="size-4 shrink-0 text-black dark:text-white" />}
        <span className="truncate">{label}</span>
        {"status" in item ? (
          <span className={`ml-auto rounded px-1.5 text-[10px] ${item.status === "Segera" ? "bg-amber-500/12 text-amber-600 dark:text-amber-300" : "bg-sidebar-accent text-muted-foreground"}`}>{item.status}</span>
        ) : counts[item.slug] ? (
          <span className="ml-auto text-[11px] text-muted-foreground">{counts[item.slug]}</span>
        ) : null}
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

const visible = (groups: readonly Group[]) => NAV.filter((n) => groups.includes(n.group) && !("sidebar" in n && n.sidebar === false));

/** A platform group: its button opens the platform page, its menus hang underneath on a branch line (foldable). */
function Tree({ name, counts, rail }: { name: Group; counts: NavCounts; rail: boolean }) {
  const pathname = usePathname();
  const folded = useSyncExternalStore(subscribe, read, () => "").split("|").includes(name);
  const items = visible([name]);
  if (!items.length) return null;
  if (rail) return <NavItems items={items} counts={counts} rail />;

  // a group = a menu button of its own with its menus as branches underneath; the group of the current page stays open
  const platform = GROUP_PLATFORM[name];
  const href = GROUP_HREF[name];
  const here = items.some((n) => isHere(pathname, n.slug));
  const open = !folded || here;
  const mark = platform ? <PlatformIcon platform={platform} className="size-[18px] shrink-0" /> : null;
  const chevron = <ChevronRight className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />;
  const btnCls = "h-9 gap-3 px-2.5 text-[13.5px] text-sidebar-foreground/80";
  return (
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            {href ? (
              <>
                {/* the platform button opens its page; the arrow folds the branches */}
                <SidebarMenuButton isActive={pathname === href} className={`${btnCls} data-active:font-medium`} render={<Link href={href} aria-label={`Buka ${name}`} />}>
                  {mark}
                  <span className="truncate font-medium">{name}</span>
                </SidebarMenuButton>
                <SidebarMenuAction onClick={() => toggleFolded(name)} aria-label={open ? `Lipat ${name}` : `Buka ${name}`} aria-expanded={open}>
                  {chevron}
                </SidebarMenuAction>
              </>
            ) : (
              <SidebarMenuButton className={btnCls} onClick={() => toggleFolded(name)} aria-expanded={open} aria-label={open ? `Lipat ${name}` : `Buka ${name}`}>
                {mark}
                <span className="truncate font-medium">{name}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  {!open && <span className="text-[11px] text-muted-foreground">{items.length}</span>}
                  {chevron}
                </span>
              </SidebarMenuButton>
            )}
            {open && (
              <SidebarMenuSub className="mr-0 ml-[18px] gap-0.5 py-1">
                {items.map((item) => <SubItem key={item.slug} item={item} counts={counts} />)}
              </SidebarMenuSub>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
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
        {SECTIONS.map((s, i) => (
          <SidebarGroup key={i} className={`px-2 ${i === SECTIONS.length - 1 ? "mt-auto" : ""} ${rail ? "py-1" : "py-1.5"}`}>
            {s.label && !rail && <SidebarGroupLabel className="h-7 px-2.5 text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase">{s.label}</SidebarGroupLabel>}
            <SidebarGroupContent className="flex flex-col gap-0.5">
              {s.tree?.map((g) => <Tree key={g} name={g} counts={counts} rail={rail} />)}
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
