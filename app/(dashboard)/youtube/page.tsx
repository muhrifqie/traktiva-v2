import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ChevronRight, CircleAlert, Download } from "lucide-react";
import { AccountAvatar } from "@/components/account-avatar";
import { PageHeader } from "@/components/page-header";
import { PlatformIcon } from "@/components/platform-icon";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { isProfileKey } from "@/lib/browser/chrome";
import { VERIFY_URL } from "@/lib/platforms/youtube-upload";
import { youtubeUploadDefaults } from "@/lib/settings";
import { uploadLimitUntil } from "@/lib/youtube-limit";
import { UploadSettings } from "./upload-settings";
import { AccountActions } from "../akun/row-actions";
import { YouTubeConnectButton } from "../akun/tiktok-connect";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

// YouTube home (the sidebar's YouTube button): connected channels with their stored login, then the YouTube tools.
export default async function YouTubePage() {
  const list = await db.select().from(accounts).where(eq(accounts.platform, "youtube")).orderBy(asc(accounts.username));
  const limits = await Promise.all(list.map((a) => uploadLimitUntil(a.id)));
  return (
    <>
      <PageHeader slug="youtube">{list.length > 0 && <YouTubeConnectButton label="Tambah channel" />}</PageHeader>

      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold text-muted-foreground">Channel tersambung</h2>
        {list.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
            <PlatformIcon platform="youtube" className="size-7" />
            <p className="text-sm font-medium">Belum ada channel YouTube</p>
            <p className="max-w-sm text-xs text-muted-foreground">Login sekali di jendela Chrome yang terbuka. Sesinya disimpan di profil browser khusus akun ini, jadi tidak perlu login lagi.</p>
            <div className="mt-2"><YouTubeConnectButton /></div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.map((a) => {
              const hasSession = isProfileKey(a.sessionKey);
              return (
                <article key={a.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                  <header className="flex items-center gap-3">
                    <AccountAvatar a={a} size="size-10" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{a.displayName || a.username}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.username.includes("@") ? a.username : `@${a.username}`}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${a.status === "active" ? "bg-status-ok/10 text-status-ok" : "bg-destructive/10 text-destructive"}`}>
                      {a.status === "active" ? "Login" : "Perlu login"}
                    </span>
                  </header>
                  <p className="text-xs text-muted-foreground">Dicek {a.lastCheckAt ? dateFmt.format(a.lastCheckAt) : "belum pernah"}</p>
                  {limits[list.indexOf(a)] && (
                    <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-300">
                      <CircleAlert className="mt-px size-3.5 shrink-0" />
                      <span>
                        Batas upload harian tercapai sampai {dateFmt.format(limits[list.indexOf(a)]!)}. Jadwal upload menunggu otomatis.{" "}
                        <a href={VERIFY_URL} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">Verifikasi nomor HP</a> supaya batasnya naik.
                      </span>
                    </p>
                  )}
                  <AccountActions id={a.id} platform="youtube" username={a.username} hasSession={hasSession} needsLogin={a.status !== "active" || !hasSession} />
                </article>
              );
            })}
          </div>
        )}
      </section>

      {list.length > 0 && <UploadSettings initial={youtubeUploadDefaults()} />}

      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold text-muted-foreground">Alat</h2>
        <Link href="/youtube-shorts" className="flex max-w-md items-center gap-3 rounded-xl border bg-card p-4 hover:border-ring/30 hover:bg-accent/40">
          <span className="grid size-10 place-items-center rounded-lg bg-muted"><Download className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Shorts Downloader</p>
            <p className="text-xs text-muted-foreground">Unduh semua Shorts dari satu channel.</p>
          </div>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      </section>
    </>
  );
}
