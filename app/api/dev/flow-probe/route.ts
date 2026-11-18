// TEMPORARY diagnostics route (dev only): dry-run the Flow browser engine without generating.
import { probeFlowBrowser } from "@/lib/platforms/flow-browser";
import { mediaDataUrl } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development") return new Response("not found", { status: 404 });
  const u = new URL(req.url);
  const kind = u.searchParams.get("kind") === "image" ? "image" : "video";
  const ref = u.searchParams.get("ref");
  const refs = ref ? [await mediaDataUrl(ref)] : [];
  return Response.json(await probeFlowBrowser(kind, refs));
}
