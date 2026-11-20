import "server-only";
import { cookies } from "next/headers";
import { MEMBER_COOKIE } from "@/lib/license-api";

/** Member sign-in cookie: httpOnly, Lax (survives the redirect back from Google), Secure once served over HTTPS. */
export async function setMemberCookie(session: string, maxAge: number) {
  (await cookies()).set(MEMBER_COOKIE, session, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.ADMIN_COOKIE_SECURE === "1",
    path: "/",
    maxAge,
  });
}
