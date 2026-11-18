import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "@/lib/db";

// Step-by-step log of every posting attempt (one JSON line per step), so the user can see how far a post
// got and the proof of any error: data/post-logs/<postId>.jsonl. Screenshots live in data/tiktok-debug and
// are served by /api/post-shot/<file>.

const LOG_DIR = path.join(/* turbopackIgnore: true */ DATA_DIR, "post-logs");
export const SHOT_DIR = path.join(/* turbopackIgnore: true */ DATA_DIR, "tiktok-debug");

export type LogLevel = "info" | "ok" | "warn" | "error";
export type LogEntry = { t: number; msg: string; level: LogLevel; attempt?: number; shot?: string /* file name in SHOT_DIR */ };

const file = (postId: number) => path.join(LOG_DIR, `${postId}.jsonl`);

export async function appendPostLog(postId: number, e: Omit<LogEntry, "t"> & { t?: number }) {
  await fs.mkdir(LOG_DIR, { recursive: true });
  const entry: LogEntry = { t: e.t ?? Date.now(), msg: e.msg.slice(0, 2000), level: e.level, ...(e.attempt ? { attempt: e.attempt } : {}), ...(e.shot ? { shot: path.basename(e.shot) } : {}) };
  await fs.appendFile(file(postId), `${JSON.stringify(entry)}\n`);
}

export async function readPostLog(postId: number): Promise<LogEntry[]> {
  const text = await fs.readFile(file(postId), "utf8").catch(() => "");
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as LogEntry;
      } catch {
        return null;
      }
    })
    .filter((x): x is LogEntry => !!x);
}

export async function deletePostLog(postId: number) {
  await fs.rm(file(postId), { force: true });
}

/** Pull "(screenshot: <path>)" out of an error message → [clean message, screenshot path]. */
export function splitShot(msg: string): [string, string | undefined] {
  const m = msg.match(/\s*\(screenshot: ([^)]+)\)/);
  return m ? [msg.replace(m[0], "").trim(), m[1]] : [msg, undefined];
}
