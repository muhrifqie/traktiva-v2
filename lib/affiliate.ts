import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";

// Affiliate earnings per TikTok account for Beranda ("Pendapatan affiliate · 7 hari").
// The numbers live in the TikTok Shop Indonesia affiliate center (Tokopedia), not in Streamer Desktop
// (that one only has LIVE GMV):
//   https://affiliate-id.tokopedia.com/insights/transaction-analysis?shop_region=ID&shop_id=<account's shop id>
// ponytail: backend not built yet (Rifq) — read the last 7 days there through the account's own Chrome profile
// (withProfile / signed in-page fetch, like lib/platforms/tiktok-shop.ts), cache it like shopCache, and return it
// from affiliateSummary(). Until then every account comes back with `data: null` and the card says "belum tersambung".

export const AFFILIATE_CENTER_URL = "https://affiliate-id.tokopedia.com/insights/transaction-analysis?shop_region=ID";

export type AffiliateSummary = {
  commission: number; // estimated commission earned, IDR
  gmv: number; // sales value of the attributed orders, IDR
  orders: number;
  itemsSold: number;
  capturedAt: number; // ms epoch of the read
};

export type AffiliateRow = { accountId: number; username: string; data: AffiliateSummary | null };

/** Last 7 days of affiliate earnings per TikTok account (null data = not connected yet). */
export async function affiliateSummary(): Promise<AffiliateRow[]> {
  const list = await db.select({ id: accounts.id, username: accounts.username }).from(accounts).where(eq(accounts.platform, "tiktok"));
  return list.map((a) => ({ accountId: a.id, username: a.username, data: null }));
}
