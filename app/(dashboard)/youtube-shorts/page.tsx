import { PageHeader } from "@/components/page-header";
import { downloadHistory, downloadJob } from "@/lib/youtube";
import { ShortsDownloader } from "./downloader";

export const dynamic = "force-dynamic";

export default function YouTubeShortsPage() {
  return (
    <>
      <PageHeader slug="youtube-shorts" />
      <ShortsDownloader initialJob={downloadJob()} history={downloadHistory()} />
    </>
  );
}
