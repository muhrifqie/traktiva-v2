"use server";

import { spawn } from "node:child_process";
import fs from "node:fs";
import { z } from "zod";
import { resolveMedia } from "@/lib/media";
import { updateSettings } from "@/lib/settings";
import { cancelRender, editorJob, GAMEPLAY_DIR, listGameplay, listResults, renderPreview, SIZES, startRender, type EditorSettings } from "@/lib/youtube-editor";

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
  layout: z.enum(["side", "stack"]),
  size: z.enum(Object.keys(SIZES) as [keyof typeof SIZES, ...(keyof typeof SIZES)[]]),
  ratio: z.union([z.literal(50), z.literal(60), z.literal(70)]),
  fitOriginal: z.enum(["cover", "contain"]),
  fitGame: z.enum(["cover", "contain"]),
  fill: z.enum(["blur", "black", "white"]),
});

/** Save the Editor configuration in settings.json (not only this browser). */
export async function saveEditorSettings(settings: EditorSettings) {
  updateSettings({ youtubeEditor: Settings.parse(settings) });
}

export const previewFrame = async (original: string, gameplay: string, settings: EditorSettings) =>
  safe(async () => {
    const [o, g] = [Rel.parse(original), Rel.parse(gameplay)];
    return renderPreview(resolveMedia(o), resolveMedia(g), Settings.parse(settings));
  });

export const renderVideos = async (input: { originals: string[]; gameplay: string[]; settings: EditorSettings; random: boolean }) =>
  safe(async () => {
    const d = z.object({ originals: z.array(Rel).min(1).max(200), gameplay: z.array(Rel).max(50), settings: Settings, random: z.boolean() }).parse(input);
    for (const rel of [...d.originals, ...d.gameplay]) if (!fs.existsSync(resolveMedia(rel))) throw new Error(`File tidak ditemukan: ${rel}`);
    return startRender(d);
  });

export const renderStatus = async () => editorJob();
export const stopRender = async () => cancelRender();
export const refreshLists = async () => ({ gameplay: listGameplay(), results: listResults() });

/** Open a media folder in the OS file manager (the server runs on the user's own PC). */
export async function openMediaFolder(which: "gameplay" | "results") {
  const abs = which === "gameplay" ? GAMEPLAY_DIR() : resolveMedia("YouTube Editor");
  fs.mkdirSync(abs, { recursive: true });
  const cmd = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  spawn(cmd, [abs], { detached: true, stdio: "ignore" }).unref();
}
