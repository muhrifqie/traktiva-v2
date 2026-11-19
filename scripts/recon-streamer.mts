// Recon (read-only): visit every Streamer Desktop menu page and save every JSON API response, so we can
// pick the useful data for the app. Responses go to <outDir>/<page>/<api>.json; a summary prints at the end.
// Usage: npx tsx --conditions=react-server scripts/recon-streamer.mts <outDir>
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { withProfile } from "@/lib/browser/chrome";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";

const outDir = process.argv[2];
const acc = (await db.select().from(accounts).where(eq(accounts.platform, "tiktok")))[0];
const NOISE = /i18n_conf|\/bs\/|feelgood|config_center|websocket|abtest|unread_count|settings\/get|web-cookie|data_infra|starling|mssdk|account_info|home\/info|live_creator_tools|post_limit|live_relation|data_share_auth|sentry/;
const summary: Record<string, string[]> = {};
let current = "home";

type MenuNode = { id: string; path: string; external?: boolean; children?: MenuNode[] };
const flatten = (nodes: MenuNode[]): MenuNode[] => nodes.flatMap((n) => (n.children?.length ? flatten(n.children) : [n]));

await withProfile(acc.sessionKey!, { headless: true }, async (ctx) => {
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  let menuBody: { data?: { menu_list?: MenuNode[] } } | null = null;
  page.on("response", async (r) => {
    const u = new URL(r.url());
    if (u.pathname.endsWith("/streamer_desktop/home/info")) menuBody = await r.json().catch(() => null);
    if (!u.pathname.startsWith("/api/") || NOISE.test(u.pathname)) return;
    if (!(r.headers()["content-type"] ?? "").includes("json")) return;
    try {
      const body = await r.json();
      const dir = path.join(outDir, current);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${u.pathname.replace(/^\/api\//, "").replace(/\//g, "_")}.json`), JSON.stringify({ method: r.request().method(), path: u.pathname, post: r.request().postData(), body }, null, 1));
      (summary[current] ??= []).push(`${r.request().method()} ${u.pathname} → ${JSON.stringify(body).length}b`);
    } catch {}
  });

  await page.goto("https://shop.tiktok.com/streamer/home", { waitUntil: "commit", timeout: 45_000 });
  await page.waitForTimeout(10_000);
  const menu = menuBody as { data?: { menu_list?: MenuNode[] } } | null;
  const pages = flatten(menu?.data?.menu_list ?? []).filter((n) => !n.external && n.path);
  console.log("menu pages:", pages.map((p) => p.path).join(" "));

  for (const p of pages) {
    current = p.id || p.path.replace(/\//g, "_");
    try {
      await page.goto(`https://shop.tiktok.com/streamer${p.path}`, { waitUntil: "commit", timeout: 30_000 });
      await page.waitForTimeout(9000);
      await page.screenshot({ path: path.join(outDir, `${current}.png`) }).catch(() => {});
      console.log("visited", p.path, (summary[current] ?? []).length, "apis");
    } catch (e) {
      console.log("fail", p.path, String(e).slice(0, 100));
    }
  }
});
fs.writeFileSync(path.join(outDir, "_summary.json"), JSON.stringify(summary, null, 1));
for (const [k, v] of Object.entries(summary)) console.log(`\n# ${k}\n${v.join("\n")}`);
process.exit(0);
