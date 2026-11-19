import { asc, desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { accounts, showcaseProducts, uploadJobs, videoProjects } from "@/lib/db/schema";
import { hookInsights } from "@/lib/insights";
import { MAX_PER_DAY, scheduleTips } from "@/lib/schedule-tips";
import { writingRules } from "@/lib/settings";
import { MIN_GAP_MIN } from "@/lib/uploads";
import { listUploadable } from "./actions";
import { JadwalBoard } from "./board";

export const dynamic = "force-dynamic";

export default async function JadwalPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  const [jobs, tiktok, videos, insights, etalase] = await Promise.all([
    db
      .select({ job: uploadJobs, username: accounts.username, title: videoProjects.title })
      .from(uploadJobs)
      .innerJoin(accounts, eq(accounts.id, uploadJobs.accountId))
      .leftJoin(videoProjects, eq(videoProjects.id, uploadJobs.projectId))
      .orderBy(desc(uploadJobs.scheduledAt))
      .limit(150),
    db.select({ id: accounts.id, username: accounts.username, status: accounts.status }).from(accounts).where(eq(accounts.platform, "tiktok")),
    listUploadable(),
    hookInsights(),
    // each account's affiliate showcase (synced in TikTok Shop): the product picker's options
    db
      .select({ accountId: showcaseProducts.accountId, productId: showcaseProducts.productId, title: showcaseProducts.title, price: showcaseProducts.price, stock: showcaseProducts.stock, inStock: showcaseProducts.inStock, hidden: showcaseProducts.hidden, cover: showcaseProducts.cover })
      .from(showcaseProducts)
      .orderBy(asc(showcaseProducts.position)),
  ]);
  const tips = await scheduleTips(tiktok.map((a) => a.id), MIN_GAP_MIN);
  const queued = jobs.filter((j) => j.job.status === "queued" || j.job.status === "uploading").length;

  return (
    <>
      <PageHeader slug="jadwal">
        <span className="text-xs text-muted-foreground">{queued} antre</span>
      </PageHeader>
      <JadwalBoard
        jobs={jobs.map((j) => ({ ...j.job, scheduledAt: j.job.scheduledAt.getTime(), postedAt: j.job.postedAt?.getTime() ?? null, createdAt: j.job.createdAt.getTime(), username: j.username, title: j.title }))}
        accounts={tiktok}
        videos={videos}
        insights={insights}
        etalase={etalase}
        minGap={MIN_GAP_MIN}
        tips={tips}
        banned={writingRules().replace}
        maxPerDay={MAX_PER_DAY}
        initialProject={project ? Number(project) : null}
      />
    </>
  );
}
