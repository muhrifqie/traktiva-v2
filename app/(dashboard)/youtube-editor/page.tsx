import { PageHeader } from "@/components/page-header";
import { editorJob, listGameplay, listOriginals, listResults } from "@/lib/youtube-editor";
import { VideoEditor } from "./editor";

export const dynamic = "force-dynamic";

export default function YouTubeEditorPage() {
  return (
    <>
      <PageHeader slug="youtube-editor" />
      <VideoEditor originals={listOriginals()} initialGameplay={listGameplay()} initialResults={listResults()} initialJob={editorJob()} />
    </>
  );
}
