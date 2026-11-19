// Dev check for fetchProductDetail. Usage: npx tsx --conditions=react-server scripts/try-product-detail.mts <productId>
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { fetchProductDetail } from "@/lib/platforms/tiktok-shop";

const acc = await db.select().from(accounts).where(eq(accounts.platform, "tiktok")).get();
const d = await fetchProductDetail(acc!.sessionKey!, process.argv[2]).catch((e) => ({ error: String(e).slice(0, 200) }));
console.log(JSON.stringify(d).slice(0, 700));
process.exit(0);
