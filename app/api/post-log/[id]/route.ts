import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, posts } from "@/lib/db/schema";
import { readPostLog } from "@/lib/post-log";

export const dynamic = "force-dynamic";

// One post's live state + step log, polled by the Detail dialog in Jadwal Upload.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("not found", { status: 404 });
  const row = await db.select({ p: posts, username: accounts.username }).from(posts).innerJoin(accounts, eq(accounts.id, posts.accountId)).where(eq(posts.id, id)).get();
  if (!row) return new Response("not found", { status: 404 });
  const { p, username } = row;
  return Response.json(
    {
      id: p.id,
      username,
      status: p.status,
      progress: p.progress,
      error: p.error,
      attempts: p.attempts,
      label: p.label,
      video: p.video,
      caption: p.caption,
      productId: p.productId,
      productTitle: p.productTitle,
      scheduledAt: p.scheduledAt.getTime(),
      url: p.url,
      log: await readPostLog(id),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
