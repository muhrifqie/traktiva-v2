"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { BUYER_COOKIE, licenseApi } from "@/lib/license-api";

export type BuyerResult = { ok: false; message: string } | null;

/** Buyer signs in with their license key (no accounts). Locked per IP after 10 misses. */
export async function buyerLogin(_prev: BuyerResult, form: FormData): Promise<BuyerResult> {
  const key = String(form.get("key") ?? "").trim().slice(0, 40);
  if (key.replace(/[^a-z0-9]/gi, "").length < 16) return { ok: false, message: "Masukkan key lengkap, contoh TRK-XXXX-XXXX-XXXX-XXXX." };
  const ip = (await headers()).get("x-real-ip") ?? "local";
  try {
    const r = await licenseApi<{ session: string; maxAge: number }>("/internal/buyer/login", { method: "POST", body: { key, ip } });
    (await cookies()).set(BUYER_COOKIE, r.session, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.ADMIN_COOKIE_SECURE === "1",
      path: "/",
      maxAge: r.maxAge,
    });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Gagal masuk." };
  }
  redirect("/akun");
}

export async function buyerLogout() {
  const jar = await cookies();
  const session = jar.get(BUYER_COOKIE)?.value;
  if (session) await licenseApi("/internal/buyer/logout", { method: "POST", body: {}, headers: { "x-buyer-session": session } }).catch(() => {});
  jar.delete(BUYER_COOKIE);
  redirect("/masuk");
}
