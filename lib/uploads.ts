import "server-only";
import { and, asc, desc, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, uploadJobs } from "@/lib/db/schema";
import { resolveMedia } from "@/lib/media";
import { uploadToTikTok } from "@/lib/platforms/tiktok-upload";

// Jadwal Upload runner. A new job is uploaded to TikTok Studio right away (one at a time across the app, so only one
// TikTok window works at once): when its time is far enough ahead, TikTok's own "Schedule" is set to it, so TikTok
// publishes it on time even with the app closed; otherwise it is posted now. A minute timer picks up anything left.

const TICK_MS = 60_000;
export const MIN_GAP_MIN = 20; // minutes between two posts of the same account (looks human, lowers limit risk)
/** TikTok refuses a schedule closer than ~15 minutes: below this lead time a job is posted right away instead. */
export const SCHEDULE_LEAD_MIN = 20;
/** When to let TikTok publish a job: its time if far enough ahead, else null (= post now). */
const scheduleFor = (scheduledAt: Date) => (scheduledAt.getTime() - Date.now() >= SCHEDULE_LEAD_MIN * 60_000 ? scheduledAt.getTime() : null);
/** TikTok Studio only schedules ~10 days ahead: a job further out waits in the queue until it is within this range. */
export const SCHEDULE_MAX_DAYS = 9;
/** Pause between two uploads (any account): a burst of uploads from one PC looks automated and raises the limit risk. */
const UPLOAD_SPACING_MS = 3 * 60_000;
const g = globalThis as unknown as { __uploadTimer?: ReturnType<typeof setInterval>; __uploadBusy?: boolean; __uploadEndedAt?: number };

async function setJob(id: number, patch: Partial<typeof uploadJobs.$inferInsert>) {
  await db.update(uploadJobs).set(patch).where(eq(uploadJobs.id, id));
}

/** True while an upload drives a TikTok Chrome profile (lib/profile-autosync.ts waits for it). */
export const isUploadBusy = () => !!g.__uploadBusy;

/**
 * Upload the next waiting job, oldest time first: one per tick, at least UPLOAD_SPACING_MS after the previous upload.
 * Safe to call any time (no-op while another upload runs). Jobs scheduled ahead (up to SCHEDULE_MAX_DAYS) go to TikTok
 * with TikTok's own schedule; jobs due now keep the per-account gap; jobs further out wait.
 */
export async function tickUploads() {
  if (g.__uploadBusy) return;
  g.__uploadBusy = true;
  try {
    if (Date.now() - (g.__uploadEndedAt ?? 0) < UPLOAD_SPACING_MS) return;
    const waiting = await db.select().from(uploadJobs).where(eq(uploadJobs.status, "queued")).orderBy(asc(uploadJobs.scheduledAt)).limit(10);
    for (const job of waiting) {
      if (job.scheduledAt.getTime() - Date.now() > SCHEDULE_MAX_DAYS * 86_400_000) continue; // too far for TikTok's schedule yet
      const acc = await db.select().from(accounts).where(eq(accounts.id, job.accountId)).get();
      if (!acc?.sessionKey || acc.status !== "active") {
        await setJob(job.id, { status: "failed", error: "Akun TikTok tidak aktif atau perlu login ulang (Akun Sosial)." });
        continue;
      }
      if (!scheduleFor(job.scheduledAt)) {
        // posting now: keep a gap after this account's last post that already went live; the job waits for a later tick
        const last = await db
          .select()
          .from(uploadJobs)
          .where(and(eq(uploadJobs.accountId, acc.id), eq(uploadJobs.status, "done"), lte(uploadJobs.postedAt, new Date())))
          .orderBy(desc(uploadJobs.postedAt))
          .get();
        if (last?.postedAt && Date.now() - last.postedAt.getTime() < MIN_GAP_MIN * 60_000) continue;
      }
      // re-read right before uploading: it may have been cancelled or deleted since the list was taken
      const fresh = await db.select({ status: uploadJobs.status }).from(uploadJobs).where(eq(uploadJobs.id, job.id)).get();
      if (fresh?.status !== "queued") continue;
      await runJob(job.id, acc.sessionKey);
      g.__uploadEndedAt = Date.now();
      break; // the next one waits UPLOAD_SPACING_MS (later tick)
    }
  } finally {
    g.__uploadBusy = false;
  }
}

/** Start uploading right away (after "Jadwalkan"), without waiting for the minute timer. */
export function kickUploads() {
  void tickUploads().catch((e) => console.warn("[upload]", e));
}

async function runJob(id: number, sessionKey: string, dryRun = false, postNow = false) {
  const job = await db.select().from(uploadJobs).where(eq(uploadJobs.id, id)).get();
  if (!job) return; // deleted meanwhile
  await setJob(id, { status: "uploading", progress: "Menyiapkan...", error: null, attempts: job.attempts + 1 });
  let last = 0;
  const onProgress = (stage: string) => {
    if (Date.now() - last < 1500) return; // throttle DB writes
    last = Date.now();
    void setJob(id, { progress: stage });
  };
  try {
    const scheduleAt = postNow ? null : scheduleFor(job.scheduledAt);
    const r = await uploadToTikTok(
      { sessionKey, file: resolveMedia(job.video), caption: job.caption, productId: job.productId, productTitle: job.productTitle, music: job.music ? { volume: job.musicVolume } : null, scheduleAt, dryRun, visible: process.env.TRAKTIVA_UPLOAD_HEADLESS !== "1" },
      onProgress,
    );
    await setJob(
      id,
      !r.posted
        ? { status: "queued", progress: "Uji coba berhasil: siap diunggah." }
        : r.scheduled
          ? { status: "done", progress: "Terjadwal di TikTok", postedAt: job.scheduledAt } // goes live at that time, done by TikTok
          : { status: "done", progress: null, postedAt: new Date() },
    );
  } catch (e) {
    await setJob(id, { status: "failed", progress: null, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
  }
}

/** Post one job now ("Posting sekarang", ignoring its time) or dry-run it (fills everything, incl. TikTok's schedule, without pressing the button). */
export async function runJobNow(id: number, dryRun = false) {
  if (g.__uploadBusy) throw new Error("Masih ada upload yang berjalan. Tunggu sebentar.");
  const job = await db.select().from(uploadJobs).where(eq(uploadJobs.id, id)).get();
  if (!job) throw new Error("Jadwal tidak ditemukan.");
  const acc = await db.select().from(accounts).where(eq(accounts.id, job.accountId)).get();
  if (!acc?.sessionKey) throw new Error("Akun TikTok belum login.");
  g.__uploadBusy = true;
  try {
    await runJob(id, acc.sessionKey, dryRun, !dryRun);
  } finally {
    if (!dryRun) g.__uploadEndedAt = Date.now();
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
