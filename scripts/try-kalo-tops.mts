// Dev check: KaloData overview rankings + Shopee top products for a few markets (prints field names & first rows).
// Usage: npx tsx --conditions=react-server scripts/try-kalo-tops.mts ID JP DE
import { kalo, kaloRange } from "@/lib/kalo";
import type { CountryCode } from "@/lib/countries";

for (const cc of (process.argv.slice(2).length ? process.argv.slice(2) : ["ID"]) as CountryCode[]) {
  const range = await kaloRange(cc);
  for (const [name, fn] of [
    ["productTops", () => kalo((c) => c.productTops(range, 5), cc)],
    ["videoTops", () => kalo((c) => c.videoTops(range, 5), cc)],
    ["shopee", () => kalo((c) => c.shopeeProducts({ pageSize: 5 }), cc)],
  ] as const) {
    try {
      const rows = (await fn()) as unknown as Record<string, unknown>[];
      console.log(cc, name, rows.length, "keys:", Object.keys(rows[0] ?? {}).slice(0, 40).join(","));
      console.log("  first:", JSON.stringify(rows[0] ?? {}).slice(0, 300));
    } catch (e) {
      console.log(cc, name, "ERR", (e as Error).message);
    }
  }
}
process.exit(0);
