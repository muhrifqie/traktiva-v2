import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountPosts, accounts } from "@/lib/db/schema";
import { scheduleTips } from "@/lib/schedule-tips";

// Content analysis per TikTok account (Beranda, Profil & Postingan): the last week's average views decides whether an account keeps
// posting or should rest; trend, engagement, best video and best hour explain why. Views come from the last
// profile sync, so a stale sync is flagged.

export const HEALTH_DAYS = 7; // window looked at
export const MIN_AVG_VIEWS = 60; // below this average the account should rest (or switch to other content)
const MIN_AGE_HOURS = 24; // a fresh post is still gaining views: leave it out so it can't drag the average down
const STALE_SYNC_HOURS = 48;
const DROP_ALERT = -0.3; // average views 30%+ lower than the week before
const FEW_POSTS = 3; // fewer counted videos than this in a week = posting too rarely

export type ContentHealth = {
  accountId: number;
  username: string;
  posts: number; // videos counted (7 days, older than 24 h, public)
  avgViews: number | null;
  trend: number | null; // avg views vs the 7 days before (-0.25 = 25% lower); null when either week is empty
  engagement: number | null; // (likes + comments + shares + saves) / views over the counted videos
  best: { externalId: string; views: number; caption: string } | null; // most-viewed counted video
  bestHour: number | null; // WIB hour this account's posts do best (from its own history)
  status: "rest" | "drop" | "rare" | "ok" | "nodata";
  stale: boolean; // last sync older than 2 days: numbers may be out of date
};

type Row = { accountId: number; externalId: string; caption: string | null; views: number; likes: number; comments: number; shares: number; saves: number; postedAt: Date | null; isPrivate: boolean; updatedAt: Date };

/** Public videos of one account posted in [from, until) (ms), the ones the analysis counts. */
const inWindow = (rows: Row[], accountId: number, from: number, until: number) =>
  rows.filter((r) => r.accountId === accountId && !r.isPrivate && r.postedAt && r.postedAt.getTime() >= from && r.postedAt.getTime() < until);
const avg = (xs: Row[]) => (xs.length ? Math.round(xs.reduce((s, r) => s + r.views, 0) / xs.length) : null);

export async function contentHealth(now = Date.now()): Promise<ContentHealth[]> {
  const list = await db.select({ id: accounts.id, username: accounts.username }).from(accounts).where(eq(accounts.platform, "tiktok"));
  if (!list.length) return [];
  const ids = list.map((a) => a.id);
  const day = 86400_000;
  const until = now - MIN_AGE_HOURS * 3600_000;
  const weekFrom = now - HEALTH_DAYS * day;
  const prevFrom = weekFrom - HEALTH_DAYS * day;
  const prevUntil = until - HEALTH_DAYS * day; // same 24 h offset, so both weeks are compared alike

  const [rows, synced, tips] = await Promise.all([
    db
      .select({ accountId: accountPosts.accountId, externalId: accountPosts.externalId, caption: accountPosts.caption, views: accountPosts.views, likes: accountPosts.likes, comments: accountPosts.comments, shares: accountPosts.shares, saves: accountPosts.saves, postedAt: accountPosts.postedAt, isPrivate: accountPosts.isPrivate, updatedAt: accountPosts.updatedAt })
      .from(accountPosts)
      .where(and(inArray(accountPosts.accountId, ids), gte(accountPosts.postedAt, new Date(prevFrom)))),
    // newest sync per account, across all its posts (not only these two weeks)
    db.select({ accountId: accountPosts.accountId, updatedAt: accountPosts.updatedAt }).from(accountPosts).where(inArray(accountPosts.accountId, ids)),
    scheduleTips(ids, 60).catch(() => ({}) as Awaited<ReturnType<typeof scheduleTips>>),
  ]);
  const lastSync = new Map<number, number>();
  for (const r of synced) lastSync.set(r.accountId, Math.max(lastSync.get(r.accountId) ?? 0, r.updatedAt.getTime()));

  return list.map((a) => {
    const week = inWindow(rows, a.id, weekFrom, until);
    const prev = inWindow(rows, a.id, prevFrom, prevUntil);
    const avgViews = avg(week);
    const prevAvg = avg(prev);
    const views = week.reduce((s, r) => s + r.views, 0);
    const reactions = week.reduce((s, r) => s + r.likes + r.comments + r.shares + r.saves, 0);
    const top = week.reduce<Row | null>((b, r) => (!b || r.views > b.views ? r : b), null);
    const trend = avgViews != null && prevAvg ? (avgViews - prevAvg) / prevAvg : null;
    const t = (tips as Record<number, { hours: { hour: number }[]; fromHistory: boolean }>)[a.id];
    const syncedAt = lastSync.get(a.id) ?? null;
    return {
      accountId: a.id,
      username: a.username,
      posts: week.length,
      avgViews,
      trend,
      engagement: views ? reactions / views : null,
      best: top ? { externalId: top.externalId, views: top.views, caption: (top.caption ?? "").replace(/\s+/g, " ").trim().slice(0, 60) } : null,
      bestHour: t?.fromHistory ? (t.hours[0]?.hour ?? null) : null,
      status:
        avgViews == null ? "nodata"
        : avgViews < MIN_AVG_VIEWS ? "rest"
        : trend != null && trend <= DROP_ALERT ? "drop"
        : week.length < FEW_POSTS ? "rare"
        : "ok",
      stale: !syncedAt || now - syncedAt > STALE_SYNC_HOURS * 3600_000,
    };
  });
}
