"use server";

import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { showcaseProducts, videoProjects } from "@/lib/db/schema";
import { createProjectFolder, resolveMedia, writeMedia } from "@/lib/media";
import { addToShowcase, fetchMarketRanking, removeFromShowcase } from "@/lib/platforms/tiktok-shop";
import { FLOW_ENGINES, MAX_VIDEO_WORKERS, maxVideosPerProduct, SYNC_CHOICES, updateSettings } from "@/lib/settings";
import { startVideoBatch } from "@/lib/batch";
import { getTiktokAccount, mirrorShowcase, setShopCache, startShowcaseAutoSync, syncAccountShowcase } from "@/lib/showcase";
import { defaultOptions, presetById } from "@/lib/presets";

const Id = z.number().int().positive();

/** Pull the account's showcase from TikTok Shop and mirror it locally (covers cached once). */
export async function syncShowcase(accountId: number) {
  const count = await syncAccountShowcase(Id.parse(accountId));
  revalidatePath("/showcase");
  return { count };
}

/** Add products by link or product ID (one per line). Returns TikTok's answer per item. */
export async function addShowcaseProducts(accountId: number, text: string) {
  const acc = await getTiktokAccount(Id.parse(accountId));
  const inputs = [...new Set(text.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean))];
  if (!inputs.length) throw new Error("Tempel link produk atau ID produk dulu.");
  if (inputs.length > 20) throw new Error("Maksimal 20 produk sekali tambah.");
  const { results, showcase } = await addToShowcase(acc.sessionKey, inputs);
  await mirrorShowcase(acc.id, showcase.products); // refresh right away, no separate sync needed
  revalidatePath("/showcase");
  return results;
}

export async function removeShowcaseProducts(accountId: number, productIds: string[]) {
  const acc = await getTiktokAccount(Id.parse(accountId));
  const ids = z.array(z.string().regex(/^\d{10,22}$/)).min(1).max(50).parse(productIds);
  const { showcase } = await removeFromShowcase(acc.sessionKey, ids);
  await mirrorShowcase(acc.id, showcase.products);
  revalidatePath("/showcase");
  return { removed: ids.length, left: showcase.products.length };
}

/** Market research: categories + top products of one category, cached per category. */
export async function loadMarketRanking(accountId: number, categoryId?: string) {
  const acc = await getTiktokAccount(Id.parse(accountId));
  const r = await fetchMarketRanking(acc.sessionKey, categoryId);
  await setShopCache(acc.id, "categories", r.categories);
  await setShopCache(acc.id, `ranking:${r.categoryId}`, r);
  revalidatePath("/riset");
  return r.categoryId;
}

export async function setShowcaseAutoSync(minutes: number) {
  const m = z.number().int().parse(minutes);
  if (!(SYNC_CHOICES as readonly number[]).includes(m)) throw new Error("Pilihan interval tidak dikenal.");
  updateSettings({ showcaseSyncMinutes: m });
  startShowcaseAutoSync();
  revalidatePath("/showcase");
}

/** Start a video project from a showcase product: name, price and cover photo are filled in. */
export async function createProjectFromProduct(showcaseId: number, presetId: string) {
  const p = await db.select().from(showcaseProducts).where(eq(showcaseProducts.id, Id.parse(showcaseId))).get();
  if (!p) throw new Error("Produk tidak ditemukan. Sinkronkan etalase lagi.");
  const preset = presetById(presetId);
  if (!preset?.available) throw new Error("Konsep ini belum tersedia.");

  const name = p.title.length > 120 ? `${p.title.slice(0, 117)}...` : p.title;
  const [{ id }] = await db
    .insert(videoProjects)
    .values({
      presetId, title: "", step: 2, product: { name, details: p.labels.join(", "), price: p.price, photos: [] },
      options: { ...defaultOptions(preset), productId: p.productId }, scenes: [], folder: "",
    })
    .returning({ id: videoProjects.id });
  const folder = await createProjectFolder(id, preset.id);
  const photos: string[] = [];
  if (p.cover) {
    const data = await fs.readFile(resolveMedia(p.cover)).catch(() => null);
    if (data) photos.push(await writeMedia(`${folder}/produk/etalase-${p.productId}.jpg`, data));
  }
  await db.update(videoProjects).set({ folder, product: { name, details: p.labels.join(", "), price: p.price, photos } }).where(eq(videoProjects.id, id));
  redirect(`/video/${id}`);
}

const BatchInput = z.object({
  showcaseIds: z.array(Id).min(1).max(50),
  presetId: z.string().min(1).max(40),
  workers: z.number().int().min(1).max(MAX_VIDEO_WORKERS),
  engine: z.enum(FLOW_ENGINES),
  sec: z.number().int().min(3).max(15),
  videos: z.number().int().min(1).max(4),
});

/**
 * Etalase batch: one finished video per selected product, `workers` videos at a time (the rest queue).
 * Projects appear in Proyek Video immediately; the choice is remembered as the next default.
 */
export async function startBatchVideos(input: z.input<typeof BatchInput>) {
  const b = BatchInput.parse(input);
  const r = await startVideoBatch({ showcaseIds: [...new Set(b.showcaseIds)], presetId: b.presetId, workers: b.workers, engine: b.engine, sec: b.sec, videos: Math.min(b.videos, maxVideosPerProduct()) });
  updateSettings({ videoWorkers: b.workers, flowEngine: b.engine });
  revalidatePath("/proyek");
  revalidatePath("/video");
  return { count: r.projectIds.length };
}
