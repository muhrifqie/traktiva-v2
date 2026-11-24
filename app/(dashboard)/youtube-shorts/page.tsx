import { asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { YouTubeTabs } from "@/components/platform-tabs";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { downloadHistory, downloadJob, pendingDownload } from "@/lib/youtube";
import { ShortsDownloader } from "./downloader";

export const dynamic = "force-dynamic";

// Tab 3 of a YouTube channel. The downloader itself takes any channel URL; ?akun= only picks whose tabs are shown.
export default async function YouTubeShortsPage({ searchParams }: PageProps<"/youtube-shorts">) {
  const { akun } = await searchParams;
  const list = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.platform, "youtube")).orderBy(asc(accounts.username));
  const wanted = Number(Array.isArray(akun) ? akun[0] : akun);
  const current = list.find((a) => a.id === wanted) ?? (list.length === 1 ? list[0] : undefined);
  return (
    <>
      <PageHeader slug="youtube-shorts" />
      {current && <YouTubeTabs accountId={current.id} current="shorts" />}
      <ShortsDownloader initialJob={downloadJob()} history={downloadHistory()} pending={pendingDownload()} />
    </>
  );
}
