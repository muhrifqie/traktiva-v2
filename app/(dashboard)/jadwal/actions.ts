"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { accounts, showcaseProducts } from "@/lib/db/schema";
import { cancelPosts, deletePosts, queuePosts, retryPost } from "@/lib/posting";
import { cleanTitle, checkTikTokStudio } from "@/lib/platforms/tiktok-upload";

const Id = z.number().int().positive();
const refresh = () => {
  revalidatePath("/jadwal");
  revalidatePath("/galeri-video");
};

/** What the posting dialog needs: TikTok accounts and each account's showcase products (for the yellow basket). */
export async function postingOptions() {
  const accs = await db.select().from(accounts).where(eq(accounts.platform, "tiktok")).orderBy(asc(accounts.username));
  const products = await db
    .select({ accountId: showcaseProducts.accountId, productId: showcaseProducts.productId, title: showcaseProducts.title, cover: showcaseProducts.cover, price: showcaseProducts.price })
    .from(showcaseProducts)
    .where(eq(showcaseProducts.hidden, false))
    .orderBy(asc(showcaseProducts.position));
  return {
    accounts: accs.map((a) => ({ id: a.id, username: a.username, displayName: a.displayName, avatar: a.avatarUrl, ready: a.status === "active" && !!a.sessionKey })),
    products: products.map((p) => ({ ...p, linkTitle: cleanTitle(p.title) })),
  };
}

const NewPosts = z.object({
  videos: z.array(z.object({ video: z.string().min(1).max(500), label: z.string().max(120).nullable(), projectId: z.number().int().nullable() })).min(1).max(50),
  accountIds: z.array(Id).min(1).max(20),
  caption: z.string().max(2200),
  productId: z.string().regex(/^\d{8,25}$/).nullable(),
  productTitle: z.string().max(30).nullable(),
  startAt: z.number().int().nullable(), // ms epoch; null = now
  spacingMin: z.number().int().min(0).max(24 * 60),
});

export async function createPosts(input: z.input<typeof NewPosts>) {
  const n = NewPosts.parse(input);
  if (n.videos.some((v) => v.video.includes(".."))) throw new Error("Lokasi video tidak valid.");
  const accs = await db.select().from(accounts).where(and(eq(accounts.platform, "tiktok"), eq(accounts.status, "active")));
  const ok = new Set(accs.filter((a) => a.sessionKey).map((a) => a.id));
  const accountIds = n.accountIds.filter((id) => ok.has(id));
  if (!accountIds.length) throw new Error("Pilih akun TikTok yang sudah login.");
  const startAt = new Date(Math.max(Date.now(), n.startAt ?? 0));
  const count = await queuePosts({
    videos: n.videos,
    accountIds,
    caption: n.caption.trim(),
    productId: n.productId,
    productTitle: n.productId ? cleanTitle(n.productTitle || n.caption) : null,
    startAt,
    spacingMin: n.spacingMin,
  });
  refresh();
  return { count };
}

export async function retryPostAction(id: number) {
  await retryPost(Id.parse(id));
  refresh();
}

export async function cancelPostAction(id: number) {
  await cancelPosts([Id.parse(id)]);
  refresh();
}

export async function deletePostAction(id: number) {
  await deletePosts([Id.parse(id)]);
  refresh();
}

/** Safe check: opens TikTok Studio on the account without uploading anything. */
export async function checkStudioAction(accountId: number) {
  const a = await db.select().from(accounts).where(eq(accounts.id, Id.parse(accountId))).get();
  if (!a?.sessionKey) throw new Error("Akun belum login.");
  return checkTikTokStudio(a.sessionKey);
}
