import { youtubeEditorPresets, youtubeEditorSettings, youtubeUploadDefaults } from "@/lib/settings";
import { editorJob, listGameplay, listOriginals, listRendered, listResults } from "@/lib/youtube-editor";
import { musicList, youtubeChannels } from "./actions";
import { VideoEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function YouTubeEditorPage() {
  return (
    <VideoEditor originals={listOriginals()} initialGameplay={listGameplay()} initialResults={listResults()} initialJob={editorJob()} initialSettings={youtubeEditorSettings()} initialRendered={listRendered()} initialMusic={await musicList()}
      initialPresets={youtubeEditorPresets()}
      channels={await youtubeChannels()}
      uploadDefaults={youtubeUploadDefaults()}
    />
  );
}
