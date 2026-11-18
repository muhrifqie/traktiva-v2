import { PageHeader } from "@/components/page-header";
import { listFinishedVideos } from "@/lib/video-gallery";
import { VideoGrid } from "./video-grid";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export default async function GaleriVideoPage() {
  const videos = await listFinishedVideos();
  return (
    <>
      <PageHeader slug="galeri-video">
        <span className="text-xs text-muted-foreground">{videos.length} video jadi</span>
      </PageHeader>
      <VideoGrid videos={videos.map((v) => ({ ...v, date: fmt.format(new Date(v.at)) }))} />
    </>
  );
}
