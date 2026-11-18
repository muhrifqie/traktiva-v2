import { camoufoxStatus, type CamoufoxStatus } from "@/lib/browser/camoufox-install";
import { findChromium } from "@/lib/browser/chromium";

export const dynamic = "force-dynamic";

export type BrowserStatus = { camoufox: CamoufoxStatus; fallback: string | null };

// Camoufox install progress + the fallback browser, polled by the browser card in Pengaturan.
export async function GET() {
  const body: BrowserStatus = { camoufox: camoufoxStatus(), fallback: findChromium()?.name ?? null };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
