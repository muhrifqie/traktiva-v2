// Research: measure edit rhythm of the downloaded top videos (data/research/kalo): duration, size, scene cuts,
// shot lengths, silence. Writes data/research/kalo/stats.json and prints a summary.
// Usage: npx tsx scripts/analyze-kalo-videos.mts
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import ffmpeg from "ffmpeg-static";

const run = promisify(execFile);
const dir = path.join(process.cwd(), "data", "research", "kalo");
const meta: { id: string; product: string; views: string; sale: string; revenue: string; description: string }[] = JSON.parse(await fs.readFile(path.join(dir, "meta.json"), "utf8"));

const stderr = async (args: string[]) => (await run(ffmpeg!, args, { maxBuffer: 64 * 1024 * 1024 }).catch((e) => e)).stderr as string;
const stats = [];
for (const m of meta) {
  const f = path.join(dir, `${m.id}.mp4`);
  const info = await stderr(["-hide_banner", "-i", f]);
  const d = info.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const dur = d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0;
  const size = info.match(/Video:[^\n]*?(\d{3,4})x(\d{3,4})/);
  const fps = Number(info.match(/([\d.]+) fps/)?.[1] ?? 0);
  // scene cuts (content change > 0.3) on a downscaled copy for speed
  const sc = await stderr(["-hide_banner", "-i", f, "-vf", "scale=180:-2,select='gt(scene,0.3)',showinfo", "-an", "-f", "null", "-"]);
  const cuts = [...sc.matchAll(/pts_time:([\d.]+)/g)].map((x) => +x[1]).filter((t) => t > 0.2 && t < dur - 0.2);
  const edges = [0, ...cuts, dur];
  const shots = edges.slice(1).map((t, i) => t - edges[i]);
  // speech-ish density: share of time that is NOT silent (-35 dB, ≥0.4 s)
  const sil = await stderr(["-hide_banner", "-i", f, "-af", "silencedetect=n=-35dB:d=0.4", "-vn", "-f", "null", "-"]);
  const silent = [...sil.matchAll(/silence_duration: ([\d.]+)/g)].reduce((a, x) => a + +x[1], 0);
  const loud = await stderr(["-hide_banner", "-i", f, "-af", "ebur128", "-vn", "-f", "null", "-"]);
  const lufs = Number(loud.match(/I:\s+(-?[\d.]+) LUFS/g)?.pop()?.match(/-?[\d.]+/)?.[0] ?? NaN);
  stats.push({
    id: m.id, product: m.product.slice(0, 40), views: m.views, sale: m.sale, revenue: m.revenue,
    dur: +dur.toFixed(1), w: size ? +size[1] : 0, h: size ? +size[2] : 0, fps,
    cuts: cuts.length, cutsPerMin: +((cuts.length / dur) * 60).toFixed(1), firstCut: cuts[0] != null ? +cuts[0].toFixed(2) : null,
    cutsIn3s: cuts.filter((t) => t < 3).length, avgShot: +(dur / (cuts.length + 1)).toFixed(2),
    medianShot: +shots.sort((a, b) => a - b)[Math.floor(shots.length / 2)].toFixed(2),
    silentShare: +(silent / dur).toFixed(2), lufs,
    hashtags: (m.description.match(/#\w+/g) ?? []).length, captionLen: m.description.replace(/#\w+/g, "").trim().length,
  });
  console.log(m.id, dur.toFixed(0) + "s", "cuts", cuts.length, "first", cuts[0]?.toFixed(1), "silent", (silent / dur).toFixed(2), "lufs", lufs);
}
await fs.writeFile(path.join(dir, "stats.json"), JSON.stringify(stats, null, 2));

const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const col = (k: keyof (typeof stats)[number]) => stats.map((s) => Number(s[k])).filter(Number.isFinite);
console.log("\nMEDIAN dur", med(col("dur")), "cuts/min", med(col("cutsPerMin")), "avgShot", med(col("avgShot")), "medianShot", med(col("medianShot")),
  "firstCut", med(col("firstCut")), "cutsIn3s", med(col("cutsIn3s")), "silentShare", med(col("silentShare")), "LUFS", med(col("lufs")),
  "res", [...new Set(stats.map((s) => `${s.w}x${s.h}`))].join(","));
process.exit(0);
