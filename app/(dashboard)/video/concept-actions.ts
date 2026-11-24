"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { videoProjects } from "@/lib/db/schema";
import { createProjectFolder } from "@/lib/media";
import { CONCEPT_VOICES, defaultOptions, MOODS, presetById } from "@/lib/presets";
import { getSettings, updateSettings, type MyConcept } from "@/lib/settings";
import { pruneUnsaved, UNSAVED } from "@/lib/unsaved";

// The owner's own concepts ("+ Buat konsep sendiri"): kept in settings.json, used through the free-form
// "custom" preset. The idea text reaches the AI scene writer as options.concept.

const Input = z.object({
  name: z.string().trim().min(1, "Isi nama konsep.").max(60),
  idea: z.string().trim().min(10, "Ceritakan videonya minimal satu kalimat.").max(1500),
  scenes: z.number().int().min(1).max(12),
  // typed by the owner (any words); empty = the AI picks a set that suits the product
  background: z.string().trim().max(300).transform((v) => v || "auto"),
  // who is on screen, in the owner's own words ("cewek setengah badan pakai celana", "tangan saja"); empty = AI decides
  cast: z.string().trim().max(300).default(""),
  mood: z.string().refine((v) => MOODS.some((m) => m.value === v), "Suasana tidak dikenal"),
  voice: z.string().refine((v) => CONCEPT_VOICES.some((x) => x.value === v), "Suara tidak dikenal"),
  hook: z.string().trim().max(150).default(""),
});

export async function createMyConcept(input: z.input<typeof Input>) {
  const parsed = Input.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Isian konsep belum lengkap.");
  const d = parsed.data;
  const concept: MyConcept = { id: randomUUID(), ...d, audio: d.voice === "none" ? "off" : "on", createdAt: Date.now() };
  updateSettings({ myConcepts: [concept, ...(getSettings().myConcepts ?? [])].slice(0, 50) });
  revalidatePath("/video");
  return concept;
}

export async function deleteMyConcept(id: string) {
  updateSettings({ myConcepts: (getSettings().myConcepts ?? []).filter((c) => c.id !== id) });
  revalidatePath("/video");
}

/** Start a project from one of the owner's concepts (free-form preset, its scene count, its idea for the AI writer). */
export async function createProjectFromConcept(id: string) {
  const c = getSettings().myConcepts?.find((x) => x.id === id);
  if (!c) throw new Error("Konsep tidak ditemukan.");
  const preset = presetById("custom")!;
  const options: Record<string, string> = { ...defaultOptions(preset), background: c.background, audio: c.audio, concept: c.idea, conceptName: c.name, [UNSAVED]: "1" };
  if (c.cast) options.cast = c.cast;
  if (c.mood) options.mood = c.mood;
  if (c.voice && c.voice !== "none") options.voice = c.voice;
  if (c.hook) options.hook = c.hook;
  await pruneUnsaved();
  const scenes = Array.from({ length: c.scenes }, (_, i) => ({ label: `Scene ${i + 1}`, imagePrompt: "", motionPrompt: "" }));
  const [{ id: projectId }] = await db
    .insert(videoProjects)
    .values({ presetId: preset.id, title: "", product: { name: "", details: "", price: "", photos: [] }, options, scenes, folder: "" })
    .returning({ id: videoProjects.id });
  await db.update(videoProjects).set({ folder: await createProjectFolder(projectId, preset.id) }).where(eq(videoProjects.id, projectId));
  redirect(`/video/${projectId}`);
}
