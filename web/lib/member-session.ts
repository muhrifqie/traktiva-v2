import "server-only";
import { cookies } from "next/headers";
import { MEMBER_COOKIE } from "@/lib/license-api";

export const TWOFA_COOKIE = "trk_2fa";
/** Set COOKIE_DOMAIN=.traktiva.site so one sign-in works on traktiva.site, app. and admin.; unset = this host only. */
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
type SignIn = { session?: string; maxAge?: number; needCode?: boolean; ticket?: string };

/**
 * Finish a sign-in answer from the license server: either set the session cookie, or (account with an authenticator)
 * park the 2FA ticket in a 5-minute httpOnly cookie and return the URL of the code step.
 */
export async function finishSignIn(r: SignIn, next: string): Promise<string> {
  if (r.needCode && r.ticket) {
    (await cookies()).set(TWOFA_COOKIE, JSON.stringify({ ticket: r.ticket, next }), {
      httpOnly: true, sameSite: "lax", secure: process.env.ADMIN_COOKIE_SECURE === "1", path: "/", maxAge: 300,
    });
    return `/masuk?step=kode&next=${encodeURIComponent(next)}`;
  }
  await setMemberCookie(r.session!, r.maxAge!);
  return next;
}

/** Member sign-in cookie: httpOnly, Lax (survives the redirect back from Google), Secure once served over HTTPS. */
export async function setMemberCookie(session: string, maxAge: number) {
  (await cookies()).set(MEMBER_COOKIE, session, {
    domain: COOKIE_DOMAIN,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.ADMIN_COOKIE_SECURE === "1",
    path: "/",
    maxAge,
  });
}

/** Sign the member out on every subdomain (same domain the cookie was set with). */
export async function clearMemberCookie() {
  (await cookies()).delete({ name: MEMBER_COOKIE, domain: COOKIE_DOMAIN, path: "/" });
}
