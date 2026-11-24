// Read-only check of the Studio sync on one stored YouTube profile:
// npx tsx --conditions=react-server scripts/try-youtube-studio.mts <cfx_key> <UC…>
import { syncStudio } from "../lib/platforms/youtube-studio";

const r = await syncStudio(process.argv[2], process.argv[3]);
console.log(JSON.stringify({ channel: r.channel, monetization: r.monetization, videos: r.videos.length, first: r.videos[0] }, null, 1));
for (const k of ["overview", "shorts"] as const)
  for (const c of r.insight[k])
    console.log(k, "|", c.title, "|", c.metrics.map((m) => `${m.value}${m.label ? ` ${m.label}` : ""}`).join(" · "), "|", c.series ? `${c.series.label} ${c.series.points.length}pt` : "", "|", c.rows.map((x) => `${x.label}=${x.value}`).join(", "));
