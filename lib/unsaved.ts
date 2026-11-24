import "server-only";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { videoProjects } from "@/lib/db/schema";
import { removeMedia } from "@/lib/media";

// A project that was just opened (Buat Video Reels, Etalase, Riset, KaloData) is not a draft yet: it stays out of
// Proyek Video and the Beranda counts until the owner clicks "Simpan draft" or starts making the video.
// Kept in video_projects.options.unsaved = "1"; only the server sets or clears it.
export const UNSAVED = "unsaved";
export const isUnsaved = (options: Record<string, string>) => options[UNSAVED] === "1";

/** options without the "not saved yet" mark */
export function savedOptions(options: Record<string, string>) {
  const rest = { ...options };
  delete rest[UNSAVED];
  return rest;
}

/** The project becomes a real draft/video (making it started): shown in Proyek Video from now on. */
export async function markSaved(id: number) {
  const p = await db.select({ options: videoProjects.options }).from(videoProjects).where(eq(videoProjects.id, id)).get();
  if (p && isUnsaved(p.options)) await db.update(videoProjects).set({ options: savedOptions(p.options) }).where(eq(videoProjects.id, id));
}

/** Projects opened but never saved, untouched for a day: removed with their (empty) folder. */
export async function pruneUnsaved() {
  const old = new Date(Date.now() - 24 * 3600_000);
  const rows = await db.select().from(videoProjects).where(and(lt(videoProjects.updatedAt, old), eq(videoProjects.status, "draft")));
  for (const p of rows) {
    if (!isUnsaved(p.options)) continue;
    if (p.folder) await removeMedia(p.folder).catch(() => {});
    await db.delete(videoProjects).where(eq(videoProjects.id, p.id));
  }
}
