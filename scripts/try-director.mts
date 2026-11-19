// Dev check: run AI Director once on a project and print the raw Gemini answer when it fails.
// Usage: npx tsx --conditions=react-server scripts/try-director.mts <projectId>
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { videoProjects } from "@/lib/db/schema";
import { aiAdjustEdit, answerLog } from "@/lib/editor";
import { normalizeEdit } from "@/lib/edit";

const p = (await db.select().from(videoProjects).where(eq(videoProjects.id, Number(process.argv[2]))).get())!;
const t0 = Date.now();
try {
  const r = await aiAdjustEdit(p, normalizeEdit(p.edit!), "", { director: true, angle: 0 });
  console.log("OK", Date.now() - t0, "ms", r.note, JSON.stringify(r.edit.overlays), JSON.stringify(r.edit.fx), JSON.stringify(r.edit.captionStyle));
} catch (e) {
  console.log("FAIL", (e as Error).message, "\nRAW:", answerLog.last.slice(0, 1500));
}
process.exit(0);
