import "server-only";
import type { BrowserContext, Locator, Page } from "playwright-core";
import { withProfile } from "@/lib/browser/chrome";

// Reels upload for Instagram and Facebook through their own web apps (ported from the owner's Social Media Uploader
// bot, which posts with the same flows every day). Neither web app can schedule, so the runner calls this at the
// job's time (like YouTube). A dry run fills everything and stops right before the publish button.
// ⚠️ Real accounts: one profile per account, human pace; a checkpoint / captcha stops the run for the user.

export type MetaUploadInput = {
  sessionKey: string;
  file: string; // absolute path of the video
  caption: string;
  dryRun: boolean;
  visible: boolean;
  /** Facebook only: who posts — the personal profile or a Page (id = the profile id Facebook switches to, i_user) */
  postAs?: { kind: "user" | "page"; id: string; name: string } | null;
};
export type MetaUploadResult = { posted: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NEXT = /^(Berikutnya|Next|Selanjutnya)$/i;
const IN_FLOW = /\/(accounts\/login|login|auth_platform|challenge|checkpoint|two_factor|two_step_verification)(\/|\?|$)|login\.php/i;
/** isVisible() does not wait: use this to wait for an optional element. */
const appears = (loc: Locator, ms: number) => loc.waitFor({ timeout: ms }).then(() => true, () => false);

function stopOnCheck(page: Page, label: string) {
  if (IN_FLOW.test(new URL(page.url()).pathname)) throw new Error(`${label} meminta login atau verifikasi keamanan. Buka Akun → Login, selesaikan di jendelanya, lalu ulangi.`);
}

async function typeCaption(page: Page, box: Locator, caption: string) {
  await box.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.insertText(caption);
}
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

async function run<T>(input: MetaUploadInput, fn: (ctx: BrowserContext, page: Page) => Promise<T>) {
  return withProfile(input.sessionKey, { headless: !input.visible }, async (ctx) => {
    const page = await ctx.newPage();
    page.on("dialog", (d) => void d.accept().catch(() => {})); // "leave page?" must never hang a run
    try {
      return await fn(ctx, page);
    } finally {
      await page.close().catch(() => {});
    }
  });
}

/** "Turn on notifications" / "Save login info" prompts: answered with Not now (never anything that posts). */
async function dismissPopups(page: Page) {
  for (let i = 0; i < 3; i++) {
    const later = page.getByRole("button", { name: /^(Not Now|Not now|Lain Kali|Nanti saja|Jangan sekarang)$/i }).filter({ visible: true }).first();
    if (!(await appears(later, 2500))) return;
    await later.click().catch(() => {});
    await sleep(800);
  }
}

// ---------------------------------------------------------------- Instagram
// New post → (Post) → file → "Video posts are now reels" OK → Crop "Original" (9:16 stays 9:16) → Next… → caption → Share.

export async function uploadToInstagram(input: MetaUploadInput, onProgress: (s: string) => void = () => {}): Promise<MetaUploadResult> {
  return run(input, async (_ctx, page) => {
    onProgress("Membuka Instagram...");
    await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await sleep(3000);
    stopOnCheck(page, "Instagram");
    await dismissPopups(page);
    // the visible "new post" entry (hidden copies of the icon exist for other layouts)
    await page
      .locator('svg[aria-label="New post"], svg[aria-label="Postingan baru"], svg[aria-label="Buat"], svg[aria-label="Create"]')
      .filter({ visible: true })
      .first()
      .click({ timeout: 30_000 });
    const sub = page.getByRole("link", { name: /^(Post|Postingan)$/i });
    if (await appears(sub, 2500)) await sub.click();
    const dialog = page.getByRole("dialog").last();
    onProgress("Mengunggah video...");
    await dialog.locator("input[type=file]").last().setInputFiles(input.file, { timeout: 20_000 });
    const ok = page.getByRole("dialog").getByRole("button", { name: /^(OK|Oke)$/i }).last();
    const crop = dialog.locator('svg[aria-label="Select crop"], svg[aria-label="Pilih potong"], svg[aria-label="Pilih pangkas"]');
    await crop.or(ok).first().waitFor({ timeout: 60_000 });
    if (await appears(ok, 3000)) await ok.click();
    if (await appears(crop, 10_000)) {
      await crop.first().click();
      await dialog.getByText(/^(Original|Asli)$/).first().click();
      await sleep(800);
    }
    const box = dialog.locator("[contenteditable=true][role=textbox]");
    for (let i = 0; i < 3 && !(await box.isVisible().catch(() => false)); i++) {
      await dialog.getByRole("button", { name: NEXT }).last().click();
      await sleep(2500);
    }
    await box.waitFor({ timeout: 30_000 });
    if (input.caption) {
      onProgress("Mengisi caption...");
      await typeCaption(page, box, input.caption);
      await sleep(1500);
      if (norm(await box.innerText()) !== norm(input.caption)) throw new Error("Caption Instagram tidak terisi dengan benar.");
    }
    const share = dialog.getByRole("button", { name: /^(Share|Bagikan)$/i }).last();
    await share.waitFor({ timeout: 20_000 });
    if (input.dryRun) return { posted: false };
    onProgress("Membagikan Reel...");
    await share.click();
    await page.getByText(/(has been shared|telah dibagikan|sudah dibagikan|Reel Anda telah dibagikan|Your reel has been shared)/i).first().waitFor({ timeout: 10 * 60_000 });
    return { posted: true };
  });
}

// ---------------------------------------------------------------- Facebook
// As the chosen identity: a Page = switch the session to it ("Buat postingan → Beralih"; Facebook then sets cookie
// i_user = the Page's profile id), the profile = no i_user. Then /reels/create → video → caption → Next… → Posting.

const FINAL = /^(Posting|Post|Kirim|Send|Publikasikan|Publish|Terbitkan|Bagikan|Bagikan sekarang|Share now|Share)$/i;
const actingAs = async (ctx: BrowserContext) => (await ctx.cookies("https://www.facebook.com")).find((c) => c.name === "i_user")?.value || null;

async function actAs(ctx: BrowserContext, page: Page, who: NonNullable<MetaUploadInput["postAs"]>) {
  if (who.kind === "user") {
    // the personal profile: drop the Page switch (Facebook keeps it in the i_user cookie)
    if (await actingAs(ctx)) await ctx.clearCookies({ name: "i_user" });
    return;
  }
  if ((await actingAs(ctx)) === who.id) return;
  await page.goto("https://www.facebook.com/pages/?category=your_pages", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await sleep(5000);
  stopOnCheck(page, "Facebook");
  const card = page
    .locator("div", { has: page.getByText(who.name, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: /Buat postingan|Create post/i }) })
    .last();
  await card.getByRole("button", { name: /Buat postingan|Create post/i }).first().click({ timeout: 20_000 });
  await sleep(2500);
  await page.getByRole("dialog").last().getByRole("button", { name: /^(Ubah|Switch|Beralih)$/i }).click({ timeout: 15_000 });
  await sleep(8000);
  if ((await actingAs(ctx)) !== who.id) throw new Error(`Gagal beralih ke Page ${who.name}.`);
}

/** Click "Berikutnya" until the publish button shows (max 3 steps); returns that button. */
async function advanceToFinal(page: Page) {
  for (let i = 0; i < 4; i++) {
    const fin = page.getByRole("button", { name: FINAL }).last();
    if (await fin.isVisible().catch(() => false)) return fin;
    const next = page.getByRole("button", { name: NEXT }).last();
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click();
    await sleep(2500);
  }
  const fin = page.getByRole("button", { name: FINAL }).last();
  if (await fin.isVisible().catch(() => false)) return fin;
  throw new Error("Tombol posting Facebook tidak ditemukan.");
}

export async function uploadToFacebook(input: MetaUploadInput, onProgress: (s: string) => void = () => {}): Promise<MetaUploadResult> {
  const who = input.postAs;
  if (!who) throw new Error("Pilih dulu 'Posting sebagai' (profil pribadi atau Page) di menu Facebook.");
  return run(input, async (ctx, page) => {
    onProgress(`Beralih ke ${who.name}...`);
    await actAs(ctx, page, who);
    onProgress("Membuka pembuat Reel...");
    await page.goto("https://www.facebook.com/reels/create", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await sleep(3000);
    stopOnCheck(page, "Facebook");
    onProgress("Mengunggah video...");
    await page.locator('input[type=file][accept*="video"]').first().setInputFiles(input.file, { timeout: 30_000 });
    await sleep(6000);
    const box = page.locator("[contenteditable=true][role=textbox]").first();
    await box.waitFor({ timeout: 60_000 });
    // identity check right before publishing: the session must still be acting as the chosen Page / profile
    const now = await actingAs(ctx);
    if (who.kind === "page" ? now !== who.id : now !== null) throw new Error(`Sesi Facebook bukan atas nama ${who.name}; dibatalkan sebelum posting.`);
    if (input.caption) {
      onProgress("Mengisi caption...");
      await typeCaption(page, box, input.caption);
      await sleep(800);
      if (norm(await box.innerText()) !== norm(input.caption)) throw new Error("Caption Facebook tidak terisi dengan benar.");
    }
    const fin = await advanceToFinal(page);
    if (input.dryRun) return { posted: false };
    onProgress("Memposting Reel...");
    await fin.click();
    await page.waitForURL((u) => !u.href.includes("/reels/create"), { timeout: 10 * 60_000 }).catch(() => {});
    return { posted: true };
  });
}
