"use server";

import { and, eq, gte, inArray, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { accountPosts, accounts, accountStats } from "@/lib/db/schema";
import { deleteProfile, isProfileKey } from "@/lib/browser/chrome";
import { removeMedia } from "@/lib/media";
import * as tiktok from "@/lib/platforms/tiktok";

// Accounts are only created by a real platform login (username/uid read from the session), never typed in by hand.

const Id = z.number().int().positive();

function refresh() {
  revalidatePath("/akun");
  revalidatePath("/beranda");
  revalidatePath("/profil");
}

/** The social account shown at the bottom of the sidebar (the one the user is working with). */
export async function selectAccount(id: number) {
  const a = await getAccount(id);
  const { updateSettings } = await import("@/lib/settings");
  updateSettings({ activeAccountId: a.id });
  revalidatePath("/", "layout");
}

async function getAccount(id: number) {
  const a = await db.select().from(accounts).where(eq(accounts.id, Id.parse(id))).get();
  if (!a) throw new Error("Akun tidak ditemukan");
  return a;
}

export async function deleteAccount(id: number) {
  const a = await getAccount(id);
  await db.delete(accountPosts).where(eq(accountPosts.accountId, a.id));
  await db.delete(accountStats).where(eq(accountStats.accountId, a.id));
  await db.delete(accounts).where(eq(accounts.id, a.id));
  if (isProfileKey(a.sessionKey)) await deleteProfile(a.sessionKey).catch(() => {});
  refresh();
}

/**
 * Upsert a TikTok account after a successful login.
 * Match order: same TikTok uid (username may have changed) → same username → new row.
 */
async function saveTikTokLogin(sessionKey: string, who: tiktok.TikTokIdentity) {
  const now = new Date();
  const values = {
    username: who.username,
    displayName: who.nickname,
    externalId: who.uid,
    sessionKey,
    status: "active" as const,
    lastLoginAt: now,
    lastCheckAt: now,
    ...(who.avatar ? { avatarUrl: who.avatar } : {}),
  };
  const existing =
    (who.uid && (await db.select().from(accounts).where(and(eq(accounts.platform, "tiktok"), eq(accounts.externalId, who.uid))).get())) ||
    (await db.select().from(accounts).where(and(eq(accounts.platform, "tiktok"), eq(accounts.username, who.username))).get());

  if (existing) {
    if (existing.username !== who.username) {
      // uid matched but the user renamed; drop a stale row holding the new name so the unique index holds
      await db.delete(accounts).where(and(eq(accounts.platform, "tiktok"), eq(accounts.username, who.username)));
    }
    await db.update(accounts).set(values).where(eq(accounts.id, existing.id));
    // the old browser profile is replaced by the one that just logged in
    if (existing.sessionKey && existing.sessionKey !== sessionKey && isProfileKey(existing.sessionKey)) {
      await deleteProfile(existing.sessionKey).catch(() => {});
    }
    return { id: existing.id, created: false };
  }
  const [{ id }] = await db.insert(accounts).values({ platform: "tiktok", ...values }).returning({ id: accounts.id });
  return { id, created: true };
}

/** Start a TikTok login in a visible Chrome window. accountId = re-login that account on its own profile. */
export async function startTikTokLogin(accountId?: number) {
  let key: string | undefined;
  if (accountId) {
    const a = await getAccount(accountId);
    if (isProfileKey(a.sessionKey)) key = a.sessionKey;
  }
  return tiktok.startLogin(key);
}

/** Poll a running login; when done, the account is saved and its profile sync can start. */
type LoginPoll =
  | { status: "waiting" | "identifying" | "failed" | "cancelled"; error?: string }
  | { status: "done"; accountId: number; created: boolean; username: string };

export async function pollTikTokLogin(loginId: string): Promise<LoginPoll> {
  const s = tiktok.getLogin(z.string().uuid().parse(loginId));
  if (!s) return { status: "failed", error: "Sesi login tidak ditemukan. Coba lagi." };
  if (s.status !== "done" || !s.result) return { status: s.status === "done" ? "identifying" : s.status, error: s.error };
  const saved = await saveTikTokLogin(s.sessionKey, s.result);
  refresh();
  return { status: "done" as const, accountId: saved.id, created: saved.created, username: s.result.username };
}

export async function cancelTikTokLogin(loginId: string) {
  await tiktok.cancelLogin(z.string().uuid().parse(loginId));
}

export async function checkTikTokSession(id: number) {
  const a = await getAccount(id);
  if (!isProfileKey(a.sessionKey)) {
    await db.update(accounts).set({ status: "need_login", lastCheckAt: new Date() }).where(eq(accounts.id, a.id));
    refresh();
    return { valid: false };
  }
  const res = await tiktok.checkSession(a.sessionKey);
  await db.update(accounts).set({ status: res.valid ? "active" : "need_login", lastCheckAt: new Date() }).where(eq(accounts.id, a.id));
  refresh();
  return { valid: res.valid };
}

/**
 * Drop stored posts that are gone from TikTok (deleted, or made private by TikTok) and their saved covers.
 * Whole list loaded: everything missing goes. Partial list (very long profiles): only posts inside the loaded
 * date range, so older posts that simply weren't scrolled to are kept.
 */
async function pruneDeletedPosts(accountId: number, videos: tiktok.TikTokVideo[], allVideos: boolean) {
  if (!videos.length) return 0; // an empty answer is more likely a failed load than a wiped account
  const seen = videos.map((v) => v.id);
  const dated = videos.filter((v) => !v.isPinned && v.postedAt).map((v) => v.postedAt!);
  if (!allVideos && !dated.length) return 0;
  const where = and(
    eq(accountPosts.accountId, accountId),
    notInArray(accountPosts.externalId, seen),
    ...(allVideos ? [] : [gte(accountPosts.postedAt, new Date(Math.min(...dated) * 1000))]),
  );
  const gone = await db.select({ id: accountPosts.id, cover: accountPosts.coverUrl }).from(accountPosts).where(where);
  if (!gone.length) return 0;
  await db.delete(accountPosts).where(inArray(accountPosts.id, gone.map((g) => g.id)));
  for (const g of gone) if (g.cover && !g.cover.startsWith("http")) await removeMedia(g.cover).catch(() => {});
  return gone.length;
}

/** Pull profile, stats and videos from TikTok and store them (stats as a new snapshot, videos upserted). */
export async function syncTikTokAccount(id: number) {
  const a = await getAccount(id);
  if (!isProfileKey(a.sessionKey)) throw new Error("Akun ini belum login di Traktiva. Login dulu.");
  const p = await tiktok.syncProfile(a.sessionKey, a.username);
  const now = new Date();

  await db
    .update(accounts)
    .set({
      username: p.username,
      displayName: p.nickname,
      avatarUrl: p.avatar,
      externalId: p.uid ?? a.externalId,
      status: "active",
      lastCheckAt: now,
    })
    .where(eq(accounts.id, a.id));

  await db.insert(accountStats).values({
    accountId: a.id,
    followers: p.followers,
    following: p.following,
    likes: p.likes,
    videoCount: p.videoCount,
    bio: p.bio,
    bioLink: p.bioLink,
    verified: p.verified,
    isPrivate: p.isPrivate,
    capturedAt: now,
  });

  for (const v of p.videos) {
    const row = {
      caption: v.caption,
      coverUrl: v.cover,
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      shares: v.shares,
      saves: v.saves,
      durationSec: v.durationSec,
      isPinned: v.isPinned,
      isPrivate: v.isPrivate,
      postedAt: v.postedAt ? new Date(v.postedAt * 1000) : null,
      updatedAt: now,
    };
    await db
      .insert(accountPosts)
      .values({ accountId: a.id, externalId: v.id, ...row })
      .onConflictDoUpdate({ target: [accountPosts.accountId, accountPosts.externalId], set: row });
  }
  const removed = await pruneDeletedPosts(a.id, p.videos, p.allVideos);

  refresh();
  return { videos: p.videos.length, removed, followers: p.followers, playlists: p.playlists.length };
}
