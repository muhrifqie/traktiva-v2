import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright-core";
import { launchProfile } from "@/lib/browser/camoufox";
import { DATA_DIR } from "@/lib/db";

// Posts a video through TikTok Studio in the account's own browser profile (already logged in), the same
// steps a person takes: upload → caption → product link (yellow basket) → optional TikTok schedule → Post.
// Ported from bot-autoupload's tiktokUploader (raw CDP + Chrome) to Playwright; selectors kept together.
// Improvements over the original: waits for the upload to really finish, detects TikTok's own error
// messages, and returns the Studio content link. Failures save a screenshot to data/tiktok-debug.

const UPLOAD_URL = "https://www.tiktok.com/tiktokstudio/upload?from=webapp&tab=video";
const CONTENT_URL = "https://www.tiktok.com/tiktokstudio/content";
const DEBUG_DIR = path.join(/* turbopackIgnore: true */ DATA_DIR, "tiktok-debug");
const MIN_SCHEDULE_LEAD_MS = 16 * 60_000; // TikTok refuses schedules closer than ~15 min

const SEL = {
  file: 'input[type="file"]',
  editor: '.public-DraftEditor-content[contenteditable="true"], .caption-editor [contenteditable="true"], .notranslate[contenteditable="true"]',
  productSearch: 'input[placeholder*="Search products" i], input[placeholder*="Cari produk" i]',
  productRows: "table tbody tr, [role='row']",
  productRadio: ".TUXRadioStandalone, label:has(.TUXRadioStandalone-input), input.TUXRadioStandalone-input, input[type='radio']",
  linkTitle: ".TUXInputBox input, input.TUXTextInputCore-input",
  scheduleRadio: 'input[name="postSchedule"][value="schedule"]',
  scheduleContainer: '[data-e2e="schedule_container"]',
  post: 'button[data-e2e="post_video_button"]',
  dialogs: '[role="dialog"], .TUXModal, [class*="Modal" i], [class*="popover" i]',
};
const DISMISS = /^(got it|ok|okay|skip|skip tour|done|dismiss|not now|maybe later|later|no thanks|i understand|understood|decline optional cookies|mengerti|saya mengerti|oke|lewati|selesai|nanti saja|tidak sekarang)$/i;
const SUCCESS = /Your video has been uploaded|Video Anda telah diunggah|Manage your posts|Kelola postingan|Video published|Video dipublikasikan|has been scheduled|telah dijadwalkan|Video scheduled|Video dijadwalkan/i;
const TIKTOK_ERROR = /couldn.?t (post|upload)|failed to (post|upload)|gagal (memposting|mengunggah|diunggah)|violat|melanggar|too many|terlalu banyak|limit reached|batas harian|try again later|coba lagi nanti/i;
const ALLOW_SCHEDULE = /saved for scheduled posting|scheduled posting\?|disimpan untuk (posting|postingan) (ter)?jadwal|izinkan video anda disimpan/i;

export type UploadInput = {
  sessionKey: string;
  file: string; // absolute path
  caption: string;
  productId?: string | null;
  productTitle?: string | null;
  scheduleAt?: Date | null; // TikTok's own scheduler (≥ 16 min ahead), else publish now
  onProgress?: (line: string) => void;
  /** proof screenshot at a milestone (file path), for the post's step log */
  onShot?: (label: string, file: string) => void;
};
export type UploadResult = { url: string | null; warning?: string };

export async function uploadToTikTok(input: UploadInput): Promise<UploadResult> {
  const say = input.onProgress ?? (() => {});
  say("Membuka TikTok Studio...");
  const ctx = await launchProfile(input.sessionKey, { headless: true, waitMs: 5 * 60_000, maxMs: 20 * 60_000, what: "posting TikTok" });
  const page = await ctx.newPage();
  const proof = async (label: string, name: string) => {
    const f = await debugShot(page, name).catch(() => null);
    if (f) input.onShot?.(label, f);
  };
  try {
    await openStudio(page);
    await dismissPopups(page);
    say(`TikTok Studio terbuka (${new URL(page.url()).pathname})`);

    say("Mengunggah video ke TikTok...");
    await page.waitForSelector(SEL.file, { state: "attached", timeout: 30_000 });
    await page.setInputFiles(SEL.file, input.file);

    say("Menunggu editor caption...");
    await page.waitForSelector(SEL.editor, { timeout: 120_000 });
    await settle(page, 3000);
    await dismissPopups(page);
    await proof("Video masuk ke TikTok Studio", "1-unggah");

    say("Menulis caption...");
    await writeCaption(page, input.caption);
    const written = (await page.locator(SEL.editor).first().innerText().catch(() => "")).trim();
    say(`Caption tertulis (${written.length} karakter)`);
    await proof("Caption ditulis", "2-caption");

    let warning: string | undefined;
    if (input.productId) {
      say(`Menautkan produk ke keranjang kuning (PID ${input.productId})...`);
      warning = await linkProduct(page, input.productId, input.productTitle || input.caption, say);
      await proof(warning ? "Produk: belum terlihat tertaut" : "Produk tertaut", "3-produk");
    }

    if (input.scheduleAt && input.scheduleAt.getTime() > Date.now() + 60_000) {
      say("Mengatur jadwal di TikTok...");
      await setSchedule(page, input.scheduleAt);
      say("Jadwal TikTok terpasang");
      await proof("Jadwal TikTok diatur", "4-jadwal");
    }

    say("Menunggu video selesai diproses TikTok...");
    await waitPostReady(page);
    await proof("Siap diposting", "5-sebelum-post");
    say(input.scheduleAt ? "Klik Jadwalkan..." : "Klik Posting...");
    await clickPost(page, say);
    // TikTok jumps to its content list after posting: let it load so the proof shows the new post, not a spinner
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await settle(page, 4000);
    await proof(input.scheduleAt ? "Terjadwal di TikTok" : "Terkirim ke TikTok", "6-berhasil");
    return { url: CONTENT_URL, warning };
  } catch (e) {
    const shot = await debugShot(page, "gagal").catch(() => null);
    throw new Error(`${e instanceof Error ? e.message : String(e)}${shot ? ` (screenshot: ${shot})` : ""}`, { cause: e });
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * Safe check without uploading or posting anything: opens TikTok Studio on the account's profile and
 * reports whether it is logged in and the upload form is there. Used before the first real post.
 */
export async function checkTikTokStudio(sessionKey: string) {
  const ctx = await launchProfile(sessionKey, { headless: true, waitMs: 60_000, maxMs: 5 * 60_000, what: "cek TikTok Studio" });
  const page = await ctx.newPage();
  try {
    await openStudio(page);
    await dismissPopups(page);
    const fileInput = await page.waitForSelector(SEL.file, { state: "attached", timeout: 30_000 }).then(() => true, () => false);
    return { ok: fileInput, url: page.url(), screenshot: await debugShot(page, "cek") };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), url: page.url(), screenshot: await debugShot(page, "cek-gagal").catch(() => null) };
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ---------- steps ----------

async function openStudio(page: Page) {
  await page.goto(UPLOAD_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await settle(page, 4000);
  if (/\/login|passport/.test(page.url())) throw new Error("Sesi TikTok habis. Login ulang akunnya di Akun Sosial.");
}

async function writeCaption(page: Page, caption: string) {
  const ed = page.locator(SEL.editor).first();
  // TikTok pre-fills the file name: always clear it, even when the caption is empty
  for (let i = 0; i < 3; i++) {
    await ed.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await settle(page, 300);
    if (!(await ed.innerText().catch(() => "")).trim()) break;
  }
  const lines = caption.trim().split("\n");
  for (const [i, line] of lines.entries()) {
    if (i) await page.keyboard.press("Enter");
    // real key presses: Firefox (Camoufox) rejects insertText inside TikTok's Draft.js editor.
    // Hashtags open a suggestion list: close it after each tag so it doesn't replace the word.
    for (const [j, word] of line.split(" ").entries()) {
      if (j) await page.keyboard.type(" ");
      await page.keyboard.type(word, { delay: 8 });
      if (/^[#@]/.test(word)) {
        await settle(page, 600);
        await page.keyboard.press("Escape").catch(() => {});
      }
    }
  }
  await settle(page, 1500);
}

/** Yellow basket: Add → Next → Showcase products → search PID → pick → Next → title (≤30) → Add. Returns a warning when not confirmed. */
async function linkProduct(page: Page, productId: string, titleSource: string, say: (l: string) => void): Promise<string | undefined> {
  await dismissPopups(page);
  if (!(await clickButton(page, /^\+?\s*Add(\s+product\s+links)?$|^Tambah(kan)?(\s+tautan)?$/i))) throw new Error("Tombol 'Add link' produk tidak ditemukan di TikTok Studio.");
  await settle(page, 2500);
  await clickButton(page, /^\s*(Next|Berikutnya|Selanjutnya)\s*$/i);
  await settle(page, 3000);

  // shop owners open on "My shop": switch to the showcase tab
  for (let i = 0; i < 4; i++) {
    const tab = page.locator('[role="tab"], button, div, span, a').filter({ hasText: /^(showcase products?|produk etalase|etalase|showcase)$/i }).first();
    if (!(await tab.count())) break;
    const active = await tab.evaluate((el) => el.getAttribute("aria-selected") === "true" || /active|selected/i.test(String(el.className))).catch(() => false);
    if (active && (await page.locator(SEL.productSearch).count())) break;
    await tab.click().catch(() => {});
    await settle(page, 1200);
  }

  const search = page.locator(SEL.productSearch).first();
  await search.waitFor({ timeout: 15_000 }).catch(() => {
    throw new Error("Kotak cari produk tidak muncul (akun belum punya etalase?).");
  });
  await search.fill("");
  await search.pressSequentially(productId, { delay: 60 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(({ rows, pid }) => [...document.querySelectorAll(rows)].some((r) => (r as HTMLElement).innerText.includes(pid)), { rows: SEL.productRows, pid: productId }, { timeout: 12_000 }).catch(() => {});
  await settle(page, 2000);

  const rows = page.locator(SEL.productRows).filter({ has: page.locator(SEL.productRadio) });
  if (!(await rows.count())) throw new Error(`Produk PID ${productId} tidak ditemukan di etalase akun TikTok ini.`);
  const row = (await rows.filter({ hasText: productId }).count()) ? rows.filter({ hasText: productId }).first() : rows.first();
  await row.locator(SEL.productRadio).first().click({ force: true });
  await settle(page, 2000);

  // Next until the "Product name" step shows
  for (let i = 0; i < 12; i++) {
    const atTitle = await page.evaluate((s) => /Product name|Nama produk/i.test(document.body.innerText) && !document.querySelector(s), SEL.productSearch);
    if (atTitle) break;
    await clickButton(page, /^\s*(Next|Berikutnya|Selanjutnya)\s*$/i, { enabledOnly: true, last: true });
    await settle(page, 1800);
  }

  const title = cleanTitle(titleSource);
  const input = page.locator(SEL.linkTitle).first();
  await input.waitFor({ timeout: 10_000 }).catch(() => {
    throw new Error("Langkah judul tautan produk tidak muncul.");
  });
  await input.fill(title);
  for (let i = 0; i < 10; i++) {
    if (await clickButton(page, /^\s*(Add|Tambah(kan)?)\s*$/i, { enabledOnly: true, last: true })) break;
    await settle(page, 1000);
  }
  await settle(page, 3500);

  const linked = await page.evaluate(({ s, t }) => !document.querySelector(s) && document.body.innerText.toUpperCase().includes(t.toUpperCase()), { s: SEL.productSearch, t: title });
  if (!linked) {
    say("Peringatan: tautan produk belum terlihat, lanjut posting.");
    await debugShot(page, "produk-belum-tertaut").catch(() => {});
    return "Tautan produk mungkin tidak terpasang. Cek postingannya di TikTok.";
  }
  say("Produk tertaut ke keranjang kuning ✓");
  return undefined;
}

/** TikTok's product link title: letters, numbers and spaces only, 5–30 chars. */
export function cleanTitle(src: string) {
  const t = src.replace(/#\S+/g, " ").replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 30).trim();
  return t.length >= 5 ? t : "PROMO SPESIAL CEK SEKARANG";
}

/** TikTok's own scheduler: rounds UP to 5 minutes, ≥ 16 min ahead; both the old and new picker UI. */
async function setSchedule(page: Page, at: Date) {
  const ms = Math.ceil(Math.max(at.getTime(), Date.now() + MIN_SCHEDULE_LEAD_MS) / 300_000) * 300_000;
  const d = new Date(ms);
  const want = { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, day: d.getDate(), month: d.getMonth(), year: d.getFullYear(), hh: String(d.getHours()).padStart(2, "0"), mm: String(d.getMinutes()).padStart(2, "0") };

  for (let i = 0; i < 4; i++) {
    const radio = page.locator(SEL.scheduleRadio);
    if (await radio.count()) await radio.first().check({ force: true }).catch(async () => radio.first().locator("xpath=ancestor::label").click());
    else await page.locator(`${SEL.scheduleContainer} label`).filter({ hasText: /^(schedule|jadwalkan)$/i }).first().click().catch(() => {});
    await allowSchedulePopup(page);
    if (await page.locator(".scheduled-picker").count()) break;
    await settle(page, 600);
  }
  if (!(await page.locator(".scheduled-picker").count())) throw new Error("Pilihan jadwal TikTok tidak muncul.");

  const isNew = (await page.locator(".scheduled-picker .Picker__trigger").count()) >= 2;
  // date
  await (isNew ? page.locator(".scheduled-picker .Picker__trigger").nth(0) : page.locator(".scheduled-picker input").nth(1)).click();
  await settle(page, 600);
  for (let i = 0; i < 4; i++) {
    const shown = await page.evaluate((isNewUi) => {
      const txt = isNewUi
        ? `${document.querySelector(".DatePicker__panel .DatePicker__titleMonth")?.textContent ?? ""} ${document.querySelector(".DatePicker__panel .DatePicker__titleYear")?.textContent ?? ""}`
        : `${document.querySelector(".calendar-wrapper .month-title")?.textContent ?? ""} ${document.querySelector(".calendar-wrapper .year-title")?.textContent ?? ""}`;
      return txt;
    }, isNew);
    const m = monthIndex(shown);
    const y = Number(shown.match(/\d{4}/)?.[0]);
    if (m == null || !y || (y === want.year && m === want.month)) break;
    const forward = y < want.year || (y === want.year && m < want.month);
    const navs = page.locator(isNew ? ".DatePicker__panel .DatePicker__nav" : ".calendar-wrapper .month-header-wrapper .arrow");
    await (forward ? navs.last() : navs.first()).click();
    await settle(page, 500);
  }
  const day = isNew
    ? page.locator('.DatePicker__day:not([data-outside="true"]):not([data-disabled="true"])').filter({ hasText: new RegExp(`^${want.day}$`) }).first()
    : page.locator(".calendar-wrapper .day.valid").filter({ hasText: new RegExp(`^${want.day}$`) }).first();
  if (!(await day.count())) throw new Error(`Tanggal ${want.date} tidak bisa dipilih di TikTok (di luar batas jadwal).`);
  await day.click();
  await settle(page, 600);
  // time
  await (isNew ? page.locator(".scheduled-picker .Picker__trigger").nth(1) : page.locator(".scheduled-picker input").nth(0)).click();
  await settle(page, 600);
  const cols = isNew ? [".TimePicker__column >> nth=0", ".TimePicker__column >> nth=1"] : [".tiktok-timepicker-left", ".tiktok-timepicker-right"];
  for (const [i, v] of [want.hh, want.mm].entries()) {
    const item = page.locator(cols[i]).locator(isNew ? ".TimePicker__item" : "span, div").filter({ hasText: new RegExp(`^${v}$`) }).first();
    await item.scrollIntoViewIfNeeded().catch(() => {});
    await item.click();
    await settle(page, 400);
  }
  await page.locator(`${SEL.scheduleContainer} .scheduled-title-container`).click().catch(() => page.keyboard.press("Escape"));
  await settle(page, 600);
  await allowSchedulePopup(page);
}

const MONTHS = ["jan", "feb", "mar", "apr", "ma[iy]", "jun", "jul", "a[gu]", "sep", "o[ck]t", "nov", "de[cs]"];
function monthIndex(s: string) {
  const t = s.toLowerCase();
  const i = MONTHS.findIndex((m) => new RegExp(`\\b${m}`).test(t));
  return i >= 0 ? i : null;
}

async function allowSchedulePopup(page: Page) {
  const dlg = page.locator(SEL.dialogs).filter({ hasText: ALLOW_SCHEDULE }).first();
  if (await dlg.count()) {
    await dlg.locator("button").filter({ hasText: /^(allow|izinkan)$/i }).first().click().catch(() => {});
    await settle(page, 1200);
  }
}

/** Post becomes clickable once TikTok has the whole file (large videos take a while). */
async function waitPostReady(page: Page) {
  await page.locator(SEL.post).scrollIntoViewIfNeeded().catch(() => {});
  const ok = await page
    .waitForFunction(
      (s) => {
        const b = document.querySelector(s) as HTMLButtonElement | null;
        return !!b && !b.disabled && b.getAttribute("aria-disabled") !== "true" && b.getAttribute("data-loading") !== "true";
      },
      SEL.post,
      { timeout: 10 * 60_000, polling: 1000 },
    )
    .then(() => true, () => false);
  if (!ok) throw new Error("Video tidak selesai diunggah ke TikTok dalam 10 menit.");
}

async function clickPost(page: Page, say: (l: string) => void) {
  await page.locator(SEL.post).click();
  let reclicked = false;
  for (let t = 0; t < 45; t++) {
    await settle(page, 2000);
    const s = await page.evaluate(({ success, error }) => {
      const text = document.body.innerText;
      return { ok: new RegExp(success, "i").test(text) || /\/manage|\/tiktokstudio\/content/.test(location.pathname), err: text.match(new RegExp(error, "i"))?.[0] ?? null };
    }, { success: SUCCESS.source, error: TIKTOK_ERROR.source });
    if (s.ok) {
      say("Berhasil ✓");
      return;
    }
    if (s.err) throw new Error(`TikTok menolak: ${s.err}`);
    await allowSchedulePopup(page);
    // "Post now?" / "Continue" confirmations
    const confirm = page.locator('[role="dialog"] button, .TUXModal button, div[class*="modal" i] button').filter({ hasText: /^(post now|posting sekarang|posting saja|continue|lanjutkan|post|posting|schedule|jadwalkan)$/i }).first();
    if (await confirm.count()) {
      await confirm.click().catch(() => {});
      continue;
    }
    if (!reclicked && t >= 10 && (await page.locator(SEL.post).isVisible().catch(() => false))) {
      reclicked = true;
      await page.locator(SEL.post).click().catch(() => {});
    }
  }
  if (await page.locator(SEL.post).isVisible().catch(() => false)) throw new Error("Tombol Post sudah diklik tapi TikTok belum mengirim videonya.");
  // button gone without a success text: treat as sent (never post twice)
}

// ---------- helpers ----------

async function clickButton(page: Page, text: RegExp, o: { enabledOnly?: boolean; last?: boolean } = {}) {
  let btns = page.locator("button").filter({ hasText: text });
  if (o.enabledOnly) btns = btns.and(page.locator("button:not([disabled]):not([aria-disabled='true']):not(.TUXButton--disabled)"));
  const n = await btns.count();
  if (!n) return false;
  const b = o.last ? btns.nth(n - 1) : btns.first();
  await b.scrollIntoViewIfNeeded().catch(() => {});
  await b.click().catch(() => b.evaluate((el) => (el as HTMLElement).click()));
  return true;
}

/** Tours, cookie banners, "content check" and copyright/music notices; never touches the product modal. */
async function dismissPopups(page: Page) {
  for (let round = 0; round < 4; round++) {
    const clicked = await page.evaluate(({ dismiss }) => {
      const re = new RegExp(dismiss, "i");
      const inProductModal = (el: Element) => {
        const box = el.closest('[role="dialog"], .TUXModal, [class*="Modal"]');
        return !!box && !!box.querySelector('input[placeholder*="Search products" i], .TUXTextInputCore-input');
      };
      for (const b of document.querySelectorAll('.react-joyride__tooltip button[data-action="skip"], .react-joyride__tooltip button[data-action="close"], button[data-test-id="button-skip"]')) {
        (b as HTMLElement).click();
        return true;
      }
      for (const d of document.querySelectorAll('[role="dialog"], .TUXModal, [class*="Modal" i]')) {
        const t = (d as HTMLElement).innerText || "";
        if (/content check|pemeriksaan konten/i.test(t)) {
          const on = [...d.querySelectorAll("button")].find((x) => /^(turn on|aktifkan)$/i.test(x.innerText.trim()));
          if (on) return on.click(), true;
        }
        if (/copyright|hak cipta|royalty/i.test(t) && !/edit cover|select cover|add product links|search products|discard/i.test(t)) {
          const no = [...d.querySelectorAll("button")].find((x) => /^(cancel|batal|not now|nanti saja|no thanks|tidak)$/i.test(x.innerText.trim()));
          if (no) return no.click(), true;
        }
      }
      for (const b of document.querySelectorAll('button, [role="button"]')) {
        const t = ((b as HTMLElement).innerText || "").toLowerCase().replace(/\s+/g, " ").trim();
        const r = b.getBoundingClientRect();
        if (r.width > 2 && re.test(t) && !inProductModal(b)) return (b as HTMLElement).click(), true;
      }
      return false;
    }, { dismiss: DISMISS.source });
    if (!clicked) return;
    await settle(page, 800);
  }
}

async function debugShot(page: Page, name: string) {
  await fs.mkdir(DEBUG_DIR, { recursive: true });
  const file = path.join(DEBUG_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}-${name}.png`);
  await page.screenshot({ path: file, timeout: 10_000 });
  return file;
}

const settle = (page: Page, ms: number) => page.waitForTimeout(ms + Math.random() * 300);
