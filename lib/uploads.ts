import "server-only";
import { and, asc, desc, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, uploadJobs } from "@/lib/db/schema";
import { resolveMedia } from "@/lib/media";
import { uploadToTikTok } from "@/lib/platforms/tiktok-upload";
import { UploadLimitError, uploadToYouTube } from "@/lib/platforms/youtube-upload";
import { markUploadLimit, uploadLimitUntil } from "@/lib/youtube-limit";

// Jadwal Upload runner. YouTube jobs go through YouTube Studio at their own time (Studio's schedule pickers are not
// automatable, so the app must be open then); a channel that hit the daily upload cap waits 24 hours.
// TikTok: a new job is uploaded to TikTok Studio right away (one at a time across the app, so only one
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
const g = globalThis as unknown as { __uploadTimer?: ReturnType<typeof setInterval>; __uploadBusy?: boolean };

async function setJob(id: number, patch: Partial<typeof uploadJobs.$inferInsert>) {
  await db.update(uploadJobs).set(patch).where(eq(uploadJobs.id, id));
}

/** True while an upload drives a TikTok Chrome profile (lib/profile-autosync.ts waits for it). */
export const isUploadBusy = () => !!g.__uploadBusy;

/**
 * Upload every waiting job, oldest time first. Safe to call any time (no-op while another upload runs).
 * Jobs scheduled ahead (up to SCHEDULE_MAX_DAYS) go to TikTok now with TikTok's own schedule; jobs due now keep the
 * per-account gap; jobs further out wait in the queue.
 */
export async function tickUploads() {
  if (g.__uploadBusy) return;
  g.__uploadBusy = true;
  try {
    const waiting = await db.select().from(uploadJobs).where(eq(uploadJobs.status, "queued")).orderBy(asc(uploadJobs.scheduledAt)).limit(200); // all of them in practice: capped/waiting ones are skipped, the rest must still be seen
    for (const job of waiting) {
      const acc = await db.select().from(accounts).where(eq(accounts.id, job.accountId)).get();
      const yt = acc?.platform === "youtube";
      if (yt ? job.scheduledAt.getTime() > Date.now() : job.scheduledAt.getTime() - Date.now() > SCHEDULE_MAX_DAYS * 86_400_000) continue; // not its time yet
      if (!acc?.sessionKey || acc.status !== "active") {
        await setJob(job.id, { status: "failed", error: `Akun ${yt ? "YouTube" : "TikTok"} tidak aktif atau perlu login ulang (${yt ? "menu YouTube" : "Akun Sosial"}).` });
        continue;
      }
      if (yt) {
        const until = await uploadLimitUntil(acc.id);
        if (until) {
          const msg = `Menunggu batas upload harian YouTube (sampai ${new Date(until).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})`;
          if (job.progress !== msg) await setJob(job.id, { progress: msg });
          continue;
        }
      }
      if (yt || !scheduleFor(job.scheduledAt)) {
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
      await runJob(job.id, acc);
    }
  } finally {
    g.__uploadBusy = false;
  }
}

/** Start uploading right away (after "Jadwalkan"), without waiting for the minute timer. */
export function kickUploads() {
  void tickUploads().catch((e) => console.warn("[upload]", e));
}

type Acc = { id: number; platform: string; sessionKey: string | null; externalId: string | null };

async function runJob(id: number, acc: Acc, dryRun = false, postNow = false) {
  const job = await db.select().from(uploadJobs).where(eq(uploadJobs.id, id)).get();
  if (!job) return; // deleted meanwhile
  const sessionKey = acc.sessionKey!;
  await setJob(id, { status: "uploading", progress: "Menyiapkan...", error: null, attempts: job.attempts + 1 });
  let last = 0;
  const onProgress = (stage: string) => {
    if (Date.now() - last < 1500) return; // throttle DB writes
    last = Date.now();
    void setJob(id, { progress: stage });
  };
  if (acc.platform === "youtube") return runYouTubeJob(job, acc, dryRun, onProgress);
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

/** One YouTube job through YouTube Studio: posted now with its visibility (the runner calls it at its time). */
async function runYouTubeJob(job: typeof uploadJobs.$inferSelect, acc: Acc, dryRun: boolean, onProgress: (s: string) => void) {
  try {
    if (!acc.externalId?.startsWith("UC")) throw new Error("Channel YouTube ini belum dikenali (login ulang di menu YouTube).");
    const m = job.meta ?? {};
    const r = await uploadToYouTube(
      {
        sessionKey: acc.sessionKey!,
        channelId: acc.externalId,
        file: resolveMedia(job.video),
        title: job.videoTitle || job.label || "Video",
        description: job.caption,
        tags: m.tags ?? [],
        visibility: m.visibility ?? "public",
        madeForKids: !!m.madeForKids,
        aiContent: m.aiContent ?? true,
        dryRun,
        visible: process.env.TRAKTIVA_UPLOAD_HEADLESS !== "1", // Studio misbehaves headless: a visible window, like TikTok
      },
      onProgress,
    );
    await setJob(
      job.id,
      !r.posted
        ? { status: "queued", progress: `Uji coba berhasil: siap diunggah${"draftPending" in r && r.draftPending ? " (draf uji dihapus otomatis beberapa menit lagi)" : " (draf uji sudah dihapus)"}.` }
        : { status: "done", progress: null, postedAt: new Date(), postId: r.videoId },
    );
  } catch (e) {
    if (e instanceof UploadLimitError) {
      await markUploadLimit(acc.id);
      await setJob(job.id, { status: "queued", progress: null, error: e.message }); // retried by itself after 24 h
      return;
    }
    await setJob(job.id, { status: "failed", progress: null, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
  }
}

/** Post one job now ("Posting sekarang", ignoring its time) or dry-run it (fills everything, incl. TikTok's schedule, without pressing the button). */
export async function runJobNow(id: number, dryRun = false) {
  if (g.__uploadBusy) throw new Error("Masih ada upload yang berjalan. Tunggu sebentar.");
  const job = await db.select().from(uploadJobs).where(eq(uploadJobs.id, id)).get();
  if (!job) throw new Error("Jadwal tidak ditemukan.");
  const acc = await db.select().from(accounts).where(eq(accounts.id, job.accountId)).get();
  if (!acc?.sessionKey) throw new Error("Akun belum login.");
  if (acc.platform === "youtube" && !dryRun && (await uploadLimitUntil(acc.id))) throw new Error("Channel ini sedang terkena batas upload harian YouTube. Tunggu 24 jam atau verifikasi nomor HP di youtube.com/verify.");
  g.__uploadBusy = true;
  try {
    await runJob(id, acc, dryRun, !dryRun);
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
    .set({ status: "failed", progress: null, error: "Upload terputus (aplikasi ditutup). Cek TikTok/YouTube Studio dulu, lalu Ulangi kalau belum terposting." })
    .where(eq(uploadJobs.status, "uploading"))
    .catch(() => {});
  g.__uploadTimer = setInterval(() => void tickUploads().catch((e) => console.warn("[upload]", e)), TICK_MS);
}
