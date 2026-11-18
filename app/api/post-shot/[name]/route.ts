import fs from "node:fs/promises";
import path from "node:path";
import { SHOT_DIR } from "@/lib/post-log";

export const dynamic = "force-dynamic";

// Posting screenshots (proof of each step / error) from data/tiktok-debug. File names only, no paths.
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^[\w.-]+\.png$/.test(name)) return new Response("not found", { status: 404 });
  const data = await fs.readFile(path.join(SHOT_DIR, name)).catch(() => null);
  if (!data) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(data), { headers: { "content-type": "image/png", "cache-control": "private, max-age=86400" } });
}
