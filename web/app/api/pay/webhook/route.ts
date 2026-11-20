import { ApiError, licenseApi } from "@/lib/license-api";

/**
 * WaroengPay → payment webhook. The raw body + signature headers go untouched to the license server,
 * which verifies the HMAC (5-minute window), matches the order, and delivers the key exactly once.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 64_000) return Response.json({ ok: false }, { status: 413 });
  const headers: Record<string, string> = {};
  for (const [k, v] of req.headers) if (k.startsWith("x-waroengpay-") || k === "x-signature") headers[k] = v;
  try {
    await licenseApi("/internal/pay/webhook", { method: "POST", body: { raw, headers } });
    return Response.json({ ok: true });
  } catch (e) {
    // 4xx = rejected for good (bad signature, unknown order); anything else → WaroengPay retries
    return Response.json({ ok: false }, { status: e instanceof ApiError && e.status < 500 ? e.status : 502 });
  }
}
