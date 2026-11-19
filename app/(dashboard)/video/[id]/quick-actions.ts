"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { autoEdit } from "@/lib/autopilot";
import { db } from "@/lib/db";
import { videoProjects } from "@/lib/db/schema";
import { exportEdit, prepareEdit } from "@/lib/editor";
import { archiveExport } from "@/lib/video-gallery";

// Video Pendek skips the timeline editor: the result tab builds the ready-to-post edit (voice + captions, same as
// "Buat video sekarang") and exports it straight away. Captions are drawn in the browser, so the page sends them.

async function get(id: number) {
  const p = await db.select().from(videoProjects).where(eq(videoProjects.id, z.number().int().positive().parse(id))).get();
  if (!p) throw new Error("Proyek tidak ditemukan.");
  if (p.status === "running") throw new Error("Proyek sedang diproses.");
  return p;
}

/** The edit to export: the saved one (base video rebuilt if missing), with voice + subtitles added if it has none. */
export async function prepareQuickEdit(id: number) {
  const p = await get(id);
  let edit = await prepareEdit(p); // same object back when the saved edit and its base video are still valid
  if (!edit.captions.length && !edit.voices.length) edit = await autoEdit({ ...p, edit });
  if (edit !== p.edit) await db.update(videoProjects).set({ edit, updatedAt: new Date() }).where(eq(videoProjects.id, p.id));
  return edit;
}

const Num = z.number().finite();
const Overlays = z
  .array(z.object({ start: Num, end: Num, x: Num, y: Num, w: Num.default(0), h: Num.default(0), anim: z.string().max(20).optional(), out: z.boolean().optional(), png: z.string().startsWith("data:image/png;base64,").max(3_000_000) }))
  .max(500);

/** Export the saved edit to final.mp4 (1080p), archive it in Galeri Video. */
export async function exportQuick(id: number, overlays: z.input<typeof Overlays>) {
  const p = await get(id);
  if (!p.edit) throw new Error("Video belum disiapkan.");
  const finalPath = await exportEdit(p, p.edit, Overlays.parse(overlays) as Parameters<typeof exportEdit>[2]);
  const edit = { ...p.edit, exportedAt: Date.now() };
  await db.update(videoProjects).set({ edit, finalPath, updatedAt: new Date() }).where(eq(videoProjects.id, p.id));
  await archiveExport({ ...p, edit }, finalPath);
  revalidatePath("/galeri-video");
  revalidatePath(`/video/${p.id}`);
  return finalPath;
}
