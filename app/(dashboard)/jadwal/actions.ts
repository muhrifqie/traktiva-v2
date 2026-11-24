"use server";

import fs from "node:fs/promises";
import { desc, eq, inArray, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { accounts, uploadJobs, videoProjects } from "@/lib/db/schema";
import { resolveMedia } from "@/lib/media";
import { projectName } from "@/lib/presets";
import { kickUploads, runJobNow } from "@/lib/uploads";
import { allResults, cleanTitle, resultTitle } from "@/lib/youtube-editor";

/** Pseudo project id of the YouTube Editor renders in the scheduling form (stored as no project). */
const EDITOR = 0;

const Id = z.number().int().positive();
const refresh = () => revalidatePath("/jadwal");

/** Opening line of a one-take voice-over (what the hook stats group by). */
const firstLine = (t?: string | null) => (t ?? "").trim().match(/^.+?[.!?](?:\s|$)/)?.[0]?.trim() ?? (t ?? "").split(/\s+/).slice(0, 10).join(" ");

export type Uploadable = { projectId: number; title: string; video: string; label: string; hook: string | null; caption: string; productId: string | null; productTitle: string; judul?: string };

/** Every exported video ready to post: final.mp4 plus hook variants (final-A.mp4 …) of each project. */
export async function listUploadable(): Promise<Uploadable[]> {
  const rows = await db.select().from(videoProjects).where(isNotNull(videoProjects.finalPath)).orderBy(desc(videoProjects.updatedAt)).limit(60);
  const out: Uploadable[] = [];
  for (const p of rows) {
    const files = await fs.readdir(resolveMedia(p.folder)).catch(() => [] as string[]);
    const productId = p.folder.match(/kalo-(\d{10,22})/)?.[1] ?? null; // projects made from KaloData carry the TikTok product id
    const base = { projectId: p.id, title: projectName(p), caption: p.caption ?? "", productId, productTitle: p.product.name.split(/[|/,]/)[0].trim().slice(0, 30) };
    // final.mp4 is the raw 720p join of the clips until the project is exported (1080p, captions burned in):
    // only offer it once exported, so nothing soft gets posted (TikTok drops 720p uploads to a blurry tier)
    const exported = !!p.edit?.exportedAt;
    for (const f of files.filter((x) => /^final-[A-D]\.mp4$/.test(x) || (exported && x === "final.mp4")).sort()) {
      const variant = f.match(/^final-([A-D])\.mp4$/)?.[1];
      const side = variant ? await fs.readFile(resolveMedia(`${p.folder}/final-${variant}.json`), "utf8").then((t) => JSON.parse(t) as { hook?: string }, () => null) : null;
      out.push({ ...base, video: `${p.folder}/${f}`, label: variant ? `Varian ${variant}` : "Video utama", hook: variant ? side?.hook ?? null : firstLine(p.edit?.voices[0]?.text) || null });
    }
  }
  // YouTube Editor renders: one group; each video brings its own Short title for "{judul}"
  for (const r of allResults().slice(0, 100)) {
    const judul = cleanTitle(resultTitle(r.rel)) || "Video";
    out.push({ projectId: EDITOR, title: "Hasil YouTube Editor", video: r.rel, label: judul.slice(0, 40), hook: null, caption: "", productId: null, productTitle: "", judul });
  }
  return out;
}

const NewJobs = z.object({
  accountId: Id,
  // projectId 0 = a YouTube Editor render (no project); judul = that video's title for "{judul}" in title/caption
  items: z.array(z.object({ projectId: z.number().int().min(0), video: z.string().min(3).max(400), label: z.string().max(40), hook: z.string().max(300).nullish(), judul: z.string().max(200).nullish() })).min(1).max(50),
  caption: z.string().max(2200),
  productId: z.string().regex(/^\d{10,22}$/).nullish(),
  productTitle: z.string().max(60).nullish(),
  music: z.boolean().default(false),
  musicVolume: z.number().int().min(-60).max(20).default(-20),
  startAt: z.number().int(), // epoch ms
  gapMinutes: z.number().int().min(20).max(24 * 60),
  // YouTube channels: video title + tags/visibility/audience/AI label (caption = description)
  videoTitle: z.string().max(200).nullish(), // may hold "{judul}", filled per video
  meta: z
    .object({ tags: z.array(z.string().max(100)).max(30), visibility: z.enum(["public", "unlisted", "private"]), madeForKids: z.boolean(), aiContent: z.boolean() })
    .nullish(),
});

const fill = (t: string, judul?: string | null) => (judul ? t.replaceAll("{judul}", judul) : t);

/** Schedule one or more videos for an account, spaced by gapMinutes (A/B variants go out at different times). */
export async function createUploadJobs(input: z.input<typeof NewJobs>) {
  const d = NewJobs.parse(input);
  const acc = await db.select().from(accounts).where(eq(accounts.id, d.accountId)).get();
  if (!acc || !["tiktok", "youtube", "instagram", "facebook"].includes(acc.platform)) throw new Error("Pilih akun TikTok, YouTube, Instagram, atau Facebook.");
  const tt = acc.platform === "tiktok";
  const yt = acc.platform === "youtube";
  if (yt && !d.videoTitle?.trim()) throw new Error("Judul video YouTube wajib diisi.");
  for (const it of d.items) await fs.access(resolveMedia(it.video)).catch(() => Promise.reject(new Error(`Video tidak ditemukan: ${it.video}`)));
  const start = Math.max(d.startAt, Date.now());
  await db.insert(uploadJobs).values(
    d.items.map((it, i) => ({
      accountId: acc.id,
      projectId: it.projectId || null,
      video: it.video,
      label: it.label,
      hook: it.hook ?? null,
      caption: fill(d.caption, it.judul).trim(),
      productId: tt ? d.productId || null : null,
      productTitle: tt ? d.productTitle || null : null,
      music: tt ? d.music : false,
      musicVolume: d.musicVolume,
      videoTitle: yt ? fill(d.videoTitle!, it.judul).trim().slice(0, 100) : null,
      meta: yt ? d.meta ?? null : null,
      scheduledAt: new Date(start + i * d.gapMinutes * 60_000),
    })),
  );
  refresh();
  kickUploads(); // TikTok: upload now (far-ahead times go to TikTok's schedule); YouTube: at its time (lib/uploads.ts)
}

export async function cancelUpload(id: number) {
  await db.update(uploadJobs).set({ status: "cancelled", progress: null }).where(eq(uploadJobs.id, Id.parse(id)));
  refresh();
}

export async function retryUpload(id: number) {
  const job = await db.select().from(uploadJobs).where(eq(uploadJobs.id, Id.parse(id))).get();
  if (!job) return;
  // keep a time that is still ahead (it goes to TikTok's schedule again); a past one posts now
  const at = job.scheduledAt.getTime() > Date.now() ? job.scheduledAt : new Date();
  await db.update(uploadJobs).set({ status: "queued", error: null, progress: null, scheduledAt: at }).where(eq(uploadJobs.id, job.id));
  refresh();
  kickUploads();
}

export async function deleteUploads(ids: number[]) {
  const list = z.array(Id).max(200).parse(ids);
  if (list.length) await db.delete(uploadJobs).where(inArray(uploadJobs.id, list));
  refresh();
}

/** Upload sekarang (posts!) or Uji coba (dryRun: attaches, writes the caption, links the product, but never presses Post). */
export async function runUploadNow(id: number, dryRun: boolean) {
  await runJobNow(Id.parse(id), z.boolean().parse(dryRun));
  refresh();
}
