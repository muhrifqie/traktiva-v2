import "server-only";
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountPosts, accounts, uploadJobs } from "@/lib/db/schema";

// "Belajar dari performa": scheduled uploads are matched to the posts the profile sync finds (same account, posted
// within a few hours, same caption start), so each opening line (hook) gets its real view count. The best hooks
// become examples in the writer prompts; until enough uploads are matched, the account's own best posts are used.

export type HookInsights = {
  matched: { postId: string; hook: string; label: string | null; views: number; likes: number }[];
  topPosts: { postId: string; caption: string; views: number }[];
};

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 40);
const g = globalThis as unknown as { __insights?: { at: number; data: HookInsights } };

export async function hookInsights(): Promise<HookInsights> {
  if (g.__insights && Date.now() - g.__insights.at < 60_000) return g.__insights.data;
  const jobs = await db.select().from(uploadJobs).where(and(eq(uploadJobs.status, "done"), isNotNull(uploadJobs.postedAt)));
  const matched: HookInsights["matched"] = [];
  for (const j of jobs) {
    let post = j.postId ? await db.select().from(accountPosts).where(and(eq(accountPosts.accountId, j.accountId), eq(accountPosts.externalId, j.postId))).get() : undefined;
    if (!post) {
      const t = j.postedAt!.getTime();
      const near = await db
        .select()
        .from(accountPosts)
        .where(and(eq(accountPosts.accountId, j.accountId), gte(accountPosts.postedAt, new Date(t - 30 * 60_000))))
        .orderBy(accountPosts.postedAt)
        .limit(10);
      const want = norm(j.caption);
      post = near.find((p) => p.postedAt && p.postedAt.getTime() < t + 3 * 3600_000 && (!want || norm(p.caption ?? "").startsWith(want.slice(0, 20))));
      if (post) await db.update(uploadJobs).set({ postId: post.externalId }).where(eq(uploadJobs.id, j.id));
    }
    if (post && j.hook) matched.push({ postId: post.externalId, hook: j.hook, label: j.label, views: post.views, likes: post.likes });
  }
  matched.sort((a, b) => b.views - a.views);
  const top = await db
    .select({ postId: accountPosts.externalId, caption: accountPosts.caption, views: accountPosts.views })
    .from(accountPosts)
    .innerJoin(accounts, eq(accounts.id, accountPosts.accountId))
    .where(and(eq(accounts.platform, "tiktok"), eq(accountPosts.isPinned, false)))
    .orderBy(desc(accountPosts.views))
    .limit(8);
  const data = {
    matched,
    topPosts: top.filter((p) => (p.caption ?? "").trim()).map((p) => ({ postId: p.postId, caption: (p.caption ?? "").split("\n")[0].slice(0, 90), views: p.views })),
  };
  g.__insights = { at: Date.now(), data };
  return data;
}

/** Extra lines for the writer prompts: what already worked on the owner's own account ("" when there is no data). */
export async function provenHooksPrompt() {
  const d = await hookInsights().catch(() => null);
  if (!d) return "";
  if (d.matched.length >= 2) {
    const best = d.matched.slice(0, 4).map((m) => `"${m.hook}" (${m.views} views)`).join("; ");
    const worst = d.matched.length >= 4 ? d.matched.slice(-2).map((m) => `"${m.hook}" (${m.views} views)`).join("; ") : "";
    return `WHAT WORKED ON THIS ACCOUNT (real stats of the owner's posts; learn the style, don't copy word for word)\n- Best opening lines: ${best}${worst ? `\n- Weakest opening lines (avoid this style): ${worst}` : ""}`;
  }
  if (d.topPosts.length >= 3) return `WHAT WORKED ON THIS ACCOUNT (captions of the owner's most viewed posts; learn the tone)\n${d.topPosts.slice(0, 4).map((p) => `- "${p.caption}" (${p.views} views)`).join("\n")}`;
  return "";
}
