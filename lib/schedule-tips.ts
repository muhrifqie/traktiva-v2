import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountPosts, uploadJobs } from "@/lib/db/schema";

// Smart suggestions for Jadwal Upload: the hours (WIB) the account's own past posts got the most views, and the
// next free slots at those hours that keep the gap between posts and a sane number of posts per day.

export const MAX_PER_DAY = 3; // more than this per account per day looks like spam to TikTok
const DEFAULT_HOURS = [19, 12, 21]; // general TikTok Indonesia prime time when the account has too little history
const wibHour = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Jakarta" }).format(d)) % 24;
const wibDay = (t: number) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });

export type HourTip = { hour: number; avgViews: number | null; posts: number };
export type AccountTips = { hours: HourTip[]; fromHistory: boolean; slots: number[]; postsToday: number };

/** Best posting hours from the account's own posts (≥ 6 posts with a time), else the general prime time. */
export async function bestHours(accountId: number): Promise<{ hours: HourTip[]; fromHistory: boolean }> {
  const posts = await db.select({ views: accountPosts.views, postedAt: accountPosts.postedAt }).from(accountPosts).where(and(eq(accountPosts.accountId, accountId), isNotNull(accountPosts.postedAt)));
  if (posts.length >= 6) {
    const by = new Map<number, number[]>();
    for (const p of posts) {
      const h = wibHour(p.postedAt!);
      // 06–23 only: a post at 04:00 gets its views later in the day, which says nothing about posting at 04:00
      if (h < 6) continue;
      by.set(h, [...(by.get(h) ?? []), p.views]);
    }
    // median per hour (one viral post shouldn't decide), hours with at least 2 posts
    const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const ranked = [...by.entries()].filter(([, v]) => v.length >= 2).map(([hour, v]) => ({ hour, avgViews: med(v), posts: v.length })).sort((a, b) => b.avgViews - a.avgViews).slice(0, 3);
    if (ranked.length >= 2) return { hours: ranked, fromHistory: true };
  }
  return { hours: DEFAULT_HOURS.map((hour) => ({ hour, avgViews: null, posts: 0 })), fromHistory: false };
}

/** Per TikTok account: best hours + the next free slots (epoch ms) at those hours over the coming days. */
export async function scheduleTips(accountIds: number[], minGapMin: number): Promise<Record<number, AccountTips>> {
  const out: Record<number, AccountTips> = {};
  if (!accountIds.length) return out;
  const jobs = await db.select({ accountId: uploadJobs.accountId, at: uploadJobs.scheduledAt, postedAt: uploadJobs.postedAt, status: uploadJobs.status }).from(uploadJobs).where(and(inArray(uploadJobs.accountId, accountIds), inArray(uploadJobs.status, ["queued", "uploading", "done"])));
  for (const id of accountIds) {
    const { hours, fromHistory } = await bestHours(id);
    const taken = jobs.filter((j) => j.accountId === id).map((j) => (j.postedAt ?? j.at).getTime());
    const perDay = new Map<string, number>();
    for (const t of taken) perDay.set(wibDay(t), (perDay.get(wibDay(t)) ?? 0) + 1);
    const slots: number[] = [];
    const now = Date.now();
    for (let d = 0; d < 5 && slots.length < 6; d++) {
      for (const { hour } of [...hours].sort((a, b) => a.hour - b.hour)) {
        // that day at HH:00 WIB (UTC+7, no DST)
        const base = new Date(new Date(now + d * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" }) + "T00:00:00+07:00").getTime();
        const t = base + hour * 3_600_000;
        if (t < now + 15 * 60_000) continue;
        const day = wibDay(t);
        if ((perDay.get(day) ?? 0) >= MAX_PER_DAY) continue;
        if ([...taken, ...slots].some((x) => Math.abs(x - t) < minGapMin * 60_000)) continue;
        slots.push(t);
        perDay.set(day, (perDay.get(day) ?? 0) + 1);
        if (slots.length >= 6) break;
      }
    }
    out[id] = { hours, fromHistory, slots, postsToday: taken.filter((t) => wibDay(t) === wibDay(now)).length };
  }
  return out;
}
