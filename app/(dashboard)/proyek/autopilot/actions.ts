"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { autopilotState, clearAutopilot, markExported, startAutopilot, stopAutopilot } from "@/lib/autopilot";
import { db } from "@/lib/db";
import { videoProjects } from "@/lib/db/schema";

const Pid = z.string().regex(/^\d{10,22}$/);

export async function getAutopilot() {
  return autopilotState();
}

export async function runAutopilot(products: { productId: string; title: string }[]) {
  await startAutopilot(z.array(z.object({ productId: Pid, title: z.string().max(200) })).min(1).max(10).parse(products));
  revalidatePath("/proyek/autopilot");
}

export async function haltAutopilot() {
  stopAutopilot();
}

export async function clearFinished() {
  await clearAutopilot();
  revalidatePath("/proyek/autopilot");
}

/** The prepared edit of a project (the page draws its captions and exports it). */
export async function getProjectEdit(id: number) {
  const p = await db.select().from(videoProjects).where(eq(videoProjects.id, z.number().int().positive().parse(id))).get();
  if (!p?.edit) throw new Error("Proyek belum punya timeline.");
  return p.edit;
}

export async function markProjectExported(id: number) {
  await markExported(z.number().int().positive().parse(id));
}
