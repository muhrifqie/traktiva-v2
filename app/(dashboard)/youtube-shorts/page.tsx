import { PageHeader } from "@/components/page-header";
import { YouTubeTabs } from "@/components/platform-tabs";
import { downloadHistory, downloadJob, pendingDownload } from "@/lib/youtube";
import { ShortsDownloader } from "./downloader";

export const dynamic = "force-dynamic";

export default function YouTubeShortsPage() {
  return (
    <>
      <PageHeader slug="youtube-shorts" />
      <YouTubeTabs current="shorts" />
      <ShortsDownloader initialJob={downloadJob()} history={downloadHistory()} pending={pendingDownload()} />
    </>
  );
}
