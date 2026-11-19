import "server-only";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { videoProjects, type ProjectScene, type VideoProject } from "@/lib/db/schema";
import { generateFlowImage, generateFlowVideo, type Progress } from "@/lib/flow2api";
import { synthesize } from "@/lib/cartesia";
import { mediaDataUrl, mixVoiceOver, resolveMedia, saveResult, writeMedia } from "@/lib/media";
import { getSettings, writingRules } from "@/lib/settings";
import { applyRules } from "@/lib/writing";
import { projectVoice, spoken, voiceLine, withoutVoice } from "@/lib/voice";
import { isSilent } from "@/lib/presets";
import { checkSceneImages } from "@/lib/prompt-writer";
import { withSlot } from "@/lib/video";

// Project pipeline: product photos → one image per scene (Nano Banana) → one clip per scene image
// (Omni reference mode) → ffmpeg concat into final.mp4. Scenes run in parallel through the shared
// generation slots (lib/video withSlot); each scene carries its own live state for the UI.

const run = promisify(execFile);

// Appended to every prompt (AI-written or typed by the user) to protect what AI models break most often.
const IMAGE_GUARD =
  "The product, its brand logo and every printed letter must match the reference photos exactly (same spelling, font, color, size and position); " +
  "do not add any other text, logos, labels or watermarks. Anatomically correct hands with five fingers. Vertical 9:16.";
const CLIP_GUARD =
  "One continuous shot starting exactly from the reference frame, no cuts. Smooth real-time motion with no sudden changes. " +
  "The product keeps the exact same shape, size, color and logo for the whole clip: no morphing, flickering or duplicating, nothing appears or disappears. " +
  "Consistent lighting and background, natural hand anatomy, gentle handheld camera. Vertical 9:16.";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

// Errors that will not fix themselves by trying again (retrying would only burn credits).
const PERMANENT = /kredit|credit|sesi akun google habis|login ulang|policy|kebijakan|safety|blocked|diblokir|tidak pantas|invalid prompt|API key|ditolak \(4(01|03)\)/i;
const BACKOFF_S = [5, 10, 20, 30];

/**
 * Retry a flaky generation step (Flow captcha/queue hiccups, timeouts, empty results) up to `max` attempts,
 * with growing pauses. Permanent errors (credits, session, content policy) fail at once.
 */
export async function withRetry<T>(fn: () => Promise<T>, onStage: Progress, max = 5): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (attempt === max || PERMANENT.test(errMsg(e))) break;
      const wait = BACKOFF_S[Math.min(attempt - 1, BACKOFF_S.length - 1)];
      onStage(`Gagal, coba lagi ${attempt + 1}/${max} dalam ${wait} dtk...`, 0);
      await new Promise((r) => setTimeout(r, wait * 1000));
      onStage(`Percobaan ${attempt + 1}/${max}...`);
    }
  }
  const msg = errMsg(last);
  throw new Error(PERMANENT.test(msg) ? msg : `${msg} (sudah dicoba ${max}×)`);
}

async function load(id: number) {
  return db.select().from(videoProjects).where(eq(videoProjects.id, id)).get();
}
async function save(id: number, set: Partial<VideoProject>) {
  await db.update(videoProjects).set({ ...set, updatedAt: new Date() }).where(eq(videoProjects.id, id));
}

/**
 * In-memory scenes for one run + serialized, throttled writes. Parallel workers patch their own scene;
 * the whole array is written in order so no worker overwrites another's result.
 */
function sceneStore(id: number, scenes: ProjectScene[], kind: "Gambar" | "Klip", targets: number[]) {
  let chain = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const summary = () => {
    const done = targets.filter((i) => scenes[i].state === "done").length;
    const working = targets.filter((i) => scenes[i].state === "working").length;
    return `${kind} ${done}/${targets.length} selesai${working ? ` · ${working} sedang dibuat` : ""}`;
  };
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    const snapshot = scenes.map((s) => ({ ...s }));
    const progress = summary();
    chain = chain.then(() => save(id, { scenes: snapshot, progress })).catch(() => {});
    return chain;
  };
  return {
    scenes,
    patch(i: number, p: Partial<ProjectScene>, now = false) {
      scenes[i] = { ...scenes[i], ...p };
      if (now) return flush();
      timer ??= setTimeout(flush, 1500); // stream status lines arrive many times per second
      return chain;
    },
    flush,
  };
}

/** Generate scene images. `only` = a single scene index (re-roll); otherwise every scene. */
export function queueImages(id: number, only?: number) {
  return start(id, () => runImages(id, only));
}

/** Generate missing clips, then join them into final.mp4. */
export function queueRender(id: number) {
  return start(id, () => runRender(id));
}

async function start(id: number, task: () => Promise<void>) {
  await save(id, { status: "running", progress: "Menyiapkan...", error: null });
  void task().catch((e) => save(id, { status: "failed", progress: null, error: errMsg(e) }));
}

const now = () => Date.now();

/** Run `work` for each target scene in parallel (bounded by generation slots), tracking per-scene state. */
async function eachScene(
  store: ReturnType<typeof sceneStore>,
  targets: number[],
  work: (i: number, onStage: Progress) => Promise<Partial<ProjectScene>>,
) {
  const t = now();
  for (const i of targets) store.patch(i, { state: "queued", stage: "Antre", pct: null, error: null, queuedAt: t, startedAt: null, finishedAt: null });
  await store.flush();
  await Promise.all(
    targets.map((i) =>
      withSlot(async () => {
        await store.patch(i, { state: "working", stage: "Mengirim ke Flow...", pct: 2, startedAt: now() }, true);
        try {
          const result = await work(i, (line, pct) => void store.patch(i, pct == null ? { stage: line } : { stage: line, pct }));
          await store.patch(i, { ...result, state: "done", stage: null, pct: 100, finishedAt: now() }, true);
        } catch (e) {
          await store.patch(i, { state: "failed", stage: null, pct: null, error: errMsg(e), finishedAt: now() }, true);
        }
      }),
    ),
  );
  return targets.filter((i) => store.scenes[i].state === "failed").length;
}

async function runImages(id: number, only?: number) {
  const p = await load(id);
  if (!p) return;
  const refs = await Promise.all(p.product.photos.slice(0, 3).map(mediaDataUrl));
  // "generate all" leaves the user's own images alone; an explicit re-roll replaces one
  const targets = only != null ? [only].filter((i) => p.scenes[i]) : p.scenes.map((s, i) => (s.own && s.image ? -1 : i)).filter((i) => i >= 0);
  if (!targets.length) return save(id, { status: "draft", progress: null });
  const store = sceneStore(id, p.scenes.map((s) => ({ ...s })), "Gambar", targets);

  const failed = await eachScene(store, targets, async (i, onStage) => {
    // product photos keep the product exact; a style frame (from a reference video) guides the shot
    const style = store.scenes[i].styleRef ? [await mediaDataUrl(store.scenes[i].styleRef!).catch(() => null)].filter(Boolean) as string[] : [];
    const sceneRefs = [...refs.slice(0, style.length ? 2 : 3), ...style];
    const url = await withRetry(() => generateFlowImage(`${store.scenes[i].imagePrompt} ${IMAGE_GUARD}`, sceneRefs, onStage), onStage);
    onStage("Menyimpan gambar...", 97);
    // new name each time so the browser never shows a cached older take
    const image = await saveResult(url, `${p.folder}/gambar/adegan-${i + 1}-${now().toString(36)}`, ".png");
    return { image, own: false, clip: null, check: null };
  });
  await store.flush();
  // QC: Gemini compares the new images with the product photos before anyone spends a clip render on them
  const made = targets.filter((i) => store.scenes[i].state === "done" && store.scenes[i].image);
  if (made.length) {
    await save(id, { progress: "Gemini mengecek gambar dengan foto produk..." });
    const fresh = await load(id);
    const checks = fresh ? await checkSceneImages({ ...fresh, scenes: store.scenes }, made).catch(() => new Map()) : new Map();
    for (const [i, c] of checks) store.patch(i, { check: c });
    await store.flush();

    // auto-fix once: a scene whose product doesn't match is redrawn from the product photos only (no style frame),
    // with the checker's note as the correction, then checked again. Costs one extra image per failed scene.
    const bad = made.filter((i) => checks.get(i)?.ok === false);
    if (bad.length && refs.length) {
      await save(id, { progress: `Memperbaiki ${bad.length} gambar yang produknya beda dari foto...` });
      const fixStore = sceneStore(id, store.scenes, "Gambar", bad);
      await eachScene(fixStore, bad, async (i, onStage) => {
        const note = checks.get(i)?.note ?? "";
        const fix = `${fixStore.scenes[i].imagePrompt} ${IMAGE_GUARD} CORRECTION: the previous attempt got the product wrong (${note.slice(0, 200)}). Copy the product EXACTLY from the reference photos: same shape, parts, colour variant and logo; exactly one product.`;
        const url = await withRetry(() => generateFlowImage(fix, refs.slice(0, 3), onStage), onStage);
        const image = await saveResult(url, `${p.folder}/gambar/adegan-${i + 1}-fix-${now().toString(36)}`, ".png");
        return { image, own: false, clip: null, check: null };
      });
      await fixStore.flush();
      const fixed = bad.filter((i) => fixStore.scenes[i].state === "done");
      if (fixed.length) {
        await save(id, { progress: "Gemini mengecek ulang gambar yang diperbaiki..." });
        const again = await load(id);
        const second = again ? await checkSceneImages({ ...again, scenes: fixStore.scenes }, fixed).catch(() => new Map()) : new Map();
        for (const [i, c] of second) fixStore.patch(i, { check: c.ok ? c : { ok: false, note: `${c.note} (sudah diperbaiki 1x; coba "Pakai foto asli")` } });
        await fixStore.flush();
      }
    }
  }
  await save(id, {
    status: failed ? "failed" : "draft",
    progress: null,
    error: failed ? `${failed} gambar gagal dibuat. Ubah prompt atau buat ulang adegan itu.` : null,
  });
}

async function runRender(id: number) {
  const p = await load(id);
  if (!p) return;
  if (p.scenes.some((s) => !s.image)) throw new Error("Semua adegan perlu gambar dulu.");
  const silent = isSilent(p.presetId, p.options);
  const model = `omni-1.2-flash-${p.clipSec}s-portrait`;
  // voice-over by Cartesia: Flow renders the clip without speech, the line is spoken by Cartesia and mixed in
  // the project's own voice choice (storyboard) wins over the app default (Pengaturan AI)
  const defaults = getSettings().voice ?? { provider: "flow" };
  const pv = projectVoice(p.options, defaults);
  const cartesia = !silent && pv.choice === "cartesia" && defaults.cartesiaKey && pv.voiceId ? { key: defaults.cartesiaKey, voiceId: pv.voiceId, speed: pv.speed } : null;
  const targets = p.scenes.map((s, i) => (s.clip ? -1 : i)).filter((i) => i >= 0); // finished clips are kept
  const store = sceneStore(id, p.scenes.map((s) => ({ ...s })), "Klip", targets);

  const failed = await eachScene(store, targets, async (i, onStage) => {
    const s = store.scenes[i];
    const line = voiceLine(s.motionPrompt);
    const motion = cartesia ? `${withoutVoice(s.motionPrompt)} No one speaks: no talking, no voice-over, no lip-sync; only soft natural ambient sound.` : s.motionPrompt;
    const frame = await mediaDataUrl(s.image!);
    const url = await withRetry(() => generateFlowVideo(model, `${motion} ${CLIP_GUARD}`, onStage, [frame]), onStage);
    onStage("Mengunduh klip...", 95);
    const stamp = now().toString(36);
    const raw = await saveResult(url, `${p.folder}/klip/adegan-${i + 1}-${stamp}`, ".mp4");
    if (!cartesia || !line) return { clip: raw };
    onStage("Membuat suara (Cartesia)...", 97);
    const wav = await writeMedia(`${p.folder}/suara/adegan-${i + 1}-${stamp}.wav`, await withRetry(() => synthesize(cartesia.key, spoken(applyRules(line, writingRules())), cartesia.voiceId, { speed: cartesia.speed }), onStage, 3));
    onStage("Menggabung suara ke klip...", 98);
    return { clip: await mixVoiceOver(raw, wav, `${p.folder}/klip/adegan-${i + 1}-${stamp}-vo.mp4`) };
  });
  await store.flush();
  if (failed) throw new Error(`${failed} klip gagal dibuat. Render lagi untuk mencoba ulang (klip yang sudah jadi tidak dibuat ulang).`);

  await save(id, { progress: "Menggabungkan klip..." });
  const finalPath = `${p.folder}/final.mp4`;
  await concat(store.scenes.map((s) => resolveMedia(s.clip!)), resolveMedia(finalPath), silent);
  await save(id, { status: "done", progress: null, error: null, finalPath, step: 6 });
}

/** Join clips with ffmpeg (re-encode so clips with slightly different params still join cleanly). */
export async function concat(files: string[], out: string, silent: boolean) {
  if (!ffmpegPath) throw new Error("ffmpeg tidak tersedia di perangkat ini.");
  const list = `${out}.txt`;
  await fs.writeFile(list, files.map((f) => `file '${f.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
  try {
    await run(ffmpegPath, [
      "-y", "-f", "concat", "-safe", "0", "-i", list,
      // near-lossless: this file is the editor's base and gets encoded again on export (avoid losing detail twice)
      "-c:v", "libx264", "-preset", "fast", "-crf", "14", "-pix_fmt", "yuv420p",
      ...(silent ? ["-an"] : ["-c:a", "aac", "-b:a", "192k"]),
      // clean export: drop container/stream tags carried over from the source clips (vendor handler names,
      // encoder strings, creation times, chapters) — like a normal "export" from a video editor
      "-map_metadata", "-1", "-map_chapters", "-1",
      "-metadata:s:v:0", "handler_name=VideoHandler", ...(silent ? [] : ["-metadata:s:a:0", "handler_name=SoundHandler"]),
      "-fflags", "+bitexact", "-flags:v", "+bitexact", ...(silent ? [] : ["-flags:a", "+bitexact"]),
      "-movflags", "+faststart", out,
    ], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  } finally {
    await fs.rm(list, { force: true });
  }
}
