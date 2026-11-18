// Research: download the best-selling videos of every product already opened in KaloData (cached details only,
// no extra DETAIL quota) into data/research/kalo/<videoId>.mp4 + meta.json, for edit-style analysis.
// Usage: npx tsx --conditions=react-server scripts/collect-kalo-videos.mts
import fs from "node:fs/promises";
import path from "node:path";
import { like } from "drizzle-orm";
import { db, DATA_DIR } from "@/lib/db";
import { kvCache } from "@/lib/db/schema";
import { kalo } from "@/lib/kalo";

type V = { id: string; revenue: string; views: string; sale: string; description: string; duration: string };
const out = path.join(DATA_DIR, "research", "kalo");
await fs.mkdir(out, { recursive: true });

const rows = await db.select().from(kvCache).where(like(kvCache.key, "kalo:detail%"));
const meta = new Map<string, V & { product: string; category?: string }>();
for (const r of rows) {
  const d = r.data as { info?: { product_title?: string; category?: string } | null; videos?: V[] };
  const product = d.info?.product_title ?? r.key;
  for (const v of d.videos ?? []) if (!meta.has(v.id)) meta.set(v.id, { ...v, product });
}
console.log(meta.size, "videos");

for (const [id, v] of meta) {
  const file = path.join(out, `${id}.mp4`);
  if (await fs.stat(file).then(() => true, () => false)) continue;
  try {
    const url = await kalo((c) => c.videoUrl(id));
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
    console.log("ok", id, v.product.slice(0, 30));
  } catch (e) {
    console.log("fail", id, (e as Error).message);
  }
  await new Promise((r) => setTimeout(r, 1500)); // gentle with the account
}
await fs.writeFile(path.join(out, "meta.json"), JSON.stringify([...meta.values()], null, 2));
process.exit(0);
