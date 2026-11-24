import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { accountPosts, accounts, showcaseProducts, uploadJobs, videoProjects } from "@/lib/db/schema";
import { provenHashtagsFor } from "@/lib/hashtags";
import { hookInsights } from "@/lib/insights";
import { projectName } from "@/lib/presets";
import { MAX_PER_DAY, scheduleTips } from "@/lib/schedule-tips";
import { getSettings, writingRules } from "@/lib/settings";
import { MIN_GAP_MIN } from "@/lib/uploads";
import { listUploadable } from "./actions";
import { JadwalBoard } from "./board";
import { JadwalCalendar } from "./calendar";

export const dynamic = "force-dynamic";

/** Not live yet: waiting to upload, uploading, or uploaded and waiting for TikTok to publish (request-time helper). */
function inQueue(j: { status: string; postedAt: Date | null }) {
  return j.status === "queued" || j.status === "uploading" || (j.status === "done" && !!j.postedAt && j.postedAt.getTime() > Date.now());
}

export default async function JadwalPage({ searchParams }: { searchParams: Promise<{ project?: string; tampilan?: string }> }) {
  const { project, tampilan } = await searchParams;
  // Kalender by default; the list (with the scheduling form) when asked, or when coming from a project to schedule it
  const view = tampilan === "daftar" || project ? "daftar" : "kalender";
  await hookInsights().catch(() => null); // links finished jobs to the TikTok post the profile sync found (postId)
  const [jobs, tiktok, videos, etalase] = await Promise.all([
    db
      .select({ job: uploadJobs, username: accounts.username, project: { title: videoProjects.title, presetId: videoProjects.presetId, product: videoProjects.product }, views: accountPosts.views })
      .from(uploadJobs)
      .innerJoin(accounts, eq(accounts.id, uploadJobs.accountId))
      .leftJoin(videoProjects, eq(videoProjects.id, uploadJobs.projectId))
      .leftJoin(accountPosts, and(eq(accountPosts.accountId, uploadJobs.accountId), eq(accountPosts.externalId, uploadJobs.postId)))
      .orderBy(desc(uploadJobs.scheduledAt))
      .limit(150),
    db.select({ id: accounts.id, username: accounts.username, status: accounts.status }).from(accounts).where(eq(accounts.platform, "tiktok")),
    listUploadable(),
    // each account's affiliate showcase (synced in TikTok Shop): the product picker's options
    db
      .select({ accountId: showcaseProducts.accountId, productId: showcaseProducts.productId, title: showcaseProducts.title, price: showcaseProducts.price, stock: showcaseProducts.stock, inStock: showcaseProducts.inStock, hidden: showcaseProducts.hidden, cover: showcaseProducts.cover })
      .from(showcaseProducts)
      .orderBy(asc(showcaseProducts.position)),
  ]);
  const [tips, provenTags] = await Promise.all([scheduleTips(tiktok.map((a) => a.id), MIN_GAP_MIN), provenHashtagsFor(tiktok.map((a) => a.id))]);
  const queued = jobs.filter((j) => inQueue(j.job)).length;

  const tab = (v: "kalender" | "daftar", label: string) => (
    <Link href={`/jadwal?tampilan=${v}`} className={`h-7 rounded-md px-3 text-xs leading-7 font-medium ${view === v ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{label}</Link>
  );
  const mapped = jobs.map((j) => ({ ...j.job, scheduledAt: j.job.scheduledAt.getTime(), postedAt: j.job.postedAt?.getTime() ?? null, createdAt: j.job.createdAt.getTime(), username: j.username, title: j.project?.presetId ? projectName(j.project as Parameters<typeof projectName>[0]) : null, views: j.views ?? null }));

  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader slug="jadwal">
        <span className="text-xs text-muted-foreground">{queued} dalam antrian</span>
        <nav className="flex rounded-lg border bg-card p-0.5" aria-label="Tampilan">{tab("kalender", "Kalender")}{tab("daftar", "Daftar")}</nav>
      </PageHeader>
      {view === "kalender" ? (
        <JadwalCalendar
          jobs={mapped.map(({ id, scheduledAt, status, accountId, username, title }) => ({ id, scheduledAt, status, accountId, username, title }))}
          today={new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())}
        />
      ) : (
      <JadwalBoard
        jobs={mapped}
        accounts={tiktok}
        videos={videos}
        etalase={etalase}
        minGap={MIN_GAP_MIN}
        tips={tips}
        banned={writingRules().replace}
        maxPerDay={MAX_PER_DAY}
        initialProject={project ? Number(project) : null}
        selectedAccountId={getSettings().activeAccountId ?? null}
        provenTags={provenTags}
      />
      )}
    </>
  );
}
