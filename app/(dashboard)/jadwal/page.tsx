import { asc, desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { accounts, posts } from "@/lib/db/schema";
import { startPostingWorker } from "@/lib/posting";
import { PostList } from "./post-list";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export default async function JadwalPage() {
  startPostingWorker(); // make sure the queue runs even if startup missed it (dev reloads)
  const rows = await db
    .select({ p: posts, username: accounts.username })
    .from(posts)
    .innerJoin(accounts, eq(accounts.id, posts.accountId))
    .orderBy(asc(posts.scheduledAt), desc(posts.id));
  const tiktok = await db.select({ id: accounts.id, username: accounts.username, status: accounts.status, sessionKey: accounts.sessionKey }).from(accounts).where(eq(accounts.platform, "tiktok"));
  const active = rows.filter((r) => r.p.status === "queued" || r.p.status === "posting").length;
  return (
    <>
      <PageHeader slug="jadwal">
        <span className="text-xs text-muted-foreground">{active} antre/berjalan</span>
      </PageHeader>
      <PostList
        accounts={tiktok.map((a) => ({ id: a.id, username: a.username, ready: a.status === "active" && !!a.sessionKey }))}
        posts={rows.map(({ p, username }) => ({
          id: p.id,
          username,
          video: p.video,
          label: p.label,
          projectId: p.projectId,
          caption: p.caption,
          productId: p.productId,
          productTitle: p.productTitle,
          status: p.status,
          progress: p.progress,
          error: p.error,
          url: p.url,
          when: fmt.format(p.scheduledAt),
          at: p.scheduledAt.getTime(),
        }))}
      />
    </>
  );
}
