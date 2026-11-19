import "server-only";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, uploadJobs } from "@/lib/db/schema";
import { resolveMedia } from "@/lib/media";
import { uploadToTikTok } from "@/lib/platforms/tiktok-upload";

// Jadwal Upload runner: every minute, post the oldest due job (one at a time across the app, so only one TikTok
// window works at once). Runs while the app is open; jobs that came due while it was closed post on the next start.

const TICK_MS = 60_000;
export const MIN_GAP_MIN = 20; // minutes between two posts of the same account (looks human, lowers limit risk)
const g = globalThis as unknown as { __uploadTimer?: ReturnType<typeof setInterval>; __uploadBusy?: boolean };

async function setJob(id: number, patch: Partial<typeof uploadJobs.$inferInsert>) {
  await db.update(uploadJobs).set(patch).where(eq(uploadJobs.id, id));
}

const STATS_EVERY_MS = 6 * 3600_000;
const gs = globalThis as unknown as { __statsAt?: number };

/** Every 6 h: refresh the profile stats of accounts that posted through the scheduler in the last week (feeds lib/insights). */
async function syncPostedAccounts() {
  if (gs.__statsAt && Date.now() - gs.__statsAt < STATS_EVERY_MS) return;
  gs.__statsAt = Date.now();
  const recent = await db.selectDistinct({ id: uploadJobs.accountId }).from(uploadJobs).where(and(eq(uploadJobs.status, "done"), gte(uploadJobs.postedAt, new Date(Date.now() - 7 * 86_400_000))));
  const { syncTikTokAccount } = await import("@/app/(dashboard)/akun/actions");
  for (const a of recent) await syncTikTokAccount(a.id).catch((e) => console.warn("[stats]", e instanceof Error ? e.message : e));
}

/** Post one due job, if any. Safe to call any time (no-op while another upload runs). */
export async function tickUploads() {
  if (g.__uploadBusy) return;
  g.__uploadBusy = true;
  try {
    await syncPostedAccounts().catch(() => {});
    const due = await db.select().from(uploadJobs).where(and(eq(uploadJobs.status, "queued"), lte(uploadJobs.scheduledAt, new Date()))).orderBy(asc(uploadJobs.scheduledAt)).limit(5);
    for (const job of due) {
      const acc = await db.select().from(accounts).where(eq(accounts.id, job.accountId)).get();
      if (!acc?.sessionKey || acc.status !== "active") {
        await setJob(job.id, { status: "failed", error: "Akun TikTok tidak aktif atau perlu login ulang (Akun Sosial)." });
        continue;
      }
      // keep a gap after this account's last post; the job simply waits for a later tick
      const last = await db.select().from(uploadJobs).where(and(eq(uploadJobs.accountId, acc.id), eq(uploadJobs.status, "done"))).orderBy(desc(uploadJobs.postedAt)).get();
      if (last?.postedAt && Date.now() - last.postedAt.getTime() < MIN_GAP_MIN * 60_000) continue;
      await runJob(job.id, acc.sessionKey);
      break;
    }
  } finally {
    g.__uploadBusy = false;
  }
}

async function runJob(id: number, sessionKey: string, dryRun = false) {
  const job = (await db.select().from(uploadJobs).where(eq(uploadJobs.id, id)).get())!;
  await setJob(id, { status: "uploading", progress: "Menyiapkan...", error: null, attempts: job.attempts + 1 });
  let last = 0;
  const onProgress = (stage: string) => {
    if (Date.now() - last < 1500) return; // throttle DB writes
    last = Date.now();
    void setJob(id, { progress: stage });
  };
  try {
    const r = await uploadToTikTok(
      { sessionKey, file: resolveMedia(job.video), caption: job.caption, productId: job.productId, productTitle: job.productTitle, dryRun, visible: process.env.TRAKTIVA_UPLOAD_HEADLESS !== "1" },
      onProgress,
    );
    await setJob(id, r.posted ? { status: "done", progress: null, postedAt: new Date() } : { status: "queued", progress: "Uji coba berhasil: siap diposting sesuai jadwal." });
  } catch (e) {
    await setJob(id, { status: "failed", progress: null, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
  }
}

/** Run one job now (Upload sekarang) or as a dry run (everything except Post). Returns when it ends. */
export async function runJobNow(id: number, dryRun = false) {
  if (g.__uploadBusy) throw new Error("Masih ada upload yang berjalan. Tunggu sebentar.");
  const job = await db.select().from(uploadJobs).where(eq(uploadJobs.id, id)).get();
  if (!job) throw new Error("Jadwal tidak ditemukan.");
  const acc = await db.select().from(accounts).where(eq(accounts.id, job.accountId)).get();
  if (!acc?.sessionKey) throw new Error("Akun TikTok belum login.");
  g.__uploadBusy = true;
  try {
    await runJob(id, acc.sessionKey, dryRun);
  } finally {
    g.__uploadBusy = false;
  }
}

/**
 * Called once at server start (instrumentation). A job cut off mid-upload (app closed) is marked failed, not
 * re-queued: it may already be posted, and a blind retry could post it twice.
 */
export function startUploadRunner() {
  if (g.__uploadTimer) return;
  void db
    .update(uploadJobs)
    .set({ status: "failed", progress: null, error: "Upload terputus (aplikasi ditutup). Cek TikTok Studio dulu, lalu Ulangi kalau belum terposting." })
    .where(eq(uploadJobs.status, "uploading"))
    .catch(() => {});
  g.__uploadTimer = setInterval(() => void tickUploads().catch((e) => console.warn("[upload]", e)), TICK_MS);
}
