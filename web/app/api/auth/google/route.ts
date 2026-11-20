import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_STATE_COOKIE, googleEnabled, googleStart, publicOrigin } from "@/lib/google";

/** "Masuk dengan Google": remember state + PKCE verifier for 10 minutes, then hand over to Google. */
export async function GET(req: NextRequest) {
  if (!googleEnabled()) return NextResponse.redirect(new URL("/masuk?error=google-off", publicOrigin(req.headers)));
  const { url, cookie } = googleStart(req.nextUrl.searchParams.get("next") ?? "/akun");
  (await cookies()).set(GOOGLE_STATE_COOKIE, cookie, {
    httpOnly: true,
    sameSite: "lax", // Google sends the user back with a top-level GET from its own site
    secure: process.env.ADMIN_COOKIE_SECURE === "1",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return NextResponse.redirect(url);
}
