import { youtubeEditorPresets, youtubeEditorSettings } from "@/lib/settings";
import { editorJob, listGameplay, listOriginals, listRendered, listResults } from "@/lib/youtube-editor";
import { musicList } from "./actions";
import { VideoEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function YouTubeEditorPage({ searchParams }: PageProps<"/youtube-editor">) {
  const jadwal = (await searchParams).jadwal;
  return (
    <VideoEditor originals={listOriginals()} initialGameplay={listGameplay()} initialResults={listResults()} initialJob={editorJob()} initialSettings={youtubeEditorSettings()} initialRendered={listRendered()} initialMusic={await musicList()}
      initialPresets={youtubeEditorPresets()}
      initialPick={typeof jadwal === "string" ? jadwal : null}
    />
  );
}
