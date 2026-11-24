// Dry run of the YouTube Studio upload on one channel: fills everything, then deletes the draft it created (never
// presses Save/Schedule). Run from a Terminal-panel tab (real %APPDATA%), e.g.
//   $env:TRAKTIVA_DATA_DIR = "$env:APPDATA\Traktiva"; npx tsx --conditions=react-server scripts/try-youtube-upload.mts <cfx_key> <UC…> <file.mp4>
import { withProfile } from "../lib/browser/chrome";
import { deleteDraft, UploadLimitError, uploadToYouTube } from "../lib/platforms/youtube-upload";

const [key, channelId, file] = process.argv.slice(2);
// leftovers of an earlier failed dry run (same title)
await withProfile(key, { headless: true }, async (ctx) => {
  const page = await ctx.newPage();
  for (let i = 0; i < 5 && (await deleteDraft(page, channelId, { title: "Traktiva uji coba upload" })); i++) console.log("· draf lama dihapus");
});
const r = await uploadToYouTube(
  {
    sessionKey: key,
    channelId,
    file,
    title: "Traktiva uji coba upload",
    description: "Uji coba otomatis Traktiva.\nBaris kedua deskripsi.",
    tags: ["traktiva", "uji coba"],
    visibility: "private",
    madeForKids: false,
    aiContent: true,
    dryRun: true,
    visible: process.env.YT_HEADLESS !== "1",
  },
  (s) => console.log("·", s),
).catch((e) => {
  if (e instanceof UploadLimitError) return console.log("LIMIT:", e.message), null;
  throw e;
});
console.log("hasil:", JSON.stringify(r));
