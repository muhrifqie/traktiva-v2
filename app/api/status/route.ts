import { desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { googleAccounts, videoProjects } from "@/lib/db/schema";
import { camoufoxStatus, type CamoufoxStatus } from "@/lib/browser/camoufox-install";
import { engineStatus } from "@/lib/engine/flow2api-engine";
import { presetById, projectName } from "@/lib/presets";
import { slotStats } from "@/lib/video";
import { setActiveFlowAccounts } from "@/lib/settings";

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
export type AppStatus = {
  engine: "online" | "offline" | "missing" | "installing" | "starting" | "failed";
  tokens: number | null;
  slots: { active: number; waiting: number; max: number };
  google: { active: number; total: number; credits: number };
  camoufox: CamoufoxStatus;
  tasks: Task[];
  finished: Finished[];
  now: number;
};

async function engineState(): Promise<{ engine: AppStatus["engine"]; tokens: number | null }> {
  const e = await engineStatus();
  if (e.state === "running") {
    try {
      const j = await fetch(`${e.url}/health`, { signal: AbortSignal.timeout(1500) }).then((r) => r.json());
      return { engine: "online", tokens: Number(j.active_tokens ?? 0) };
    } catch {}
    return { engine: "online", tokens: null };
  }
  const map = { missing: "missing", installing: "installing", starting: "starting", failed: "failed", stopped: "offline" } as const;
  return { engine: map[e.state], tokens: null }; // "offline" = started on demand by the next generation
}

// Everything the bottom status bar shows, in one cheap call (polled every few seconds).
export async function GET() {
  const since = new Date(Date.now() - 30 * 60_000);
  const [engine, google, projects, doneProjects] = await Promise.all([
    engineState(),
    db.select({ status: googleAccounts.status, credits: googleAccounts.credits }).from(googleAccounts),
    db.select().from(videoProjects).where(eq(videoProjects.status, "running")),
    db.select().from(videoProjects).where(gte(videoProjects.updatedAt, since)).orderBy(desc(videoProjects.updatedAt)).limit(10),
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

  const active = google.filter((g) => g.status === "active");
  setActiveFlowAccounts(active.length); // the automatic parallel limit follows the account count
  const body: AppStatus = {
    ...engine,
    slots: slotStats(),
    google: { active: active.length, total: google.length, credits: active.reduce((n, g) => n + (g.credits ?? 0), 0) },
    camoufox: camoufoxStatus(),
    tasks,
    finished,
    now: Date.now(),
  };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
