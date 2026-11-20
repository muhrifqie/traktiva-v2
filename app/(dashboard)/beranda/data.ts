import "server-only";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountPosts, accounts, accountStats, googleAccounts, kaloSessions, showcaseProducts, uploadJobs, videoProjects } from "@/lib/db/schema";
import { getSettings } from "@/lib/settings";
import { licenseView, serverInfo } from "@/lib/server-info";
import pkg from "@/package.json";

// Everything the Beranda shows about the user, read from the local DB (no network): profile & license,
// connected accounts, usage over time, TikTok performance. Dates are bucketed in WIB.
const DAY = 86_400;
const WIB = 7 * 3600;
export const ACTIVITY_DAYS = 14;

/** Local (WIB) day index of a unix-seconds timestamp. */
const dayOf = (sec: number) => Math.floor((sec + WIB) / DAY);

export async function loadBeranda() {
  const nowSec = Math.floor(Date.now() / 1000);
  const today = dayOf(nowSec);
  const since = (today - ACTIVITY_DAYS + 1) * DAY - WIB; // start of the oldest day in the chart (WIB midnight)

  const [social, google, projects, uploads, kalo, showcase] = await Promise.all([
    db.select().from(accounts).orderBy(asc(accounts.platform), asc(accounts.username)),
    db.select().from(googleAccounts).orderBy(asc(googleAccounts.email)),
    db.select({ id: videoProjects.id, status: videoProjects.status, createdAt: videoProjects.createdAt, updatedAt: videoProjects.updatedAt, archived: videoProjects.archived }).from(videoProjects),
    db.select().from(uploadJobs),
    db.select({ status: kaloSessions.status }).from(kaloSessions),
    db.select({ n: sql<number>`count(*)` }).from(showcaseProducts).where(eq(showcaseProducts.hidden, false)),
  ]);

  const sec = (d: Date | null | undefined) => (d ? Math.floor(d.getTime() / 1000) : 0);

  // ---- usage: totals + per-day series (videos finished, uploads posted)
  const done = projects.filter((p) => p.status === "done");
  const posted = uploads.filter((u) => u.status === "done");
  const count = (rows: number[], fromDay: number) => rows.filter((d) => d >= fromDay).length;
  const doneDays = done.map((p) => dayOf(sec(p.updatedAt)));
  const postedDays = posted.map((u) => dayOf(sec(u.postedAt ?? u.scheduledAt)));
  const series = (days: number[]) =>
    Array.from({ length: ACTIVITY_DAYS }, (_, i) => {
      const d = today - ACTIVITY_DAYS + 1 + i;
      return { day: d * DAY - WIB + 12 * 3600, n: days.filter((x) => x === d).length };
    });

  const queued = uploads.filter((u) => u.status === "queued" || u.status === "uploading").sort((a, b) => sec(a.scheduledAt) - sec(b.scheduledAt));
  const accountName = new Map(social.map((a) => [a.id, a]));

  // ---- TikTok performance per account: latest stat vs ~7 days ago, follower history, post totals, top posts
  const tiktok = social.filter((a) => a.platform === "tiktok");
  const ids = tiktok.map((a) => a.id);
  const [stats, posts] = ids.length
    ? await Promise.all([
        db.select().from(accountStats).where(and(inArray(accountStats.accountId, ids), gte(accountStats.capturedAt, new Date((nowSec - 60 * DAY) * 1000)))).orderBy(asc(accountStats.capturedAt)),
        db.select().from(accountPosts).where(inArray(accountPosts.accountId, ids)).orderBy(desc(accountPosts.views)),
      ])
    : [[], []];
  const performance = tiktok.map((a) => {
    const hist = stats.filter((s) => s.accountId === a.id);
    const last = hist.at(-1) ?? null;
    const weekAgo = [...hist].reverse().find((s) => sec(s.capturedAt) <= nowSec - 7 * DAY) ?? hist[0] ?? null;
    const own = posts.filter((p) => p.accountId === a.id);
    const views = own.reduce((n, p) => n + p.views, 0);
    return {
      id: a.id,
      username: a.username,
      displayName: a.displayName,
      avatarUrl: a.avatarUrl,
      status: a.status,
      followers: last?.followers ?? null,
      followersDelta7: last && weekAgo && last !== weekAgo ? last.followers - weekAgo.followers : null,
      likes: last?.likes ?? null,
      videoCount: last?.videoCount ?? own.length,
      views,
      avgViews: own.length ? Math.round(views / own.length) : null,
      engagement: views ? own.reduce((n, p) => n + p.likes + p.comments + p.shares, 0) / views : null,
      history: hist.slice(-30).map((s) => ({ at: sec(s.capturedAt), followers: s.followers })),
      syncedAt: last ? sec(last.capturedAt) : null,
      topPosts: own.slice(0, 3).map((p) => ({ id: p.externalId, caption: p.caption, cover: p.coverUrl, views: p.views, likes: p.likes })),
    };
  });

  // videos uploaded BY Traktiva, matched to their TikTok post (profile sync fills upload_jobs.post_id)
  const matched = posted.filter((u) => u.postId);
  const byPost = new Map(posts.map((p) => [`${p.accountId}:${p.externalId}`, p]));
  const traktivaPosts = matched
    .map((u) => ({ u, p: byPost.get(`${u.accountId}:${u.postId}`) }))
    .filter((x): x is { u: (typeof matched)[number]; p: (typeof posts)[number] } => !!x.p)
    .sort((a, b) => b.p.views - a.p.views);

  // ---- profile & license
  const info = serverInfo();
  const view = licenseView(info, pkg.version);
  const primary = tiktok.find((a) => a.status === "active") ?? tiktok[0] ?? social[0] ?? null;
  const mainGoogle = google.find((g) => g.status === "active") ?? google[0] ?? null;
  const settings = getSettings();
  const firstUse = Math.min(...[...projects.map((p) => sec(p.createdAt)), ...social.map((a) => sec(a.createdAt)), ...google.map((g) => sec(g.createdAt))].filter(Boolean), nowSec);

  return {
    nowSec,
    profile: {
      name: primary?.displayName || (primary ? `@${primary.username}` : mainGoogle?.email.split("@")[0] ?? "Pengguna Traktiva"),
      username: primary ? `@${primary.username}` : null,
      avatarUrl: primary?.avatarUrl ?? null,
      email: mainGoogle?.email ?? null,
      memberSince: firstUse,
      license: view.license,
      licenseId: info?.licenseId ?? null,
      device: info?.device?.name ?? null,
      hwParts: info?.device?.hwParts ?? [],
      appVersion: pkg.version,
      update: view.update,
    },
    usage: {
      videosTotal: done.length,
      videosToday: count(doneDays, today),
      videos7: count(doneDays, today - 6),
      videos30: count(doneDays, today - 29),
      running: projects.filter((p) => p.status === "running").length,
      drafts: projects.filter((p) => p.status === "draft" && !p.archived).length,
      failed: projects.filter((p) => p.status === "failed" && !p.archived).length,
      uploadsTotal: posted.length,
      uploads7: count(postedDays, today - 6),
      uploadsFailed7: uploads.filter((u) => u.status === "failed" && sec(u.scheduledAt) >= nowSec - 7 * DAY).length,
      successRate: posted.length + uploads.filter((u) => u.status === "failed").length
        ? posted.length / (posted.length + uploads.filter((u) => u.status === "failed").length)
        : null,
      showcaseProducts: Number(showcase[0]?.n ?? 0),
      videoSeries: series(doneDays),
      uploadSeries: series(postedDays),
      chartSince: since,
    },
    schedule: queued.slice(0, 5).map((u) => ({
      id: u.id,
      at: sec(u.scheduledAt),
      label: u.label,
      product: u.productTitle,
      status: u.status,
      account: accountName.get(u.accountId)?.username ?? "?",
      platform: accountName.get(u.accountId)?.platform ?? "tiktok",
    })),
    scheduledToday: queued.filter((u) => dayOf(sec(u.scheduledAt)) === today).length,
    queuedTotal: queued.length,
    accounts: {
      google: google.map((g) => ({ id: g.id, email: g.email, credits: g.credits, status: g.status, error: g.lastError, syncedAt: sec(g.lastSyncAt) || null })),
      social: social.map((a) => ({ id: a.id, platform: a.platform, username: a.username, avatarUrl: a.avatarUrl, status: a.status, checkedAt: sec(a.lastCheckAt) || null })),
      chatgpt: settings.chatgpt?.email ?? null,
      voice: settings.voice.provider === "cartesia" ? (settings.voice.cartesiaKey ? "Cartesia" : "Cartesia (kunci belum diisi)") : "Suara bawaan Flow",
      kalo: { total: kalo.length, active: kalo.filter((k) => k.status === "active").length },
      credits: google.filter((g) => g.status === "active").reduce((n, g) => n + (g.credits ?? 0), 0),
    },
    performance,
    traktivaPosts: traktivaPosts.slice(0, 5).map(({ u, p }) => ({
      id: u.id,
      label: u.label,
      product: u.productTitle,
      cover: p.coverUrl,
      views: p.views,
      likes: p.likes,
      comments: p.comments,
      account: accountName.get(u.accountId)?.username ?? "?",
      postedAt: sec(u.postedAt),
    })),
    traktivaViews: traktivaPosts.reduce((n, x) => n + x.p.views, 0),
    traktivaMatched: traktivaPosts.length,
  };
}

export type Beranda = Awaited<ReturnType<typeof loadBeranda>>;
