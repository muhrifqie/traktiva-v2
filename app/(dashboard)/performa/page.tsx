import Link from "next/link";
import { asc } from "drizzle-orm";
import { ArrowRight, CircleAlert, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PlatformIcon } from "@/components/platform-icon";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { navBySlug } from "@/lib/nav";

export const dynamic = "force-dynamic";

// Akun dan Performa: one door to everything about accounts and platforms, which the sidebar keeps out of the way so
// making videos and the posting schedule stay up front. Each platform card links to that platform's own pages.
const PLATFORMS = [
  { platform: "tiktok", name: "TikTok", pages: ["profil", "tiktok-shop", "showcase"] },
  { platform: "youtube", name: "YouTube", pages: ["youtube-performa", "youtube", "youtube-shorts"] },
] as const;
const SOON = ["shopee", "instagram", "facebook"] as const;

export default async function PerformaPage() {
  const list = await db
    .select({ id: accounts.id, platform: accounts.platform, username: accounts.username, displayName: accounts.displayName, status: accounts.status })
    .from(accounts)
    .orderBy(asc(accounts.platform), asc(accounts.username));
  const needLogin = list.filter((a) => a.status !== "active");

  return (
    <>
      <PageHeader slug="performa" />

      {/* connected accounts first: everything below needs them */}
      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-muted"><Users className="size-4" /></span>
          <h2 className="text-[13px] font-semibold">Akun tersambung</h2>
          <span className="text-xs text-muted-foreground">{list.length ? `${list.length} akun` : "belum ada"}</span>
          <Link href="/akun" className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium hover:bg-accent">
            Kelola akun <ArrowRight className="size-3.5" />
          </Link>
        </div>
        {list.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {list.map((a) => (
              <span key={a.id} className="flex h-8 items-center gap-2 rounded-lg border bg-background px-2.5 text-[13px]">
                <PlatformIcon platform={a.platform} className="size-4" />
                {a.platform === "youtube" ? a.displayName || a.username : `@${a.username}`}
                <span className={`size-2 rounded-full ${a.status === "active" ? "bg-status-ok" : "bg-status-progress"}`} title={a.status === "active" ? "Aktif" : "Perlu login"} />
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-muted-foreground">Sambungkan akun TikTok atau channel YouTube dulu supaya video bisa dijadwalkan dan performanya terbaca.</p>
        )}
        {needLogin.length > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-status-progress">
            <CircleAlert className="size-3.5" /> {needLogin.length} akun perlu login ulang di Kelola akun.
          </p>
        )}
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        {PLATFORMS.map((p) => (
          <section key={p.platform} className="flex flex-col rounded-xl border bg-card p-4">
            <div className="mb-2 flex items-center gap-2">
              <PlatformIcon platform={p.platform} className="size-5" />
              <h2 className="text-sm font-semibold">{p.name}</h2>
              <span className="text-xs text-muted-foreground">{list.filter((a) => a.platform === p.platform).length} akun</span>
            </div>
            <ul className="divide-y">
              {p.pages.map((slug) => {
                const item = navBySlug(slug)!;
                return (
                  <li key={slug}>
                    <Link href={`/${slug}`} className="flex items-center gap-3 py-2.5 hover:text-foreground">
                      <item.icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium">{item.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{item.desc}</span>
                      </span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <section className="rounded-xl border border-dashed p-4">
        <h2 className="mb-2 text-[13px] font-semibold text-muted-foreground">Segera hadir</h2>
        <div className="flex flex-wrap gap-2">
          {SOON.map((slug) => {
            const item = navBySlug(slug)!;
            return (
              <Link key={slug} href={`/${slug}`} className="flex h-8 items-center gap-2 rounded-lg border bg-background px-2.5 text-[13px] text-muted-foreground hover:text-foreground">
                <PlatformIcon platform={slug} className="size-4 opacity-70" />
                {item.title}
                <span className="rounded bg-muted px-1.5 text-[10px]">{"status" in item ? item.status : ""}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
