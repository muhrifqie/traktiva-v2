"use server";

import { spawn } from "node:child_process";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { googleAccounts, videoProjects, type ProjectScene } from "@/lib/db/schema";
import fs from "node:fs/promises";
import { createProjectFolder, removeMedia, resolveMedia, writeMedia } from "@/lib/media";
import { aiAdjustEdit, exportEdit, fitClipsToVoice, fullVoiceOver, prepareEdit, writeFullScript } from "@/lib/editor";
import { addMusic, copyMusicToProject, ensureSfx, listMusic, removeMusic } from "@/lib/audio-library";
import {
  CAPTION_ANIMS, CAPTION_FONTS, CAPTION_PRESETS, clamp, DEFAULT_FX, DEFAULT_SAFE, round2, SFX_DIR, toTemplate,
  type CaptionAnim, type CaptionFont, type CaptionPreset, type EditTemplate, type ProjectEdit,
} from "@/lib/edit";
import { defaultOptions, draftCaption, presetById, projectName } from "@/lib/presets";
import { addToLibrary, copyIntoProject, listGenerated, listUploads } from "@/lib/library";
import { queueImages, queueRender } from "@/lib/projects";
import { writeScenes } from "@/lib/prompt-writer";
import { synthesize } from "@/lib/cartesia";
import { getSettings, updateSettings } from "@/lib/settings";
import { spoken } from "@/lib/voice";

const Id = z.number().int().positive();
const MAX_SCENES = 12;

async function get(id: number) {
  const p = await db.select().from(videoProjects).where(eq(videoProjects.id, Id.parse(id))).get();
  if (!p) throw new Error("Proyek tidak ditemukan.");
  return p;
}
async function requireGoogle() {
  const a = await db.select({ id: googleAccounts.id }).from(googleAccounts).where(eq(googleAccounts.status, "active")).limit(1);
  if (!a.length) throw new Error("Tambahkan akun Google di Pengaturan AI dulu.");
}

export async function createProject(presetId: string) {
  const preset = presetById(presetId);
  if (!preset?.available) throw new Error("Konsep ini belum tersedia.");
  const [{ id }] = await db
    .insert(videoProjects)
    .values({ presetId, title: "", product: { name: "", details: "", price: "", photos: [] }, options: defaultOptions(preset), scenes: [], folder: "" })
    .returning({ id: videoProjects.id });
  await db.update(videoProjects).set({ folder: await createProjectFolder(id, preset.id) }).where(eq(videoProjects.id, id));
  redirect(`/video/${id}`);
}

const Patch = z.object({
  step: z.number().int().min(1).max(6).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  product: z.object({ name: z.string().max(200), details: z.string().max(1000), price: z.string().max(60) }).optional(),
  options: z.record(z.string(), z.string().max(300)).optional(),
  clipSec: z.number().int().min(4).max(10).optional(),
  scenes: z.array(z.object({ label: z.string().max(60), imagePrompt: z.string().max(2000), motionPrompt: z.string().max(2000) })).max(MAX_SCENES).optional(),
  caption: z.string().max(2200).optional(),
});

/** Save wizard edits. Editing a scene's prompts drops its stale clip; editing the image prompt keeps the image (user can re-roll). */
export async function saveProject(id: number, patch: z.input<typeof Patch>) {
  const p = await get(id);
  const d = Patch.parse(patch);
  if (d.scenes && p.status === "running") throw new Error("Proyek sedang diproses, tunggu selesai dulu.");
  // Only write fields the caller sent: a runner may be updating scenes in the background.
  const set: Partial<typeof videoProjects.$inferInsert> = { updatedAt: new Date() };
  if (d.step) set.step = d.step;
  if (d.title) set.title = d.title;
  if (d.product) set.product = { ...p.product, ...d.product };
  if (d.options) set.options = d.options;
  if (d.clipSec) set.clipSec = d.clipSec;
  if (d.caption !== undefined) set.caption = d.caption;
  if (d.scenes) {
    set.scenes = d.scenes.map((s, i) => {
      const old = p.scenes[i];
      const same = old && old.motionPrompt === s.motionPrompt && old.imagePrompt === s.imagePrompt;
      return { ...old, ...s, clip: same ? old.clip : null } as ProjectScene;
    });
  }
  await db
    .update(videoProjects)
    .set(set)
    .where(eq(videoProjects.id, p.id));
}

/** (Re)build the storyboard from the preset template with the current product + style. Clears generated media links. */
export async function buildStoryboard(id: number) {
  const p = await get(id);
  const preset = presetById(p.presetId);
  if (!preset) throw new Error("Konsep tidak dikenal.");
  if (!p.product.name.trim()) throw new Error("Isi nama produk dulu.");
  const scenes = preset.scenes(p.product, p.options).map((s) => ({ ...s, image: null, clip: null, error: null }));
  await db
    .update(videoProjects)
    .set({ scenes, caption: p.caption || draftCaption(p.product), step: 4, updatedAt: new Date() })
    .where(eq(videoProjects.id, p.id));
}

const PHOTO_TYPES: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };

export async function uploadPhotos(id: number, form: FormData) {
  const p = await get(id);
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (p.product.photos.length + files.length > 3) throw new Error("Maksimal 3 foto produk.");
  const photos = [...p.product.photos];
  for (const f of files) {
    const ext = PHOTO_TYPES[f.type];
    if (!ext) throw new Error("Format foto harus PNG, JPG, atau WEBP.");
    if (f.size > 8 * 1024 * 1024) throw new Error("Ukuran foto maksimal 8 MB.");
    const data = Buffer.from(await f.arrayBuffer());
    photos.push(await writeMedia(`${p.folder}/produk/foto-${Date.now().toString(36)}${photos.length}${ext}`, data));
    await addToLibrary(data, ext, f.name);
  }
  await db.update(videoProjects).set({ product: { ...p.product, photos }, updatedAt: new Date() }).where(eq(videoProjects.id, p.id));
}

export async function removePhoto(id: number, rel: string) {
  const p = await get(id);
  if (!p.product.photos.includes(rel)) return;
  await removeMedia(rel);
  await db.update(videoProjects).set({ product: { ...p.product, photos: p.product.photos.filter((x) => x !== rel) }, updatedAt: new Date() }).where(eq(videoProjects.id, p.id));
}

export async function generateImages(id: number, only?: number) {
  const p = await get(id);
  if (p.status === "running") throw new Error("Proyek sedang diproses.");
  if (!p.product.photos.length && !presetById(p.presetId)?.custom) throw new Error("Unggah minimal 1 foto produk.");
  if (!p.scenes.length) throw new Error("Storyboard masih kosong.");
  const targets = only != null ? [p.scenes[only]] : p.scenes.filter((s) => !(s.own && s.image));
  if (targets.some((s) => !s?.imagePrompt.trim())) throw new Error("Isi prompt gambar dulu untuk adegan yang mau dibuat AI.");
  await requireGoogle();
  await queueImages(p.id, only);
}

export async function renderProject(id: number) {
  const p = await get(id);
  if (p.status === "running") throw new Error("Proyek sedang diproses.");
  if (p.scenes.some((s) => !s.image)) throw new Error("Semua adegan perlu gambar dulu.");
  if (p.scenes.some((s) => !s.motionPrompt.trim())) throw new Error("Isi prompt gerak untuk semua adegan dulu.");
  await requireGoogle();
  await db.update(videoProjects).set({ step: 5 }).where(eq(videoProjects.id, p.id));
  await queueRender(p.id);
}

export async function deleteProject(id: number, withFiles: boolean) {
  const p = await get(id);
  if (p.status === "running") throw new Error("Proyek sedang diproses, tunggu selesai dulu.");
  if (withFiles && p.folder) await removeMedia(p.folder);
  await db.delete(videoProjects).where(eq(videoProjects.id, p.id));
  revalidatePath("/proyek");
}

/** Open the project folder in the OS file manager (the server always runs on the user's own machine). */
export async function openProjectFolder(id: number) {
  const p = await get(id);
  const abs = resolveMedia(p.folder);
  const cmd = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  spawn(cmd, [abs], { detached: true, stdio: "ignore" }).unref();
}

export async function listProjects() {
  return db.select().from(videoProjects).orderBy(desc(videoProjects.updatedAt)).limit(60);
}

// ---------- project CRUD ----------

const notRunning = (p: { status: string }) => {
  if (p.status === "running") throw new Error("Proyek sedang diproses, tunggu selesai dulu.");
};

export async function renameProject(id: number, name: string) {
  const p = await get(id);
  const title = z.string().trim().min(1, "Nama tidak boleh kosong").max(120).parse(name);
  await db.update(videoProjects).set({ title, updatedAt: new Date() }).where(eq(videoProjects.id, p.id));
  revalidatePath("/proyek");
}

/** Copy a project, its settings and every file (photos, images, clips, final) into a new folder. */
export async function duplicateProject(id: number) {
  const p = await get(id);
  notRunning(p);
  const [{ id: newId }] = await db
    .insert(videoProjects)
    .values({
      presetId: p.presetId, title: `${projectName(p)} (salinan)`, step: p.step, product: p.product, options: p.options,
      scenes: p.scenes, clipSec: p.clipSec, caption: p.caption, folder: "", finalPath: p.finalPath, status: p.status === "done" ? "done" : "draft",
    })
    .returning({ id: videoProjects.id });
  const folder = await createProjectFolder(newId, p.presetId);
  if (p.folder) await fs.cp(resolveMedia(p.folder), resolveMedia(folder), { recursive: true, force: true }).catch(() => {});
  const move = (rel?: string | null) => (rel && rel.startsWith(`${p.folder}/`) ? folder + rel.slice(p.folder.length) : rel ?? null);
  await db
    .update(videoProjects)
    .set({
      folder,
      finalPath: move(p.finalPath),
      product: { ...p.product, photos: p.product.photos.map((x) => move(x)!) },
      scenes: p.scenes.map((s) => ({ ...s, image: move(s.image), clip: move(s.clip), state: null, stage: null, error: null })),
    })
    .where(eq(videoProjects.id, newId));
  revalidatePath("/proyek");
  return newId;
}

// ---------- storyboard editing (any concept) ----------

async function editScenes(id: number, fn: (scenes: ProjectScene[]) => ProjectScene[]) {
  const p = await get(id);
  notRunning(p);
  const scenes = fn(p.scenes.map((s) => ({ ...s })));
  if (scenes.length > MAX_SCENES) throw new Error(`Maksimal ${MAX_SCENES} adegan.`);
  await db.update(videoProjects).set({ scenes, updatedAt: new Date() }).where(eq(videoProjects.id, p.id));
  return p;
}

export async function addScene(id: number, after?: number) {
  await editScenes(id, (scenes) => {
    const at = after == null ? scenes.length : after + 1;
    scenes.splice(at, 0, { label: `Adegan ${scenes.length + 1}`, imagePrompt: "", motionPrompt: "", image: null, clip: null });
    return scenes;
  });
}

export async function removeScene(id: number, index: number) {
  await editScenes(id, (scenes) => {
    if (scenes.length <= 1) throw new Error("Minimal 1 adegan.");
    return scenes.filter((_, i) => i !== index);
  });
}

export async function moveScene(id: number, index: number, dir: -1 | 1) {
  await editScenes(id, (scenes) => {
    const j = index + dir;
    if (j < 0 || j >= scenes.length) return scenes;
    [scenes[index], scenes[j]] = [scenes[j], scenes[index]];
    return scenes;
  });
}

/** Use the user's own picture for a scene (its clip is made from this picture). */
export async function uploadSceneImage(id: number, index: number, form: FormData) {
  const p = await get(id);
  notRunning(p);
  const f = form.get("image");
  if (!(f instanceof File) || !f.size) throw new Error("Pilih gambar dulu.");
  const ext = PHOTO_TYPES[f.type];
  if (!ext) throw new Error("Format gambar harus PNG, JPG, atau WEBP.");
  if (f.size > 12 * 1024 * 1024) throw new Error("Ukuran gambar maksimal 12 MB.");
  if (!p.scenes[index]) throw new Error("Adegan tidak ditemukan.");
  const data = Buffer.from(await f.arrayBuffer());
  const image = await writeMedia(`${p.folder}/gambar/sendiri-${index + 1}-${Date.now().toString(36)}${ext}`, data);
  await addToLibrary(data, ext, f.name);
  await editScenes(id, (scenes) => {
    scenes[index] = { ...scenes[index], image, own: true, clip: null, error: null };
    return scenes;
  });
}


// ---------- library (Pustaka) ----------

export async function getLibrary() {
  const [uploads, generated] = await Promise.all([listUploads(), listGenerated()]);
  return { uploads, generated };
}

/** Use a library picture as a product photo, or as a scene's own image. */
export async function pickFromLibrary(id: number, rel: string, target: { kind: "photo" } | { kind: "scene"; index: number }) {
  const p = await get(id);
  notRunning(p);
  const stamp = Date.now().toString(36);
  if (target.kind === "photo") {
    if (p.product.photos.length >= 3) throw new Error("Maksimal 3 foto produk.");
    const photo = await copyIntoProject(rel, `${p.folder}/produk/foto-${stamp}`);
    await db.update(videoProjects).set({ product: { ...p.product, photos: [...p.product.photos, photo] }, updatedAt: new Date() }).where(eq(videoProjects.id, p.id));
    return;
  }
  if (!p.scenes[target.index]) throw new Error("Adegan tidak ditemukan.");
  const image = await copyIntoProject(rel, `${p.folder}/gambar/pustaka-${target.index + 1}-${stamp}`);
  await editScenes(id, (scenes) => {
    scenes[target.index] = { ...scenes[target.index], image, own: true, clip: null, error: null };
    return scenes;
  });
}

/** Let Gemini (via the Google account) rewrite the storyboard prompts: all scenes, or one when `index` is given. */
export async function aiWriteScenes(id: number, index?: number) {
  const p = await get(id);
  notRunning(p);
  if (!p.scenes.length) throw new Error("Storyboard masih kosong.");
  if (index != null && !p.scenes[index]) throw new Error("Adegan tidak ditemukan.");
  if (!p.product.name.trim()) throw new Error("Isi nama produk dulu supaya AI tahu apa yang dipromosikan.");
  const written = await writeScenes(p, index);
  await editScenes(id, (scenes) => {
    const targets = index != null ? [index] : scenes.map((_, i) => i);
    targets.forEach((t, k) => {
      const w = written[k];
      if (!w || !w.imagePrompt) return;
      // new prompts make the old clip stale; the current image stays until the user re-generates it
      scenes[t] = { ...scenes[t], label: w.label, imagePrompt: w.imagePrompt, motionPrompt: w.motionPrompt, clip: null };
    });
    return scenes;
  });
  return written.length;
}

// ---------- voice-over per project (chosen in the storyboard, before render) ----------

const VoiceInput = z.object({
  voice: z.enum(["flow", "cartesia", "off"]),
  voiceId: z.string().max(80).optional(),
  voiceName: z.string().max(60).optional(),
  voiceSpeed: z.number().min(0.6).max(1.5).optional(),
});

/** Store the project's voice choice. Changing who speaks makes rendered clips stale (they carry the old audio). */
export async function setProjectVoice(id: number, input: z.input<typeof VoiceInput>) {
  const p = await get(id);
  notRunning(p);
  const d = VoiceInput.parse(input);
  if (d.voice === "cartesia" && !getSettings().voice?.cartesiaKey) throw new Error("Masukkan API key Cartesia di Pengaturan AI dulu.");
  const options = { ...p.options, voice: d.voice, voiceId: d.voiceId ?? p.options.voiceId ?? "", voiceName: d.voiceName ?? p.options.voiceName ?? "", voiceSpeed: String(d.voiceSpeed ?? p.options.voiceSpeed ?? 1) };
  const engineChanged = (p.options.voice || "") !== d.voice || (d.voice === "cartesia" && p.options.voiceId !== options.voiceId) || p.options.voiceSpeed !== options.voiceSpeed;
  await db
    .update(videoProjects)
    .set({ options, ...(engineChanged ? { scenes: p.scenes.map((s) => ({ ...s, clip: null })), finalPath: null } : {}), updatedAt: new Date() })
    .where(eq(videoProjects.id, p.id));
}

/** Hear one line in a Cartesia voice (few credits) → data URL for the browser. */
export async function previewVoiceLine(text: string, voiceId: string, speed = 1) {
  const key = getSettings().voice?.cartesiaKey;
  if (!key) throw new Error("Masukkan API key Cartesia di Pengaturan AI dulu.");
  const line = z.string().trim().min(1).max(300).parse(text);
  const wav = await synthesize(key, spoken(line), z.string().min(8).max(80).parse(voiceId), { speed });
  return `data:audio/wav;base64,${wav.toString("base64")}`;
}

// ---- Timeline editor (Hasil) ----

const Num = z.number().finite();
const Anim = z.enum(CAPTION_ANIMS.map((a) => a.id) as [CaptionAnim, ...CaptionAnim[]]);
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const EditInput = z.object({
  clipVolume: Num,
  voiceVolume: Num,
  captions: z.array(z.object({ id: z.string().max(20), start: Num, end: Num, text: z.string().max(200), pos: z.object({ x: Num, y: Num, size: Num }).nullish() })).max(200),
  captionStyle: z.object({
    preset: z.enum(CAPTION_PRESETS.map((x) => x.id) as [CaptionPreset, ...CaptionPreset[]]),
    x: Num.default(0.5),
    y: Num,
    size: Num,
    upper: z.boolean(),
    anim: Anim.default("pop"),
    karaoke: z.boolean().default(false),
    accent: Hex.default("#ffe03d"),
    font: z.enum(CAPTION_FONTS.map((f) => f.id) as [CaptionFont, ...CaptionFont[]]).default("segoe"),
    color: Hex.nullish(),
    box: Hex.nullish(),
    out: z.boolean().default(false),
  }),
  safe: z.object({ top: Num, bottom: Num, left: Num, right: Num }).optional(),
  overlays: z
    .array(z.object({ id: z.string().max(20), kind: z.enum(["judul", "harga", "cta", "info"]), start: Num, end: Num, text: z.string().max(80), x: Num, y: Num, size: Num, anim: Anim }))
    .max(20)
    .optional(),
  fx: z.object({ transition: z.enum(["none", "zoom", "flash", "gelap"]), kenburns: z.boolean() }).optional(),
  voices: z.array(z.object({ id: z.string(), start: Num, speed: Num, volume: Num })).max(50),
  bgm: z.object({ src: z.string(), name: z.string().max(120), dur: Num, volume: Num, offset: Num, fade: z.boolean(), bpm: Num.nullish(), beat: Num.nullish() }).nullable(),
  sfx: z.array(z.object({ id: z.string().max(20), src: z.string().max(300), name: z.string().max(60), start: Num, dur: Num, volume: Num, auto: z.boolean().optional() })).max(200).optional(),
});
type EditPatch = z.input<typeof EditInput>;

/** Only editable values come from the browser; media paths and durations always come from the stored state. */
function mergeEdit(p: Awaited<ReturnType<typeof get>>, patch: EditPatch): ProjectEdit {
  const e = p.edit;
  if (!e) throw new Error("Buka editor dulu.");
  const d = EditInput.parse(patch);
  const D = e.duration;
  if (d.bgm && !d.bgm.src.startsWith(`${p.folder}/musik/`)) throw new Error("File musik tidak valid.");
  return {
    ...e,
    clipVolume: round2(clamp(d.clipVolume, 0, 2)),
    voiceVolume: round2(clamp(d.voiceVolume, 0, 2)),
    captions: d.captions.map((c) => {
      const start = round2(clamp(c.start, 0, D - 0.1));
      const pos = c.pos && { x: round2(clamp(c.pos.x, 0.02, 0.98)), y: round2(clamp(c.pos.y, 0.02, 0.98)), size: clamp(c.pos.size, 0.03, 0.12) };
      return { id: c.id, start, end: round2(clamp(c.end, start + 0.1, D)), text: c.text, ...(pos ? { pos } : {}) };
    }),
    captionStyle: {
      preset: d.captionStyle.preset,
      x: round2(clamp(d.captionStyle.x, 0.02, 0.98)),
      y: clamp(d.captionStyle.y, 0.02, 0.98),
      size: clamp(d.captionStyle.size, 0.03, 0.12),
      upper: d.captionStyle.upper,
      anim: d.captionStyle.anim,
      karaoke: d.captionStyle.karaoke,
      accent: d.captionStyle.accent,
      font: d.captionStyle.font,
      color: d.captionStyle.color ?? null,
      box: d.captionStyle.box ?? null,
      out: d.captionStyle.out,
    },
    overlays: d.overlays
      ? d.overlays.map((o) => {
          const start = round2(clamp(o.start, 0, D - 0.1));
          return { ...o, start, end: round2(clamp(o.end, start + 0.1, D)), x: round2(clamp(o.x, 0.02, 0.98)), y: round2(clamp(o.y, 0.02, 0.98)), size: clamp(o.size, 0.03, 0.14) };
        })
      : (e.overlays ?? []),
    fx: d.fx ?? e.fx ?? DEFAULT_FX,
    safe: d.safe ? { top: clamp(d.safe.top, 0, 0.4), bottom: clamp(d.safe.bottom, 0, 0.4), left: clamp(d.safe.left, 0, 0.4), right: clamp(d.safe.right, 0, 0.4) } : (e.safe ?? DEFAULT_SAFE),
    voices: e.voices.map((v) => {
      const x = d.voices.find((y) => y.id === v.id);
      return x ? { ...v, start: round2(clamp(x.start, 0, D - 0.1)), speed: round2(clamp(x.speed, 0.5, 2)), volume: round2(clamp(x.volume, 0, 2)) } : v;
    }),
    bgm: d.bgm && { ...d.bgm, volume: round2(clamp(d.bgm.volume, 0, 2)), offset: round2(clamp(d.bgm.offset, 0, Math.max(0, d.bgm.dur - 0.5))) },
    // sound effects: built-in ones or files inside this project only
    sfx: d.sfx
      ? d.sfx
          .filter((x) => x.src.startsWith(`${SFX_DIR}/`) || x.src.startsWith(`${p.folder}/`))
          .filter((x) => !x.src.includes(".."))
          .map((x) => ({ ...x, start: round2(clamp(x.start, 0, D - 0.05)), volume: round2(clamp(x.volume, 0, 2)) }))
      : (e.sfx ?? []),
  };
}

/** Open the editor: builds the voice-free base video the first time (or after clips changed). */
export async function openEditor(id: number) {
  const p = await get(id);
  if (p.status === "running") throw new Error("Proyek sedang diproses.");
  const edit = await prepareEdit(p);
  if (edit !== p.edit) await db.update(videoProjects).set({ edit }).where(eq(videoProjects.id, p.id));
  return edit;
}

export async function saveEdit(id: number, patch: EditPatch) {
  const p = await get(id);
  await db.update(videoProjects).set({ edit: mergeEdit(p, patch) }).where(eq(videoProjects.id, p.id));
}

const AUDIO_TYPES: Record<string, string> = { "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/wave": ".wav", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a", "audio/aac": ".aac", "audio/ogg": ".ogg" };

export async function uploadMusic(id: number, form: FormData) {
  const p = await get(id);
  const f = form.get("music");
  if (!(f instanceof File) || !f.size) throw new Error("Pilih file musik.");
  const ext = AUDIO_TYPES[f.type] ?? (/\.(mp3|wav|m4a|aac|ogg)$/i.exec(f.name)?.[0].toLowerCase() || null);
  if (!ext) throw new Error("Format musik harus MP3, WAV, M4A, AAC, atau OGG.");
  if (f.size > 25 * 1024 * 1024) throw new Error("Ukuran musik maksimal 25 MB.");
  // goes into the shared library first (tempo detected once), then a copy into this project
  const item = await addMusic(Buffer.from(await f.arrayBuffer()), f.name, ext);
  const m = await copyMusicToProject(item.src, p.folder);
  return { src: m.src, name: m.name, dur: m.dur, volume: 0.2, offset: 0, fade: true, bpm: m.bpm, beat: m.beat };
}

// ---- audio library (Pustaka): music + built-in sound effects ----

export async function audioLibrary() {
  const [music, sfx] = await Promise.all([listMusic(), ensureSfx()]);
  return { music, sfx };
}

export async function pickLibraryMusic(id: number, src: string) {
  const p = await get(id);
  const m = await copyMusicToProject(z.string().max(300).parse(src), p.folder);
  return { src: m.src, name: m.name, dur: m.dur, volume: 0.2, offset: 0, fade: true, bpm: m.bpm, beat: m.beat };
}

export async function deleteLibraryMusic(src: string) {
  await removeMusic(z.string().max(300).parse(src));
  return listMusic();
}

// ---- one-take voice-over & fitting clips to the voice ----

export async function draftFullScript(id: number, patch: EditPatch, wish = "") {
  const p = await get(id);
  return writeFullScript(p, mergeEdit(p, patch), z.string().max(300).parse(wish));
}

export async function makeFullVoice(id: number, patch: EditPatch, script: string, words = 2) {
  const p = await get(id);
  const text = z.string().trim().min(10, "Naskah terlalu pendek.").max(2000).parse(script);
  const r = await fullVoiceOver(p, mergeEdit(p, patch), text, z.number().int().min(1).max(6).parse(words));
  await db.update(videoProjects).set({ edit: r.edit }).where(eq(videoProjects.id, p.id));
  return r;
}

export async function fitToVoice(id: number, patch: EditPatch) {
  const p = await get(id);
  const edit = await fitClipsToVoice(p, mergeEdit(p, patch));
  await db.update(videoProjects).set({ edit }).where(eq(videoProjects.id, p.id));
  return edit;
}

export async function undoFit(id: number) {
  const p = await get(id);
  const before = p.edit?.beforeFit;
  if (!before) throw new Error("Tidak ada potongan untuk dibatalkan.");
  const edit = { ...before, beforeFit: null };
  await db.update(videoProjects).set({ edit }).where(eq(videoProjects.id, p.id));
  return edit;
}

export async function aiEditTimeline(id: number, patch: EditPatch, instruction: string) {
  const p = await get(id);
  if (!instruction.trim()) throw new Error("Tulis dulu apa yang mau diubah.");
  const current = mergeEdit(p, patch);
  const { edit, note } = await aiAdjustEdit(p, current, instruction);
  await db.update(videoProjects).set({ edit }).where(eq(videoProjects.id, p.id));
  return { edit, note };
}

/** AI Director: three complete versions with different angles. Nothing is saved until the user picks one. */
export async function aiDirector(id: number, patch: EditPatch, wish: string) {
  const p = await get(id);
  const current = mergeEdit(p, patch);
  // one after another: all calls share the same Gemini browser profile (parallel calls break each other)
  const ok: Awaited<ReturnType<typeof aiAdjustEdit>>[] = [];
  let lastError = "AI Director gagal. Coba lagi.";
  for (const angle of [0, 1, 2]) {
    try {
      ok.push(await aiAdjustEdit(p, current, wish.slice(0, 600), { director: true, angle }));
    } catch (e) {
      lastError = e instanceof Error ? e.message : lastError;
    }
  }
  if (!ok.length) throw new Error(lastError);
  return ok;
}

// ---- Edit templates ("gaya brand"), kept in settings.json ----

export async function listEditTemplates(): Promise<EditTemplate[]> {
  return getSettings().editTemplates ?? [];
}

export async function saveEditTemplate(id: number, patch: EditPatch, name: string) {
  const p = await get(id);
  const t = toTemplate(mergeEdit(p, patch), z.string().trim().min(1).max(40).parse(name));
  const list = [t, ...(getSettings().editTemplates ?? []).filter((x) => x.name !== t.name)].slice(0, 30);
  updateSettings({ editTemplates: list });
  return list;
}

export async function deleteEditTemplate(templateId: string) {
  const list = (getSettings().editTemplates ?? []).filter((x) => x.id !== templateId);
  updateSettings({ editTemplates: list });
  return list;
}

const Overlay = z.array(z.object({ start: Num, end: Num, x: Num, y: Num, w: Num.default(0), h: Num.default(0), anim: Anim.optional(), out: z.boolean().optional(), png: z.string().startsWith("data:image/png;base64,").max(3_000_000) })).max(500);

export async function exportTimeline(id: number, patch: EditPatch, overlays: z.input<typeof Overlay>) {
  const p = await get(id);
  if (p.status === "running") throw new Error("Proyek sedang diproses.");
  const edit = mergeEdit(p, patch);
  const finalPath = await exportEdit(p, edit, Overlay.parse(overlays));
  await db.update(videoProjects).set({ edit: { ...edit, exportedAt: Date.now() }, finalPath, updatedAt: new Date() }).where(eq(videoProjects.id, p.id));
  revalidatePath(`/video/${p.id}`);
}
