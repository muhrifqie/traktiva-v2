import "server-only";
import type { Page } from "playwright-core";
import { withProfile } from "@/lib/browser/chrome";

// Post one video through YouTube Studio's upload dialog in the channel's own Chrome profile, like a person would:
// attach → title → description → audience → (more) tags + AI disclosure → Next ×3 → visibility → Save.
// Mapped on Studio (Indonesian UI) 2026-11-24 with a private test draft that was deleted afterwards.
// ⚠️ A real channel: the runner keeps a gap between posts. Attaching a file already creates a private DRAFT in Studio,
// so a dry run deletes its draft at the end instead of leaving it behind.

const STUDIO = "https://studio.youtube.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DLG = "ytcp-uploads-dialog";
export type UploadProgress = (stage: string) => void;
export type YouTubeVisibility = "public" | "unlisted" | "private";
export type YouTubeUploadInput = {
  sessionKey: string;
  channelId: string;
  file: string;
  title: string;
  description: string;
  tags: string[];
  visibility: YouTubeVisibility;
  madeForKids: boolean;
  /** "altered or synthetic content" disclosure: realistic AI-made video must say yes */
  aiContent: boolean;
  dryRun?: boolean;
  visible?: boolean;
};

const RADIO = { public: "PUBLIC", unlisted: "UNLISTED", private: "PRIVATE" } as const;

/** Clear a Studio contenteditable box and type `text` (line breaks as Shift+Enter would split chips; Enter is fine here). */
async function typeInto(page: Page, box: ReturnType<Page["locator"]>, text: string) {
  // focus, not click: Studio's hashtag suggestions can sit on top of the next box and swallow the click
  await box.focus({ timeout: 15_000 }).catch(async (e) => {
    await checkLimit(page);
    throw e;
  });
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  for (const [i, line] of text.split("\n").entries()) {
    if (i) await page.keyboard.press("Enter");
    if (line) await page.keyboard.insertText(line);
  }
  await sleep(400);
}

/**
 * YouTube's daily upload cap ("Batas upload harian telah tercapai"): channels without phone verification get only a
 * few uploads a day. Studio then greys the whole form out. Thrown as its own error so the runner can pause the
 * channel for 24 hours and the app can say why.
 */
export class UploadLimitError extends Error {
  constructor() {
    super("Batas upload harian YouTube untuk channel ini sudah tercapai. Coba lagi besok, atau verifikasi nomor HP channel di youtube.com/verify supaya batasnya naik.");
    this.name = "UploadLimitError";
  }
}
export const VERIFY_URL = "https://www.youtube.com/verify";
const LIMIT = /batas upload harian|daily upload limit/i;
async function checkLimit(page: Page) {
  const text = (await page.locator(DLG).first().innerText().catch(() => "")) || "";
  if (LIMIT.test(text)) throw new UploadLimitError();
}

const radio = (page: Page, name: string) => page.locator(`${DLG} tp-yt-paper-radio-button[name="${name}"]`).first();
/**
 * Click; when a Studio popup (hashtag/mention suggestions) covers the target, send the click to the element itself.
 * A click that fails because the form is locked by the daily upload cap reports that instead.
 */
async function tap(target: ReturnType<Page["locator"]>) {
  try {
    await target.click({ timeout: 5000 });
  } catch {
    await checkLimit(target.page());
    await target.dispatchEvent("click", undefined, { timeout: 10_000 });
  }
}

/** Wait until the file is fully sent to YouTube (closing the browser earlier would cancel the upload). */
async function waitUploaded(page: Page, onProgress: UploadProgress, timeoutMs = 15 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // the dialog footer reads "Mengupload 42% …" while sending, then "Upload selesai … Proses akan segera dimulai"
    const text = (await page.locator(DLG).first().innerText().catch(() => "")) || "";
    if (LIMIT.test(text)) throw new UploadLimitError();
    const sending = /mengupload|uploading/i.test(text);
    if (process.env.TRAKTIVA_UPLOAD_DEBUG) console.warn("[yt-upload] footer:", text.replace(/\s+/g, " ").slice(-260));
    // after the file is sent the footer moves on: "Upload selesai …", "Memproses hingga HD …" (the step names
    // "Pemeriksaan" etc. are always in the dialog, so only footer phrases count)
    if (!sending && /upload selesai|upload complete|memproses|processing/i.test(text)) return;
    if (/upload gagal|upload failed|tidak dapat diupload|couldn't upload/i.test(text)) throw new Error("YouTube menolak upload video (upload gagal).");
    const pct = text.match(/(?:mengupload|uploading)\D{0,12}(\d{1,3})\s?%/i)?.[1];
    onProgress(`Mengunggah ke YouTube${pct ? ` ${pct}%` : ""}...`);
    await sleep(2000);
  }
  throw new Error("Upload ke YouTube terlalu lama (lebih dari 15 menit).");
}

/** Delete a draft this run created (dry run, or a run that failed before publishing): row menu "Hapus selamanya". */
export async function deleteDraft(page: Page, channelId: string, match: { videoId?: string; title?: string }, waitRounds = 1) {
  for (const tab of ["short", "upload"]) {
    await page.goto(`${STUDIO}/channel/${channelId}/videos/${tab}`, { waitUntil: "load", timeout: 60_000 });
    await sleep(5000);
    const rows = page.locator("ytcp-video-row");
    // by id; else by exact title, and then ONLY a row marked "Draf" (a published/private video with the same title
    // must never be touched)
    const exact = new RegExp(`^\\s*${(match.title ?? "(tanpa judul)").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
    // row links are set as DOM properties (no href attribute): match the id on .href in the page
    const byId = async () => {
      if (!match.videoId) return -1;
      return page
        .evaluate((id) => [...document.querySelectorAll("ytcp-video-row")].findIndex((r) => [...r.querySelectorAll("a")].some((a) => (a as HTMLAnchorElement).href.includes(id))), match.videoId)
        .catch(() => -1);
    };
    const pick = async () => {
      const i = await byId();
      return i >= 0 ? rows.nth(i) : rows.filter({ has: page.locator("#video-title", { hasText: exact }) }).filter({ hasText: /\bdraf\b|\bdraft\b/i }).first();
    };
    // a fresh draft can take a minute to show up in the list
    for (let i = 0; i < waitRounds && !(await (await pick()).count()); i++) {
      await sleep(8000);
      await page.reload({ waitUntil: "load" }).catch(() => {});
      await sleep(5000);
    }
    const row = await pick();
    if (!(await row.count())) continue;
    await row.hover();
    await row.getByRole("button", { name: /^(opsi|options)$/i }).first().click({ timeout: 8000 });
    await sleep(1000);
    await page.locator("tp-yt-paper-item:visible").filter({ hasText: /^\s*(hapus selamanya|delete forever)\s*$/i }).first().click({ timeout: 8000 });
    await sleep(1200);
    const dlg = page.locator("ytcp-confirmation-dialog#delete-dialog");
    await dlg.locator("#confirm-checkbox").click({ timeout: 8000 });
    await sleep(500);
    await dlg.locator("#confirm-button").click({ timeout: 8000 });
    await sleep(4000);
    return true;
  }
  return false;
}

/**
 * A fresh draft shows up in Studio's content list only once YouTube starts processing it (minutes): when it could not
 * be deleted right away, try again in the background every 3 minutes (headless; same safe matching: its id, or its
 * exact title on a row marked "Draf").
 */
export function scheduleDraftCleanup(sessionKey: string, channelId: string, match: { videoId?: string; title?: string }, attempt = 1) {
  const t = setTimeout(async () => {
    let ok = false;
    try {
      ok = await withProfile(sessionKey, { headless: true }, async (ctx) => {
        const page = await ctx.newPage();
        page.on("dialog", (d) => void d.accept().catch(() => {}));
        try {
          return await deleteDraft(page, channelId, match);
        } finally {
          await page.close().catch(() => {});
        }
      });
    } catch {
      // profile busy (an upload or a sync): next round
    }
    if (ok) console.info("[yt-upload] draf uji terhapus", match.videoId ?? match.title);
    else if (attempt < 6) scheduleDraftCleanup(sessionKey, channelId, match, attempt + 1);
    else console.warn("[yt-upload] draf uji belum terhapus setelah 18 menit, hapus manual:", match.videoId ?? match.title);
  }, 3 * 60_000);
  t.unref?.();
}

/** Upload one video. dryRun = fill everything, then delete the draft instead of pressing Save/Schedule. */
export async function uploadToYouTube(input: YouTubeUploadInput, onProgress: UploadProgress = () => {}) {
  return withProfile(input.sessionKey, { headless: !input.visible }, async (ctx) => {
    const page = await ctx.newPage();
    // "Leave site? Changes may not be saved" when moving away from the dialog: accept (never let it hang the run)
    page.on("dialog", (d) => void d.accept().catch(() => {}));
    let videoId: string | null = null;
    let published = false;
    try {
      onProgress("Membuka YouTube Studio...");
      await page.goto(`${STUDIO}/channel/${input.channelId}/videos/upload?d=ud`, { waitUntil: "load", timeout: 60_000 });
      if (/accounts\.google\.com/.test(page.url())) throw new Error("Channel YouTube ini perlu login ulang (menu YouTube).");
      const file = page.locator('input[type="file"]').first();
      await file.waitFor({ state: "attached", timeout: 45_000 });
      onProgress("Mengunggah video...");
      await file.setInputFiles(input.file);
      const boxes = page.locator(`${DLG} #textbox`);
      await boxes.first().waitFor({ state: "visible", timeout: 90_000 });
      await sleep(2500);
      await checkLimit(page); // the cap shows right after attaching, before anything else can be filled
      // the draft's id, from its link in the dialog (needed to clean up a dry run or a failed one)
      // (Studio sets the link as a DOM property, not an attribute: read .href in the page)
      const readId = async () =>
        page
          .evaluate((sel) => {
            for (const a of document.querySelectorAll<HTMLAnchorElement>(`${sel} a`)) {
              const m = a.href.match(/(?:\/shorts\/|youtu\.be\/|[?&]v=)([\w-]{6,})/);
              if (m) return m[1];
            }
            return null;
          }, DLG)
          .catch(() => null);
      videoId ??= await readId();

      onProgress("Mengisi judul & deskripsi...");
      await typeInto(page, boxes.nth(0), input.title.slice(0, 100));
      await typeInto(page, boxes.nth(1), input.description.slice(0, 5000));
      await tap(radio(page, input.madeForKids ? "VIDEO_MADE_FOR_KIDS_MFK" : "VIDEO_MADE_FOR_KIDS_NOT_MFK"));
      await sleep(800);

      // "Tampilkan lebih banyak": tags + AI disclosure
      await tap(page.locator(`${DLG} #toggle-button`).first());
      await sleep(1500);
      await tap(radio(page, input.aiContent ? "VIDEO_HAS_ALTERED_CONTENT_YES" : "VIDEO_HAS_ALTERED_CONTENT_NO")).catch(() => {});
      const tags = input.tags.map((t) => t.replace(/[<>,#]/g, "").trim()).filter(Boolean);
      if (tags.length) {
        const tagBox = page.locator(`${DLG} input#text-input[aria-label="Tag"], ${DLG} input#text-input[aria-label="Tags"]`).first();
        await tagBox.focus({ timeout: 10_000 });
        for (const t of tags.slice(0, 30)) {
          await page.keyboard.insertText(t);
          await page.keyboard.press("Enter");
        }
      }

      // Detail → Elemen video → Pemeriksaan → Visibilitas
      for (let i = 0; i < 3; i++) {
        await tap(page.locator(`${DLG} #next-button`).first());
        await sleep(2500);
      }
      // the runner calls this at the planned time, so visibility applies right away (Studio's own schedule
      // pickers close the upload dialog on keyboard input; not used)
      await tap(radio(page, RADIO[input.visibility]));
      await sleep(800);

      await waitUploaded(page, onProgress);
      videoId ??= await readId(); // the link can appear only once the upload is under way
      if (input.dryRun) {
        if (process.env.TRAKTIVA_UPLOAD_DEBUG) await page.screenshot({ path: process.env.TRAKTIVA_UPLOAD_DEBUG }).catch(() => {});
        onProgress("Uji coba selesai: semua terisi, menghapus draf uji...");
        await page.locator("#ytcp-uploads-dialog-close-button").first().click({ timeout: 8000 }).catch(() => {});
        await sleep(2000);
        const id = videoId;
        videoId = null; // handled here: the catch below must not try again
        const match = { videoId: id ?? undefined, title: input.title.slice(0, 100) };
        const removed = await deleteDraft(page, input.channelId, match).catch((e) => {
          console.warn("[yt-upload] hapus draf gagal:", String(e).split(/\r?\n/)[0]);
          return false;
        });
        if (!removed) scheduleDraftCleanup(input.sessionKey, input.channelId, match);
        return { posted: false, videoId: id, draftPending: !removed };
      }
      onProgress("Menekan Simpan...");
      published = true; // from here on the video may be live: never delete it
      await tap(page.locator(`${DLG} #done-button`).first());
      // the share dialog ("Video dipublikasikan / dijadwalkan / disimpan") or the upload dialog closing = accepted
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        await sleep(2000);
        if (await page.locator("ytcp-video-share-dialog, ytcp-uploads-still-processing-dialog").first().isVisible().catch(() => false)) break;
        if (!(await page.locator(DLG).first().isVisible().catch(() => false))) break;
      }
      if (await page.locator(DLG).first().isVisible().catch(() => false)) throw new Error("YouTube tidak mengonfirmasi upload dalam 90 detik. Cek YouTube Studio sebelum mencoba lagi.");
      return { posted: true, videoId };
    } catch (e) {
      // failed before publishing: remove the private draft Studio already made, so a retry does not pile them up
      if (videoId && !published) {
        onProgress("Gagal, menghapus draf yang terlanjur dibuat...");
        const match = { videoId, title: input.title.slice(0, 100) };
        const removed = await deleteDraft(page, input.channelId, match).catch(() => false);
        if (!removed) scheduleDraftCleanup(input.sessionKey, input.channelId, match);
      }
      throw e;
    } finally {
      await page.close().catch(() => {});
    }
  });
}
