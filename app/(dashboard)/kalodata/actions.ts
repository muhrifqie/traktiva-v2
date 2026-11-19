"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { accounts, kaloSessions, videoProjects } from "@/lib/db/schema";
import { isCountry, SHOPEE_MARKETS, type CountryCode } from "@/lib/countries";
import { getKv, kalo, kaloRange, setKv } from "@/lib/kalo";
import { createProjectFolder, extractFrames, saveResult } from "@/lib/media";
import { defaultOptions, parseDuration, presetById } from "@/lib/presets";

const medianSec = (xs: number[]) => { const v = xs.filter((x) => x > 0).sort((a, b) => a - b); return v.length ? Math.round(v[Math.floor(v.length / 2)]) : 0; };
import { KaloClient, KaloError, parseKaloNumber, signupKalodata, type KaloCreator, type KaloHistoryPoint, type KaloProductInfo, type KaloProductTotal, type KaloShopeeProduct, type KaloTopProduct, type KaloTopVideo, type KaloVideo } from "@/lib/kalodata";
import { addToShowcase } from "@/lib/platforms/tiktok-shop";
import { mirrorShowcase } from "@/lib/showcase";

const refresh = () => revalidatePath("/riset", "layout");
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------------------------------------------------------------- sessions

/** Add a session from a pasted SESSION cookie (checked against Kalodata first). */
export async function addKaloSession(cookie: string, label?: string, deviceId?: string) {
  const sessionCookie = cookie.trim().replace(/^SESSION=/i, "").replace(/;.*$/, "");
  if (sessionCookie.length < 16) throw new Error("Cookie SESSION tidak valid.");
  const m = await new KaloClient({ sessions: [{ sessionCookie, deviceId: deviceId?.trim() || undefined }], minDelayMs: 0, jitterMs: 0 }).membership().catch((e) => {
    throw new Error(`Sesi ditolak KaloData: ${errMsg(e)}`);
  });
  const count = (await db.select({ id: kaloSessions.id }).from(kaloSessions)).length;
  await db
    .insert(kaloSessions)
    .values({ label: label?.trim() || `Akun ${count + 1}`, sessionCookie, deviceId: deviceId?.trim() || null, source: "manual" })
    .onConflictDoUpdate({ target: kaloSessions.sessionCookie, set: { status: "active", lastError: null } });
  refresh();
  return { level: m.level, daysLeft: m.day };
}

/** Create a fresh Kalodata trial account (disposable WaroengMail inbox) and store its session. */
export async function signupKaloSession() {
  const acc = await signupKalodata().catch((e) => {
    throw new Error(`Gagal membuat akun trial: ${errMsg(e)}`);
  });
  const check = await new KaloClient({ sessions: [acc], minDelayMs: 0, jitterMs: 0 }).membership().then(
    (m) => ({ ok: true as const, level: m.level, days: m.day }),
    (e) => ({ ok: false as const, error: errMsg(e) }),
  );
  const count = (await db.select({ id: kaloSessions.id }).from(kaloSessions)).length;
  await db.insert(kaloSessions).values({
    label: `Trial ${count + 1}`, sessionCookie: acc.sessionCookie, email: acc.email, deviceId: acc.deviceId ?? null, extraCookies: acc.extraCookies ?? null, source: "signup",
  });
  refresh();
  if (!check.ok) throw new Error(`Akun ${acc.email} dibuat tapi sesinya ditolak KaloData: ${check.error}`);
  return { email: acc.email, level: check.level, days: check.days };
}

export async function deleteKaloSession(id: number) {
  await db.delete(kaloSessions).where(eq(kaloSessions.id, z.number().int().positive().parse(id)));
  refresh();
}

/** Membership info for every session (trial/basic, days left), for the sessions dialog. */
export async function checkKaloSessions() {
  const rows = await db.select().from(kaloSessions);
  const out: { id: number; level: string | null; daysLeft: number | null; error: string | null }[] = [];
  for (const r of rows) {
    try {
      const m = await new KaloClient({ sessions: [{ sessionCookie: r.sessionCookie, deviceId: r.deviceId ?? undefined, extraCookies: r.extraCookies ?? undefined }], minDelayMs: 0, jitterMs: 0 }).membership();
      out.push({ id: r.id, level: m.level, daysLeft: m.day, error: null });
      await db
        .update(kaloSessions)
        .set(m.expired ? { status: "dead", lastError: "Paket kedaluwarsa" } : { status: r.status === "quota" ? "quota" : "active", lastError: null })
        .where(eq(kaloSessions.id, r.id));
    } catch (e) {
      out.push({ id: r.id, level: null, daysLeft: null, error: errMsg(e).slice(0, 120) });
      // only a real rejection kills a session; network/odd responses just get noted
      const dead = e instanceof KaloError && e.kind === "auth";
      await db.update(kaloSessions).set({ ...(dead ? { status: "dead" as const } : {}), lastError: errMsg(e).slice(0, 200) }).where(eq(kaloSessions.id, r.id));
    }
  }
  refresh();
  return out;
}

// ---------------------------------------------------------------- research

export type KaloHit = { id: string; name: string; gmv30: number };

/** Search several keywords at once (quota-safe full-text search); results sorted by 30-day GMV. Cached 6 h. */
export async function searchKalo(text: string, country: string = "ID") {
  const cc: CountryCode = isCountry(country) ? country : "ID";
  const keywords = [...new Set(text.split(/[,\n]+/).map((k) => k.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
  if (!keywords.length) throw new Error("Isi kata kunci dulu, pisahkan dengan koma.");
  const key = `kalo:search:${cc}:${keywords.sort().join("|")}`;
  const hit = await getKv<KaloHit[]>(key, 6 * 3600_000);
  if (hit) return { results: hit.data, cached: true, keywords, country: cc };
  const map = await kalo((c) => c.collectProducts(keywords, { maxPages: 2, pageSize: 100 }), cc);
  const results = [...map.values()].map((p) => ({ id: p.product_id, name: p.product_name, gmv30: p.gmv_in_30 })).sort((a, b) => b.gmv30 - a.gmv30);
  await setKv(key, results);
  await setKv("kalo:last-search", { keywords, country: cc, at: Date.now() });
  return { results, cached: false, keywords, country: cc };
}

export type KaloDetail = {
  info: KaloProductInfo | null;
  images: string[];
  total: KaloProductTotal;
  history: KaloHistoryPoint[];
  videos: KaloVideo[];
  creators: KaloCreator[];
  revenue: number;
  range: { startDate: string; endDate: string };
};

/** Full product detail (uses the daily DETAIL quota) — cached 24 h per product. */
export async function kaloDetail(productId: string, country: string = "ID") {
  const cc: CountryCode = isCountry(country) ? country : "ID";
  const id = z.string().regex(/^\d{10,22}$/).parse(productId);
  const key = `kalo:detail2:${cc}:${id}`; // v2: + info & images
  const hit = await getKv<KaloDetail>(key, 24 * 3600_000);
  if (hit) return { ...hit.data, cached: true };
  const range = await kaloRange(cc);
  const total = await kalo((c) => c.productTotal(id, range), cc);
  const info = await kalo((c) => c.productInfo(id, range), cc).catch(() => null);
  const images = await kalo((c) => c.productImages(id), cc).catch(() => []);
  const history = await kalo((c) => c.productHistory(id, range), cc).catch(() => []);
  const videos = await kalo((c) => c.productVideos(id, range, 1, 6), cc).catch(() => []);
  const creators = await kalo((c) => c.productCreators(id, range, 1, 6), cc).catch(() => []);
  const detail: KaloDetail = { info, images, total, history, videos, creators, revenue: parseKaloNumber(total.revenue), range };
  // don't pin a half-empty detail for 24 h (info/images failed): next open retries them
  if (info || images.length) await setKv(key, detail);
  return { ...detail, cached: false };
}

/** Put a researched product into the first logged-in TikTok account's showcase. */
export async function kaloToShowcase(productId: string) {
  const acc = await db.select().from(accounts).where(and(eq(accounts.platform, "tiktok"), eq(accounts.status, "active"))).get();
  if (!acc?.sessionKey) throw new Error("Belum ada akun TikTok yang login. Tambahkan di Akun Sosial.");
  const { results, showcase } = await addToShowcase(acc.sessionKey, [productId]);
  await mirrorShowcase(acc.id, showcase.products);
  revalidatePath("/showcase");
  return { ...results[0], account: acc.username };
}

// ---------------------------------------------------------------- market rankings (no keyword needed)

const asCountry = (c: string): CountryCode => (isCountry(c) ? c : "ID");

/** Best-selling TikTok Shop products of one market, last 30 days, 20 per page. Cached 6 h per page. */
export async function kaloTopProducts(country: string, page = 1, refreshNow = false) {
  const cc = asCountry(country);
  const pg = z.number().int().min(1).max(10).parse(page);
  const key = `kalo:tops:product:${cc}:p${pg}`;
  const hit = refreshNow ? null : await getKv<KaloTopProduct[]>(key, 6 * 3600_000);
  if (hit) return { rows: hit.data, cached: true, at: hit.capturedAt.getTime() };
  const range = await kaloRange(cc);
  const rows = await kalo((c) => c.productTops(range, 20, pg), cc);
  await setKv(key, rows);
  return { rows, cached: false, at: Date.now() };
}

/** Best-selling videos of one market (across products), last 30 days, 20 per page. Cached 6 h per page. */
export async function kaloTopVideos(country: string, page = 1, refreshNow = false) {
  const cc = asCountry(country);
  const pg = z.number().int().min(1).max(10).parse(page);
  const key = `kalo:tops:video:${cc}:p${pg}`;
  const hit = refreshNow ? null : await getKv<KaloTopVideo[]>(key, 6 * 3600_000);
  if (hit) return { rows: hit.data, cached: true, at: hit.capturedAt.getTime() };
  const range = await kaloRange(cc);
  const rows = await kalo((c) => c.videoTops(range, 20, pg), cc);
  await setKv(key, rows);
  return { rows, cached: false, at: Date.now() };
}

const shopeeCountry = (c: string): CountryCode => ((SHOPEE_MARKETS as readonly string[]).includes(c) ? (c as CountryCode) : "ID");

const ShopeeQuery = z.object({
  keyword: z.string().trim().max(80).default(""),
  dataRange: z.string().regex(/^(L1W|\d{6})$/).default("L1W"),
  categoryId: z.string().regex(/^\d{1,12}$/).nullish(),
  sort: z.enum(["unitsSold", "revenue"]).default("unitsSold"),
});

/** Shopee best sellers (KaloData only covers ID, TH and VN). Cached 6 h per filter combination. */
export async function kaloShopeeTops(country: string, query: z.input<typeof ShopeeQuery> = {}, refreshNow = false) {
  const cc = shopeeCountry(country);
  const q = ShopeeQuery.parse(query);
  const key = `kalo:tops:shopee:${cc}:${q.dataRange}:${q.categoryId ?? "all"}:${q.sort}:${q.keyword.toLowerCase()}`;
  const hit = refreshNow ? null : await getKv<KaloShopeeProduct[]>(key, 6 * 3600_000);
  if (hit) return { rows: hit.data, cached: true, at: hit.capturedAt.getTime(), country: cc };
  const rows = await kalo((c) => c.shopeeProducts({ keyword: q.keyword, dataRange: q.dataRange, cateIds: q.categoryId ? [q.categoryId] : [], sortField: q.sort, pageSize: 10 }), cc);
  await setKv(key, rows);
  return { rows, cached: false, at: Date.now(), country: cc };
}

/** Playable MP4 of a TikTok video via Kalodata's mirror (link expires; fetched on demand). */
export async function kaloVideoUrl(videoId: string, country: string = "ID") {
  const id = z.string().regex(/^\d{10,22}$/).parse(videoId);
  return kalo((c) => c.videoUrl(id), isCountry(country) ? country : "ID");
}

/**
 * "Buatkan videonya": turn a researched product into a ready Studio project.
 * - photos: first 3 KaloData gallery images (product reference for the AI)
 * - name / price / details: title, selling price, brand, shop, rating, commission, sales
 * - style: the best-selling video is downloaded and 4 frames become per-scene style references
 *   (composition & lighting only — the creator's footage itself is never reused)
 * - script: voice lines built from the product data and the top video's caption (speech-to-text comes later via Gemini)
 */
export async function createVideoFromKalo(productId: string, country: string = "ID") {
  redirect(`/video/${await createProjectFromKalo(productId, country)}`);
}

/** createVideoFromKalo without the redirect (Autopilot): returns the new project id. */
export async function createProjectFromKalo(productId: string, country: string = "ID") {
  const id = z.string().regex(/^\d{10,22}$/).parse(productId);
  const cc: CountryCode = isCountry(country) ? country : "ID";
  const d = await kaloDetail(id, cc);
  const title = String(d.info?.product_title ?? d.info?.name ?? `Produk ${id}`);
  const name = title.length > 120 ? `${title.slice(0, 117)}...` : title;
  // Kalodata formats ("Rp172.00k", "17.91k") → how people say it ("Rp172.000", "lebih dari 17 ribu")
  const priceNum = parseKaloNumber(d.info?.min_real_price ?? d.total.unit_price);
  const price = priceNum ? `Rp${new Intl.NumberFormat("id-ID").format(Math.round(priceNum))}` : "";
  const sold = parseKaloNumber(d.total.sale);
  const soldSpoken = sold >= 1_000_000 ? `lebih dari ${Math.floor(sold / 1_000_000)} juta` : sold >= 1000 ? `lebih dari ${Math.floor(sold / 1000)} ribu` : sold ? String(sold) : "";
  const facts = [
    d.info?.brand_name && `brand ${d.info.brand_name}`,
    d.info?.product_rating != null && `rating ${d.info.product_rating}`,
    soldSpoken && `terjual ${soldSpoken} dalam 30 hari`,
    d.info?.commission_rate && `komisi ${d.info.commission_rate}`,
  ].filter(Boolean).join(", ");

  const preset = presetById("custom")!;
  const product = { name, details: facts, price, photos: [] as string[] };
  const [{ id: projectId }] = await db
    .insert(videoProjects)
    .values({ presetId: preset.id, title: "", step: 4, product, options: { ...defaultOptions(preset) }, scenes: [], folder: "" })
    .returning({ id: videoProjects.id });
  const folder = await createProjectFolder(projectId, `kalo-${id}`);

  // 1) product photos
  for (const [i, src] of (d.images.length ? d.images : [`https://img.kalocdn.com/tiktok.product/${id}/cover.png`]).slice(0, 3).entries()) {
    const rel = await saveResult(src, `${folder}/produk/foto-${i + 1}`, ".png").catch(() => null);
    if (rel) product.photos.push(rel);
  }

  // 2) style reference: best-selling video → 4 frames
  const top = [...d.videos].sort((a, b) => parseKaloNumber(b.revenue) - parseKaloNumber(a.revenue))[0];
  let frames: string[] = [];
  let refVideo: string | null = null;
  if (top) {
    try {
      const url = await kalo((c) => c.videoUrl(top.id), cc);
      refVideo = await saveResult(url, `${folder}/referensi/video-${top.id}`, ".mp4");
      frames = await extractFrames(refVideo, `${folder}/referensi/frame`, [0.08, 0.35, 0.62, 0.88]);
    } catch {
      // no reference available: the storyboard still works from product photos alone
    }
  }

  // 3) storyboard + script (Indonesian voice lines, English visual prompts for Flow)
  const short = name.split(/[|/,-]/)[0].trim().slice(0, 60);
  const look = "match the camera angle, framing and lighting of the style reference image, vertical 9:16 smartphone video look, realistic, no text";
  const prod = `the product "${short}" exactly as in the product photos`;
  const scenes = [
    { label: "Hook", imagePrompt: `Close-up of ${prod} held up to the camera, eye-catching first frame, ${look}`, motionPrompt: `Quick push-in on the product. A friendly Indonesian voice says: "Ini dia yang lagi viral, ${short}!"` },
    { label: "Demo", imagePrompt: `Hands showing ${prod} in use, natural home setting, ${look}`, motionPrompt: `Hands demonstrate the product naturally. Voice: "${d.info?.product_rating ? `Rating ${String(d.info.product_rating).replace(".", " koma ")}, ` : ""}udah ${soldSpoken || "ribuan orang"} yang beli bulan ini."` },
    { label: "Detail", imagePrompt: `Macro detail shot of ${prod} showing texture and quality, ${look}`, motionPrompt: `Slow pan across the product details. Voice: "Lihat detailnya, rapi banget."` },
    { label: "Pakai", imagePrompt: `A person using ${prod} in a real everyday moment at home, product clearly visible, ${look}`, motionPrompt: `The person uses the product naturally in one smooth action. Voice: "Dipakai tiap hari juga enak banget."` },
    // spoken CTA without invented urgency (0/30 best sellers used a CTA sticker; the CTA is said, not shown)
    { label: "Ajakan", imagePrompt: `${prod} placed neatly with a hand pointing to it, clean background, ${look}`, motionPrompt: `Hand points at the product, then a thumbs up. Voice: "${price ? `Cuma ${price}, ` : ""}cek keranjang di bawah ya!"` },
  ].map((s, i) => ({ ...s, image: null, clip: null, styleRef: frames[i] ?? null }));

  const tags = (top?.description.match(/#[\p{L}\p{N}_]+/gu) ?? []).slice(0, 6).join(" ");
  const caption = `${short} lagi rame banget! ${price ? `Cuma ${price}. ` : ""}Cek keranjang di bawah ya 🛒\n\n${tags || "#racuntiktok #tiktokshop #fyp"}`;
  await db
    .update(videoProjects)
    .set({
      title: `${short} (dari KaloData)`,
      folder,
      product,
      scenes,
      caption,
      options: {
        ...defaultOptions(preset),
        refVideo: refVideo ?? "",
        refCaption: top?.description?.slice(0, 300) ?? "",
        // median length of the product's 3 best-selling videos: the Gaya step suggests a format from it
        refDuration: String(medianSec([...d.videos].sort((a, b) => parseKaloNumber(b.revenue) - parseKaloNumber(a.revenue)).slice(0, 3).map((v) => parseDuration(v.duration)))),
      },
    })
    .where(eq(videoProjects.id, projectId));
  return projectId;
}
