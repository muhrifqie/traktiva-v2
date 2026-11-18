import { engineStatus, type EngineStatus } from "@/lib/engine/flow2api-engine";

export const dynamic = "force-dynamic";
export type { EngineStatus };

// Video engine state (install progress, running/stopped, last error), polled by the engine card in Pengaturan.
export async function GET() {
  return Response.json(await engineStatus(), { headers: { "cache-control": "no-store" } });
}
