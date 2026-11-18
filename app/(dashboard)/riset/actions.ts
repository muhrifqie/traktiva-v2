"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { savedProducts, videoProjects } from "@/lib/db/schema";
import { createProjectFolder, saveResult } from "@/lib/media";
import { defaultOptions, presetById } from "@/lib/presets";

// "Produk tersimpan": products bookmarked from TikTok ranking or KaloData, reused for videos & the showcase.

const SaveInput = z.object({
  productId: z.string().regex(/^\d{10,22}$/),
  country: z.string().length(2).default("ID"),
  source: z.enum(["tiktok", "kalodata", "shopee", "manual"]),
  title: z.string().min(1).max(500),
  image: z.string().url().max(1000).nullish(),
  price: z.string().max(80).nullish(),
  shopName: z.string().max(200).nullish(),
  metrics: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).default({}),
});

const refresh = () => revalidatePath("/riset", "layout");

/** Bookmark a product (or refresh its numbers if it's already saved). */
export async function saveProduct(input: z.input<typeof SaveInput>) {
  const d = SaveInput.parse(input);
  const row = { source: d.source, title: d.title, image: d.image ?? null, price: d.price ?? null, shopName: d.shopName ?? null, metrics: d.metrics };
  const [r] = await db
    .insert(savedProducts)
    .values({ productId: d.productId, country: d.country.toUpperCase(), ...row })
    .onConflictDoUpdate({ target: [savedProducts.productId, savedProducts.country], set: row })
    .returning({ id: savedProducts.id });
  refresh();
  return r.id;
}

export async function unsaveProduct(productId: string, country = "ID") {
  await db.delete(savedProducts).where(and(eq(savedProducts.productId, productId), eq(savedProducts.country, country.toUpperCase())));
  refresh();
}

export async function updateSavedNote(id: number, note: string) {
  await db.update(savedProducts).set({ note: note.slice(0, 500) || null }).where(eq(savedProducts.id, z.number().int().parse(id)));
  refresh();
}

/** Start a video project from a saved product: name, price and cover photo are filled in. */
export async function createProjectFromSaved(id: number, presetId: string) {
  const p = await db.select().from(savedProducts).where(eq(savedProducts.id, z.number().int().parse(id))).get();
  if (!p) throw new Error("Produk tidak ditemukan.");
  const preset = presetById(presetId);
  if (!preset?.available) throw new Error("Konsep ini belum tersedia.");
  const name = p.title.length > 120 ? `${p.title.slice(0, 117)}...` : p.title;
  const product = { name, details: p.shopName ? `dari ${p.shopName}` : "", price: p.price ?? "", photos: [] as string[] };
  const [{ id: projectId }] = await db
    .insert(videoProjects)
    .values({ presetId, title: "", step: 2, product, options: defaultOptions(preset), scenes: [], folder: "" })
    .returning({ id: videoProjects.id });
  const folder = await createProjectFolder(projectId, preset.id);
  if (p.image) {
    const photo = await saveResult(p.image, `${folder}/produk/riset-${p.productId}`, ".png").catch(() => null);
    if (photo) product.photos.push(photo);
  }
  await db.update(videoProjects).set({ folder, product }).where(eq(videoProjects.id, projectId));
  redirect(`/video/${projectId}`);
}
