import "server-only";
import { and, desc, eq, gt, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, accountStats, shopCache, uploadJobs } from "@/lib/db/schema";
import { YT_CACHE } from "@/lib/platforms/youtube-studio";
import { isUploadBusy } from "@/lib/uploads";

// Profil & Postingan (and the content analysis on Beranda/Profil) stay current without pressing Sinkronkan:
// every logged-in TikTok account is re-read (headless) a few minutes after one of its posts goes live, and
// otherwise every EVERY_MIN minutes (catches posts made outside Traktiva and keeps view counts fresh).
// Runs while the app is open; never while an upload drives the same Chrome profile.

const CHECK_MS = 2 * 60_000;
export const PROFILE_SYNC_EVERY_MIN = 30;
const AFTER_POST_MIN = 3; // TikTok needs a moment before a new post shows on the profile
const RETRY_MIN = 10; // after a failed sync, wait this long before trying that account again
// YouTube channels: Studio is read every few hours only (4 page loads per sync; Google flags busy sessions)
export const YOUTUBE_SYNC_EVERY_MIN = 180;

const g = globalThis as unknown as { __profileTimer?: ReturnType<typeof setInterval>; __profileBusy?: boolean; __profileTried?: Map<number, number>; __profileNow?: ProfileSyncRun | null };
type ProfileSyncRun = { platform: "tiktok" | "youtube"; username: string; startedAt: number };
/** The account being synced right now (null when idle), for the status bar. */
export const profileSyncNow = () => g.__profileNow ?? null;

/** Sync the accounts that are due. Safe to call any time (no-op while a sync or an upload runs). */
export async function tickProfileSync() {
  if (g.__profileBusy || isUploadBusy()) return;
  g.__profileBusy = true;
  const tried = (g.__profileTried ??= new Map());
  try {
    const list = await db.select().from(accounts).where(and(eq(accounts.platform, "tiktok"), eq(accounts.status, "active")));
    const { syncTikTokAccount } = await import("@/app/(dashboard)/akun/actions");
    for (const a of list) {
      if (!a.sessionKey?.startsWith("cfx_")) continue;
      if (isUploadBusy()) break;
      const now = Date.now();
      if (now - (tried.get(a.id) ?? 0) < RETRY_MIN * 60_000) continue;
      const last = (await db.select({ at: accountStats.capturedAt }).from(accountStats).where(eq(accountStats.accountId, a.id)).orderBy(desc(accountStats.capturedAt)).get())?.at.getTime() ?? 0;
      // a post (from Jadwal, incl. one TikTok published on schedule) went live after the last sync
      const newPost = await db
        .select({ id: uploadJobs.id })
        .from(uploadJobs)
        .where(and(eq(uploadJobs.accountId, a.id), eq(uploadJobs.status, "done"), gt(uploadJobs.postedAt, new Date(last)), lte(uploadJobs.postedAt, new Date(now - AFTER_POST_MIN * 60_000))))
        .get();
      // uploaded with TikTok's own schedule after the last sync: it is already on the profile (scheduled)
      const newUpload = await db
        .select({ id: uploadJobs.id })
        .from(uploadJobs)
        .where(and(eq(uploadJobs.accountId, a.id), eq(uploadJobs.status, "done"), gt(uploadJobs.createdAt, new Date(last)), gt(uploadJobs.postedAt, new Date(now))))
        .get();
      if (!newPost && !newUpload && now - last < PROFILE_SYNC_EVERY_MIN * 60_000) continue;
      tried.set(a.id, now);
      g.__profileNow = { platform: "tiktok", username: a.username, startedAt: now };
      await syncTikTokAccount(a.id).catch((e) => console.warn("[profil-sync]", a.username, e instanceof Error ? e.message : e));
    }

    const yt = await db.select().from(accounts).where(and(eq(accounts.platform, "youtube"), eq(accounts.status, "active")));
    const { syncYouTubeAccount } = await import("@/app/(dashboard)/youtube-performa/actions");
    for (const a of yt) {
      if (isUploadBusy()) break; // an upload drives a Chrome profile right now
      if (!a.sessionKey?.startsWith("cfx_") || !a.externalId?.startsWith("UC")) continue;
      const now = Date.now();
      if (now - (tried.get(a.id) ?? 0) < RETRY_MIN * 60_000) continue;
      const last = (await db.select({ at: shopCache.capturedAt }).from(shopCache).where(and(eq(shopCache.accountId, a.id), eq(shopCache.key, YT_CACHE))).get())?.at.getTime() ?? 0;
      if (now - last < YOUTUBE_SYNC_EVERY_MIN * 60_000) continue;
      tried.set(a.id, now);
      g.__profileNow = { platform: "youtube", username: a.username, startedAt: now };
      await syncYouTubeAccount(a.id).catch((e) => console.warn("[youtube-sync]", a.username, e instanceof Error ? e.message : e));
    }
  } finally {
    g.__profileBusy = false;
    g.__profileNow = null;
  }
}

/** Called at server start (instrumentation) and again from pages, so a dev server started before it still runs it. */
export function startProfileAutoSync() {
  if (g.__profileTimer) return;
  g.__profileTimer = setInterval(() => void tickProfileSync().catch(() => {}), CHECK_MS);
  g.__profileTimer.unref?.();
}
