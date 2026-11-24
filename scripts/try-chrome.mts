// Dev check for lib/browser/chrome.ts on a throwaway profile: headless launch, automation signals, cookies,
// close, and the "close" event when Chrome dies from outside (= user closed the window).
// Usage: npx tsx --conditions=react-server scripts/try-chrome.mts
import { chromePath, deleteProfile, launchProfile, newProfileKey, withProfile } from "@/lib/browser/chrome";

const key = newProfileKey();
console.log("chrome:", chromePath());
let t = Date.now();
const info = await withProfile(key, { headless: true }, async (ctx) => {
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto("https://www.google.com/", { waitUntil: "domcontentloaded" });
  // a persistent cookie (with expiry) like real login cookies; session cookies are dropped on restart by design
  await ctx.addCookies([{ name: "traktiva_test", value: "1", domain: ".google.com", path: "/", expires: Math.floor(Date.now() / 1000) + 3600 }]);
  return {
    ua: await page.evaluate(() => navigator.userAgent),
    webdriver: await page.evaluate(() => navigator.webdriver),
    cookies: (await ctx.cookies("https://www.google.com")).length,
    title: await page.title(),
  };
});
console.log(`headless ${Date.now() - t} ms`, JSON.stringify(info));

// cookies survive a restart of the same profile
t = Date.now();
const kept = await withProfile(key, { headless: true }, async (ctx) => (await ctx.cookies("https://www.google.com")).some((c) => c.name === "traktiva_test"));
console.log(`relaunch ${Date.now() - t} ms, cookie kept:`, kept);

// "user closes the window": kill Chrome from outside, expect the context to emit close
const ctx = await launchProfile(key, { headless: true });
const closed = new Promise<string>((r) => ctx.on("close", () => r("close event ✓")));
const s = await ctx.browser()!.newBrowserCDPSession();
await s.send("Browser.close").catch(() => {});
console.log(await Promise.race([closed, new Promise<string>((r) => setTimeout(() => r("no close event ✗"), 8000))]));

await new Promise((r) => setTimeout(r, 1500));
await deleteProfile(key);
console.log("profile deleted");
process.exit(0);
