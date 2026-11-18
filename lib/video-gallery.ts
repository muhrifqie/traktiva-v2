import "server-only";
import fs from "node:fs/promises";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, posts, videoProjects } from "@/lib/db/schema";
import { resolveMedia } from "@/lib/media";
import { isVideosMode, presetById, projectName, videoFile } from "@/lib/presets";

// Galeri Video: every finished video, straight from the projects, so a video shows up the moment its
// render is done (no separate copy or "save to gallery" step). "videos"-mode projects give one entry
// per finished variant (video-N.mp4); classic projects their final.mp4.

export type GalleryVideo = {
  rel: string; // MEDIA_DIR-relative file
  label: string; // variant name, or "Video final"
  project: string;
  projectId: number;
  concept: string;
  sec: number | null; // length of one video when known
  at: number; // when the file was written (ms)
  size: number; // bytes
  caption: string; // project caption (prefills the posting dialog)
  productId: string | null; // TikTok Shop product of the project (prefills the yellow basket)
  posts: { status: string; username: string }[]; // where this file was posted / is queued
};

export async function listFinishedVideos(): Promise<GalleryVideo[]> {
  const rows = await db.select().from(videoProjects).orderBy(desc(videoProjects.updatedAt));
  const postRows = await db.select({ video: posts.video, status: posts.status, username: accounts.username }).from(posts).innerJoin(accounts, eq(accounts.id, posts.accountId));
  const postsOf = (rel: string) => postRows.filter((r) => r.video === rel && r.status !== "cancelled").map(({ status, username }) => ({ status, username }));
  const candidates: Omit<GalleryVideo, "at" | "size" | "posts">[] = [];
  for (const p of rows) {
    const base = { project: projectName(p), projectId: p.id, concept: presetById(p.presetId)?.title ?? "Proyek", caption: p.caption ?? "", productId: p.options.productId ?? null };
    if (isVideosMode(p.options)) {
      p.scenes.forEach((s, i) => s.clip && candidates.push({ ...base, rel: videoFile(p.folder, i), label: s.label, sec: p.clipSec }));
    } else if (p.finalPath) {
      candidates.push({ ...base, rel: p.finalPath, label: "Video final", sec: null });
    }
  }
  // only files that really exist (a re-render or a deleted folder can leave stale paths)
  const found = await Promise.all(
    candidates.map(async (c): Promise<GalleryVideo | null> => {
      const st = await fs.stat(resolveMedia(c.rel)).catch(() => null);
      return st?.isFile() ? { ...c, at: st.mtimeMs, size: st.size, posts: postsOf(c.rel) } : null;
    }),
  );
  return found.filter((x): x is GalleryVideo => !!x).sort((a, b) => b.at - a.at);
}
