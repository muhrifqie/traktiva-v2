"use server";

import { spawn } from "node:child_process";
import fs from "node:fs";
import { z } from "zod";
import { addMusic, listMusic } from "@/lib/audio-library";
import { resolveMedia } from "@/lib/media";
import { updateSettings } from "@/lib/settings";
import { cancelRender, editorJob, GAMEPLAY_DIR, listGameplay, listRendered, listResults, probe, renderPreview, renderPreviewClip, SIZES, startRender, type EditorSettings } from "@/lib/youtube-editor";

// errors come back as { error } (thrown server-action errors are hidden in production)
const safe = async <T,>(f: () => Promise<T>) => {
  try {
    return { ok: await f() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
};
const Rel = z.string().min(3).max(400);
const Settings = z.object({
  layout: z.enum(["side", "stack", "pip"]),
  size: z.enum(Object.keys(SIZES) as [keyof typeof SIZES, ...(keyof typeof SIZES)[]]),
  ratio: z.number().int().min(20).max(80),
  fitOriginal: z.enum(["cover", "contain"]),
  fitGame: z.enum(["cover", "contain"]),
  fill: z.enum(["blur", "black", "white"]),
  pipMain: z.enum(["original", "game"]),
  pipX: z.number().min(0).max(100),
  pipY: z.number().min(0).max(100),
  pipSize: z.number().int().min(15).max(90),
  pipShape: z.enum(["rect", "round", "circle"]),
  pipAspect: z.enum(["9:16", "3:4", "1:1", "4:3", "16:9"]),
  pipZoom: z.number().int().min(100).max(300),
  pipFocusX: z.number().min(0).max(100),
  pipFocusY: z.number().min(0).max(100),
  pipBorder: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  pipBorderColor: z.enum(["white", "black"]),
  gameStart: z.number().min(-1).max(36_000),
  music: z.string().max(300),
  volMusic: z.number().int().min(0).max(100),
  volOriginal: z.number().int().min(0).max(150),
  volGame: z.number().int().min(0).max(100),
  flipOriginal: z.enum(["none", "h", "v", "hv"]),
  flipGame: z.enum(["none", "h", "v", "hv"]),
  seam: z.union([z.literal(0), z.literal(24), z.literal(64)]),
});

/** Save the Editor configuration in settings.json (not only this browser). */
export async function saveEditorSettings(settings: EditorSettings) {
  updateSettings({ youtubeEditor: Settings.parse(settings) });
}

export const previewFrame = async (original: string, gameplay: string, settings: EditorSettings, at = 2) =>
  safe(async () => {
    const [o, g] = [Rel.parse(original), Rel.parse(gameplay)];
    return renderPreview(resolveMedia(o), resolveMedia(g), Settings.parse(settings), z.number().min(0).max(36_000).parse(at));
  });

/** A 6 s clip with sound of the result from `at`, to play on the monitor. */
export const previewClip = async (original: string, gameplay: string, settings: EditorSettings, at = 0) =>
  safe(async () => {
    const [o, g] = [Rel.parse(original), Rel.parse(gameplay)];
    return renderPreviewClip(resolveMedia(o), resolveMedia(g), Settings.parse(settings), z.number().min(0).max(36_000).parse(at));
  });

/** Lengths (s) of the clips on the timeline. */
export const clipLengths = async (rels: string[]) => {
  const list = z.array(Rel).max(200).parse(rels);
  const out: Record<string, number> = {};
  for (const rel of list) out[rel] = (await probe(resolveMedia(rel)).catch(() => ({ len: 0 }))).len;
  return out;
};

export const renderVideos = async (input: { originals: string[]; gameplay: string[]; settings: EditorSettings; random: boolean }) =>
  safe(async () => {
    const d = z.object({ originals: z.array(Rel).min(1).max(200), gameplay: z.array(Rel).max(50), settings: Settings, random: z.boolean() }).parse(input);
    for (const rel of [...d.originals, ...d.gameplay]) if (!fs.existsSync(resolveMedia(rel))) throw new Error(`File tidak ditemukan: ${rel}`);
    return startRender(d);
  });

export const renderStatus = async () => editorJob();

// ---- music: the shared Pustaka library (same tracks as in Buat Video) ----
export const musicList = async () => (await listMusic()).map((m) => ({ src: m.src, name: m.name, dur: m.dur }));
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg)$/i;
export const uploadEditorMusic = async (form: FormData) =>
  safe(async () => {
    const f = form.get("music");
    if (!(f instanceof File) || !f.size) throw new Error("Pilih file musik.");
    const ext = AUDIO_EXT.exec(f.name)?.[0].toLowerCase();
    if (!ext) throw new Error("Format musik harus MP3, WAV, M4A, AAC, atau OGG.");
    if (f.size > 25 * 1024 * 1024) throw new Error("Ukuran musik maksimal 25 MB.");
    const m = await addMusic(Buffer.from(await f.arrayBuffer()), f.name, ext);
    return { src: m.src, name: m.name, dur: m.dur };
  });
export const stopRender = async () => cancelRender();
export const refreshLists = async () => ({ gameplay: listGameplay(), results: listResults(), rendered: listRendered() });

/** Open a media folder in the OS file manager (the server runs on the user's own PC). */
export async function openMediaFolder(which: "gameplay" | "results") {
  const abs = which === "gameplay" ? GAMEPLAY_DIR() : resolveMedia("YouTube Editor");
  fs.mkdirSync(abs, { recursive: true });
  const cmd = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  spawn(cmd, [abs], { detached: true, stdio: "ignore" }).unref();
}
