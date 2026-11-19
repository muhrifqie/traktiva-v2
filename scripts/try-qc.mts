// Dev check: Gemini QC of a project's scene images against its product photos (no DB writes).
// Usage: npx tsx --conditions=react-server scripts/try-qc.mts <projectId>
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { videoProjects } from "@/lib/db/schema";
import { checkSceneImages } from "@/lib/prompt-writer";

const p = (await db.select().from(videoProjects).where(eq(videoProjects.id, Number(process.argv[2]))).get())!;
const t0 = Date.now();
const r = await checkSceneImages(p, p.scenes.map((_, i) => i));
console.log(Math.round((Date.now() - t0) / 1000), "s");
for (const [i, c] of r) console.log(`scene ${i + 1}:`, c.ok ? "OK" : "MISMATCH", "-", c.note);
process.exit(0);
