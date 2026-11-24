import { count, eq } from "drizzle-orm";
import { pickActive } from "@/lib/settings";
import { AppSidebar } from "@/components/app-sidebar";
import type { UserInfo } from "@/components/user-card";
import { CommandMenu } from "@/components/command-menu";
import { SiteHeader } from "@/components/site-header";
import { TitleBar } from "@/components/title-bar";
import { StatusBar } from "@/components/status-bar";
import { MediaLightbox } from "@/components/media-lightbox";
import { ServerBanner } from "@/components/server-banner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { db } from "@/lib/db";
import { accounts, googleAccounts, videoProjects } from "@/lib/db/schema";
import { startProfileAutoSync } from "@/lib/profile-autosync";
import { startShowcaseAutoSync } from "@/lib/showcase";
import { ADMIN_PANEL_URL, licenseView, serverInfo } from "@/lib/server-info";
import pkg from "@/package.json";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  // background syncs (no-ops when already running): also covers a server started before they existed
  startProfileAutoSync();
  startShowcaseAutoSync();
  const [social, google, [{ videos }]] = await Promise.all([
    db
      .select({ id: accounts.id, platform: accounts.platform, username: accounts.username, displayName: accounts.displayName, avatarUrl: accounts.avatarUrl, status: accounts.status })
      .from(accounts)
      .orderBy(accounts.platform, accounts.username),
    db.select({ email: googleAccounts.email, status: googleAccounts.status }).from(googleAccounts).orderBy(googleAccounts.id),
    db.select({ videos: count() }).from(videoProjects).where(eq(videoProjects.status, "done")),
  ]);
  const info = serverInfo();
  const view = licenseView(info, pkg.version);
  const n = social.length;
  const selected = pickActive(social);
  const user: UserInfo = {
    email: (google.find((g) => g.status === "active") ?? google[0])?.email ?? null,
    googleAccounts: google.length,
    socialAccounts: n,
    social: { selected, list: social },
    videos,
    appVersion: pkg.version,
    platform: process.platform,
    license: view.license,
    adminPanelUrl: ADMIN_PANEL_URL,
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
            <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
              <ServerBanner announcements={info?.announcements ?? []} update={view.update} licenseWarning={view.warning} />
              {children}
            </div>
          </div>
        </SidebarInset>
      </div>
      <StatusBar />
      <MediaLightbox />
      <CommandMenu />
    </SidebarProvider>
  );
}
