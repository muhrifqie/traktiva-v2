"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createUploadJobs } from "../jadwal/actions";

const Input = z.object({
  drafts: z
    .array(z.object({ id: z.string().max(20), rel: z.string().min(3).max(400), title: z.string().max(200), projectId: z.number().int().min(0), channelId: z.number().int().positive(), at: z.number().int() }))
    .min(1)
    .max(100),
  title: z.string().trim().min(1).max(200), // may hold "{judul}"
  description: z.string().max(2200),
  tags: z.string().max(500),
  visibility: z.enum(["public", "unlisted", "private"]),
  madeForKids: z.boolean(),
  aiContent: z.boolean(),
});

/** Kalender drafts → real YouTube upload jobs, each at its own day and hour (the runner posts them then). */
export async function queueDrafts(input: z.input<typeof Input>) {
  const d = Input.parse(input);
  const meta = { tags: d.tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 30), visibility: d.visibility, madeForKids: d.madeForKids, aiContent: d.aiContent };
  const soon = Date.now() + 5 * 60_000;
  const queued: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const x of d.drafts) {
    // a past hour would be posted right away: those stay drafts so they get a new hour first
    if (x.at < soon) {
      failed.push({ id: x.id, error: "jamnya sudah lewat" });
      continue;
    }
    try {
      await createUploadJobs({
        accountId: x.channelId,
        items: [{ projectId: x.projectId, video: x.rel, label: x.title.slice(0, 40), judul: x.title }],
        caption: d.description,
        startAt: x.at,
        gapMinutes: 20,
        videoTitle: d.title,
        meta,
      });
      queued.push(x.id);
    } catch (e) {
      failed.push({ id: x.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  revalidatePath("/youtube-kalender");
  return { queued, failed };
}
