"use server";

import { and, eq, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isProfileKey } from "@/lib/browser/chrome";
import { db } from "@/lib/db";
import { accountPosts, accounts, accountStats } from "@/lib/db/schema";
import { syncStudio, YT_CACHE, type StudioSync, type YouTubeCache } from "@/lib/platforms/youtube-studio";
import { setShopCache } from "@/lib/showcase";

// one sync per channel at a time: a second caller (login flow, page auto-sync in another window, the 3-hour
// timer) waits for the running one instead of failing on the locked Chrome profile
const g = globalThis as unknown as { __ytSyncing?: Map<number, Promise<{ videos: number; subscribers: number }>> };
const syncing = (g.__ytSyncing ??= new Map());

/** Pull every video, Insight (28 days) and monetization progress from YouTube Studio into the DB. */
export async function syncYouTubeAccount(id: number) {
  const key = z.number().int().positive().parse(id);
  const running = syncing.get(key);
  if (running) return running;
  const p = runSync(key).finally(() => syncing.delete(key));
  syncing.set(key, p);
  return p;
}

async function runSync(id: number) {
  const a = await db.select().from(accounts).where(eq(accounts.id, z.number().int().positive().parse(id))).get();
  if (!a || a.platform !== "youtube") throw new Error("Akun YouTube tidak ditemukan");
  if (!isProfileKey(a.sessionKey) || !a.externalId?.startsWith("UC")) throw new Error("Channel ini belum login di Traktiva (atau belum punya channel). Login dulu.");

  let r: StudioSync;
  try {
    r = await syncStudio(a.sessionKey, a.externalId);
  } catch (e) {
    if (/Sesi YouTube habis/.test(String(e))) await db.update(accounts).set({ status: "need_login" }).where(eq(accounts.id, a.id));
    throw e;
  }
  const now = new Date();
  await db.update(accounts).set({ status: "active", lastCheckAt: now }).where(eq(accounts.id, a.id));
  await db.insert(accountStats).values({
    accountId: a.id,
    followers: r.channel.subscribers,
    likes: r.videos.reduce((s, v) => s + v.likes, 0),
    videoCount: r.videos.length,
    capturedAt: now,
  });
  for (const v of r.videos) {
    const row = {
      caption: v.title,
      // public thumbnails (Studio's own links are signed and expire); oar2 = the portrait frame of a Short
      coverUrl: `https://i.ytimg.com/vi/${v.id}/${v.type === "short" ? "oar2" : "hqdefault"}.jpg`,
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      durationSec: v.durationSec,
      isPrivate: v.privacy !== "public",
      postedAt: v.publishedAt ? new Date(v.publishedAt * 1000) : null,
      updatedAt: now,
    };
    await db.insert(accountPosts).values({ accountId: a.id, externalId: v.id, ...row }).onConflictDoUpdate({ target: [accountPosts.accountId, accountPosts.externalId], set: row });
  }
  // Studio lists every video of the channel: whatever is missing was deleted
  if (r.videos.length) await db.delete(accountPosts).where(and(eq(accountPosts.accountId, a.id), notInArray(accountPosts.externalId, r.videos.map((v) => v.id))));
  await setShopCache(a.id, YT_CACHE, { channel: r.channel, monetization: r.monetization, insight: r.insight, types: Object.fromEntries(r.videos.map((v) => [v.id, v.type])) } satisfies YouTubeCache);

  // the background auto-sync runs outside a request, where revalidatePath throws (pages are dynamic anyway)
  try {
    revalidatePath("/youtube-performa");
    revalidatePath("/youtube");
  } catch {}
  return { videos: r.videos.length, subscribers: r.channel.subscribers };
}
