import "server-only";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { BrowserContext, Page } from "playwright-core";
import { launchProfile } from "@/lib/browser/camoufox";
import { db, DATA_DIR } from "@/lib/db";
import { googleAccounts } from "@/lib/db/schema";
import type { Progress } from "@/lib/flow2api";

// Browser engine for Flow: the Google account's own browser profile opens flow.google.com and drives the
// page like a person (new project → settings → reference image → prompt → generate → wait → download).
// Ported from bot-autoupload's flowVideoRunnerTiktokPov (raw CDP + Chrome) to Playwright on our profiles.
// No API, token or captcha handling: auth is the logged-in profile, Flow's own page does the rest.
//
// Fragile by nature (Flow's UI changes): selectors are kept together below, labels match the Indonesian
// UI (profiles run with locale id-ID) plus English. Every failure saves a screenshot to data/flow-debug.

const FLOW_URL = "https://flow.google.com/";
const IMAGE_TIMEOUT_MS = 8 * 60_000;
const VIDEO_TIMEOUT_MS = 30 * 60_000;
const UPLOAD_TIMEOUT_MS = 5 * 60_000;
const LEASE_WAIT_MS = 20 * 60_000;
const DEBUG_DIR = path.join(/* turbopackIgnore: true */ DATA_DIR, "flow-debug");

const SEL = {
  newProject: { selector: "button, a, [role='button'], div, span", text: "^\\s*(\\+|add|add_2)?\\s*(Project baru|Proyek baru|New project|Buat project)\\s*$" },
  editor: 'flow-rich-text-editor .ProseMirror, div.ProseMirror[contenteditable="true"]',
  settingsTrigger: 'button[aria-label="Pemicu setelan"], button.settings-trigger-button, button[aria-label="Settings trigger"]',
  settingsPanel: "flow-prompt-box-settings",
  modelTrigger: 'flow-prompt-box-settings button[aria-label="Pilih rangkaian model"], flow-prompt-box-settings .model-select-trigger-content',
  menuItems: '.cdk-overlay-container .mat-mdc-menu-panel [role="menuitem"], .cdk-overlay-container [role="listbox"] [role="option"]',
  generate: { selector: 'button[aria-label="Mulai pembuatan"], button.generate-icon-button, button[aria-label="Start generating"]', text: "arrow_forward|Mulai pembuatan|Start generating|Generate" },
  agentClose: '.agent-panel-header button[aria-label="Tutup"], .agent-panel-header button[aria-label="Close"]',
  agentOn: 'flow-agent-mode-toggle-chip button[aria-pressed="true"], button.agent-mode-chip-checked',
  chips: "flow-image-ingredient-chip, flow-ingredient-chip",
  loadingPct: ".loading-percentage",
  errorTile: ".error-tile",
  errorText: ".error-message-text",
  errorRetry: '.error-tile button[aria-label="Coba lagi"], .error-tile button[aria-label="Retry"]',
};
// Flow's first-run onboarding (opt-ins + privacy policy): the user must go through it themselves once.
const ONBOARDING = "app-onboarding-dialog";
const POLICY = /privacy policy|kebijakan privasi|terms of service|persyaratan layanan|experience and shape ai tools/i;
export const ONBOARDING_ERROR = "Akun ini belum menyelesaikan pendaftaran Flow di browser. Buka Pengaturan AI → \"Buka Flow\" pada akun ini, setujui ketentuannya sekali, lalu coba lagi.";
const UNUSUAL = /aktivitas\s+(yang\s+)?tidak\s+biasa|unusual\s+activity/i;
const NO_CREDITS = /insufficient credits|not enough credits|out of (google flow )?credits|kredit\s+(\S+\s+){0,3}(tidak cukup|habis)/i;

type Kind = "image" | "video";
type Job = { kind: Kind; prompt: string; refs: string[]; sec?: number; onStage: Progress };

// ---------- account lease: one job per profile at a time (a profile folder can't be opened twice) ----------

const g = globalThis as unknown as { __flowBrowserRR?: number };
let trace: string[] | null = null; // filled during probeFlowBrowser only

async function leaseProfile(onStage: Progress): Promise<{ ctx: BrowserContext; email: string }> {
  const deadline = Date.now() + LEASE_WAIT_MS;
  let said = false;
  for (;;) {
    const accounts = await db.select().from(googleAccounts).where(eq(googleAccounts.status, "active"));
    if (!accounts.length) throw new Error("Tidak ada akun Google aktif untuk mode browser. Tambahkan/login ulang di Pengaturan AI.");
    // rotate so back-to-back jobs land on different accounts (Flow treats rapid repeats on one account as spam)
    const start = (g.__flowBrowserRR = ((g.__flowBrowserRR ?? -1) + 1) % accounts.length);
    let lastErr: unknown = null;
    for (let k = 0; k < accounts.length; k++) {
      const a = accounts[(start + k) % accounts.length];
      try {
        const ctx = await launchProfile(a.sessionKey, { headless: true, waitMs: 0, maxMs: 35 * 60_000, what: "membuat di Flow (browser)" });
        return { ctx, email: a.email };
      } catch (e) {
        lastErr = e; // busy with another job, or the browser isn't ready yet
      }
    }
    if (lastErr instanceof Error && !/sedang dipakai/i.test(lastErr.message)) throw lastErr;
    if (Date.now() > deadline) throw new Error("Semua akun sedang dipakai mode browser terlalu lama.");
    if (!said) onStage("Menunggu akun Google yang bebas (mode browser)...", 2);
    said = true;
    await sleep(3000);
  }
}

// ---------- public ----------

export function browserFlowImage(prompt: string, refs: string[], onStage: Progress) {
  return runJob({ kind: "image", prompt, refs, onStage });
}

export function browserFlowVideo(prompt: string, frames: string[], sec: number, onStage: Progress) {
  return runJob({ kind: "video", prompt, refs: frames, sec, onStage });
}

/**
 * Dry run for diagnostics: every step up to (not including) "generate", so it costs no credits.
 * Returns what was reached plus a screenshot of the filled-in prompt box.
 */
export async function probeFlowBrowser(kind: Kind, refs: string[] = []) {
  const steps: string[] = [];
  trace = steps;
  const job: Job = { kind, prompt: "Vertical 9:16 test prompt from Traktiva (not submitted).", refs, sec: 6, onStage: (l) => void steps.push(l) };
  const { ctx, email } = await leaseProfile(job.onStage);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "flowb-"));
  const page = await ctx.newPage();
  try {
    await page.goto(FLOW_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await settle(page, 2500);
    steps.push(`url ${page.url()}`);
    steps.push(
      `dom: ${await page.evaluate(() => {
        const btns = [...document.querySelectorAll("button, [role='button'], a")].filter((b) => (b as HTMLElement).innerText?.trim()).slice(0, 40);
        const chain = (el: Element | null) => {
          const out: string[] = [];
          for (let e = el; e && out.length < 7; e = e.parentElement) out.push(`${e.tagName.toLowerCase()}${e.getAttribute("role") ? `[role=${e.getAttribute("role")}]` : ""}${e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}`);
          return out.join(" < ");
        };
        const np = [...document.querySelectorAll("*")].find((e) => /^\s*New project\s*$/i.test((e as HTMLElement).innerText ?? "") && !e.children.length);
        return JSON.stringify({ buttons: btns.map((b) => `${(b as HTMLElement).innerText.trim().slice(0, 30)} :: ${chain(b)}`), newProject: np ? chain(np) : null });
      })}`,
    );
    await newProject(page);
    steps.push(`project ${page.url()}`);
    await dismissPopups(page);
    const panel = await openSettings(page);
    steps.push(`settings panel: ${panel}`);
    if (panel) {
      steps.push(`toggles: ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("flow-toggles")].map((g) => ({ label: g.getAttribute("aria-label"), options: [...g.querySelectorAll('button[role="radio"]')].map((b) => `${(b as HTMLElement).innerText.trim()}${b.getAttribute("aria-checked") === "true" ? "*" : ""}`) }))))}`);
      await page.keyboard.press("Escape");
    }
    await configure(page, job);
    await openSettings(page);
    steps.push(`after configure: ${await page.evaluate(() => (document.querySelector("flow-prompt-box-settings") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 400) ?? "-")}`);
    await page.keyboard.press("Escape");
    if (refs.length) {
      await uploadRefs(page, refs, tmp);
      steps.push(`chips: ${await chipCount(page)}`);
    }
    await typePrompt(page, job.prompt);
    steps.push("prompt typed");
    const gen = await page.evaluate((sel) => !!document.querySelector(sel), SEL.generate.selector);
    steps.push(`generate button found: ${gen}`);
    return { ok: true, email, steps, screenshot: await debugShot(page) };
  } catch (e) {
    return { ok: false, email, steps, error: e instanceof Error ? e.message : String(e), screenshot: await debugShot(page).catch(() => null) };
  } finally {
    trace = null;
    await ctx.close().catch(() => {});
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

async function runJob(job: Job): Promise<string> {
  const { onStage } = job;
  onStage("Membuka Flow di browser akun...", 3);
  const { ctx, email } = await leaseProfile(onStage);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "flowb-"));
  const page = await ctx.newPage();
  const media = new Set<string>(); // video URLs seen on the wire (fallback for the download)
  page.on("response", (r) => {
    const type = r.headers()["content-type"] ?? "";
    if (/^video\//.test(type) || /googlevideo\.com\/videoplayback|\.mp4(\?|$)/.test(r.url())) media.add(r.url());
  });
  try {
    await page.goto(FLOW_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await settle(page, 2500);
    if (/accounts\.google\.com/.test(page.url())) throw new Error(`Sesi Google ${email} habis di browser. Login ulang akunnya.`);

    onStage("Membuat project Flow...", 6);
    await newProject(page);
    await dismissPopups(page);

    onStage("Mengatur mode & model...", 9);
    await configure(page, job);

    if (job.refs.length) {
      onStage(`Mengunggah ${job.refs.length} foto acuan...`, 12);
      await uploadRefs(page, job.refs, tmp);
    }

    onStage("Menulis prompt...", 20);
    await typePrompt(page, job.prompt);
    const before = await resultSnapshot(page);

    onStage("Mengirim ke Flow...", 24);
    if (!(await click(page, { ...SEL.generate, pickLast: true }))) await page.keyboard.press("Enter");

    const found = await waitResult(page, job, before);
    onStage(job.kind === "video" ? "Mengunduh video..." : "Mengunduh gambar...", 93);
    return await download(page, ctx, found, media, job.kind);
  } catch (e) {
    const shot = await debugShot(page).catch(() => null);
    const m = e instanceof Error ? e.message : String(e);
    throw new Error(`[browser] ${m}${shot ? ` (screenshot: ${shot})` : ""}`, { cause: e });
  } finally {
    await ctx.close().catch(() => {});
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------- page steps ----------

async function newProject(page: Page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await dismissPopups(page, 4000);
    if (await needsOnboarding(page)) throw new Error(ONBOARDING_ERROR);
    if (!page.url().includes("/project/")) trace?.push(`new project click: ${await click(page, SEL.newProject)}`);
    const ok = await page.waitForURL(/\/project\//, { timeout: 20_000 }).then(() => true, () => false);
    if (ok && (await page.waitForSelector(SEL.editor, { timeout: 30_000 }).then(() => true, () => false))) {
      // Agent mode would turn the prompt into a chat: switch it off
      await click(page, { selector: SEL.agentClose });
      await click(page, { selector: SEL.agentOn });
      return;
    }
    await page.goto(FLOW_URL, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
    await settle(page, 2500);
  }
  throw new Error("Tidak bisa membuat project baru di Flow.");
}

const needsOnboarding = (page: Page) =>
  page.evaluate(({ onboarding, policySrc }) => {
    if (document.querySelector(onboarding)) return true;
    const re = new RegExp(policySrc, "i");
    return [...document.querySelectorAll('[role="dialog"], mat-dialog-container')].some((d) => re.test((d as HTMLElement).innerText));
  }, { onboarding: ONBOARDING, policySrc: POLICY.source });

/** Visible window on the account's profile at Flow, for first-run setup (closed by the user, or after 20 min). */
export async function openFlowWindow(sessionKey: string) {
  const ctx = await launchProfile(sessionKey, { headless: false, force: true, what: "jendela Flow" });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(FLOW_URL, { waitUntil: "domcontentloaded", timeout: 90_000 }).catch(() => {});
  const timer = setTimeout(() => void ctx.close().catch(() => {}), 20 * 60_000);
  ctx.on("close", () => clearTimeout(timer));
  page.on("close", () => void ctx.close().catch(() => {}));
}

async function configure(page: Page, job: Job) {
  if (!(await openSettings(page))) return; // Flow's defaults still produce a result; the prompt says 9:16
  const toggles: [string[], string][] =
    job.kind === "video"
      ? [
          [["Mode"], "^\\s*Video\\s*$"],
          [["Jenis video", "Video type"], "^\\s*(Bahan|Ingredients)\\s*$"],
          [["Rasio aspek", "Aspect ratio"], "^\\s*9\\s*:\\s*16\\s*$"],
        ]
      : [
          [["Mode"], "^\\s*(Gambar|Image)\\s*$"],
          [["Rasio aspek", "Aspect ratio"], "^\\s*9\\s*:\\s*16\\s*$"],
        ];
  for (const [labels, option] of toggles) await selectToggle(page, labels, option);
  await selectModel(page, job.kind === "video" ? /Omni\s*1\.2\s*Flash/i : /Nano\s*Banana(?!\s*Pro)/i);
  if (job.kind === "video" && job.sec) await setDuration(page, job.sec);
  await selectToggle(page, ["Jumlah output", "Number of outputs", "Outputs"], "^\\s*(x\\s*)?1\\s*$");
  await page.keyboard.press("Escape").catch(() => {});
  await settle(page, 500);
}

async function openSettings(page: Page) {
  for (let i = 0; i < 3; i++) {
    if (await page.$(SEL.settingsPanel)) return true;
    await click(page, { selector: SEL.settingsTrigger, pickLast: true });
    if (await page.waitForSelector(SEL.settingsPanel, { timeout: 4000 }).then(() => true, () => false)) return true;
  }
  return false;
}

/** Pick an option in a `flow-toggles[aria-label=…]` radio group (no-op when already selected or missing). */
async function selectToggle(page: Page, labels: string[], optionRe: string) {
  for (let i = 0; i < 2; i++) {
    const target = await page.evaluate(
      ({ labels, optionRe }) => {
        const groups = [...document.querySelectorAll("flow-toggles")].filter((g) => labels.some((l) => (g.getAttribute("aria-label") ?? "").toLowerCase() === l.toLowerCase()));
        const re = new RegExp(optionRe, "i");
        for (const grp of groups) {
          for (const b of grp.querySelectorAll('button[role="radio"]')) {
            const t = ((b.querySelector(".toggle-text") as HTMLElement | null)?.innerText ?? (b as HTMLElement).innerText ?? "").trim();
            if (!re.test(t)) continue;
            if (b.getAttribute("aria-checked") === "true") return "done";
            const r = b.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }
        }
        return null;
      },
      { labels, optionRe },
    );
    if (!target || target === "done") return;
    await mouseClick(page, target);
    await settle(page, 400);
  }
}

async function selectModel(page: Page, want: RegExp) {
  const current = await page.evaluate((sel) => (document.querySelector(sel) as HTMLElement | null)?.innerText ?? "", ".model-select-trigger-content");
  if (want.test(current)) return;
  if (!(await click(page, { selector: SEL.modelTrigger }))) return;
  await settle(page, 600);
  const target = await page.evaluate(
    ({ sel, src, flags }) => {
      const re = new RegExp(src, flags);
      const el = [...document.querySelectorAll(sel)].find((e) => re.test((e as HTMLElement).innerText));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    { sel: SEL.menuItems, src: want.source, flags: want.flags },
  );
  if (target) await mouseClick(page, target);
  else await page.keyboard.press("Escape");
  await settle(page, 500);
}

/** Omni's duration is a slider whose value is not seconds: nudge it until the label shows `sec`. */
async function setDuration(page: Page, sec: number) {
  const read = () =>
    page.evaluate(() => {
      const t = (document.querySelector("flow-prompt-box-settings") as HTMLElement | null)?.innerText ?? "";
      const m = t.match(/(?:Durasi|Duration)\s*(\d+)\s*(?:dtk|detik|sec|s)/i);
      return m ? Number(m[1]) : null;
    });
  const slider = await page.$('flow-prompt-box-settings input[type="range"]');
  if (!slider) {
    await selectToggle(page, ["Durasi", "Duration"], `^\\s*${sec}\\s*(dtk|detik|s|sec)?\\s*$`);
    return;
  }
  await slider.focus();
  for (let i = 0; i < 20; i++) {
    const now = await read();
    if (now == null || now === sec) return;
    await page.keyboard.press(now < sec ? "ArrowRight" : "ArrowLeft");
    await settle(page, 150);
  }
}

async function uploadRefs(page: Page, refs: string[], tmp: string) {
  const files: string[] = [];
  for (const [i, ref] of refs.entries()) {
    const m = ref.match(/^data:([^;,]+);base64,([\s\S]*)$/);
    if (!m) continue;
    const ext = m[1].includes("png") ? ".png" : m[1].includes("webp") ? ".webp" : ".jpg";
    const file = path.join(tmp, `ref-${i + 1}${ext}`);
    await fs.writeFile(file, Buffer.from(m[2], "base64"));
    files.push(file);
  }
  if (!files.length) return;
  const startChips = await chipCount(page);

  // 1) a real file input (trusted, like choosing files in the dialog)
  let sent = false;
  const input = await page.$('input[type="file"]');
  if (input) {
    sent = await input.setInputFiles(files).then(() => true, () => false);
  }
  // 2) paste the images into the prompt editor (what bot-autoupload does through the OS clipboard)
  if (!sent || !(await waitChips(page, startChips + 1, 8000))) {
    const payload = await Promise.all(files.map(async (f) => ({ name: path.basename(f), type: f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "image/jpeg", b64: (await fs.readFile(f)).toString("base64") })));
    await page.click(SEL.editor).catch(() => {});
    await page.evaluate(
      ({ sel, payload }) => {
        const dt = new DataTransfer();
        for (const p of payload) {
          const bin = Uint8Array.from(atob(p.b64), (c) => c.charCodeAt(0));
          dt.items.add(new File([bin], p.name, { type: p.type }));
        }
        const ed = document.querySelector(sel) as HTMLElement | null;
        ed?.focus();
        ed?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      },
      { sel: SEL.editor, payload },
    );
  }
  await acceptRightsDialog(page);
  if (!(await waitChips(page, startChips + files.length, UPLOAD_TIMEOUT_MS))) {
    if ((await chipCount(page)) <= startChips) throw new Error("Foto acuan tidak terunggah ke Flow.");
  }
}

const chipCount = (page: Page) =>
  page.evaluate((sel) => {
    return [...document.querySelectorAll(sel)].filter((c) => {
      const b = c.querySelector("button");
      const img = c.querySelector("img") as HTMLImageElement | null;
      return b?.getAttribute("aria-busy") !== "true" && (!img || (img.complete && img.naturalWidth > 0));
    }).length;
  }, SEL.chips);

async function waitChips(page: Page, want: number, timeout: number) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    await acceptRightsDialog(page);
    const busy = await page.$(SEL.loadingPct);
    if (!busy && (await chipCount(page)) >= want) return true;
    await sleep(1000);
  }
  return false;
}

/** "I have the right to use these images" — must be a real mouse click (a DOM click is ignored). */
async function acceptRightsDialog(page: Page) {
  const target = await page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role="dialog"], mat-dialog-container, .cdk-overlay-pane')];
    for (const d of dialogs) {
      if (!/hak untuk menggunakan|right to use|have the rights?|memiliki hak/i.test((d as HTMLElement).innerText)) continue;
      const b = [...d.querySelectorAll("button")].find((x) => /^(saya setuju|setuju|i agree|agree)$/i.test(x.innerText.trim()));
      if (b) {
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return null;
  });
  if (target) {
    await mouseClick(page, target, 16);
    await settle(page, 800);
  }
}

async function typePrompt(page: Page, prompt: string) {
  await dismissPopups(page);
  const ed = page.locator(SEL.editor).first();
  await ed.click();
  await page.keyboard.press("Control+End").catch(() => {});
  await page.keyboard.insertText(prompt);
  await settle(page, 400);
  const len = await ed.evaluate((el) => (el as HTMLElement).innerText.trim().length).catch(() => 0);
  if (len < Math.min(20, prompt.length)) throw new Error("Prompt tidak masuk ke kotak Flow.");
}

// ---------- wait + result ----------

type Snapshot = { imgs: string[]; videos: string[] };
type Found = { kind: "img" | "video"; src: string } | { kind: "tile" };

/** Result media already on the page before submitting (reference chips, older tiles) — not ours. */
const resultSnapshot = (page: Page): Promise<Snapshot> =>
  page.evaluate((chips) => {
    const inChip = (el: Element) => !!el.closest(chips + ", flow-prompt-box, flow-rich-text-editor");
    return {
      imgs: [...document.querySelectorAll("img")].filter((i) => !inChip(i)).map((i) => (i as HTMLImageElement).currentSrc || (i as HTMLImageElement).src),
      videos: [...document.querySelectorAll("video")].map((v) => (v as HTMLVideoElement).currentSrc || (v as HTMLVideoElement).src),
    };
  }, SEL.chips);

async function waitResult(page: Page, job: Job, before: Snapshot): Promise<Found> {
  const t0 = Date.now();
  const timeout = job.kind === "video" ? VIDEO_TIMEOUT_MS : IMAGE_TIMEOUT_MS;
  let sawPct = false;
  let retries = 0;
  let pct = 26;
  while (Date.now() - t0 < timeout) {
    await sleep(3500);
    await acceptRightsDialog(page);
    const s = await page.evaluate(
      ({ sel, before, kind }) => {
        const text = document.body.innerText;
        const err = document.querySelector(sel.errorTile);
        const pctEl = document.querySelector(sel.loadingPct) as HTMLElement | null;
        const inChip = (el: Element) => !!el.closest(sel.chips + ", flow-prompt-box, flow-rich-text-editor");
        let found: { kind: "img" | "video"; src: string } | { kind: "tile" } | null = null;
        if (!pctEl) {
          if (kind === "video") {
            const v = [...document.querySelectorAll("video")].find((x) => {
              const vv = x as HTMLVideoElement;
              const src = vv.currentSrc || vv.src;
              return src && !before.videos.includes(src) && vv.readyState >= 1 && vv.duration > 1;
            }) as HTMLVideoElement | undefined;
            if (v) found = { kind: "video", src: v.currentSrc || v.src };
            else if ([...document.querySelectorAll("flow-video-tile")].some((t) => /play_circle/.test((t as HTMLElement).innerText) && !!t.querySelector("img.thumbnail"))) found = { kind: "tile" };
          } else {
            const img = [...document.querySelectorAll("img")].find((x) => {
              const i = x as HTMLImageElement;
              const src = i.currentSrc || i.src;
              return src && !inChip(i) && !before.imgs.includes(src) && i.complete && i.naturalWidth >= 256 && i.naturalHeight >= 256;
            }) as HTMLImageElement | undefined;
            if (img) found = { kind: "img", src: img.currentSrc || img.src };
          }
        }
        return {
          unusual: text,
          error: err ? ((err.querySelector(sel.errorText) as HTMLElement | null)?.innerText ?? (err as HTMLElement).innerText).trim().slice(0, 200) : null,
          pct: pctEl ? Number(pctEl.innerText.match(/(\d{1,3})\s*%/)?.[1] ?? NaN) : null,
          found,
        };
      },
      { sel: SEL, before, kind: job.kind },
    );
    if (UNUSUAL.test(s.unusual)) throw new Error("Flow menandai aktivitas tidak biasa di akun ini. Istirahatkan akun beberapa jam.");
    if (NO_CREDITS.test(s.unusual)) throw new Error("Kredit Flow akun ini habis.");
    if (s.error) {
      if (/kebijakan|policy|safety|tidak dapat membuat|can't generate|cannot generate/i.test(s.error)) throw new Error(`Flow menolak prompt: ${s.error}`);
      if (retries++ >= 3) throw new Error(`Flow gagal: ${s.error}`);
      job.onStage(`Flow gagal (${s.error.slice(0, 60)}), coba lagi ${retries}/3...`, pct);
      await click(page, { selector: SEL.errorRetry, pickLast: true });
      continue;
    }
    if (s.pct != null && Number.isFinite(s.pct)) {
      sawPct = true;
      pct = Math.max(pct, Math.min(92, 26 + Math.round(s.pct * 0.66)));
      job.onStage(`${job.kind === "video" ? "Video" : "Gambar"} sedang dibuat di Flow (browser) ${s.pct}%`, pct);
      continue;
    }
    // tiles appear as soon as rendering starts, so "done" needs progress seen or some time passed
    if (s.found && (sawPct || Date.now() - t0 > 40_000)) return s.found;
    pct = Math.min(90, pct + 1);
    job.onStage(`${job.kind === "video" ? "Video" : "Gambar"} sedang dibuat di Flow (browser)...`, pct);
  }
  throw new Error(`Flow (browser) tidak selesai dalam ${Math.round(timeout / 60_000)} menit.`);
}

async function download(page: Page, ctx: BrowserContext, found: Found, media: Set<string>, kind: Kind): Promise<string> {
  const mime = kind === "video" ? "video/mp4" : "image/png";
  let src = found.kind === "tile" ? null : found.src;
  if (!src && kind === "video") {
    // open the finished tile so the player loads the clip
    await click(page, { selector: "flow-video-tile img.thumbnail", pickLast: true });
    await settle(page, 3000);
    src = await page.evaluate(() => {
      const v = [...document.querySelectorAll("video")].find((x) => (x as HTMLVideoElement).currentSrc) as HTMLVideoElement | undefined;
      return v?.currentSrc ?? null;
    });
  }
  const candidates = [src, ...[...media].reverse()].filter((x): x is string => !!x);
  for (const url of candidates) {
    if (url.startsWith("data:")) return url;
    if (url.startsWith("blob:")) {
      const b64 = await page.evaluate(async (u) => {
        const blob = await (await fetch(u)).blob();
        return await new Promise<string>((r) => {
          const fr = new FileReader();
          fr.onload = () => r(String(fr.result));
          fr.readAsDataURL(blob);
        });
      }, url).catch(() => null);
      if (b64) return b64;
      continue;
    }
    // full file, with the profile's cookies (a range= URL only returns part of the stream)
    const clean = url.replace(/([?&])range=[^&]*&?/, "$1").replace(/[?&]$/, "");
    const res = await ctx.request.get(clean, { headers: { Referer: "https://labs.google/" }, timeout: 180_000 }).catch(() => null);
    if (!res?.ok()) continue;
    const body = await res.body();
    if (body.length < (kind === "video" ? 100_000 : 10_000)) continue;
    const type = res.headers()["content-type"]?.split(";")[0] || mime;
    return `data:${type.startsWith(kind === "video" ? "video/" : "image/") ? type : mime};base64,${body.toString("base64")}`;
  }
  throw new Error("Hasil Flow tidak bisa diunduh dari browser.");
}

// ---------- helpers ----------

type ClickOpts = { selector: string; text?: string; pickLast?: boolean };

/** Find a visible element (optionally by text/aria-label regex) and click it with a real mouse. */
async function click(page: Page, o: ClickOpts) {
  const target = await page.evaluate(({ selector, text, pickLast }) => {
    const re = text ? new RegExp(text, "i") : null;
    const els = [...document.querySelectorAll(selector)].filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return false;
      if (!re) return true;
      return re.test(`${(el as HTMLElement).innerText ?? ""}`.trim()) || re.test(el.getAttribute("aria-label") ?? "");
    });
    // with a text match, prefer the innermost element (a wrapper div matches the same text)
    const cand = re ? els.filter((e) => !els.some((o) => o !== e && e.contains(o))) : els;
    const el = pickLast ? cand.at(-1) : cand[0];
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, o);
  if (!target) return false;
  await mouseClick(page, target);
  return true;
}

async function mouseClick(page: Page, p: { x: number; y: number }, steps = 8) {
  const j = () => Math.random() * 4 - 2;
  await page.mouse.move(p.x + j(), p.y + j(), { steps });
  await sleep(60 + Math.random() * 120);
  await page.mouse.down();
  await sleep(40 + Math.random() * 60);
  await page.mouse.up();
}

/**
 * Close banners/onboarding that cover the editor (never accepts policies). Dialogs can show up seconds
 * after load, so keep looking until nothing has appeared for `calmMs`.
 */
async function dismissPopups(page: Page, calmMs = 1500, maxMs = 12_000) {
  const end = Date.now() + maxMs;
  let calmSince = Date.now();
  for (let clicks = 0; Date.now() < end && clicks < 8; ) {
    const target = await page.evaluate(({ onboarding, policySrc }) => {
      const policy = new RegExp(policySrc, "i");
      const scopes = [...document.querySelectorAll('[role="dialog"], mat-dialog-container, .cdk-overlay-pane, flow-smart-app-banner, flow-retention-optin-banner, flow-banner')];
      for (const s of scopes) {
        if (/hak untuk menggunakan|right to use/i.test((s as HTMLElement).innerText)) continue; // handled by acceptRightsDialog
        // first-run onboarding / policy consent is the user's to accept, never clicked here
        if (s.querySelector(onboarding) || s.matches(onboarding) || policy.test((s as HTMLElement).innerText)) continue;
        const b = [...s.querySelectorAll("button")].find((x) =>
          // dismiss-type buttons only (never sign-out, accept or consent)
          /^(close|tutup|nanti|lain kali|not now|no thanks|tidak, terima kasih|mengerti|got it|oke|ok|lewati|skip|dismiss)$/i.test((x.innerText || x.getAttribute("aria-label") || "").trim()),
        );
        if (b) {
          const r = b.getBoundingClientRect();
          if (r.width > 2) return { x: r.left + r.width / 2, y: r.top + r.height / 2, what: `${b.innerText.trim()} @ ${(s as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 80)}` };
        }
      }
      return null;
    }, { onboarding: ONBOARDING, policySrc: POLICY.source });
    if (target) trace?.push(`popup: click "${target.what}" at ${Math.round(target.x)},${Math.round(target.y)}`);
    if (!target) {
      if (Date.now() - calmSince >= calmMs) return;
      await sleep(400);
      continue;
    }
    await mouseClick(page, target);
    clicks++;
    await settle(page, 700);
    calmSince = Date.now();
  }
}

async function debugShot(page: Page) {
  await fs.mkdir(DEBUG_DIR, { recursive: true });
  const file = path.join(DEBUG_DIR, `flow-${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
  await page.screenshot({ path: file, timeout: 10_000 });
  return file;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const settle = (page: Page, ms: number) => page.waitForTimeout(ms + Math.random() * 300);
