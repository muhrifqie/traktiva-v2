import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { showcaseProducts } from "@/lib/db/schema";
import { parseKaloNumber } from "@/lib/kalodata/client";
import { copyIntoProject } from "@/lib/library";
import { saveResult } from "@/lib/media";

// What a TikTok showcase product brings to a video project: its photo gallery and short facts.
// Shared by "Ambil dari Etalase" (one project) and the Etalase batch (many videos at once).

/**
 * Photo gallery (Kalodata's product gallery for the same TikTok product id, then the cached showcase cover)
 * and short facts for the "Detail singkat" field. Kalodata is optional (cached 24 h).
 */
export async function showcaseMaterial(showcaseId: number) {
  const row = await db.select().from(showcaseProducts).where(eq(showcaseProducts.id, showcaseId)).get();
  if (!row) throw new Error("Produk etalase tidak ditemukan. Sinkronkan etalase dulu.");
  let images: string[] = [];
  const facts: string[] = [];
  try {
    const { kaloDetail } = await import("@/app/(dashboard)/kalodata/actions");
    const d = await kaloDetail(row.productId, "ID");
    images = d.images ?? [];
    const sold = parseKaloNumber(d.total?.sale);
    const soldSpoken = sold >= 1_000_000 ? `lebih dari ${Math.floor(sold / 1_000_000)} juta` : sold >= 1000 ? `lebih dari ${Math.floor(sold / 1000)} ribu` : sold ? String(sold) : "";
    if (d.info?.brand_name) facts.push(`brand ${d.info.brand_name}`);
    if (d.info?.product_rating != null) facts.push(`rating ${d.info.product_rating}`);
    if (soldSpoken) facts.push(`terjual ${soldSpoken} dalam 30 hari`);
  } catch {}
  if (row.shopName) facts.push(`toko ${row.shopName}`);
  if (row.originalPrice && row.originalPrice !== row.price) facts.push(`harga normal ${row.originalPrice}`);
  facts.push(...row.labels);
  // gallery URLs first, the showcase cover (local media path) last
  const gallery = [...new Set([...images, ...(row.cover ? [row.cover] : [])])];
  return { row, gallery, facts: [...new Set(facts)], fromKalodata: images.length > 0 };
}

/** Copy chosen gallery photos (CDN URLs or local media paths) into the project's produk/ folder. */
export async function saveShowcasePhotos(folder: string, sources: string[]) {
  const stamp = Date.now().toString(36);
  const photos: string[] = [];
  for (const [i, src] of sources.entries()) {
    const dest = `${folder}/produk/etalase-${stamp}-${i + 1}`;
    const rel = /^https?:/.test(src) ? await saveResult(src, dest, ".png").catch(() => null) : await copyIntoProject(src, dest).catch(() => null);
    if (rel) photos.push(rel);
  }
  return photos;
}
