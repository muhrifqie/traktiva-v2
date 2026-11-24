"use server";

import { spawn } from "node:child_process";
import { z } from "zod";
import { resolveMedia } from "@/lib/media";
import { downloadJob, listChannelShorts, startDownload, updateYtdlp } from "@/lib/youtube";

// Errors come back as { error } so the page can show the message (thrown server-action errors are hidden in production).
const safe = async <T,>(f: () => Promise<T>) => {
  try {
    return { ok: await f() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
};

export const readChannel = async (input: string) => safe(() => listChannelShorts(z.string().max(300).parse(input)));

export const downloadShorts = async (handle: string, ids: string[]) =>
  safe(() => startDownload({ handle: z.string().max(120).parse(handle), ids: z.array(z.string().regex(/^[\w-]{6,20}$/)).max(5000).parse(ids) }));

export const downloadStatus = async () => downloadJob();

export const updateDownloader = async () => safe(updateYtdlp);

/** Open the channel's download folder in the OS file manager (the server runs on the user's own PC). */
export async function openShortsFolder(rel: string) {
  const abs = resolveMedia(z.string().max(300).parse(rel));
  const cmd = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  spawn(cmd, [abs], { detached: true, stdio: "ignore" }).unref();
}
