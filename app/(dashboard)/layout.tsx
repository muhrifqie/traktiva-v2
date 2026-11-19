import { count, eq } from "drizzle-orm";
import { getSettings } from "@/lib/settings";
import { AppSidebar } from "@/components/app-sidebar";
import type { UserInfo } from "@/components/user-card";
import { CommandMenu } from "@/components/command-menu";
import { SiteHeader } from "@/components/site-header";
import { TitleBar } from "@/components/title-bar";
import { StatusBar } from "@/components/status-bar";
import { MediaLightbox } from "@/components/media-lightbox";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { db } from "@/lib/db";
import { accounts, googleAccounts, videoProjects } from "@/lib/db/schema";
import pkg from "@/package.json";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const [social, google, [{ videos }]] = await Promise.all([
    db
      .select({ id: accounts.id, platform: accounts.platform, username: accounts.username, displayName: accounts.displayName, avatarUrl: accounts.avatarUrl, status: accounts.status })
      .from(accounts)
      .orderBy(accounts.platform, accounts.username),
    db.select({ email: googleAccounts.email, status: googleAccounts.status }).from(googleAccounts).orderBy(googleAccounts.id),
    db.select({ videos: count() }).from(videoProjects).where(eq(videoProjects.status, "done")),
  ]);
  const n = social.length;
  // the account picked in the sidebar; falls back to the first logged-in one (or any) when none/removed
  const chosen = getSettings().activeAccountId;
  const selected = social.find((a) => a.id === chosen) ?? social.find((a) => a.status === "active") ?? social[0] ?? null;
  const user: UserInfo = {
    email: (google.find((g) => g.status === "active") ?? google[0])?.email ?? null,
    googleAccounts: google.length,
    socialAccounts: n,
    social: { selected, list: social },
    videos,
    appVersion: pkg.version,
    platform: process.platform,
    license: { status: "dev", plan: "Pengembangan", expiresAt: null, daysLeft: null },
  };
  return (
    <SidebarProvider className="flex flex-col bg-sidebar">
      <TitleBar />
      <SiteHeader />
      <div className="flex flex-1">
        <AppSidebar counts={{ akun: n }} user={user} className="h-[calc(100svh-var(--titlebar-height)-var(--header-height)-var(--statusbar-height))]" />
        {/* Frameless: the page shares the chrome's surface (no panel border); only cards float on it.
            The page body scrolls inside; every page gets the same safe area (gutters, max width, rhythm). */}
        <SidebarInset className="overflow-hidden bg-sidebar md:h-[calc(100svh-var(--titlebar-height)-var(--header-height)-var(--statusbar-height))] md:peer-data-[variant=inset]:m-0 md:peer-data-[variant=inset]:rounded-none md:peer-data-[variant=inset]:shadow-none md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">{children}</div>
          </div>
        </SidebarInset>
      </div>
      <StatusBar />
      <MediaLightbox />
      <CommandMenu />
    </SidebarProvider>
  );
}
