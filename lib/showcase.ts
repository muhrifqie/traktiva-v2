import "server-only";
import fs from "node:fs/promises";
import { and, eq, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, shopCache, showcaseProducts } from "@/lib/db/schema";
import { resolveMedia, saveResult } from "@/lib/media";
import { fetchShopSnapshot, type ShowcaseProduct } from "@/lib/platforms/tiktok-shop";
import { getSettings } from "@/lib/settings";

// Local mirror of each TikTok account's showcase + background auto-sync.

const COVERS = "Etalase"; // MEDIA_DIR/Etalase/<productId>.jpg (TikTok CDN links expire)

export async function getTiktokAccount(accountId: number) {
  const acc = await db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!acc || acc.platform !== "tiktok") throw new Error("Akun TikTok tidak ditemukan.");
  if (!acc.sessionKey) throw new Error("Akun ini belum login. Login dulu di menu Akun Sosial.");
  return acc as typeof acc & { sessionKey: string };
}

/** Make the local table equal to TikTok's list (upsert, cache new covers, drop removed products). */
export async function mirrorShowcase(accountId: number, products: ShowcaseProduct[]) {
  const now = new Date();
  const existing = new Map((await db.select().from(showcaseProducts).where(eq(showcaseProducts.accountId, accountId))).map((r) => [r.productId, r]));
  // covers first, 6 downloads at a time (one by one took most of the ~15 s sync)
  const covers = new Map<string, string | null>();
  const queue = [...products];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        let cover = existing.get(p.productId)?.cover ?? null;
        const coverOk = cover && (await fs.stat(resolveMedia(cover)).then(() => true, () => false));
        if (!coverOk && p.coverUrl) cover = await saveResult(p.coverUrl, `${COVERS}/${p.productId}`, ".jpg").catch(() => null);
        covers.set(p.productId, cover);
      }
    }),
  );
  // all rows in one transaction: one lock instead of 60+ separate writes
  await db.transaction(async (tx) => {
    for (const [position, p] of products.entries()) {
      const row = {
        title: p.title, price: p.price, originalPrice: p.originalPrice, commission: p.commission, stock: p.stock,
        inStock: p.inStock, hidden: p.hidden, shopName: p.shopName, cover: covers.get(p.productId) ?? null, labels: p.labels, position, syncedAt: now,
      };
      await tx
        .insert(showcaseProducts)
        .values({ accountId, productId: p.productId, ...row })
        .onConflictDoUpdate({ target: [showcaseProducts.accountId, showcaseProducts.productId], set: row });
    }
  });
  const keep = products.map((p) => p.productId);
  await db
    .delete(showcaseProducts)
    .where(keep.length ? and(eq(showcaseProducts.accountId, accountId), notInArray(showcaseProducts.productId, keep)) : eq(showcaseProducts.accountId, accountId));
  return products.length;
}

/** One headless visit: mirror the showcase and store the account overview (health, LIVE, creator info). */
export async function syncAccountShowcase(accountId: number) {
  const acc = await getTiktokAccount(accountId);
  const { showcase, overview } = await fetchShopSnapshot(acc.sessionKey);
  await setShopCache(acc.id, "overview", overview);
  return mirrorShowcase(acc.id, showcase.products);
}

// ---------------------------------------------------------------- JSON cache (overview, rankings)

export async function setShopCache(accountId: number, key: string, data: unknown) {
  const capturedAt = new Date();
  await db
    .insert(shopCache)
    .values({ accountId, key, data, capturedAt })
    .onConflictDoUpdate({ target: [shopCache.accountId, shopCache.key], set: { data, capturedAt } });
}

export async function getShopCache<T>(accountId: number, key: string) {
  const row = await db.select().from(shopCache).where(and(eq(shopCache.accountId, accountId), eq(shopCache.key, key))).get();
  return row ? { data: row.data as T, capturedAt: row.capturedAt } : null;
}

// ---------------------------------------------------------------- auto-sync

const g = globalThis as unknown as { __showcaseTimer?: ReturnType<typeof setInterval>; __showcaseLast?: { at: number; ok: number; failed: number } };

/** Sync every logged-in TikTok account's showcase, one after another (each opens a headless browser). */
export async function syncAllShowcases() {
  const list = await db.select().from(accounts).where(and(eq(accounts.platform, "tiktok"), eq(accounts.status, "active")));
  let ok = 0;
  let failed = 0;
  for (const a of list) {
    if (!a.sessionKey) continue;
    try {
      await syncAccountShowcase(a.id);
      ok++;
    } catch {
      failed++; // profile busy (user is logging in / another job) or session expired: try next round
    }
  }
  g.__showcaseLast = { at: Date.now(), ok, failed };
  return g.__showcaseLast;
}

export const lastAutoSync = () => g.__showcaseLast ?? null;

/**
 * Start (or restart after a settings change) the periodic showcase sync.
 * ponytail: in-process interval; fine for a desktop app that is open while you work.
 */
export function startShowcaseAutoSync() {
  clearInterval(g.__showcaseTimer);
  const minutes = getSettings().showcaseSyncMinutes ?? 60;
  if (!minutes) return;
  g.__showcaseTimer = setInterval(() => void syncAllShowcases().catch(() => {}), minutes * 60_000);
  g.__showcaseTimer.unref?.();
}
