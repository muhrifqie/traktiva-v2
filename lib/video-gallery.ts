import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { desc, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { uploadJobs, videoProjects, type VideoProject } from "@/lib/db/schema";
import { MEDIA_DIR, resolveMedia } from "@/lib/media";
import { projectName } from "@/lib/presets";

// Galeri Video: every exported final (and hook variant) is kept in MEDIA_DIR/Galeri Video as a hard link — no extra
// disk space, and it survives deleting its project. One entry per project + label (a new export replaces the old
// one). A small JSON sidecar keeps what the gallery shows (title, hook, caption, product).

export const VIDEO_GALLERY = "Galeri Video";
export type GalleryVideo = {
  rel: string; // MEDIA_DIR-relative mp4 in the gallery
  projectId: number | null;
  title: string;
  label: string; // "Video utama" | "Varian A" …
  hook: string | null;
  caption: string;
  productId: string | null;
  sizeMb: number;
  at: number; // export time
  status: "baru" | "terjadwal" | "terposting" | "gagal";
  scheduledAt: number | null;
  postedAt: number | null;
  views: number | null;
};
type Meta = Pick<GalleryVideo, "projectId" | "title" | "label" | "hook" | "caption" | "productId"> & { at: number; source: string };

const slug = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
const labelOf = (file: string) => (file.match(/^final-([A-D])\.mp4$/) ? `Varian ${file.match(/^final-([A-D])/)![1]}` : "Video utama");

/** Keep an exported file in the gallery (called after every export). Never throws: the export itself already succeeded. */
export async function archiveExport(p: VideoProject, rel: string, hook?: string | null) {
  try {
    const dir = path.join(MEDIA_DIR, VIDEO_GALLERY);
    await fs.mkdir(dir, { recursive: true });
    const label = labelOf(path.basename(rel));
    const key = `p${p.id}-${label === "Video utama" ? "utama" : label.slice(-1)}`;
    // replace this project's previous export of the same label
    for (const f of await fs.readdir(dir)) if (f.startsWith(`${key} `)) await fs.rm(path.join(dir, f), { force: true });
    const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
    const name = `${key} ${day} ${slug(projectName(p))}`;
    const dest = path.join(dir, `${name}.mp4`);
    await fs.link(resolveMedia(rel), dest).catch(() => fs.copyFile(resolveMedia(rel), dest)); // other drive: copy
    const meta: Meta = {
      projectId: p.id,
      title: projectName(p),
      label,
      hook: hook ?? (label === "Video utama" ? firstLine(p.edit?.voices[0]?.text) : null),
      caption: p.caption ?? "",
      productId: p.folder.match(/kalo-(\d{10,22})/)?.[1] ?? null,
      at: Date.now(),
      source: rel,
    };
    await fs.writeFile(path.join(dir, `${name}.json`), JSON.stringify(meta));
  } catch (e) {
    console.warn("[galeri video]", e instanceof Error ? e.message : e);
  }
}

const firstLine = (t?: string | null) => (t ?? "").trim().match(/^.+?[.!?](?:\s|$)/)?.[0]?.trim() ?? null;

/** First visit: put the finals that already exist into the gallery. */
async function backfill(dir: string) {
  if (await fs.stat(dir).then(() => true, () => false)) return;
  const rows = await db.select().from(videoProjects).where(isNotNull(videoProjects.finalPath));
  for (const p of rows) {
    const files = await fs.readdir(resolveMedia(p.folder)).catch(() => [] as string[]);
    for (const f of files.filter((x) => /^final(-[A-D])?\.mp4$/.test(x))) {
      const side = f !== "final.mp4" ? await fs.readFile(resolveMedia(`${p.folder}/${f.replace(".mp4", ".json")}`), "utf8").then((t) => (JSON.parse(t) as { hook?: string }).hook ?? null, () => null) : undefined;
      await archiveExport(p, `${p.folder}/${f}`, side);
    }
  }
}

export async function listVideoGallery(): Promise<GalleryVideo[]> {
  const dir = path.join(MEDIA_DIR, VIDEO_GALLERY);
  await backfill(dir);
  const files = (await fs.readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".mp4"));
  const jobs = await db.select().from(uploadJobs).orderBy(desc(uploadJobs.createdAt));
  const { hookInsights } = await import("@/lib/insights");
  const views = new Map((await hookInsights().catch(() => ({ matched: [] as { postId: string; views: number }[] }))).matched.map((m) => [m.postId, m.views]));
  const out: GalleryVideo[] = [];
  for (const f of files) {
    const meta = await fs.readFile(path.join(dir, f.replace(/\.mp4$/, ".json")), "utf8").then((t) => JSON.parse(t) as Meta, () => null);
    const st = await fs.stat(path.join(dir, f)).catch(() => null);
    if (!st) continue;
    // its uploads: same project + same label (the newest decides the status)
    const mine = meta?.projectId ? jobs.filter((j) => j.projectId === meta.projectId && (j.label ?? "Video utama") === meta.label && j.status !== "cancelled") : [];
    const posted = mine.find((j) => j.status === "done");
    const queued = mine.find((j) => j.status === "queued" || j.status === "uploading");
    out.push({
      rel: `${VIDEO_GALLERY}/${f}`,
      projectId: meta?.projectId ?? null,
      title: meta?.title ?? f.replace(/^p\d+-\w+ \d{4}-\d{2}-\d{2} /, "").replace(/\.mp4$/, ""),
      label: meta?.label ?? "Video utama",
      hook: meta?.hook ?? null,
      caption: meta?.caption ?? "",
      productId: meta?.productId ?? null,
      sizeMb: Math.round((st.size / 1048576) * 10) / 10,
      at: meta?.at ?? st.mtimeMs,
      status: posted ? "terposting" : queued ? "terjadwal" : mine[0]?.status === "failed" ? "gagal" : "baru",
      scheduledAt: queued?.scheduledAt.getTime() ?? null,
      postedAt: posted?.postedAt?.getTime() ?? null,
      views: posted?.postId ? views.get(posted.postId) ?? null : null,
    });
  }
  return out.sort((a, b) => b.at - a.at);
}

/** Remove a video from the gallery only (the project's own file stays). */
export async function removeFromVideoGallery(rel: string) {
  if (!rel.startsWith(`${VIDEO_GALLERY}/`) || rel.includes("..") || !rel.endsWith(".mp4")) throw new Error("File bukan video galeri.");
  await fs.rm(resolveMedia(rel), { force: true });
  await fs.rm(resolveMedia(rel.replace(/\.mp4$/, ".json")), { force: true });
}
