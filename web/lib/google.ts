import "server-only";
import crypto from "node:crypto";

// "Masuk dengan Google" without a library: OAuth 2.0 authorization code + PKCE + state.
// Setup (Google Cloud Console → APIs & Services → Credentials → OAuth client ID, type Web application):
//   Authorized redirect URI = <SITE_URL>/api/auth/google/callback  (e.g. http://localhost:3821/... for local tests)
//   env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SITE_URL (public origin, no trailing slash)
// Google only accepts real domains (or localhost) as redirect URIs: on the bare IP the button stays hidden.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token"; // override only for tests
export const GOOGLE_STATE_COOKIE = "trk_g_state";

const clientId = () => process.env.GOOGLE_CLIENT_ID || "";
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET || "";
const siteUrl = () => (process.env.SITE_URL || "").replace(/\/+$/, "");
const redirectUri = () => `${siteUrl()}/api/auth/google/callback`;

/** Show the Google button only when it can work (credentials + a public origin Google accepts). */
export const googleEnabled = () => !!(clientId() && clientSecret() && siteUrl());

const b64url = (buf: Buffer) => buf.toString("base64url");

/** Start: random state + PKCE verifier (kept in a short-lived httpOnly cookie), and the Google URL to send the user to. */
export function googleStart(next: string) {
  const state = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), cookie: JSON.stringify({ state, verifier, next: safeNext(next) }) };
}

/**
 * Public origin for redirects. Behind nginx, Next sees its own bind address (localhost:3821) in req.url,
 * so use SITE_URL, else the host/proto nginx forwards.
 */
export function publicOrigin(h: Headers) {
  if (siteUrl()) return siteUrl();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3821";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Only same-site paths after login (no open redirect). */
export const safeNext = (n: unknown) => (typeof n === "string" && /^\/(?!\/)[\w\-/?=&.%]*$/.test(n) ? n : "/akun");

export type GoogleProfile = { sub: string; email: string; emailVerified: boolean; name: string | null; avatar: string | null };

/**
 * Callback: check state, exchange the code (with the PKCE verifier and our secret) directly with Google over TLS,
 * then read the ID token Google returned. The token comes straight from Google's token endpoint, so its
 * signature does not need a second check (OIDC core 3.1.3.7); we still check issuer, audience and expiry.
 */
export async function googleFinish(params: URLSearchParams, cookie: string | undefined): Promise<{ profile: GoogleProfile; next: string }> {
  let saved: { state?: string; verifier?: string; next?: string } = {};
  try {
    saved = JSON.parse(cookie ?? "{}");
  } catch {}
  const state = params.get("state");
  if (params.get("error")) throw new Error(params.get("error") === "access_denied" ? "Masuk dengan Google dibatalkan." : "Google menolak permintaan masuk.");
  if (!state || !saved.state || !saved.verifier || !crypto.timingSafeEqual(Buffer.from(state.padEnd(64)), Buffer.from(saved.state.padEnd(64)))) {
    throw new Error("Sesi masuk Google kedaluwarsa. Coba lagi.");
  }
  const code = params.get("code");
  if (!code) throw new Error("Google tidak mengirim kode masuk.");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId(), client_secret: clientSecret(), redirect_uri: redirectUri(), grant_type: "authorization_code", code_verifier: saved.verifier }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  }).catch(() => null);
  const tok = (await res?.json().catch(() => null)) as { id_token?: string } | null;
  if (!res?.ok || !tok?.id_token) throw new Error("Gagal memverifikasi akun Google. Coba lagi.");

  const claims = JSON.parse(Buffer.from(tok.id_token.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
  const iss = String(claims.iss ?? "");
  if (!["https://accounts.google.com", "accounts.google.com"].includes(iss) || claims.aud !== clientId() || Number(claims.exp) * 1000 < Date.now()) {
    throw new Error("Token Google tidak valid.");
  }
  return {
    profile: {
      sub: String(claims.sub ?? ""),
      email: String(claims.email ?? ""),
      emailVerified: claims.email_verified === true || claims.email_verified === "true",
      name: typeof claims.name === "string" ? claims.name : null,
      avatar: typeof claims.picture === "string" ? claims.picture : null,
    },
    next: safeNext(saved.next),
  };
}
