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
// The lock belongs to the page that took it (`owner`, a random id per result tab): that page may take it again
// ("Coba lagi" after an error), other pages wait and are told when to ask again.
const g = globalThis as unknown as { __quickExport?: Map<number, { until: number; owner: string }>; __quick?: Set<number> };
const LOCK_MS = 10 * 60_000;
const AUTOFINISH_RETRY_MS = 15_000; // "Buat video sekarang" has no end time: ask again every 15 s
const locks = () => (g.__quickExport ??= new Map());
const Owner = z.string().min(8).max(64);
/** When another page or the autopilot holds this project: the time to ask again (ms); null = free for `owner`. */
function heldUntil(id: number, owner: string) {
  if (g.__quick?.has(id)) return Date.now() + AUTOFINISH_RETRY_MS;
  const l = locks().get(id);
  return l && l.until > Date.now() && l.owner !== owner ? l.until : null;
}
const unlock = (id: number, owner: string) => {
  if (locks().get(id)?.owner === owner) locks().delete(id);
};

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
export async function prepareQuickEdit(
  id: number,
  owner: string,
): Promise<{ busy: true; retryAt: number } | { busy: false; edit: NonNullable<Awaited<ReturnType<typeof get>>["edit"]> }> {
  const p = await get(id);
  owner = Owner.parse(owner);
  const until = heldUntil(p.id, owner);
  if (until) return { busy: true, retryAt: until };
  locks().set(p.id, { until: Date.now() + LOCK_MS, owner });
  try {
    let edit = await prepareEdit(p); // same object back when the saved edit and its base video are still valid
    // AI voice + captions only once: if it produced nothing (silent preset, AI/Cartesia down) export as is
    if (!edit.captions.length && !edit.voices.length && !edit.autoTried) edit = { ...(await autoEdit({ ...p, edit })), autoTried: true };
    edit = withSubtitleChoice(p, edit); // "Tanpa subtitle"
    if (edit !== p.edit) await db.update(videoProjects).set({ edit, updatedAt: new Date() }).where(eq(videoProjects.id, p.id));
    return { busy: false, edit };
  } catch (e) {
    unlock(p.id, owner);
    throw e;
  }
}

/** The result page failed between prepare and export (caption drawing, network): free the project at once. */
export async function releaseQuickExport(id: number, owner: string) {
  unlock(z.number().int().positive().parse(id), Owner.parse(owner));
}

const Num = z.number().finite();
const Overlays = z
  .array(z.object({ start: Num, end: Num, x: Num, y: Num, w: Num.default(0), h: Num.default(0), anim: z.string().max(20).optional(), out: z.boolean().optional(), png: z.string().startsWith("data:image/png;base64,").max(3_000_000) }))
  .max(500);

/** Export the saved edit to final.mp4 (1080p), archive it in Galeri Video. */
export async function exportQuick(id: number, overlays: z.input<typeof Overlays>, owner: string) {
  const p = await get(id);
  owner = Owner.parse(owner);
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
    unlock(p.id, owner);
  }
}

