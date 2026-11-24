import "server-only";
import fs from "node:fs/promises";
import { and, eq, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, shopCache, showcaseProducts, type ProductDetail } from "@/lib/db/schema";
import { resolveMedia, saveResult } from "@/lib/media";
import { fetchProductDetail, fetchShopSnapshot, type ShowcaseProduct } from "@/lib/platforms/tiktok-shop";

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

/** Background showcase sync while the app is open (the TikTok Shop page also syncs live while it is looked at). */
export const SHOWCASE_SYNC_EVERY_MIN = 15;

/**
 * Start the periodic showcase sync (fixed interval, no setting).
 * ponytail: in-process interval; fine for a desktop app that is open while you work.
 */
export function startShowcaseAutoSync() {
  if (g.__showcaseTimer) return;
  g.__showcaseTimer = setInterval(() => void syncAllShowcases().catch(() => {}), SHOWCASE_SYNC_EVERY_MIN * 60_000);
  g.__showcaseTimer.unref?.();
}

// ---------------------------------------------------------------- product detail (opened from the showcase)

const DETAIL_TTL = 24 * 3600_000; // price/stock change; re-read after a day

/** The saved detail of a showcase product, read from TikTok when missing, older than a day, or `force`. */
export async function loadProductDetail(showcaseId: number, force = false) {
  const row = await db.select().from(showcaseProducts).where(eq(showcaseProducts.id, showcaseId)).get();
  if (!row) throw new Error("Produk tidak ditemukan. Sinkronkan etalase lagi.");
  if (!force && row.detail && row.detailAt && Date.now() - row.detailAt.getTime() < DETAIL_TTL) return { ...row, detail: row.detail };
  const acc = await getTiktokAccount(row.accountId);
  const { imageUrls, ...raw } = await fetchProductDetail(acc.sessionKey, row.productId);
  // photos are cached (TikTok CDN links expire); 4 downloads at a time
  const images: string[] = new Array(imageUrls.length).fill("");
  const queue = imageUrls.map((u, i) => ({ u, i }));
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let it = queue.shift(); it; it = queue.shift()) images[it.i] = (await saveResult(it.u, `${COVERS}/${row.productId}/foto-${it.i + 1}`, /\.webp(\?|$)/.test(it.u) ? ".webp" : ".jpg").catch(() => "")) || "";
    }),
  );
  const detail: ProductDetail = { ...raw, images: images.filter(Boolean) };
  const detailAt = new Date();
  await db.update(showcaseProducts).set({ detail, detailAt }).where(eq(showcaseProducts.id, row.id));
  return { ...row, detail, detailAt };
}

/** Product facts for the AI writers (goes into product.details): short, factual, no invented claims. */
export function detailFacts(d: ProductDetail) {
  const n = (x: number) => new Intl.NumberFormat("id-ID").format(x);
  const facts = [
    d.sold ? `terjual ${n(d.sold)}` : null,
    d.rating ? `rating ${String(d.rating).replace(".", ",")}${d.reviews ? ` dari ${n(d.reviews)} ulasan` : ""}` : null,
    d.originalPrice ? `harga coret ${d.originalPrice}${d.discount ? ` (${d.discount.replace(/^Save up to /i, "hemat sampai ")})` : ""}` : null,
    ...d.variants.filter((v) => v.values.length).map((v) => `${v.name}: ${v.values.slice(0, 8).join(", ")}${v.values.length > 8 ? ", ..." : ""}`),
    d.shipping,
    d.shop?.name ? `toko ${d.shop.name.replace(/\.+$/, "")}` : null,
  ].filter(Boolean);
  // the description's first lines carry the selling points; drop the "* Judul:" echo of the title
  const desc = d.description
    .split("\n")
    .map((l) => l.replace(/^[*•\-\s]+/, "").replace(/[.\s]+$/, "").trim())
    .filter((l) => l && !/^judul\s*:/i.test(l))
    .join(". ")
    .replace(/\s+/g, " ");
  return `${facts.join("; ")}${desc ? `. Deskripsi penjual: ${desc}` : ""}`.slice(0, 1000);
}
