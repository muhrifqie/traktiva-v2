import { and, asc, desc, eq, gte, inArray, max, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, accountStats, googleAccounts, uploadJobs, videoProjects } from "@/lib/db/schema";
import { activeExports } from "@/lib/editor";
import { loadFlow2ApiConfig } from "@/lib/flow2api";
import { presetById, projectName } from "@/lib/presets";
import { PROFILE_SYNC_EVERY_MIN, profileSyncNow } from "@/lib/profile-autosync";
import { licenseView, serverInfo } from "@/lib/server-info";
import { lastAutoSync } from "@/lib/showcase";
import { slotStats } from "@/lib/video";
import pkg from "@/package.json";

export const dynamic = "force-dynamic";

export type TaskItem = { label: string; state: string; stage: string | null; pct: number | null; startedAt: number | null };
export type Task = {
  key: string;
  kind: "project";
  title: string;
  subtitle: string;
  href: string;
  progress: string | null;
  done: number;
  pct: number; // 0-100 incl. partial progress of scenes still being made
  total: number;
  startedAt: number | null;
  items: TaskItem[];
};
export type Finished = { key: string; title: string; href: string; ok: boolean; at: number };
export type UploadRow = { id: number; account: string; platform: string; title: string; progress: string | null; error: string | null; at: number };
export type AppStatus = {
  engine: "online" | "offline" | "missing";
  tokens: number | null;
  slots: { active: number; waiting: number; max: number };
  google: { active: number; total: number; credits: number; list: { email: string; status: string; credits: number | null; error: string | null; syncedAt: number | null }[] };
  tasks: Task[];
  finished: Finished[];
  exports: { projectId: number; title: string; file: string; startedAt: number }[];
  uploads: { running: UploadRow | null; queued: number; next: UploadRow[]; failed: UploadRow[] };
  sync: { now: { platform: string; username: string; startedAt: number } | null; lastAt: number | null; everyMin: number; showcase: { at: number; ok: number; failed: number } | null };
  accounts: { total: number; active: number; needLogin: { platform: string; username: string }[] };
  app: { version: string; plan: string | null; daysLeft: number | null; expiresAt: string | null; update: { version: string; mandatory: boolean } | null };
  now: number;
};

async function engineState() {
  const cfg = loadFlow2ApiConfig();
  if (!cfg) return { engine: "missing" as const, tokens: null };
  try {
    const res = await fetch(`${cfg.baseUrl}/health`, { signal: AbortSignal.timeout(1500) });
    const j = await res.json();
    return { engine: res.ok ? ("online" as const) : ("offline" as const), tokens: Number(j.active_tokens ?? 0) };
  } catch {
    return { engine: "offline" as const, tokens: null }; // started on demand by the next generation
  }
}

// Everything the bottom status bar shows, in one cheap call (polled every few seconds).
export async function GET() {
  const since = new Date(Date.now() - 30 * 60_000);
  const day = new Date(Date.now() - 24 * 3600_000);
  const [engine, google, projects, doneProjects, jobs, social, [stats]] = await Promise.all([
    engineState(),
    db
      .select({ email: googleAccounts.email, status: googleAccounts.status, credits: googleAccounts.credits, error: googleAccounts.lastError, syncedAt: googleAccounts.lastSyncAt })
      .from(googleAccounts)
      .orderBy(googleAccounts.id),
    db.select().from(videoProjects).where(eq(videoProjects.status, "running")),
    db.select().from(videoProjects).where(gte(videoProjects.updatedAt, since)).orderBy(desc(videoProjects.updatedAt)).limit(10),
    // waiting/uploading jobs + failures of the last day (no caption: can be long)
    db
      .select({
        id: uploadJobs.id, status: uploadJobs.status, label: uploadJobs.label, videoTitle: uploadJobs.videoTitle, productTitle: uploadJobs.productTitle,
        progress: uploadJobs.progress, error: uploadJobs.error, at: uploadJobs.scheduledAt, account: accounts.username, platform: accounts.platform,
      })
      .from(uploadJobs)
      .innerJoin(accounts, eq(accounts.id, uploadJobs.accountId))
      .where(or(inArray(uploadJobs.status, ["queued", "uploading"]), and(eq(uploadJobs.status, "failed"), gte(uploadJobs.scheduledAt, day))))
      .orderBy(asc(uploadJobs.scheduledAt)),
    db.select({ platform: accounts.platform, username: accounts.username, status: accounts.status }).from(accounts).orderBy(accounts.platform, accounts.username),
    db.select({ at: max(accountStats.capturedAt) }).from(accountStats),
  ]);

  const tasks: Task[] = [
    ...projects.map((p) => {
      const last = Math.max(0, ...p.scenes.map((s) => s.queuedAt ?? 0));
      const run = last ? p.scenes.filter((s) => s.queuedAt === last) : [];
      return {
        key: `p${p.id}`,
        kind: "project" as const,
        title: projectName(p),
        subtitle: presetById(p.presetId)?.title ?? "Proyek",
        href: `/video/${p.id}`,
        progress: p.progress,
        done: run.filter((s) => s.state === "done" || s.state === "failed").length,
        pct: run.length ? Math.round(run.reduce((n, s) => n + (s.state === "done" || s.state === "failed" ? 100 : s.state === "working" ? s.pct ?? 0 : 0), 0) / run.length) : 0,
        total: run.length,
        startedAt: last || null,
        items: p.scenes
          .map((s) => ({ label: s.label, state: s.state ?? "", stage: s.stage ?? null, pct: s.pct ?? null, startedAt: s.startedAt ?? null, q: s.queuedAt }))
          .filter((s) => s.q === last && last)
          .map(({ q: _q, ...s }) => s),
      };
    }),
  ];

  const finished: Finished[] = [
    ...doneProjects
      .filter((p) => p.status === "done" || p.status === "failed" || (p.status === "draft" && p.scenes.some((s) => s.finishedAt)))
      .map((p) => ({ key: `p${p.id}:${p.updatedAt.getTime()}`, title: projectName(p), href: `/video/${p.id}`, ok: p.status !== "failed", at: p.updatedAt.getTime() })),
  ].sort((a, b) => b.at - a.at).slice(0, 8);

  const row = (j: (typeof jobs)[number]): UploadRow => ({
    id: j.id,
    account: j.account,
    platform: j.platform,
    title: j.videoTitle || [j.label, j.productTitle].filter(Boolean).join(" · ") || `Upload #${j.id}`, // YouTube label = title prefix
    progress: j.progress,
    error: j.error,
    at: j.at.getTime(),
  });
  const queued = jobs.filter((j) => j.status === "queued");
  const running = jobs.find((j) => j.status === "uploading");
  const lic = licenseView(serverInfo(), pkg.version);
  const active = google.filter((g) => g.status === "active");
  const body: AppStatus = {
    ...engine,
    slots: slotStats(),
    google: {
      active: active.length,
      total: google.length,
      credits: active.reduce((n, g) => n + (g.credits ?? 0), 0),
      list: google.map((g) => ({ email: g.email, status: g.status, credits: g.credits, error: g.error, syncedAt: g.syncedAt?.getTime() ?? null })),
    },
    tasks,
    finished,
    exports: activeExports(),
    uploads: {
      running: running ? row(running) : null,
      queued: queued.length,
      next: queued.slice(0, 5).map(row),
      failed: jobs.filter((j) => j.status === "failed").reverse().slice(0, 5).map(row),
    },
    sync: { now: profileSyncNow(), lastAt: stats?.at?.getTime() ?? null, everyMin: PROFILE_SYNC_EVERY_MIN, showcase: lastAutoSync() },
    accounts: {
      total: social.filter((a) => a.status !== "disabled").length,
      active: social.filter((a) => a.status === "active").length,
      needLogin: social.filter((a) => a.status === "need_login").map(({ platform, username }) => ({ platform, username })),
    },
    app: {
      version: pkg.version,
      plan: lic.license.status === "dev" ? null : lic.license.plan,
      daysLeft: lic.license.daysLeft,
      expiresAt: lic.license.expiresAt,
      update: lic.update && { version: lic.update.version, mandatory: lic.update.mandatory },
    },
    now: Date.now(),
  };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
