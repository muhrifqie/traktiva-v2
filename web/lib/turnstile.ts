import "server-only";

// Cloudflare Turnstile (invisible) on sign-in, sign-up and forgot-password. Keys come from env (on the server:
// /srv/traktiva-license/data/web-secrets.json via ecosystem.config.cjs). No keys = the check is skipped (local dev).
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Public site key for the widget, or "" when Turnstile is not set up. */
export const turnstileSiteKey = () => (process.env.TURNSTILE_SECRET_KEY ? process.env.TURNSTILE_SITE_KEY || "" : "");

/** Throws a user-facing error unless the form carries a valid, unused Turnstile token. */
export async function requireHuman(form: FormData, ip: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return;
  const token = String(form.get("cf-turnstile-response") ?? "");
  if (!token) throw new Error("Verifikasi keamanan belum selesai. Tunggu sebentar lalu coba lagi.");
  const r = await fetch(VERIFY_URL, {
    method: "POST",
    body: new URLSearchParams({ secret, response: token, ...(ip !== "local" ? { remoteip: ip } : {}) }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  })
    .then((res) => res.json() as Promise<{ success?: boolean }>)
    .catch(() => null);
  // ponytail: Cloudflare unreachable = refuse (fail closed); sign-in waits until it is back
  if (!r?.success) throw new Error("Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi.");
}
