import "server-only";
import { getShopCache, setShopCache } from "@/lib/showcase";

// A channel that hit YouTube's daily upload cap: its queued uploads wait 24 hours (runner) and the app says why
// (YouTube page, Kalender). Kept next to the channel's other caches.
const KEY = "yt-limit";
const DAY = 24 * 3_600_000;

export async function markUploadLimit(accountId: number) {
  await setShopCache(accountId, KEY, { until: Date.now() + DAY });
}

/** ms epoch until when the channel is capped, or null when it can upload. */
export async function uploadLimitUntil(accountId: number): Promise<number | null> {
  const c = await getShopCache<{ until: number }>(accountId, KEY);
  return c && c.data.until > Date.now() ? c.data.until : null;
}
