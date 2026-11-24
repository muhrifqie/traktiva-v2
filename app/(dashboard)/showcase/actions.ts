"use server";

import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { showcaseProducts, videoProjects } from "@/lib/db/schema";
import { pruneUnsaved, UNSAVED } from "@/lib/unsaved";
import { createProjectFolder, resolveMedia, writeMedia } from "@/lib/media";
import { addToShowcase, fetchMarketRanking, removeFromShowcase } from "@/lib/platforms/tiktok-shop";
import { detailFacts, getTiktokAccount, loadProductDetail, mirrorShowcase, setShopCache, syncAccountShowcase } from "@/lib/showcase";
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
  revalidatePath("/riset", "layout");
  return r.categoryId;
}

/** Full product detail for the showcase dialog (read from TikTok once, then from the database). */
export async function getShowcaseDetail(showcaseId: number, refresh = false) {
  const r = await loadProductDetail(Id.parse(showcaseId), refresh);
  revalidatePath("/showcase");
  return { detail: r.detail, detailAt: r.detailAt?.getTime() ?? Date.now(), facts: detailFacts(r.detail), commission: r.commission };
}

/** Start a video project from a showcase product: name, price and cover photo are filled in. */
export async function createProjectFromProduct(showcaseId: number, presetId: string) {
  const p = await db.select().from(showcaseProducts).where(eq(showcaseProducts.id, Id.parse(showcaseId))).get();
  if (!p) throw new Error("Produk tidak ditemukan. Sinkronkan etalase lagi.");
  const preset = presetById(presetId);
  if (!preset?.available) throw new Error("Konsep ini belum tersedia.");

  const name = p.title.length > 120 ? `${p.title.slice(0, 117)}...` : p.title;
  // the saved product page (if it was opened) gives the AI real facts and more photos
  const details = p.detail ? detailFacts(p.detail) : p.labels.join(", ");
  await pruneUnsaved();
  const [{ id }] = await db
    .insert(videoProjects)
    .values({
      presetId, title: "", step: 2, product: { name, details, price: p.price, photos: [] },
      options: { ...defaultOptions(preset), [UNSAVED]: "1" }, scenes: [], folder: "",
    })
    .returning({ id: videoProjects.id });
  const folder = await createProjectFolder(id, preset.id);
  const photos: string[] = [];
  for (const [i, src] of (p.detail?.images.length ? p.detail.images.slice(0, 3) : p.cover ? [p.cover] : []).entries()) {
    const data = await fs.readFile(resolveMedia(src)).catch(() => null);
    if (data) photos.push(await writeMedia(`${folder}/produk/etalase-${p.productId}-${i + 1}${src.slice(src.lastIndexOf("."))}`, data));
  }
  await db.update(videoProjects).set({ folder, product: { name, details, price: p.price, photos }, options: { ...defaultOptions(preset), showcaseId: String(p.id), [UNSAVED]: "1" } }).where(eq(videoProjects.id, id));
  redirect(`/video/${id}`);
}
