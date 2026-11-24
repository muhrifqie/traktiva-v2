import "server-only";
import { withProfile } from "@/lib/browser/chrome";

// YouTube Studio sync (read-only): Studio's own web API, called from inside a Studio page so it carries the
// page's auth headers. One sync = 4 page loads + 1 request per 50 videos: run it on demand or every few hours.

const STUDIO = "https://studio.youtube.com";

export type StudioVideo = {
  id: string;
  title: string;
  type: "short" | "video" | "live";
  privacy: "public" | "unlisted" | "private" | "draft";
  publishedAt: number | null; // unix seconds
  durationSec: number | null;
  views: number;
  likes: number;
  comments: number;
  monetized: boolean;
};
/** One Insight card as Studio draws it: title, headline numbers, a daily series and labelled rows (%, counts). */
export type InsightCard = {
  title: string;
  metrics: { value: string; label: string | null }[];
  series: { label: string; points: [number, number][] } | null;
  rows: { label: string; value: string }[];
};
export type Monetization = {
  subscribers: number;
  subscribersNeeded: number;
  watchHours: number;
  watchHoursNeeded: number;
  shortsViews: number;
  shortsViewsNeeded: number;
  monetized: boolean;
};
export type StudioSync = {
  channel: { subscribers: number; views: number; videos: number };
  monetization: Monetization | null;
  videos: StudioVideo[];
  insight: { overview: InsightCard[]; shorts: InsightCard[] };
};

/** Insight + monetization + video types of one channel, kept as JSON in shop_cache (key YT_CACHE). */
export type YouTubeCache = Pick<StudioSync, "channel" | "monetization" | "insight"> & { types: Record<string, StudioVideo["type"]> };
export const YT_CACHE = "yt-studio";

/* eslint-disable @typescript-eslint/no-explicit-any -- raw Studio payloads */

const n = (v: unknown) => Number(v) || 0;
const PRIVACY: Record<string, StudioVideo["privacy"]> = {
  VIDEO_PRIVACY_PUBLIC: "public",
  VIDEO_PRIVACY_UNLISTED: "unlisted",
  VIDEO_PRIVACY_PRIVATE: "private",
  VIDEO_PRIVACY_DRAFT: "draft",
};

function toVideo(v: any): StudioVideo {
  const t = String(v.contentType ?? "");
  return {
    id: v.videoId,
    title: v.title ?? "",
    type: t.includes("SHORTS") ? "short" : t.includes("LIVE") ? "live" : "video",
    privacy: PRIVACY[v.privacy] ?? "private",
    publishedAt: v.timePublishedSeconds ? n(v.timePublishedSeconds) : null,
    durationSec: v.lengthSeconds ? n(v.lengthSeconds) : null,
    views: n(v.publicMetrics?.externalViewCount),
    likes: n(v.publicMetrics?.likeCount),
    comments: n(v.publicMetrics?.commentCount),
    monetized: String(v.monetization?.adMonetization?.effectiveStatus ?? "") === "VIDEO_MONETIZING_STATUS_MONETIZING",
  };
}

/** Studio's view-model tree → plain cards (generic walk, so it survives Studio reshuffling its layout). */
export function parseInsightCards(browse: any): InsightCard[] {
  const cards: InsightCard[] = [];
  const inside = (o: any, card: InsightCard, hover: boolean): void => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) return o.forEach((x) => inside(x, card, hover));
    for (const [k, x] of Object.entries<any>(o)) {
      if (k === "cardViewModel") continue; // a nested card is walked on its own
      if (k === "dataHovercards" || k === "hovercard") inside(x, card, true);
      else if (k === "simpleMetricViewModel") {
        if (!hover && x.value?.content) card.metrics.push({ value: x.value.content, label: x.subtitle?.content ?? null });
      } else if (k === "lineChartViewModel" && x.series?.[0]) {
        card.series ??= { label: x.series[0].label ?? card.title, points: x.series[0].dataPoints.map((p: any) => [Math.round(p.domain / 1000), p.measure]) };
      } else if (k === "listItemViewModel" && x.title?.content) {
        const seg = JSON.stringify(x).match(/"percentage":([\d.]+)/)?.[1];
        const tail = JSON.stringify(x.trailingLabel ?? x.trailingText ?? x.subtitle ?? "").match(/"content":"([^"]+)"/)?.[1];
        card.rows.push({ label: x.title.content, value: seg ? `${(Number(seg) * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%` : (tail ?? "") });
      } else inside(x, card, hover);
    }
  };
  const walk = (o: any): void => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) return o.forEach(walk);
    for (const [k, v] of Object.entries<any>(o)) {
      if (k === "cardViewModel") {
        const card: InsightCard = { title: v.topContent?.sectionHeaderViewModel?.headline?.content ?? "", metrics: [], series: null, rows: [] };
        inside(v.bodyContent, card, false);
        if (card.title && (card.metrics.length || card.series || card.rows.length)) cards.push(card);
      }
      walk(v);
    }
  };
  walk(browse);
  return cards;
}

export async function syncStudio(sessionKey: string, channelId: string): Promise<StudioSync> {
  return withProfile(sessionKey, { headless: true }, async (ctx) => {
    /** Open a Studio page and keep the JSON answers of the Studio API calls matching `want`. */
    const visit = async (path: string, want: RegExp, ms = 15_000) => {
      const page = await ctx.newPage();
      const got: { url: string; body: any; req: { headers: Record<string, string>; body: any } }[] = [];
      page.on("response", async (r) => {
        if (!want.test(r.url())) return;
        const body = await r.json().catch(() => null);
        let reqBody: any = null; // some requests are sent compressed: only the JSON ones are replayable
        try {
          reqBody = r.request().postDataJSON();
        } catch {}
        if (body) got.push({ url: r.url(), body, req: { headers: r.request().headers(), body: reqBody } });
      });
      await page.goto(`${STUDIO}/channel/${channelId}${path}`, { waitUntil: "load", timeout: 60_000 });
      if (/accounts\.google\.com/.test(page.url())) throw new Error("Sesi YouTube habis, login ulang dulu.");
      for (let t = 0; t < ms && !got.length; t += 500) await page.waitForTimeout(500);
      await page.waitForTimeout(2000); // the page's other cards land a little later
      return { page, got };
    };

    // 1. every video: replay Studio's own list request (all types), 50 per page
    const list = await visit("/videos/short", /creator\/list_creator_videos/);
    const first = list.got[0];
    if (!first) throw new Error("YouTube Studio tidak memuat daftar video. Coba lagi nanti.");
    const headers = Object.fromEntries(Object.entries(first.req.headers).filter(([k]) => k === "authorization" || k === "content-type" || k.startsWith("x-")));
    const videos: StudioVideo[] = [];
    let token: string | undefined;
    for (let i = 0; i < 40; i++) {
      const body = { ...first.req.body, filter: { and: { operands: [{ channelIdIs: { value: channelId } }] } }, pageSize: 50, ...(token ? { pageToken: token } : {}) };
      const j: any = await list.page.evaluate(
        async (a) => (await fetch(a.url, { method: "POST", headers: a.headers, body: JSON.stringify(a.body), credentials: "include" })).json(),
        { url: first.url, headers, body },
      );
      videos.push(...(j.videos ?? []).map(toVideo));
      token = j.nextPageToken;
      if (!token) break;
      await list.page.waitForTimeout(800); // human-ish pace between pages
    }
    await list.page.close();

    // 2. Insight (28 days): overview + the content tab (Shorts); Studio's "browse" answers carry the cards
    const insight = { overview: [] as InsightCard[], shorts: [] as InsightCard[] };
    for (const [key, path] of [["overview", "/analytics/tab-overview/period-default"], ["shorts", "/analytics/tab-content/period-default"]] as const) {
      const v = await visit(path, /youtubei\/v1\/browse/);
      insight[key] = v.got.flatMap((g) => parseInsightCards(g.body));
      await v.page.close();
    }

    // 3. channel totals + monetization progress
    const m = await visit("/monetization/overview", /creator\/get_creator_channels/);
    const ch = m.got.map((g) => g.body?.channels?.[0]).find(Boolean);
    await m.page.close();
    const em = ch?.monetizationStatusData ? JSON.stringify(ch) : "";
    const pick = (re: RegExp) => n(em.match(re)?.[1]);
    return {
      channel: { subscribers: n(ch?.metric?.subscriberCount), views: n(ch?.metric?.totalVideoViewCount), videos: n(ch?.metric?.videoCount) || videos.length },
      monetization: em
        ? {
            subscribers: n(ch.metric?.subscriberCount),
            subscribersNeeded: pick(/"subscriberCountThreshold":"(\d+)"/) || 1000,
            watchHours: pick(/"pastYearPublicWatchHours":"(\d+)"/),
            watchHoursNeeded: pick(/"watchHoursThreshold":"(\d+)"/) || 4000,
            shortsViews: pick(/"yppEligibilityShortsViews":"(\d+)"/),
            shortsViewsNeeded: pick(/"shortsViewsThreshold":"(\d+)"/) || 10_000_000,
            monetized: !!(ch.monetizationStatusData.isShortsRevshareEnabled || ch.monetizationStatusData.isLongformAdsEnabled),
          }
        : null,
      videos,
      insight,
    };
  });
}

/** "1.234" · "0,5" · "1,2 rb" · "3 jt" (Studio's Indonesian numbers) → number */
export function idNum(s: string | undefined) {
  const m = s?.match(/([\d.,]+)\s*(rb|jt|M)?/);
  if (!m) return null;
  return Number(m[1].replace(/\./g, "").replace(",", ".")) * ({ rb: 1e3, jt: 1e6, M: 1e9 }[m[2] as "rb"] ?? 1);
}

/** Headline numbers of one channel's last Studio sync (Ringkasan cards). */
export function ytSummary(d: YouTubeCache) {
  const cards = [...d.insight.overview, ...d.insight.shorts];
  return {
    subscribers: d.channel.subscribers,
    shorts: Object.values(d.types).filter((t) => t === "short").length,
    videos: Object.keys(d.types).length,
    views28: d.insight.overview.find((c) => c.series && /^Penayangan$/i.test(c.title))?.series?.points.reduce((s, [, n]) => s + n, 0) ?? 0,
    hours28: idNum(cards.find((c) => /waktu tonton/i.test(c.title))?.metrics[0]?.value) ?? 0,
    stay: cards.flatMap((c) => c.metrics).find((m) => /tetap menonton/i.test(m.label ?? ""))?.value ?? null,
  };
}
