import { PageHeader } from "@/components/page-header";
import { downloadJob } from "@/lib/youtube";
import { ShortsDownloader } from "./downloader";

export const dynamic = "force-dynamic";

export default function YouTubePage() {
  return (
    <>
      <PageHeader slug="youtube-shorts" />
      <ShortsDownloader initialJob={downloadJob()} />
    </>
  );
}
