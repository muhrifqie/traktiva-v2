import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { youtubeUploadDefaults } from "@/lib/settings";
import { accounts, uploadJobs } from "@/lib/db/schema";
import { listUploadable } from "../jadwal/actions";
import { YouTubeCalendar } from "./calendar";

export const dynamic = "force-dynamic";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

// YouTube → Kalender: drag a video onto a day; each picked channel gets it at its next free hour that day.
export default async function YouTubeKalenderPage() {
  const channels = await db
    .select({ id: accounts.id, name: accounts.displayName, username: accounts.username, avatar: accounts.avatarUrl, status: accounts.status })
    .from(accounts)
    .where(eq(accounts.platform, "youtube"))
    .orderBy(asc(accounts.username));
  const ids = channels.map((c) => c.id);
  const since = daysAgo(45);
  const jobs = ids.length
    ? await db
        .select({ id: uploadJobs.id, accountId: uploadJobs.accountId, video: uploadJobs.video, title: uploadJobs.videoTitle, label: uploadJobs.label, status: uploadJobs.status, scheduledAt: uploadJobs.scheduledAt })
        .from(uploadJobs)
        .where(and(inArray(uploadJobs.accountId, ids), gte(uploadJobs.scheduledAt, since)))
    : [];
  const videos = await listUploadable();

  return (
    <>
      <PageHeader slug="youtube-kalender" />
      <YouTubeCalendar
        channels={channels.map((c) => ({ id: c.id, name: c.name || c.username, avatar: c.avatar, active: c.status === "active" }))}
        videos={videos.map((v) => ({ rel: v.video, title: v.judul ?? `${v.title} · ${v.label}`, group: v.projectId === 0 ? "editor" : "proyek", projectId: v.projectId }))}
        ytDefaults={youtubeUploadDefaults()}
        jobs={jobs.filter((j) => j.status !== "cancelled").map((j) => ({ id: j.id, accountId: j.accountId, video: j.video, title: j.title || j.label || "Video", status: j.status, at: j.scheduledAt.getTime() }))}
      />
    </>
  );
}
