import { readSync } from "@/lib/sync-progress";

// Live counter of an account sync for the connect/sync progress panel. A plain GET on purpose: server actions from one
// page run one at a time, so a poll made as an action would wait until the sync it watches has finished.
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  const p = Number.isInteger(id) && id > 0 ? readSync(id) : null;
  const live = p && Date.now() - p.at < 10 * 60_000 ? { stage: p.stage, n: p.n ?? null, total: p.total ?? null } : null;
  return Response.json(live, { headers: { "cache-control": "no-store" } });
}
