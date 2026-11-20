import { cookies, headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_STATE_COOKIE, googleFinish, publicOrigin } from "@/lib/google";
import { licenseApi } from "@/lib/license-api";
import { finishSignIn } from "@/lib/member-session";

/** Back from Google: verify, sign in (or create / link the account by verified email), go to /akun. */
export async function GET(req: NextRequest) {
  const jar = await cookies();
  const origin = publicOrigin(req.headers);
  const fail = (message: string) => NextResponse.redirect(new URL(`/masuk?error=${encodeURIComponent(message)}`, origin));
  try {
    const { profile, next } = await googleFinish(req.nextUrl.searchParams, jar.get(GOOGLE_STATE_COOKIE)?.value);
    jar.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/auth/google" });
    const ip = (await headers()).get("x-real-ip") ?? "local";
    const r = await licenseApi<{ session?: string; maxAge?: number; needCode?: boolean; ticket?: string }>("/internal/member/google", { method: "POST", body: { ...profile, ip, ua: ((await headers()).get("user-agent") ?? "").slice(0, 300) } });
    return NextResponse.redirect(new URL(await finishSignIn(r, next), origin)); // account with 2FA → code step
  } catch (e) {
    jar.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/auth/google" });
    return fail(e instanceof Error ? e.message : "Gagal masuk dengan Google.");
  }
}
