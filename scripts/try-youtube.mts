// Dry check of lib/youtube.ts: list a channel's Shorts, download the newest 2 into TRAKTIVA_MEDIA_DIR.
import { downloadJob, listChannelShorts, startDownload } from "../lib/youtube";
const c = await listChannelShorts(process.argv[2] ?? "@MrBeast");
console.log(c.channel, c.handle, c.shorts.length, "shorts;", c.downloaded.length, "downloaded", c.shorts[0]);
await startDownload({ handle: c.handle, ids: c.shorts.slice(0, 2).map((s) => s.id) });
while (downloadJob()?.running) await new Promise((r) => setTimeout(r, 1000));
console.log(downloadJob());
