// Dev check: Shopee category filter + page 2 on Shopee / top products / top videos.
// Usage: npx tsx --conditions=react-server scripts/try-kalo-paging.mts
import { kalo, kaloRange } from "@/lib/kalo";

type Any = Record<string, unknown>;
const raw = <T,>(m: "GET" | "POST", path: string, body?: unknown) =>
  kalo((c) => (c as unknown as { request: (m: string, p: string, b?: unknown) => Promise<T> }).request(m, path, body), "ID");
const show = (label: string, p: Promise<unknown>) =>
  p.then((r) => {
    const rows = (Array.isArray(r) ? r : ((r as Any).data as Any[])) as Any[];
    console.log(label, "→", rows?.length, "|", JSON.stringify(rows?.[0] ?? r).slice(0, 160), Array.isArray(r) ? "" : `hasNext=${(r as Any).hasNext} total=${(r as Any).total}`);
  }, (e) => console.log(label, "ERR", (e as Error).message));

const sh = (extra: Any) => ({ cateIds: [], dataRange: "L1W", keyword: "", pageNo: 1, pageSize: 10, sort: { field: "unitsSold", type: "DESC" }, searchWay: "VAGUE", ...extra });
await show("shopee cate 100001 (str)", raw("POST", "/shopee/product/pageList", sh({ cateIds: ["100001"] })));
await show("shopee cate 100001 (num)", raw("POST", "/shopee/product/pageList", sh({ cateIds: [100001] })));
await show("shopee page2", raw("POST", "/shopee/product/pageList", sh({ pageNo: 2 })));
await show("shopee pageSize 20", raw("POST", "/shopee/product/pageList", sh({ pageSize: 20 })));
const range = await kaloRange("ID");
await show("productTops page2", raw("POST", "/overview/rank/queryProductTops", { ...range, pageNo: 2, pageSize: 10 }));
await show("videoTops page2", raw("POST", "/overview/rank/queryVideoTops", { ...range, pageNo: 2, pageSize: 10 }));
await show("productTops size20", raw("POST", "/overview/rank/queryProductTops", { ...range, pageNo: 1, pageSize: 20 }));
process.exit(0);
