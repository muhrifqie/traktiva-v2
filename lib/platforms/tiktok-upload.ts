import "server-only";
import type { Page } from "playwright-core";
import { withProfile } from "@/lib/browser/camoufox";

// Post one video through TikTok Studio web (tiktok.com/tiktokstudio/upload) in the account's own Camoufox profile,
// driven like a person would: attach file → wait for the upload → caption → product link (keranjang) → Post.
// Ported from V1 (bot-autoupload tiktokUploader.js, raw CDP) to Playwright. Automating uploads is against TikTok's
// terms and can get an account limited: the scheduler keeps a gap between posts per account.

const UPLOAD_URL = "https://www.tiktok.com/tiktokstudio/upload?from=webapp&tab=video";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export type UploadProgress = (stage: string) => void;
export type UploadInput = { sessionKey: string; file: string; caption: string; productId?: string | null; productTitle?: string | null; dryRun?: boolean; visible?: boolean };

// one-click dismissals for tours, tips and cookie banners (never "accept all": decline optional cookies instead)
const DISMISS = /^(got it|ok|okay|skip|skip tour|done|dismiss|not now|maybe later|later|no thanks|i understand|understood|decline optional cookies|mengerti|saya mengerti|oke|lewati|selesai|nanti saja|tidak sekarang|tolak cookie opsional)$/i;
const SUCCESS = /Your video has been uploaded|Video Anda telah diunggah|Manage your posts|Kelola postingan|Video published|Video dipublikasikan|has been scheduled|telah dijadwalkan/i;
const EDITOR = '.public-DraftEditor-content[contenteditable="true"], .caption-editor [contenteditable="true"], .notranslate[contenteditable="true"]';
const POST = 'button[data-e2e="post_video_button"]';

async function dismissPopups(page: Page) {
  // "Aktifkan pemeriksaan konten otomatis?" blocks the whole form; its buttons need a real click (DOM click() is ignored)
  const turnOn = page.getByRole("button", { name: /^(turn on|aktifkan)$/i }).last();
  if (await turnOn.isVisible().catch(() => false)) {
    await turnOn.click({ timeout: 5000 }).catch(() => {});
    await sleep(800);
  }
  // guided tour (react-joyride): skip/close/last step, else Escape, until its overlay is gone
  for (let i = 0; i < 6 && (await page.locator(".react-joyride__overlay, .react-joyride__tooltip").first().isVisible().catch(() => false)); i++) {
    const b = page.locator('.react-joyride__tooltip button[data-action="skip"], .react-joyride__tooltip button[data-action="close"], .react-joyride__tooltip button[data-action="primary"], .react-joyride__tooltip button').first();
    if (await b.isVisible().catch(() => false)) await b.click({ timeout: 3000 }).catch(() => {});
    else await page.keyboard.press("Escape");
    await sleep(700);
  }
  for (let round = 0; round < 3; round++) {
    const hit = await page
      .evaluate((src) => {
        const re = new RegExp(src, "i");
        // no named helper functions in here: dev scripts (tsx) wrap them with __name, which the page doesn't have
        for (const b of document.querySelectorAll<HTMLButtonElement>("button")) {
          const t = (b.innerText || "").trim();
          if (b.getClientRects().length && re.test(t) && !b.closest('[role="dialog"]')?.querySelector('input[placeholder*="Search products" i]')) {
            b.click();
            return t;
          }
        }
        // "Aktifkan pemeriksaan konten otomatis?" (appears right after the file is attached and blocks the form):
        // keep it on, TikTok checks copyright/eligibility before posting
        if (/content check|pemeriksaan konten|pemeriksaan hak cipta/i.test(document.body.innerText))
          for (const b of document.querySelectorAll<HTMLButtonElement>("button")) if (b.getClientRects().length && /^(turn on|aktifkan)$/i.test(b.innerText.trim())) return b.click(), "turn on";
        return null;
      }, DISMISS.source)
      .catch(() => null);
    if (!hit) return;
    await sleep(600);
  }
}

/** Wait until the upload/processing is done: the Post button exists and is neither disabled nor loading. */
async function waitUploaded(page: Page, onProgress: UploadProgress, timeoutMs = 6 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const st = await page
      .evaluate((sel) => {
        const b = document.querySelector<HTMLButtonElement>(sel);
        const pct = document.body.innerText.match(/(\d{1,3})\s?%/)?.[1];
        const failed = /upload failed|gagal mengunggah|couldn't upload|tidak dapat mengunggah/i.test(document.body.innerText);
        return { ready: !!b && !b.disabled && b.getAttribute("aria-disabled") !== "true" && b.getAttribute("data-loading") !== "true", pct, failed };
      }, POST)
      .catch(() => ({ ready: false, pct: undefined, failed: false }));
    if (st.failed) throw new Error("TikTok menolak upload video (upload failed).");
    if (st.ready) return;
    onProgress(`Mengunggah video${st.pct ? ` ${st.pct}%` : ""}...`);
    await sleep(2000);
  }
  throw new Error("Upload video ke TikTok terlalu lama (lebih dari 6 menit).");
}

async function writeCaption(page: Page, caption: string) {
  const box = page.locator(EDITOR).first();
  await box.waitFor({ state: "visible", timeout: 90_000 });
  await sleep(1500);
  // dialogs pop up a few seconds after the file is attached: dismiss, then click (retry if something covers it)
  for (let i = 0; ; i++) {
    await dismissPopups(page);
    try {
      // from the 3rd try: force (TikTok animates the form while the video processes, so it is never "stable")
      await box.click({ timeout: 5000, force: i >= 2 });
      break;
    } catch (e) {
      if (i >= 5) {
        // say what is in the way (helps fix the next TikTok UI change)
        const cover = await page
          .evaluate((sel) => {
            const ed = document.querySelector<HTMLElement>(sel);
            ed?.scrollIntoView({ block: "center" });
            const r = ed?.getBoundingClientRect();
            const top = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return top ? `${top.tagName.toLowerCase()}.${String(top.className).slice(0, 50)} "${(top as HTMLElement).innerText?.slice(0, 60) ?? ""}"` : "?";
          }, EDITOR)
          .catch(() => "?");
        throw new Error(`Kolom caption TikTok tidak bisa diklik (${cover}): ${e instanceof Error ? e.message.split("\n").slice(0, 6).join(" / ") : e}`, { cause: e });
      }
      await sleep(1500);
    }
  }
  // TikTok pre-fills the file name: clear it (select all + Backspace, twice to be sure)
  for (let i = 0; i < 3; i++) {
    await box.click({ force: true });
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Backspace");
    if (!(await box.innerText()).trim()) break;
  }
  const lines = caption.trim().split("\n");
  for (const [i, line] of lines.entries()) {
    if (i) await page.keyboard.press("Enter");
    await page.keyboard.type(line, { delay: 8 }); // insertText fails in Firefox (Camoufox) on this editor
    // a typed #hashtag opens a suggestion list; Escape closes it without picking one
    if (/#\S+$/.test(line)) await page.keyboard.press("Escape").catch(() => {});
  }
}

const clickButton = (page: Page, re: RegExp, scope = "button") =>
  page
    .evaluate(
      ([src, flags, sel]) => {
        const r = new RegExp(src, flags);
        const all = [...document.querySelectorAll<HTMLButtonElement>(sel)].filter((b) => b.getClientRects().length && r.test((b.innerText || "").trim()) && !b.disabled && b.getAttribute("aria-disabled") !== "true");
        const b = all[all.length - 1];
        if (!b) return false;
        b.click();
        return true;
      },
      [re.source, re.flags, scope] as const,
    )
    .catch(() => false);

/** Add the TikTok Shop product (keranjang) by its product ID from the showcase. Throws if it isn't found. */
async function addProduct(page: Page, productId: string, title: string, onProgress: UploadProgress) {
  onProgress("Menautkan produk keranjang...");
  if (!(await clickButton(page, /^\+?\s*(add|tambah)(\s+(product\s+links|tautan produk))?$/i))) throw new Error("Tombol 'Add product links' tidak ditemukan (akun belum bisa menautkan produk?).");
  await sleep(3000);
  // step 1 (not always shown): "Jenis tautan / Link type: Produk" → Berikutnya, clicked inside that dialog only
  const typeStep = page.locator("div").filter({ has: page.getByText(/^(jenis tautan|link type)$/i) }).filter({ has: page.getByRole("button", { name: /^(batal|cancel)$/i }) }).last();
  if (await typeStep.isVisible().catch(() => false)) {
    await typeStep.getByRole("button", { name: /^(next|berikutnya|selanjutnya)$/i }).last().click({ timeout: 5000 });
    await sleep(2500);
  }
  // accounts with their own shop open on "My shop / Toko saya": switch to the affiliate showcase tab (real click)
  const tab = page.getByText(/^(produk etalase|showcase products?|etalase)$/i).first();
  if (await tab.isVisible().catch(() => false)) {
    await tab.click({ timeout: 5000 }).catch(() => {});
    await sleep(2000);
  }
  const search = page.getByPlaceholder(/search products|cari produk/i).filter({ visible: true }).first();
  await search.waitFor({ state: "visible", timeout: 15_000 }).catch(async (e) => {
    const seen = await page
      .evaluate(() => {
        const dlg = [...document.querySelectorAll('[role="dialog"], .TUXModal, [class*="modal" i]')].filter((el) => (el as HTMLElement).getClientRects().length > 0).map((d) => (d as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 200));
        const inputs = [...document.querySelectorAll("input")].filter((el) => el.getClientRects().length > 0).map((i) => i.placeholder || i.type);
        return `dialog: ${dlg.slice(0, 2).join(" || ")} | input: ${inputs.join(", ")}`;
      })
      .catch((err) => `? ${err instanceof Error ? err.message.slice(0, 120) : ""}`);
    if (process.env.TRAKTIVA_UPLOAD_DEBUG) await page.screenshot({ path: process.env.TRAKTIVA_UPLOAD_DEBUG }).catch(() => {});
    throw new Error(`Kotak cari produk tidak muncul. ${seen}`, { cause: e });
  });
  await search.click();
  await search.fill(productId);
  await search.press("Enter");
  await sleep(1500);
  // the row with this exact product ID (never a fallback row: a wrong product is worse than none)
  const row = page.locator("tr, [role='row']").filter({ hasText: productId }).filter({ visible: true }).first();
  await row.waitFor({ state: "visible", timeout: 15_000 }).catch(async (e) => {
    if (process.env.TRAKTIVA_UPLOAD_DEBUG) await page.screenshot({ path: process.env.TRAKTIVA_UPLOAD_DEBUG }).catch(() => {});
    throw new Error(`Produk ${productId} tidak ada di etalase akun ini. Tambahkan dulu ke etalase (TikTok Shop).`, { cause: e });
  });
  if (/tidak tersedia|unavailable|habis|out of stock|nonaktif|inactive/i.test(await row.innerText().catch(() => "")))
    throw new Error(`Produk ${productId} sedang "tidak tersedia" di etalase (stok habis/nonaktif), jadi tidak bisa ditautkan. Pilih produk lain atau kosongkan ID produk.`);
  await row.locator('input[type="radio"], .TUXRadioStandalone, [role="radio"], label').first().click({ force: true });
  // the product modal = innermost box holding its title and a Cancel button; every click below stays inside it
  const modal = page.locator("div").filter({ has: page.getByText(/^(tambah tautan produk|add product links?)$/i) }).filter({ has: page.getByRole("button", { name: /^(batal|cancel)$/i }) }).last();
  const enabledClick = async (name: RegExp, what: string) => {
    const b = modal.getByRole("button", { name }).last();
    for (let i = 0; i < 10 && !(await b.isEnabled().catch(() => false)); i++) await sleep(500);
    if (!(await b.isEnabled().catch(() => false))) throw new Error(`Tombol "${what}" di jendela produk tidak aktif.`);
    await b.click({ timeout: 5000 });
  };
  await enabledClick(/^(next|berikutnya|selanjutnya)$/i, "Berikutnya");
  await sleep(2000);
  // product link title: letters/digits only, max 30 characters
  const clean = title.replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim().slice(0, 30);
  const field = modal.locator("input").filter({ visible: true }).last();
  if (await field.isVisible().catch(() => false)) await field.fill(clean.length >= 5 ? clean : "Cek produknya di sini");
  if (process.env.TRAKTIVA_UPLOAD_DEBUG) await page.screenshot({ path: process.env.TRAKTIVA_UPLOAD_DEBUG.replace(/\.png$/, "-judul.png") }).catch(() => {});
  await enabledClick(/^(add|tambah)$/i, "Tambah");
  await sleep(2000);
  if (await modal.isVisible().catch(() => false)) throw new Error("Tautan produk belum tersimpan (jendela produk masih terbuka).");
}

/** Upload one video. dryRun = do everything except pressing Post (to test an account). Returns when TikTok confirms. */
export async function uploadToTikTok(input: UploadInput, onProgress: UploadProgress = () => {}) {
  return withProfile(input.sessionKey, { headless: !input.visible }, async (ctx) => {
    const page = await ctx.newPage();
    try {
      onProgress("Membuka TikTok Studio...");
      await page.goto(UPLOAD_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
      if (/\/login/.test(page.url())) throw new Error("Akun TikTok ini perlu login ulang (Akun Sosial).");
      await sleep(3000);
      await dismissPopups(page);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.waitFor({ state: "attached", timeout: 30_000 });
      onProgress("Mengunggah video...");
      await fileInput.setInputFiles(input.file);
      await sleep(4000);
      await writeCaption(page, input.caption);
      await dismissPopups(page);
      if (input.productId) await addProduct(page, input.productId, input.productTitle ?? "", onProgress);
      await waitUploaded(page, onProgress);
      await dismissPopups(page);
      if (input.dryRun) {
        if (process.env.TRAKTIVA_UPLOAD_DEBUG) await page.screenshot({ path: process.env.TRAKTIVA_UPLOAD_DEBUG, fullPage: true }).catch(() => {});
        onProgress("Uji coba selesai: semua siap, tombol Post tidak ditekan.");
        await sleep(4000);
        return { posted: false };
      }
      onProgress("Menekan Post...");
      await page.locator(POST).scrollIntoViewIfNeeded().catch(() => {});
      await page.locator(POST).click({ timeout: 15_000 });
      // confirmation dialogs ("Post now", content check not finished, …) and the success message
      const deadline = Date.now() + 120_000;
      let clickedAgain = false;
      while (Date.now() < deadline) {
        await sleep(2000);
        const text = await page.evaluate(() => document.body.innerText).catch(() => "");
        if (SUCCESS.test(text) || /\/tiktokstudio\/content|\/manage/.test(page.url())) return { posted: true };
        await clickButton(page, /^(post now|posting sekarang|posting saja|continue|lanjutkan|post|posting)$/i, '[role="dialog"] button, .TUXModal button, div[class*="modal" i] button');
        const stillThere = await page.locator(POST).isVisible().catch(() => false);
        if (!stillThere) return { posted: true }; // the form is gone: TikTok accepted it (no retry: avoids a double post)
        if (!clickedAgain && Date.now() > deadline - 90_000) {
          clickedAgain = true;
          await page.locator(POST).click({ timeout: 5000 }).catch(() => {});
        }
      }
      throw new Error("TikTok tidak mengonfirmasi postingan dalam 2 menit. Cek manual di TikTok Studio sebelum mencoba lagi.");
    } finally {
      await page.close().catch(() => {});
    }
  });
}
