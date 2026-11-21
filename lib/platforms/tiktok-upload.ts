import "server-only";
import type { Page } from "playwright-core";
import { withProfile } from "@/lib/browser/chrome";

// Post one video through TikTok Studio web (tiktok.com/tiktokstudio/upload) in the account's own Chrome profile,
// driven like a person would: attach file → wait for the upload → caption → product link (keranjang) → Post.
// Ported from V1 (bot-autoupload tiktokUploader.js, raw CDP) to Playwright. Automating uploads is against TikTok's
// terms and can get an account limited: the scheduler keeps a gap between posts per account.

const UPLOAD_URL = "https://www.tiktok.com/tiktokstudio/upload?from=webapp&tab=video";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export type UploadProgress = (stage: string) => void;
export type UploadInput = {
  sessionKey: string;
  file: string;
  caption: string;
  productId?: string | null;
  productTitle?: string | null;
  /** add a random trending sound (search "JJ") in TikTok's editor at this volume (dB, -60…20); null = original audio only */
  music?: { volume: number } | null;
  /** ms epoch: let TikTok publish the post at this time (Studio's own "Schedule"); null/undefined = post now */
  scheduleAt?: number | null;
  dryRun?: boolean;
  visible?: boolean;
};

// one-click dismissals for tours, tips and cookie banners (never "accept all": decline optional cookies instead)
const DISMISS = /^(got it|ok|okay|skip|skip tour|done|dismiss|not now|maybe later|later|no thanks|i understand|understood|decline optional cookies|mengerti|saya mengerti|oke|lewati|selesai|nanti saja|tidak sekarang|tolak cookie opsional|tutup|close)$/i;
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
    if (!hit) break;
    await sleep(600);
  }
  // any other dialog with an X (not the product search, which we fill ourselves)
  for (let i = 0; i < 3; i++) {
    const x = page
      .locator('[role="dialog"]:visible, .TUXModal:visible')
      .filter({ hasNot: page.locator('input[placeholder*="Search products" i], input[placeholder*="Cari produk" i]') })
      .locator('button[aria-label="Close" i], button[aria-label="Tutup" i], [data-e2e="modal-close-inner-button"]')
      .first();
    if (!(await x.isVisible().catch(() => false))) break;
    await x.click({ timeout: 3000 }).catch(() => {});
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
    await page.keyboard.type(line, { delay: 8 }); // typed key by key: this editor ignores insertText in some browsers
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

// ---------------------------------------------------------------- music (TikTok Studio's video editor)
// Verified on TikTok Studio (2026-11-21): the upload form has editor shortcuts (button.editor-entrance
// data-button-name="sounds" = "Suara") opening the editor on its sound panel: "Cari suara" search, rows
// .MusicPanelMusicItem__wrap with a primary "+" button. Adding one selects its clip and shows "Volume" (-60…20 dB,
// slider + text box in .PropSettingAudioVolume__wrap). "Simpan" closes the editor; the video's own audio stays.

const MUSIC_QUERY = "JJ";

/** Add a random sound from the "JJ" search results at `volume` dB, then save the editor. */
async function addMusic(page: Page, volume: number, onProgress: UploadProgress) {
  onProgress("Menambahkan musik JJ...");
  await dismissPopups(page);
  await page.locator('button.editor-entrance[data-button-name="sounds"]').first().click({ timeout: 10_000 });
  await sleep(5000);
  await dismissPopups(page);
  const search = page.getByPlaceholder(/^(cari suara|search sounds)$/i).first();
  await search.fill(MUSIC_QUERY, { timeout: 15_000 });
  await page.keyboard.press("Enter");
  await sleep(4000);
  const items = page.locator(".MusicPanelMusicItem__wrap");
  const n = Math.min(await items.count(), 10);
  if (!n) throw new Error(`Musik "${MUSIC_QUERY}" tidak ditemukan di TikTok. Coba lagi atau matikan musik.`);
  const pick = items.nth(Math.floor(Math.random() * n));
  const name = ((await pick.locator(".MusicPanelMusicItem__infoBasicTitle").textContent().catch(() => "")) ?? "").trim();
  await pick.hover();
  await pick.locator(".MusicPanelMusicItem__operation button.Button__root--type-primary").click({ timeout: 8000 });
  await sleep(4000);
  await dismissPopups(page);

  const v = String(Math.round(Math.max(-60, Math.min(20, volume))));
  const box = page.locator(".PropSettingAudioVolume__wrap input.PropSettingInput__input").first();
  await box.click({ clickCount: 3, timeout: 10_000 });
  await page.keyboard.type(v);
  await page.keyboard.press("Enter");
  await sleep(1000);
  if ((await box.inputValue().catch(() => "")) !== v) throw new Error(`Volume musik di TikTok tidak berubah ke ${v} dB.`);

  await dismissPopups(page);
  await page.locator("button:visible").filter({ hasText: /^(simpan|save)$/i }).first().click({ timeout: 8000 });
  await sleep(4000);
  await dismissPopups(page);
  if (await page.locator(".MusicPanelMusicItem__wrap:visible").count()) throw new Error("Editor TikTok tidak tertutup setelah Simpan.");
  onProgress(`Musik ditambahkan: ${name || MUSIC_QUERY} (${v} dB)`);
}

// ---------------------------------------------------------------- schedule (TikTok Studio's "Waktu posting")
// Verified on TikTok Studio (2026-11-21): radio "Sekarang" / "Jadwalkan" ("Now" / "Schedule"); then a date field
// opening a DatePicker (.DatePicker__day buttons, data-disabled outside the allowed range, "Next month" nav) and a
// time field opening two TimePicker listboxes ("Hours" 00–23, "Minutes" in steps of 5); the zone shows "(GMT+7) …".

const MONTHS: Record<string, number> = {
  januari: 0, january: 0, februari: 1, february: 1, maret: 2, march: 2, april: 3, mei: 4, may: 4, juni: 5, june: 5, juli: 6, july: 6,
  agustus: 7, august: 7, september: 8, oktober: 9, october: 9, november: 10, desember: 11, december: 11,
};

/** Wall-clock parts of `ms` in a fixed UTC offset (minutes). */
function partsAt(ms: number, offsetMin: number) {
  const d = new Date(ms + offsetMin * 60_000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes() };
}

/** Pick "Schedule" and set the date & time TikTok will publish at (minutes rounded up to its 5-minute steps). */
async function setSchedule(page: Page, at: number, onProgress: UploadProgress) {
  onProgress("Mengatur jadwal tayang di TikTok...");
  const block = page.locator("div").filter({ has: page.getByText(/^(waktu posting|when to post)$/i) }).filter({ has: page.getByText(/^(sekarang|now)$/i) }).last();
  await block.getByText(/^(jadwalkan|schedule)$/i).first().click({ timeout: 10_000 });
  await sleep(1200);

  // TikTok shows times in the zone it names next to the fields, e.g. "(GMT+7) Waktu Lokal"
  const zone = (await block.innerText().catch(() => "")).match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  const offset = zone ? (zone[1] === "-" ? -1 : 1) * (Number(zone[2]) * 60 + Number(zone[3] ?? 0)) : 7 * 60;
  const rounded = Math.ceil(at / 300_000) * 300_000; // TikTok's minute list goes 00, 05, 10, …
  const t = partsAt(rounded, offset);

  // date: open the calendar, go to the right month, click the day
  await block.getByText(/\d{1,2} \w{3,9} \d{4}|\w{3,9} \d{1,2}, \d{4}/).first().click({ timeout: 5000 });
  await sleep(800);
  const panel = page.locator(".DatePicker__panel").last();
  for (let i = 0; i < 14; i++) {
    const month = MONTHS[((await panel.locator(".DatePicker__titleMonth").textContent()) ?? "").trim().toLowerCase()];
    const year = Number((await panel.locator(".DatePicker__titleYear").textContent())?.trim());
    if (month == null || !year) throw new Error("Kalender jadwal TikTok tidak terbaca.");
    const diff = t.y * 12 + t.m - (year * 12 + month);
    if (diff === 0) break;
    await panel.getByRole("button", { name: diff > 0 ? /next month|bulan berikutnya/i : /previous month|bulan sebelumnya/i }).click({ timeout: 5000 });
    await sleep(400);
  }
  const dayBtn = panel.locator('.DatePicker__day[data-outside="false"]').filter({ hasText: new RegExp(`^${t.day}$`) }).first();
  if ((await dayBtn.getAttribute("data-disabled")) === "true") {
    throw new Error("TikTok tidak mengizinkan jadwal di tanggal itu (biasanya maksimal ±10 hari ke depan). Pilih jam yang lebih dekat.");
  }
  await dayBtn.click({ timeout: 5000 });
  await sleep(800);

  // time: open the picker, click the hour and the minute
  const pad = (n: number) => String(n).padStart(2, "0");
  await block.getByText(/^\d{2}:\d{2}$/).first().click({ timeout: 5000 });
  await sleep(800);
  await page.getByRole("option", { name: new RegExp(`^(hours|jam) ${pad(t.h)}$`, "i") }).first().click({ timeout: 5000 });
  await sleep(300);
  await page.getByRole("option", { name: new RegExp(`^(minutes|menit) ${pad(t.min)}$`, "i") }).first().click({ timeout: 5000 });
  await sleep(500);
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(500);

  // read it back: the fields must now show our time
  const shown = await block.innerText().catch(() => "");
  if (!shown.includes(`${pad(t.h)}:${pad(t.min)}`)) throw new Error(`Jam jadwal di TikTok tidak berubah ke ${pad(t.h)}:${pad(t.min)}. Cek manual di TikTok Studio.`);
  onProgress(`Jadwal tayang di TikTok: ${t.day}/${t.m + 1}/${t.y} ${pad(t.h)}:${pad(t.min)}`);
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
      if (input.music) {
        await addMusic(page, input.music.volume, onProgress);
        await waitUploaded(page, onProgress); // the edited video is processed again
        await dismissPopups(page);
      }
      if (input.scheduleAt) await setSchedule(page, input.scheduleAt, onProgress);
      if (input.dryRun) {
        if (process.env.TRAKTIVA_UPLOAD_DEBUG) await page.screenshot({ path: process.env.TRAKTIVA_UPLOAD_DEBUG, fullPage: true }).catch(() => {});
        onProgress(input.scheduleAt ? "Uji coba selesai: jadwal terisi, tombol Jadwalkan tidak ditekan." : "Uji coba selesai: semua siap, tombol Post tidak ditekan.");
        await sleep(4000);
        return { posted: false, scheduled: false };
      }
      onProgress(input.scheduleAt ? "Menekan Jadwalkan..." : "Menekan Post...");
      await page.locator(POST).scrollIntoViewIfNeeded().catch(() => {});
      await page.locator(POST).click({ timeout: 15_000 });
      // confirmation dialogs ("Post now", content check not finished, …) and the success message
      const deadline = Date.now() + 120_000;
      let clickedAgain = false;
      while (Date.now() < deadline) {
        await sleep(2000);
        const text = await page.evaluate(() => document.body.innerText).catch(() => "");
        if (SUCCESS.test(text) || /\/tiktokstudio\/content|\/manage/.test(page.url())) return { posted: true, scheduled: !!input.scheduleAt };
        await clickButton(page, /^(post now|posting sekarang|posting saja|continue|lanjutkan|post|posting|schedule|jadwalkan)$/i, '[role="dialog"] button, .TUXModal button, div[class*="modal" i] button');
        const stillThere = await page.locator(POST).isVisible().catch(() => false);
        if (!stillThere) return { posted: true, scheduled: !!input.scheduleAt }; // the form is gone: TikTok accepted it (no retry: avoids a double post)
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
