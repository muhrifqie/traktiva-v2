import { PageHeader } from "@/components/page-header";
import { youtubeEditorSettings } from "@/lib/settings";
import { editorJob, listGameplay, listOriginals, listRendered, listResults } from "@/lib/youtube-editor";
import { VideoEditor } from "./editor";

export const dynamic = "force-dynamic";

export default function YouTubeEditorPage() {
  return (
    <>
      <PageHeader slug="youtube-editor" />
      <VideoEditor originals={listOriginals()} initialGameplay={listGameplay()} initialResults={listResults()} initialJob={editorJob()} initialSettings={youtubeEditorSettings()} initialRendered={listRendered()} />
    </>
  );
}
