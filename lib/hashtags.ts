import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountPosts } from "@/lib/db/schema";

// Hashtags for upload captions (Jadwal Upload). TikTok publishes no list of hashtags "the algorithm likes"; what
// helps is relevance (product hashtags) plus the general selling / FYP hashtags that actually brought views on
// THIS account. Niche hashtags from other products (#shampoo on a shoe) are never reused: only GENERAL ones are
// ranked from the account's own posts.

/** General hashtags that fit any product (selling / discovery). Ranked per account by real views. */
const GENERAL = ["#fyp", "#fypシ", "#foryou", "#viral", "#trending", "#racuntiktok", "#tiktokshop", "#tiktokaffiliate", "#murah", "#promo", "#diskon", "#rekomendasi", "#racunshopee", "#checkout"];
/** Fallback order when an account has too little history. */
export const DEFAULT_GENERAL = ["#racuntiktok", "#tiktokshop", "#fyp"];
const MIN_USES = 2; // a hashtag must appear on at least this many posts to be judged

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** General hashtags that beat this account's median views, best first (empty when there is too little data). */
export async function provenHashtags(accountId: number): Promise<string[]> {
  const posts = await db.select({ caption: accountPosts.caption, views: accountPosts.views }).from(accountPosts).where(eq(accountPosts.accountId, accountId));
  if (posts.length < 6) return [];
  const all = median(posts.map((p) => p.views));
  const by = new Map<string, number[]>();
  for (const p of posts) {
    const tags = new Set((p.caption ?? "").toLowerCase().match(/#[\p{L}\p{N}_シ]+/gu) ?? []);
    for (const t of tags) if (GENERAL.includes(t)) by.set(t, [...(by.get(t) ?? []), p.views]);
  }
  return [...by.entries()]
    .filter(([, v]) => v.length >= MIN_USES)
    .map(([tag, v]) => ({ tag, med: median(v) }))
    .filter((x) => x.med > all)
    .sort((a, b) => b.med - a.med)
    .map((x) => x.tag);
}

/** provenHashtags for several accounts at once. */
export async function provenHashtagsFor(accountIds: number[]): Promise<Record<number, string[]>> {
  const entries = await Promise.all(accountIds.map(async (id) => [id, await provenHashtags(id).catch(() => [])] as const));
  return Object.fromEntries(entries);
}
