import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/page-header";
import { listVideoGallery } from "@/lib/video-gallery";
import { VideoGrid } from "./video-grid";

export const dynamic = "force-dynamic";

export default async function GaleriVideoPage() {
  const videos = await listVideoGallery();
  return (
    <>
      <AutoRefresh /> {/* a scheduled video turns "Terposting" once its time passes */}
      <PageHeader slug="galeri-video">
        <span className="text-xs text-muted-foreground">{videos.length} video</span>
      </PageHeader>
      <VideoGrid videos={videos} />
    </>
  );
}
