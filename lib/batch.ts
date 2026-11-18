import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { videoProjects } from "@/lib/db/schema";
import { createProjectFolder } from "@/lib/media";
import { buildVideos, defaultOptions, draftCaption, presetById } from "@/lib/presets";
import { runFullVideo } from "@/lib/projects";
import { saveShowcasePhotos, showcaseMaterial } from "@/lib/showcase-material";
import type { FlowEngine } from "@/lib/settings";

// Etalase batch: many showcase products → many finished videos. 1 worker = 1 video at a time, end to end
// (photos + storyboard → scene images → clips → final.mp4); the other products wait their turn.
// Inside a video, scenes still share the app-wide generation slots (automatic: device + Flow accounts).
// Every product gets its project right away (visible in Proyek Video with "Antre"), so nothing is lost
// from view; the queue itself lives in memory, and projects interrupted by closing the app are marked
// failed at the next start (lib/video failInterruptedJobs) and can be resumed from the Studio.

type Job = { projectId: number; showcaseId: number };
type Batch = { id: string; presetId: string; engine: FlowEngine; workers: number; sec: number; videos: number; queue: Job[]; running: number; total: number };

const g = globalThis as unknown as { __videoBatches?: Map<string, Batch> };
const batches = (g.__videoBatches ??= new Map());

const waitingText = (pos: number) => `Antre: menunggu pekerja kosong (#${pos})`;

export async function startVideoBatch(input: { showcaseIds: number[]; presetId: string; workers: number; engine: FlowEngine; sec: number; videos: number }) {
  const preset = presetById(input.presetId);
  if (!preset?.available || preset.custom) throw new Error("Pilih konsep video yang punya adegan otomatis.");
  const batch: Batch = {
    id: crypto.randomUUID(),
    presetId: preset.id,
    engine: input.engine,
    workers: input.workers,
    sec: input.sec,
    videos: input.videos,
    queue: [],
    running: 0,
    total: input.showcaseIds.length,
  };

  // one project per product, created now so the whole batch is visible at once
  for (const [i, showcaseId] of input.showcaseIds.entries()) {
    const { row } = await showcaseMaterial(showcaseId).catch(() => ({ row: null }));
    const name = row ? (row.title.length > 120 ? `${row.title.slice(0, 117)}...` : row.title) : `Produk etalase ${showcaseId}`;
    const [{ id }] = await db
      .insert(videoProjects)
      .values({
        presetId: preset.id,
        title: "",
        step: 2,
        product: { name, details: "", price: row?.price ?? "", photos: [] },
        options: { ...defaultOptions(preset), mode: "videos", videos: String(input.videos), ...(row ? { productId: row.productId } : {}) },
        scenes: [],
        clipSec: input.sec,
        folder: "",
        status: "running",
        progress: waitingText(i + 1),
      })
      .returning({ id: videoProjects.id });
    const folder = await createProjectFolder(id, preset.id);
    await db.update(videoProjects).set({ folder }).where(eq(videoProjects.id, id));
    batch.queue.push({ projectId: id, showcaseId });
  }

  batches.set(batch.id, batch);
  const projectIds = batch.queue.map((j) => j.projectId);
  for (let w = 0; w < Math.min(batch.workers, batch.queue.length); w++) void worker(batch);
  return { batchId: batch.id, projectIds };
}

async function worker(batch: Batch) {
  for (;;) {
    const job = batch.queue.shift();
    if (!job) break;
    batch.running++;
    // everyone still waiting moves up one place
    await Promise.all(batch.queue.map((j, i) => db.update(videoProjects).set({ progress: waitingText(i + 1) }).where(eq(videoProjects.id, j.projectId)))).catch(() => {});
    try {
      await prepare(batch, job);
      await runFullVideo(job.projectId, batch.engine);
    } catch (e) {
      await db
        .update(videoProjects)
        .set({ status: "failed", progress: null, error: (e instanceof Error ? e.message : String(e)).slice(0, 300), updatedAt: new Date() })
        .where(eq(videoProjects.id, job.projectId))
        .catch(() => {});
    } finally {
      batch.running--;
    }
  }
  if (!batch.queue.length && !batch.running) batches.delete(batch.id);
}

/** Product photos (first 3 of the gallery) + facts, then the concept's storyboard. */
async function prepare(batch: Batch, job: Job) {
  const set = (p: Partial<typeof videoProjects.$inferInsert>) => db.update(videoProjects).set({ ...p, updatedAt: new Date() }).where(eq(videoProjects.id, job.projectId));
  await set({ progress: "Mengambil foto & data produk..." });
  const p = await db.select().from(videoProjects).where(eq(videoProjects.id, job.projectId)).get();
  if (!p) throw new Error("Proyek dihapus.");
  const { row, gallery, facts } = await showcaseMaterial(job.showcaseId);
  const photos = await saveShowcasePhotos(p.folder, gallery.slice(0, 3));
  if (!photos.length) throw new Error("Foto produk tidak bisa diambil. Sinkronkan etalase lalu coba lagi.");
  const name = row.title.length > 120 ? `${row.title.slice(0, 117)}...` : row.title;
  const product = { name, details: facts.join(", ").slice(0, 1000), price: row.price, photos };

  const preset = presetById(batch.presetId)!;
  // `videos` finished videos per product, each one continuous clip of `sec` s with its own angle & talking points
  const scenes = buildVideos(preset.scenes(product, p.options), batch.sec, p.options, product, batch.videos).map((s) => ({ ...s, image: null, clip: null, error: null }));
  if (!scenes.length) throw new Error("Konsep ini tidak punya adegan otomatis.");
  await set({ product, scenes, caption: draftCaption(product), step: 4, progress: "Storyboard siap, membuat gambar..." });
}

/** Live batch counts for the UI (not persisted). */
export const batchStats = () =>
  [...batches.values()].map((b) => ({ id: b.id, total: b.total, waiting: b.queue.length, running: b.running, workers: b.workers }));
