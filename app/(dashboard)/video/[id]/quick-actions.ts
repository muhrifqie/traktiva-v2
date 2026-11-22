"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { autoEdit, withSubtitleChoice } from "@/lib/autopilot";
import { db } from "@/lib/db";
import { videoProjects } from "@/lib/db/schema";
import { exportEdit, prepareEdit } from "@/lib/editor";
import { archiveExport } from "@/lib/video-gallery";

// Video Pendek skips the timeline editor: the result tab builds the ready-to-post edit (voice + captions, same as
// "Buat video sekarang") and exports it straight away. Captions are drawn in the browser, so the page sends them.

// One quick export per project at a time. The flow spans three calls (prepare on the server → captions drawn in the
// browser → export on the server), so the lock is held from prepare until export ends (or LOCK_MS, if the page was
// closed halfway). Projects still being finished by "Buat video sekarang" (autoFinish) count as busy too.
const g = globalThis as unknown as { __quickExport?: Map<number, number>; __quick?: Set<number> };
const LOCK_MS = 10 * 60_000;
const locks = () => (g.__quickExport ??= new Map());
const busy = (id: number) => (locks().get(id) ?? 0) > Date.now() || !!g.__quick?.has(id);
const unlock = (id: number) => locks().delete(id);

async function get(id: number) {
  const p = await db.select().from(videoProjects).where(eq(videoProjects.id, z.number().int().positive().parse(id))).get();
  if (!p) throw new Error("Proyek tidak ditemukan.");
  if (p.status === "running") throw new Error("Proyek sedang diproses.");
  return p;
}

/**
 * The edit to export: the saved one (base video rebuilt if missing), with voice + subtitles added if it has none.
 * `busy`: another tab/window (or the autopilot) is already making this video: wait for it instead of exporting twice.
 */
export async function prepareQuickEdit(id: number): Promise<{ busy: true } | { busy: false; edit: NonNullable<Awaited<ReturnType<typeof get>>["edit"]> }> {
  const p = await get(id);
  if (busy(p.id)) return { busy: true };
  locks().set(p.id, Date.now() + LOCK_MS);
  try {
    let edit = await prepareEdit(p); // same object back when the saved edit and its base video are still valid
    // AI voice + captions only once: if it produced nothing (silent preset, AI/Cartesia down) export as is
    if (!edit.captions.length && !edit.voices.length && !edit.autoTried) edit = { ...(await autoEdit({ ...p, edit })), autoTried: true };
    edit = withSubtitleChoice(p, edit); // "Tanpa subtitle"
    if (edit !== p.edit) await db.update(videoProjects).set({ edit, updatedAt: new Date() }).where(eq(videoProjects.id, p.id));
    return { busy: false, edit };
  } catch (e) {
    unlock(p.id);
    throw e;
  }
}

const Num = z.number().finite();
const Overlays = z
  .array(z.object({ start: Num, end: Num, x: Num, y: Num, w: Num.default(0), h: Num.default(0), anim: z.string().max(20).optional(), out: z.boolean().optional(), png: z.string().startsWith("data:image/png;base64,").max(3_000_000) }))
  .max(500);

/** Export the saved edit to final.mp4 (1080p), archive it in Galeri Video. */
export async function exportQuick(id: number, overlays: z.input<typeof Overlays>) {
  const p = await get(id);
  try {
    if (!p.edit) throw new Error("Video belum disiapkan.");
    const finalPath = await exportEdit(p, p.edit, Overlays.parse(overlays) as Parameters<typeof exportEdit>[2]);
    const edit = { ...p.edit, exportedAt: Date.now() };
    await db.update(videoProjects).set({ edit, finalPath, updatedAt: new Date() }).where(eq(videoProjects.id, p.id));
    await archiveExport({ ...p, edit }, finalPath);
    revalidatePath("/galeri-video");
    revalidatePath(`/video/${p.id}`);
    return finalPath;
  } finally {
    unlock(p.id);
  }
}

