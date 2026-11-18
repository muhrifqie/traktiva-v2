// Dev check: which Shopee markets KaloData serves (the image host of the results tells the real market).
// Usage: npx tsx --conditions=react-server scripts/try-shopee-markets.mts
import { KaloClient } from "@/lib/kalodata";
import { kaloClient } from "@/lib/kalo";

const base = await kaloClient("ID");
for (const cc of ["ID", "MY", "PH", "SG", "TH", "VN", "BR", "MX", "TW"]) {
  // same sessions, different market header
  const c = new KaloClient({ sessions: (base.client as unknown as { opt: { sessions: never[] } }).opt.sessions, country: cc, currency: "IDR", minDelayMs: 1200, jitterMs: 500 });
  try {
    const r = await c.shopeeProducts({ pageSize: 3 });
    console.log(cc, r.length, r[0]?.imageUrl?.match(/shopee\.[a-z.]+/)?.[0], "|", r[0]?.productName?.slice(0, 50));
  } catch (e) {
    console.log(cc, "ERR", (e as Error).message);
  }
}
process.exit(0);
