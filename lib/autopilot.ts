import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { googleAccounts, videoProjects, type VideoProject } from "@/lib/db/schema";
import { applyTemplate, RESEARCH_TEMPLATES } from "@/lib/edit";
import { fitClipsToVoice, fullVoiceOver, prepareEdit, withChapters, writeFullScript } from "@/lib/editor";
import { getKv, setKv } from "@/lib/kalo";
import { runStep } from "@/lib/projects";
import { beginJob, inJob, throwIfCancelled } from "@/lib/jobs";
import { describeProduct, writeScenes } from "@/lib/prompt-writer";
import { getSettings } from "@/lib/settings";

// Autopilot: pick products from the KaloData ranking, then each becomes a finished edit with no clicks:
// project from KaloData → storyboard (AI) → images (+QC & auto-fix) → clips → one-take voice-over → fit clips →
// "Review" style of best sellers. One product at a time (shares Flow, the writer browser and Cartesia).
// Export stays in the browser (captions are drawn on a canvas): one "Export semua" click on the Autopilot page.

export type AutoItem = {
  productId: string;
  title: string;
  projectId: number | null;
  status: "antre" | "jalan" | "siap" | "gagal" | "diekspor";
  stage: string | null;
  error: string | null;
};
export type AutoState = { running: boolean; startedAt: number | null; items: AutoItem[] };

const KEY = "autopilot:state";
const g = globalThis as unknown as { __autopilot?: boolean };

export async function autopilotState(): Promise<AutoState> {
  const s = (await getKv<AutoState>(KEY))?.data ?? { running: false, startedAt: null, items: [] };
  // the app restarted mid-run: whatever was "jalan" stopped
  if (s.running && !g.__autopilot) return { ...s, running: false, items: s.items.map((i) => (i.status === "jalan" || i.status === "antre" ? { ...i, status: "gagal", stage: null, error: i.error ?? "Terhenti (aplikasi ditutup). Jalankan lagi." } : i)) };
  return s;
}
const save = (s: AutoState) => setKv(KEY, s);

async function patchItem(s: AutoState, i: number, patch: Partial<AutoItem>) {
  s.items[i] = { ...s.items[i], ...patch };
  await save(s);
}

const load = async (id: number) => (await db.select().from(videoProjects).where(eq(videoProjects.id, id)).get()) as VideoProject;

async function makeOne(s: AutoState, i: number) {
  const it = s.items[i];
  const step = (stage: string) => patchItem(s, i, { stage });
  await step("Membuat proyek dari KaloData...");
  const { createProjectFromKalo } = await import("@/app/(dashboard)/kalodata/actions");
  const id = await createProjectFromKalo(it.productId, "ID");
  await patchItem(s, i, { projectId: id });

  await autoFinish(id, step);
  await patchItem(s, i, { status: "siap", stage: "Siap diekspor" });
}

/**
 * From a project with a storyboard to a finished edit, no clicks: AI storyboard (skipped when `written`) → images
 * (+QC & auto-fix) → clips → one-take voice-over → fit clips → best-seller "Review" style (+ chapter titles for long
 * videos). `step` reports each stage. Used by Autopilot and by "Buat video sekarang" in the Studio.
 */
export async function autoFinish(id: number, step: (stage: string) => Promise<unknown>, opts: { written?: boolean } = {}) {
  beginJob(id);
  return inJob(id, () => autoFinishJob(id, step, opts));
}

async function autoFinishJob(id: number, step: (stage: string) => Promise<unknown>, opts: { written?: boolean }) {
  let p = await load(id);
  if (!opts.written) {
    await step("AI menulis naskah & prompt...");
    const look = !p.product.look && p.product.photos.length ? await describeProduct(p).catch(() => null) : null;
    if (look) p = { ...p, product: { ...p.product, look } };
    const written = await writeScenes(p).catch(() => []); // the template prompts still work if the writer fails
    const scenes = p.scenes.map((sc, k) => (written[k]?.imagePrompt ? { ...sc, label: written[k].label, imagePrompt: written[k].imagePrompt, motionPrompt: written[k].motionPrompt } : sc));
    throwIfCancelled(id);
    await db.update(videoProjects).set({ product: p.product, scenes, step: 4 }).where(eq(videoProjects.id, id));
  }

  throwIfCancelled(id);
  await step("Flow membuat gambar adegan (+ cek QC)...");
  await runStep(id, "images");
  p = await load(id);
  if (p.scenes.some((sc) => !sc.image)) throw new Error("Sebagian gambar gagal dibuat. Buka storyboard untuk mengulang.");

  throwIfCancelled(id);
  await step("Flow membuat klip video...");
  await db.update(videoProjects).set({ step: 5 }).where(eq(videoProjects.id, id));
  await runStep(id, "render"); // throws when clips fail
  p = await load(id);
  if (!p.finalPath) throw new Error(p.error ?? "Render klip gagal.");

  throwIfCancelled(id);
  await step("Menyusun timeline, suara & caption...");
  const edit = await autoEdit(p);
  throwIfCancelled(id);
  await db.update(videoProjects).set({ edit, step: 6, status: "done", progress: null, error: null, updatedAt: new Date() }).where(eq(videoProjects.id, id));
}

/**
 * Ready-to-post edit of a rendered project: one-take Cartesia voice-over (if a key is set) fitted to the clips,
 * then the format most best sellers use: small 1–2 word subtitles, karaoke, spoken CTA, no stickers.
 */
/** "Tanpa subtitle" on the project: the final video has no burned-in captions. */
export const withSubtitleChoice = <E extends { captions: unknown[] }>(p: { options: Record<string, string> }, e: E): E =>
  p.options.subtitle === "off" && e.captions.length ? { ...e, captions: [] } : e;

export async function autoEdit(p: VideoProject) {
  let edit = await prepareEdit(p);
  if (getSettings().voice?.cartesiaKey) {
    const script = await writeFullScript(p, edit).catch(() => null);
    if (script) {
      edit = (await fullVoiceOver(p, edit, script, 2)).edit;
      edit = await fitClipsToVoice(p, edit).catch(() => edit);
    }
  }
  return withSubtitleChoice(p, withChapters(p, applyTemplate(edit, RESEARCH_TEMPLATES[0])));
}

/** Start a run for these products (no-op while one runs). Returns at once; progress is read with autopilotState(). */
export async function startAutopilot(products: { productId: string; title: string }[]) {
  if (g.__autopilot) throw new Error("Autopilot masih berjalan.");
  if (!(await db.select().from(googleAccounts).where(eq(googleAccounts.status, "active")).get())) throw new Error("Belum ada akun Google aktif untuk Flow (Pengaturan AI).");
  const prev = await autopilotState();
  const s: AutoState = {
    running: true,
    startedAt: Date.now(),
    items: [...prev.items.filter((x) => x.status === "siap" || x.status === "diekspor"), ...products.map((p) => ({ ...p, projectId: null, status: "antre" as const, stage: null, error: null }))],
  };
  await save(s);
  g.__autopilot = true;
  void (async () => {
    try {
      for (let i = 0; i < s.items.length; i++) {
        if (s.items[i].status !== "antre") continue;
        if (!g.__autopilot) break; // stopped
        await patchItem(s, i, { status: "jalan" });
        try {
          await makeOne(s, i);
        } catch (e) {
          await patchItem(s, i, { status: "gagal", stage: null, error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
        }
      }
    } finally {
      g.__autopilot = false;
      s.running = false;
      s.items = s.items.map((x) => (x.status === "antre" ? { ...x, status: "gagal", error: "Dihentikan." } : x));
      await save(s);
    }
  })();
}

/** Stop after the current product finishes (a Flow job in progress is not cut off). */
export function stopAutopilot() {
  g.__autopilot = false;
}

export async function markExported(projectId: number) {
  const s = await autopilotState();
  s.items = s.items.map((x) => (x.projectId === projectId ? { ...x, status: "diekspor", stage: "Diekspor (1080p)" } : x));
  await save(s);
}

export async function clearAutopilot() {
  const s = await autopilotState();
  await save({ ...s, items: s.items.filter((x) => x.status === "jalan" || x.status === "antre") });
}
