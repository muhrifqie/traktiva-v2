import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { videoProjects } from "@/lib/db/schema";
import { parallelLimit } from "@/lib/settings";

// Generation slots shared by every project image and clip; the limit is automatic (parallelLimit: PC specs + accounts).
const g = globalThis as unknown as { __flowSlots?: { active: number; waiting: (() => void)[] } };
const slots = (g.__flowSlots ??= { active: 0, waiting: [] });

/** Run fn when a generation slot is free (FIFO). */
export async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (slots.active >= parallelLimit()) await new Promise<void>((r) => slots.waiting.push(r));
  else slots.active++;
  try {
    return await fn();
  } finally {
    // hand the slot to the next waiter unless the limit was lowered meanwhile
    const next = slots.active <= parallelLimit() ? slots.waiting.shift() : undefined;
    if (next) next();
    else slots.active--;
  }
}

/** Let waiting jobs start right away after the limit was raised. */
export function drainSlots() {
  while (slots.waiting.length && slots.active < parallelLimit()) {
    slots.active++;
    slots.waiting.shift()!();
  }
}

/** Work left running when the app closed can never finish; mark it so the UI doesn't spin forever. */
export async function failInterruptedJobs() {
  await db
    .update(videoProjects)
    .set({ status: "failed", progress: null, error: "Terputus karena aplikasi ditutup. Coba lagi." })
    .where(eq(videoProjects.status, "running"));
}

/** Live slot usage for the status bar. */
export const slotStats = () => ({ active: slots.active, waiting: slots.waiting.length, max: parallelLimit() });
