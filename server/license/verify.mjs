// Waroengku Verify (central email OTP over SumoPod SMTP; see Waroengku Corp/Ekosistem/services/verify/README.md).
// Traktiva uses only purpose "reset" (forgotten password). Config: env VERIFY_URL + VERIFY_KEY, or DATA_DIR/verify.json
// { "url": "...", "key": "..." } (600). Not configured / unreachable → the reset fails closed with a friendly message.
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./lib.mjs";

function config() {
  if (process.env.VERIFY_URL && process.env.VERIFY_KEY) return { url: process.env.VERIFY_URL, key: process.env.VERIFY_KEY };
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "verify.json"), "utf8"));
  } catch {
    return null;
  }
}

export const verifyConfigured = () => !!config()?.key;

/** POST /v1/gate. Returns { ok, otp?, error?, message?, retry_after? }; never throws. */
export async function emailGate(purpose, email, ip, otp) {
  const c = config();
  if (c?.url && c?.key) {
    try {
      const r = await fetch(`${c.url.replace(/\/+$/, "")}/v1/gate`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${c.key}` },
        body: JSON.stringify({ purpose, email, ip: ip || undefined, otp: otp || undefined }),
        signal: AbortSignal.timeout(25_000),
      });
      if (r.ok) return await r.json();
    } catch {
      /* fall through */
    }
  }
  return { ok: false, error: "verify_down", message: "Pengiriman email sedang gangguan. Coba lagi sebentar atau hubungi penjual." };
}
