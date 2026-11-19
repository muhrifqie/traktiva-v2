import "server-only";
import type { Page } from "playwright-core";
import { withProfile } from "@/lib/browser/camoufox";

// TikTok Shop "Streamer Desktop" (shop.tiktok.com/streamer) read & write through the account's own logged-in
// Camoufox profile. All endpoints below were found by capturing the real page (2026-11-18):
//   GET  /api/v1/streamer_desktop/search_product/list    showcase list (size, offset)
//   POST /api/v1/streamer_desktop/product_link/check     {origin:2, urls:[...]} → product preview
//   POST /api/v1/streamer_desktop/showcase_product/add   {product_info:[{product_id, source_from:2, main_plan_id:"", isv_id:""}]}
//   POST /api/v1/streamer_desktop/showcase_product/delete {product_info:[{product_id}]}
// Requests need TikTok's X-Bogus / X-Gnarly signatures, which the page's own SDK adds to fetches made from
// inside the page. So every call runs as an in-page fetch, with the query params the page itself uses.

const SHOWCASE_URL = "https://shop.tiktok.com/streamer/showcase/product/list";
const LIST = "/api/v1/streamer_desktop/search_product/list";

/* eslint-disable @typescript-eslint/no-explicit-any -- TikTok JSON */

export type ShopPage = {
  page: Page;
  /** Signed in-page call. Returns the parsed JSON (TikTok puts errors in `code`/`message`). */
  call: (path: string, init?: { method?: "GET" | "POST"; body?: unknown; query?: Record<string, string> }) => Promise<any>;
  /** First showcase list response the page loaded by itself. */
  firstList: any;
};

/** Open the showcase page once and expose a signed `call()` for any Streamer Desktop endpoint. */
export async function withShopPage<T>(sessionKey: string, fn: (s: ShopPage) => Promise<T>): Promise<T> {
  return withProfile(sessionKey, { headless: true }, async (ctx) => {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    const first = page.waitForResponse((r) => r.url().includes(LIST), { timeout: 45_000 }).catch(() => null);
    await page.goto(SHOWCASE_URL, { waitUntil: "commit", timeout: 45_000 });
    const res = await first;
    if (!res) {
      if (/login|passport/.test(page.url())) throw new Error("Sesi TikTok habis. Login ulang akun ini di menu Akun Sosial.");
      throw new Error("Halaman TikTok Shop tidak merespons. Pastikan akun sudah terdaftar sebagai kreator affiliate.");
    }
    const firstList = await res.json().catch(() => null);
    if (!firstList?.data) throw new Error(`TikTok Shop menolak permintaan (${firstList?.code ?? res.status()}).`);

    // Common query the page sends (aid, app_name, locale, device...), minus per-request signatures.
    const common = new URL(res.url()).searchParams;
    for (const k of ["msToken", "X-Bogus", "X-Gnarly", "size", "offset"]) common.delete(k);

    const call: ShopPage["call"] = async (path, init = {}) => {
      const q = new URLSearchParams(common);
      for (const [k, v] of Object.entries(init.query ?? {})) q.set(k, v);
      return page.evaluate(
        async ([url, method, body]) => {
          const r = await fetch(url, {
            method,
            credentials: "include",
            headers: body ? { "content-type": "application/json" } : undefined,
            body: body ?? undefined,
          });
          const text = await r.text();
          try {
            return JSON.parse(text);
          } catch {
            return { code: r.status, message: text.slice(0, 120) };
          }
        },
        [`${path}?${q}`, init.method ?? (init.body ? "POST" : "GET"), init.body ? JSON.stringify(init.body) : null] as const,
      );
    };
    return fn({ page, call, firstList });
  });
}

// ---------------------------------------------------------------- showcase list

export type ShowcaseProduct = {
  productId: string;
  title: string;
  price: string; // e.g. "Rp13.320"
  originalPrice: string | null;
  commission: string | null; // estimated commission per sale, e.g. "Rp1.812"
  stock: number | null;
  inStock: boolean;
  hidden: boolean;
  shopName: string | null;
  coverUrl: string | null;
  labels: string[];
};

function mapProduct(p: any): ShowcaseProduct {
  return {
    productId: String(p.product_id),
    title: String(p.title ?? ""),
    price: String(p.format_available_price ?? p.format_origin_price ?? ""),
    originalPrice: p.format_origin_price && p.format_origin_price !== p.format_available_price ? String(p.format_origin_price) : null,
    commission: p.affiliate_info?.est_commission_expense ?? null,
    stock: typeof p.stock_num === "number" ? p.stock_num : null,
    inStock: p.stock_status === 1,
    hidden: !!p.is_hide,
    shopName: p.seller_info?.shop_name ?? null,
    coverUrl: p.cover?.url_list?.[0] ?? p.cover?.thumb_url_list?.[0] ?? null,
    labels: (p.labels ?? []).map((l: any) => l.text).filter(Boolean),
  };
}

export type ShowcaseResult = { products: ShowcaseProduct[]; total: number };

async function readShowcase({ call, firstList }: ShopPage): Promise<ShowcaseResult> {
  const total = Number(firstList.data.total ?? 0);
  const all = new Map<string, ShowcaseProduct>();
  for (const p of firstList.data.products ?? []) all.set(String(p.product_id), mapProduct(p));
  let more = !!firstList.data.has_more;
  for (let offset = all.size; more && offset < Math.min(total, 2000); offset += 50) {
    const j = await call(LIST, { query: { size: "50", offset: String(offset) } });
    const list = j?.data?.products ?? [];
    for (const p of list) all.set(String(p.product_id), mapProduct(p));
    more = !!j?.data?.has_more && list.length > 0;
  }
  return { products: [...all.values()], total: Math.max(total, all.size) };
}

/** Read every product in the account's showcase (headless, ~10–25 s). */
export function fetchShowcase(sessionKey: string) {
  return withShopPage(sessionKey, readShowcase);
}

// ---------------------------------------------------------------- add / remove

/** Accepts product links (tiktok.com/view/product/…, shop links) or bare product IDs. */
export function normalizeProductInput(raw: string) {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{15,22}$/.test(s)) return { url: `https://www.tiktok.com/view/product/${s}`, productId: s };
  if (/^https?:\/\//i.test(s)) return { url: s, productId: s.match(/(\d{15,22})/)?.[1] ?? null };
  return null;
}

export type AddResult = { input: string; productId: string | null; title: string | null; ok: boolean; message: string };

/**
 * Add products to the showcase. Each link is checked first (TikTok resolves short links and tells us
 * whether the product can be promoted), then all valid ones are added in one request.
 * Ends with the fresh showcase list so the caller can mirror it.
 */
export async function addToShowcase(sessionKey: string, inputs: string[]) {
  return withShopPage(sessionKey, async (s) => {
    const items = inputs.map((input) => ({ input, n: normalizeProductInput(input) }));
    const results: AddResult[] = items
      .filter((i) => !i.n)
      .map((i) => ({ input: i.input, productId: null, title: null, ok: false, message: "Bukan link produk TikTok Shop atau ID produk." }));
    const valid = items.filter((i) => i.n);

    const found: { input: string; productId: string; title: string | null }[] = [];
    if (valid.length) {
      const check = await s.call("/api/v1/streamer_desktop/product_link/check", { body: { origin: 2, urls: valid.map((v) => v.n!.url) } });
      const byUrl = new Map<string, any>((check?.data?.results ?? []).map((r: any) => [r.original_url, r]));
      for (const v of valid) {
        const r = byUrl.get(v.n!.url);
        const p = r?.product_info?.closed_loop_product ?? r?.product_info?.product ?? r?.product_info;
        const productId = String(p?.product_id ?? v.n!.productId ?? "");
        if (!productId) {
          results.push({ input: v.input, productId: null, title: null, ok: false, message: r?.fail_reason ?? r?.message ?? "Produk tidak ditemukan dari link ini." });
          continue;
        }
        found.push({ input: v.input, productId, title: p?.title ?? p?.product_name ?? null });
      }
    }

    if (found.length) {
      const res = await s.call("/api/v1/streamer_desktop/showcase_product/add", {
        body: { product_info: found.map((f) => ({ product_id: f.productId, source_from: 2, main_plan_id: "", isv_id: "" })) },
      });
      const status = new Map<string, number>((res?.data?.product_add_status ?? []).map((x: any) => [String(x.product_id), Number(x.add_status)]));
      for (const f of found) {
        const st = status.get(f.productId);
        // add_status 1 = added (observed: 4 = rejected, e.g. region/permission); trust code 0 when no per-item status
        const ok = st != null ? st === 1 || st === 2 : res?.code === 0;
        results.push({ ...f, ok, message: ok ? "Masuk etalase" : res?.message || `Ditolak TikTok (status ${st ?? res?.code})` });
      }
    }
    return { results, showcase: await readShowcase(await refreshed(s)) };
  });
}

/** Remove products from the showcase, then return the fresh list. */
export async function removeFromShowcase(sessionKey: string, productIds: string[]) {
  return withShopPage(sessionKey, async (s) => {
    const res = await s.call("/api/v1/streamer_desktop/showcase_product/delete", {
      body: { product_info: productIds.map((product_id) => ({ product_id })) },
    });
    if (res?.code !== 0) throw new Error(res?.message || `TikTok menolak penghapusan (${res?.code}).`);
    return { showcase: await readShowcase(await refreshed(s)) };
  });
}

/** Re-read page 1 of the list after a change (firstList is from before it). */
async function refreshed(s: ShopPage): Promise<ShopPage> {
  const firstList = await s.call(LIST, { query: { size: "50", offset: "0" } });
  return firstList?.data ? { ...s, firstList } : s;
}

// ---------------------------------------------------------------- account overview (Streamer menus)

export type ShopOverview = {
  creator: { handle: string | null; alias: string | null; avatarUrl: string | null; region: string | null; currency: string | null; timezone: string | null };
  health: {
    score: number | null; // account health points (TikTok starts creators at 200)
    baseScore: number | null;
    deducted: number;
    awarded: number;
    riskText: string | null; // e.g. "Baik"
    riskColor: string | null;
    violationScore: number;
    hasNewViolation: boolean;
    toAppeal: number;
  };
  lives: { total: number; items: Record<string, unknown>[] };
  showcaseCount: number;
};

const nowSec = () => Math.floor(Date.now() / 1000);

async function readOverview({ call }: ShopPage, showcaseCount: number): Promise<ShopOverview> {
  const info = await call("/api/v2/insights/creator/info", { body: { version: "2" } }).catch(() => null);
  const country = String(info?.data?.handle?.region ?? "ID").toUpperCase();
  const [chr, vio, lives] = await Promise.all([
    call("/api/v1/account/chr/score", { query: { country_code: country, is_need_display_status: "true", is_need_violation: "true" } }).catch(() => null),
    call("/api/v2/governance/creator/violation/overview").catch(() => null),
    call("/api/v1/insights/creator/live/list", {
      body: {
        request: {
          params: [
            {
              time_selector: { period: 2, granularity: 1, start_timestamp: "0", end_timestamp: String(nowSec()) },
              stats_types: [50, 80, 90, 95, 84, 11, 12, 13],
              list_control: { rules: [{ direction: 2, field: "LIVE_LIST_LIVE_START_TIMESTAMP" }], pagination: { size: 20, page: 0 } },
            },
          ],
        },
      },
    }).catch(() => null),
  ]);
  const meta = info?.data?.meta ?? {};
  const handle = info?.data?.handle ?? {};
  const seg = lives?.data?.segments?.[0];
  return {
    creator: {
      handle: meta.handle ?? null,
      alias: meta.alias ?? null,
      avatarUrl: meta.avatar?.uri ?? null,
      region: handle.region ?? null,
      currency: handle.currency_code ?? null,
      timezone: handle.timezone ?? null,
    },
    health: {
      score: chr?.data?.score ?? null,
      baseScore: chr?.data?.base_score ?? null,
      deducted: Number(chr?.data?.total_deducted_points ?? 0),
      awarded: Number(chr?.data?.total_awarded_points ?? 0),
      riskText: vio?.data?.risk_info?.risk_level_text ?? null,
      riskColor: vio?.data?.risk_info?.light_color ?? null,
      violationScore: Number(vio?.data?.violation_score ?? 0),
      hasNewViolation: !!vio?.data?.has_new_violation,
      toAppeal: Number(vio?.data?.violation_to_appeal_num ?? 0),
    },
    lives: {
      total: Number(seg?.list_control?.next_pagination?.total ?? 0),
      items: (seg?.timed_lists ?? []).flatMap((t: any) => t.stats ?? []),
    },
    showcaseCount,
  };
}

/** One browser session: showcase list + account overview (used by manual and auto sync). */
export function fetchShopSnapshot(sessionKey: string) {
  return withShopPage(sessionKey, async (s) => {
    const showcase = await readShowcase(s);
    const overview = await readOverview(s, showcase.products.length);
    return { showcase, overview };
  });
}

// ---------------------------------------------------------------- market research (Analitik pasar)

export type MarketCategory = { id: string; name: string };
export type RankedProduct = {
  rank: number;
  rankChange: number;
  productId: string;
  title: string;
  coverUrl: string | null;
  price: string;
  transactionIndex: number; // TikTok's relative sales index (0–100)
  creators: number; // creators promoting it
  shopName: string | null;
  shopScore: number | null;
  inShowcase: boolean;
  canAdd: boolean;
  openPlan: boolean; // has a public (open) affiliate plan
};

/** Categories + top 20 products of one category (default: first category). Week-over-week ranking. */
export function fetchMarketRanking(sessionKey: string, categoryId?: string, page = 0) {
  return withShopPage(sessionKey, async ({ call }) => {
    const cats = await call("/api/v2/insights/creator/search/product/categories", { body: { version: "2" } });
    const categories: MarketCategory[] = (cats?.data?.categories ?? []).map((c: any) => ({ id: String(c.id), name: String(c.name) }));
    const cat = categoryId ?? categories[0]?.id;
    if (!cat) throw new Error("Kategori riset pasar tidak tersedia untuk akun ini.");
    const j = await call("/api/v2/insights/creator/product/ranking/list", {
      body: {
        request: {
          params: [
            {
              filter: { ranking_type: 1, product_level1_catalog_id: cat },
              list_control: { pagination: { page, size: 20 }, rules: [{ direction: 2, field: "CREATOR_PRODUCT_RANKING_LIST_PRODUCT_TRANSACTION_INDEX" }] },
              time_selector: { period: 32, granularity: 30, timezone_offset: 25200, base_timestamp: nowSec() },
              stats_types: [1, 2, 10, 22, 50, 51, 25, 23, 24, 26, 27, 20, 42],
            },
          ],
        },
        version: "2",
      },
    });
    if (j?.code !== 0) throw new Error(j?.message || `Riset pasar gagal (${j?.code}).`);
    const seg = j.data?.segments?.[0];
    const stats: any[] = (seg?.timed_lists ?? []).flatMap((t: any) => t.stats ?? []);
    const products: RankedProduct[] = stats.map((s) => ({
      rank: Number(s.rank),
      rankChange: Number(s.rank_change_cnt ?? 0),
      productId: String(s.product?.id),
      title: String(s.product?.name ?? ""),
      coverUrl: s.product?.cover_image?.thumb_url_list?.[0] ?? null,
      price:
        s.product?.price_min?.amount_formatted && s.product?.price_max?.amount_formatted && s.product.price_min.amount !== s.product.price_max.amount
          ? `${s.product.price_min.amount_formatted} – ${s.product.price_max.amount_formatted}`
          : s.product?.price_min?.amount_formatted ?? "",
      transactionIndex: Number(s.product_transaction_index ?? 0),
      creators: Number(s.creators_cnt ?? 0),
      shopName: s.shop_name ?? null,
      shopScore: s.shop_score != null ? Number(s.shop_score) : null,
      inShowcase: !!s.product_is_added_to_showcase,
      canAdd: !!s.product_can_be_added_to_showcase,
      openPlan: s.product_has_public_plan === 1,
    }));
    const pg = seg?.list_control?.next_pagination ?? {};
    return { categories, categoryId: cat, products, hasMore: !!pg.has_more, total: Number(pg.total ?? products.length) };
  });
}

// ---------------------------------------------------------------- product detail (public product page)

export type RawProductDetail = Omit<import("@/lib/db/schema").ProductDetail, "images"> & { imageUrls: string[] };

/**
 * Read a product's full page (shop.tiktok.com/view/product/<id>) with the account's profile: photos, description,
 * price, sold count, rating, variants, shop, shipping. The page embeds everything in __MODERN_ROUTER_DATA__.
 */
export function fetchProductDetail(sessionKey: string, productId: string): Promise<RawProductDetail> {
  // opened from the showcase page like a person would: a cold visit straight to the product page gets TikTok's
  // "Security Check" captcha, which we never try to solve
  return withShopPage(sessionKey, async ({ page }) => {
    await page.goto(`https://shop.tiktok.com/view/product/${productId}?region=ID&locale=id-ID`, { waitUntil: "domcontentloaded", timeout: 45_000, referer: SHOWCASE_URL });
    if (/security check/i.test(await page.title().catch(() => ""))) throw new Error("TikTok meminta verifikasi keamanan untuk halaman produk. Coba lagi nanti, atau buka produknya sekali di TikTok.");
    // the data script is server-rendered; read it through a locator (waitForFunction's rAF polling stalls headless)
    const raw = await page.locator("script#__MODERN_ROUTER_DATA__").textContent({ timeout: 20_000 }).catch(() => null);
    if (!raw) throw new Error("Halaman produk TikTok tidak terbuka. Coba lagi sebentar lagi.");
    const data = JSON.parse(raw);
    const pageData: any = Object.values(data?.loaderData ?? {}).find((v: any) => v?.page_config) ?? null;
    const comps: any[] = pageData?.page_config?.components_map ?? [];
    const info = comps.find((c) => c.component_type === "product_info")?.component_data;
    const p = info?.product_info;
    if (!p?.product_id) throw new Error("Detail produk tidak tersedia (produk dihapus atau tidak dijual di Indonesia).");
    const num = (v: unknown) => (v == null || v === "" ? null : Number(String(v).replace(/[^\d.]/g, "")) || null);
    const description = (p.desc_blocks ?? []).filter((b: any) => b.type === "text" && b.text).map((b: any) => String(b.text).trim()).join("\n").slice(0, 4000);
    const stock = (p.skus ?? []).reduce((a: number, s: any) => a + (typeof s.stock === "number" ? s.stock : 0), 0);
    const lg = p.logistic;
    return {
      title: String(p.title ?? ""),
      imageUrls: (p.images ?? []).map((i: any) => i.url_list?.[0]).filter(Boolean).slice(0, 8),
      description,
      price: String(p.price?.real_price ?? ""),
      originalPrice: p.price?.original_price && p.price.original_price !== p.price.real_price ? String(p.price.original_price) : null,
      discount: p.price?.discount ?? null,
      sold: num(p.sold_count),
      rating: p.review?.product_rating ?? null,
      reviews: num(p.review?.review_count),
      shop: p.seller ? { name: String(p.seller.name ?? ""), rating: num(p.seller.rating), products: num(p.seller.product_count) } : null,
      variants: (p.sale_props ?? []).map((sp: any) => ({ name: String(sp.prop_name ?? ""), values: (sp.sale_prop_values ?? []).map((v: any) => String(v.prop_value ?? "")).filter(Boolean) })),
      stock: p.skus?.length ? stock : null,
      shipping: lg ? [lg.free_shipping ? "Gratis ongkir" : null, lg.delivery_name ?? null].filter(Boolean).join(" · ") || null : null,
      category: info?.category_info?.recommended_categories?.[0]?.category_name ?? null,
    };
  });
}
