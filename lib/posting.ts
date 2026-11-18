import "server-only";
import fs from "node:fs/promises";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, posts, type Post } from "@/lib/db/schema";
import { resolveMedia } from "@/lib/media";
import { uploadToTikTok } from "@/lib/platforms/tiktok-upload";
import { appendPostLog, deletePostLog, splitShot, type LogLevel } from "@/lib/post-log";
import { ensure1080 } from "@/lib/upscale";

// Posting worker: takes queued posts and publishes them through TikTok Studio in each account's own
// browser profile. Timing:
//   • due now (or within a minute)           → upload and publish immediately
//   • ≥ NATIVE_MIN ahead (up to NATIVE_MAX)  → upload now with TikTok's own scheduler, so it goes live on
//                                               time even if this PC is off (status "scheduled")
//   • closer than NATIVE_MIN                 → wait, then publish at the time
//   • further than NATIVE_MAX                → wait until it enters TikTok's scheduling window
// One upload per account at a time (one browser profile), a couple of accounts in parallel.

const TICK_MS = 30_000;
const NATIVE_MIN_MS = 20 * 60_000; // TikTok accepts schedules from 15 min ahead; keep a margin for the upload itself
const NATIVE_MAX_MS = 9.5 * 24 * 3600_000; // TikTok allows up to 10 days
const MAX_PARALLEL_ACCOUNTS = 2;
const MAX_ATTEMPTS = 3;
// will not fix themselves by trying again
const PERMANENT = /login ulang|sesi .*habis|tidak ditemukan|melanggar|violat|tidak diizinkan|batas harian|daily limit|terlalu banyak/i;

type State = { timer: ReturnType<typeof setInterval> | null; busy: Set<number>; running: number };
const g = globalThis as unknown as { __posting?: State };
const st = (g.__posting ??= { timer: null, busy: new Set(), running: 0 });

// Dev hot reload re-runs this module but the old interval would keep calling the old code: restart it.
if (st.timer) {
  clearInterval(st.timer);
  st.timer = null;
  queueMicrotask(() => startPostingWorker());
}

const set = (id: number, p: Partial<typeof posts.$inferInsert>) => db.update(posts).set({ ...p, updatedAt: new Date() }).where(eq(posts.id, id));

/** Start the background loop once per server (called at startup and whenever posts are added). */
export function startPostingWorker() {
  if (st.timer) return;
  st.timer = setInterval(() => void tick().catch((e) => console.error("[posting] tick failed:", e)), TICK_MS);
  void tick().catch(() => {});
}

/** Posts interrupted by an app restart go back to the queue (TikTok never got them, or will get them again). */
export async function requeueInterruptedPosts() {
  await db.update(posts).set({ status: "queued", progress: null, updatedAt: new Date() }).where(eq(posts.status, "posting"));
}

/** Run the queue right away (e.g. after the user pressed "Posting sekarang"). */
export const kickPosting = () => void tick().catch(() => {});

async function tick() {
  const now = Date.now();
  const queued = await db.select().from(posts).where(and(eq(posts.status, "queued"), lte(posts.scheduledAt, new Date(now + NATIVE_MAX_MS)))).orderBy(asc(posts.scheduledAt));
  for (const p of queued) {
    if (st.running >= MAX_PARALLEL_ACCOUNTS) break;
    if (st.busy.has(p.accountId)) continue;
    const lead = p.scheduledAt.getTime() - now;
    const native = lead >= NATIVE_MIN_MS;
    if (!native && lead > 60_000) continue; // not yet: publish at its time
    st.busy.add(p.accountId);
    st.running++;
    void runPost(p, native)
      .catch((e) => console.error("[posting] post", p.id, e))
      .finally(() => {
        st.busy.delete(p.accountId);
        st.running--;
      });
  }
}

async function runPost(p: Post, native: boolean) {
  const attempt = p.attempts + 1;
  // every step also goes to the post's log (Detail in Jadwal Upload), with proof screenshots
  const log = (msg: string, level: LogLevel = "info", shot?: string) => appendPostLog(p.id, { msg, level, attempt, shot }).catch(() => {});
  await set(p.id, { status: "posting", progress: "Menyiapkan...", error: null, attempts: attempt });
  await log(`Percobaan ${attempt}/${MAX_ATTEMPTS} dimulai · ${native ? `pakai jadwal TikTok untuk ${p.scheduledAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}` : "posting langsung"}`);
  try {
    const acc = await db.select().from(accounts).where(eq(accounts.id, p.accountId)).get();
    if (!acc?.sessionKey) throw new Error("Akun TikTok tidak ditemukan atau belum login. Login ulang di Akun Sosial.");
    if (acc.status === "need_login") throw new Error("Sesi TikTok habis. Login ulang akunnya di Akun Sosial.");
    const file = resolveMedia(p.video);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat) throw new Error("File video tidak ditemukan (mungkin sudah dihapus).");
    await log(`Akun @${acc.username} · video ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
    // TikTok keeps 1080p uploads sharper than 720p ones: post a 1080p version (the library keeps the original)
    await set(p.id, { progress: "Menyiapkan versi 1080p..." });
    const hd = await ensure1080(file, (line) => void log(line)).catch(async (e) => {
      await log(`Versi 1080p gagal dibuat, pakai file asli: ${e instanceof Error ? e.message.slice(0, 200) : e}`, "warn");
      return { file, upscaled: false as const, from: undefined };
    });
    if (hd.upscaled) {
      const hdSize = (await fs.stat(hd.file)).size;
      await log(`Diunggah dalam 1080p (dari ${hd.from}) · ${(hdSize / 1024 / 1024).toFixed(1)} MB`, "ok");
    }
    let last = 0;
    const r = await uploadToTikTok({
      sessionKey: acc.sessionKey,
      file: hd.file,
      caption: p.caption,
      productId: p.productId,
      productTitle: p.productTitle,
      scheduleAt: native ? p.scheduledAt : null,
      onProgress: (line) => {
        void log(line, /^Peringatan/i.test(line) ? "warn" : /✓/.test(line) ? "ok" : "info");
        // many lines per second while uploading: store the live status at most every 1.5 s
        if (Date.now() - last < 1500) return;
        last = Date.now();
        void set(p.id, { progress: line.slice(0, 200) });
      },
      onShot: (label, shotFile) => void log(label, "info", shotFile),
    });
    await set(p.id, {
      status: native ? "scheduled" : "posted",
      progress: null,
      error: r.warning ?? null,
      url: r.url ?? null,
      postedAt: native ? p.scheduledAt : new Date(),
    });
    if (r.warning) await log(r.warning, "warn");
    await log(native ? "Selesai: video terjadwal di TikTok" : "Selesai: video terposting", "ok");
  } catch (e) {
    const [msg, shot] = splitShot((e instanceof Error ? e.message : String(e)).slice(0, 1500));
    const retry = attempt < MAX_ATTEMPTS && !PERMANENT.test(msg);
    const next = new Date(Math.max(p.scheduledAt.getTime(), Date.now() + attempt * 5 * 60_000));
    await log(`Gagal: ${msg}`, "error", shot);
    await log(retry ? `Dicoba lagi otomatis ${next.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" })} (percobaan ${attempt + 1}/${MAX_ATTEMPTS})` : "Tidak dicoba lagi otomatis. Perbaiki penyebabnya lalu klik Coba lagi.", retry ? "info" : "warn");
    const short = msg.split("\n")[0].slice(0, 300);
    await set(p.id, retry
      ? { status: "queued", progress: null, error: `${short} (dicoba lagi ${attempt + 1}/${MAX_ATTEMPTS})`, scheduledAt: next }
      : { status: "failed", progress: null, error: short });
  }
}

// ---------- queue management (used by server actions) ----------

export type NewPosts = {
  videos: { video: string; label: string | null; projectId: number | null }[];
  accountIds: number[];
  caption: string;
  productId: string | null;
  productTitle: string | null;
  startAt: Date; // first post
  spacingMin: number; // between consecutive posts of the same account
};

/** One row per (video × account). Each account posts its videos `spacingMin` apart, starting at startAt. */
export async function queuePosts(n: NewPosts) {
  const rows: (typeof posts.$inferInsert)[] = [];
  for (const accountId of n.accountIds) {
    n.videos.forEach((v, i) =>
      rows.push({
        accountId,
        projectId: v.projectId,
        video: v.video,
        label: v.label,
        caption: n.caption,
        productId: n.productId,
        productTitle: n.productTitle,
        scheduledAt: new Date(n.startAt.getTime() + i * n.spacingMin * 60_000),
      }),
    );
  }
  if (rows.length) await db.insert(posts).values(rows);
  startPostingWorker();
  kickPosting();
  return rows.length;
}

export async function retryPost(id: number) {
  await appendPostLog(id, { msg: "Coba lagi diminta pengguna", level: "info" });
  await set(id, { status: "queued", error: null, attempts: 0, scheduledAt: new Date() });
  kickPosting();
}

export async function cancelPosts(ids: number[]) {
  await db.update(posts).set({ status: "cancelled", progress: null, updatedAt: new Date() }).where(and(inArray(posts.id, ids), eq(posts.status, "queued")));
}

export async function deletePosts(ids: number[]) {
  for (const id of ids) await deletePostLog(id);
  await db.delete(posts).where(and(inArray(posts.id, ids), inArray(posts.status, ["queued", "failed", "cancelled", "posted", "scheduled"])));
}

/** Live counts for the status bar. */
export async function postingStats() {
  const rows = await db.select({ status: posts.status }).from(posts).where(inArray(posts.status, ["queued", "posting"]));
  return { posting: rows.filter((r) => r.status === "posting").length, queued: rows.filter((r) => r.status === "queued").length };
}
