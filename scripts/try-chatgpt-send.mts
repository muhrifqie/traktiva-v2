// Dev check: send one message on the ChatGPT standby page and dump what the page shows afterwards.
// Usage: npx tsx --conditions=react-server scripts/try-chatgpt-send.mts [plain]   (plain = no resource blocking)
import { launchProfile, standbyProfile, withProfile } from "@/lib/browser/camoufox";
import { CHAT_URL } from "@/lib/platforms/chatgpt";
import { getSettings } from "@/lib/settings";

const key = getSettings().chatgpt!.profileKey;
if (process.argv[2] === "plain") {
  const ctx = await launchProfile(key, { headless: true });
  await run(ctx);
  await ctx.close();
} else {
  await standbyProfile(key, CHAT_URL);
  await withProfile(key, { headless: true }, run);
}
process.exit(0);

async function run(ctx: import("playwright-core").BrowserContext) {
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(CHAT_URL, { waitUntil: "domcontentloaded" });
  const box = page.locator('div.ProseMirror[contenteditable="true"]').first();
  await box.waitFor({ state: "visible", timeout: 30_000 });
  await box.click();
  await box.fill('Balas HANYA JSON: {"n":1}');
  console.log("editor text after fill:", JSON.stringify(await box.innerText()));
  await box.press("Enter");
  for (const s of [3, 10, 20]) {
    await new Promise((r) => setTimeout(r, s === 3 ? 3000 : s === 10 ? 7000 : 10000));
    const info = await page.evaluate(() => ({
      url: location.href,
      roles: [...document.querySelectorAll("[data-message-author-role]")].map((e) => `${e.getAttribute("data-message-author-role")}: ${(e as HTMLElement).innerText.slice(0, 60)}`),
      turns: document.querySelectorAll("article, [data-testid^='conversation-turn']").length,
      stop: document.querySelectorAll('button[data-testid="stop-button"], button[aria-label*="Hentikan"], button[aria-label*="Stop"]').length,
    }));
    console.log(`+${s}s`, JSON.stringify(info));
  }
  const tree = await page.evaluate(() => {
    const hit = [...document.querySelectorAll("main *")].filter((e) => e.children.length === 0 && /"n"\s*:\s*1/.test(e.textContent ?? "")).pop();
    const chain: string[] = [];
    for (let e: Element | null = hit ?? null; e && e.tagName !== "MAIN"; e = e.parentElement) {
      const attrs = [...e.attributes].filter((a) => /^data-|^id$|^role$|^aria-label$/.test(a.name)).map((a) => `${a.name}=${a.value.slice(0, 40)}`).join(" ");
      chain.push(`${e.tagName.toLowerCase()}.${String(e.className).split(" ").slice(0, 3).join(".")} ${attrs}`);
    }
    return chain;
  });
  console.log(tree.join(" <- "));
  await page.screenshot({ path: `${process.env.TEMP}/chatgpt-after-send.png` });
}
