"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { asMember, licenseApi, MEMBER_COOKIE } from "@/lib/license-api";
import { safeNext } from "@/lib/google";
import { setMemberCookie } from "@/lib/member-session";

export type FormResult = { ok: false; message: string } | { ok: true; message?: string } | null;
const fail = (e: unknown): FormResult => {
  if (e instanceof Error && "digest" in e) throw e; // let redirect() through
  return { ok: false, message: e instanceof Error ? e.message : "Gagal" };
};
const ip = async () => (await headers()).get("x-real-ip") ?? "local";
const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").slice(0, max);

export async function register(_prev: FormResult, form: FormData): Promise<FormResult> {
  try {
    const r = await licenseApi<{ session: string; maxAge: number }>("/internal/member/register", {
      method: "POST",
      body: { name: str(form, "name", 80), email: str(form, "email", 254), password: str(form, "password"), ip: await ip() },
    });
    await setMemberCookie(r.session, r.maxAge);
  } catch (e) {
    return fail(e);
  }
  redirect(safeNext(form.get("next")));
}

export async function login(_prev: FormResult, form: FormData): Promise<FormResult> {
  try {
    const r = await licenseApi<{ session: string; maxAge: number }>("/internal/member/login", {
      method: "POST",
      body: { email: str(form, "email", 254), password: str(form, "password"), ip: await ip() },
    });
    await setMemberCookie(r.session, r.maxAge);
  } catch (e) {
    return fail(e);
  }
  redirect(safeNext(form.get("next")));
}

export async function logout() {
  const jar = await cookies();
  if (jar.get(MEMBER_COOKIE)) await asMember("/internal/member/logout", { method: "POST", body: {} }).catch(() => {});
  jar.delete(MEMBER_COOKIE);
  redirect("/masuk");
}

/** Add a license to this account with its key. */
export async function claimKey(_prev: FormResult, form: FormData): Promise<FormResult> {
  try {
    const key = str(form, "key", 40);
    if (key.replace(/[^a-z0-9]/gi, "").length < 16) return { ok: false, message: "Masukkan key lengkap, contoh TRK-XXXX-XXXX-XXXX-XXXX." };
    const r = await asMember<{ already: boolean }>("/internal/member/claim", { method: "POST", body: { key, ip: await ip() } });
    revalidatePath("/akun");
    return { ok: true, message: r.already ? "Key ini sudah ada di akunmu." : "Lisensi ditambahkan ke akunmu." };
  } catch (e) {
    return fail(e);
  }
}

/** Free one PC of a license (self-service, once per 7 days per license). */
export async function resetMyDevice(deviceId: string): Promise<FormResult> {
  try {
    await asMember(`/internal/member/devices/${encodeURIComponent(z.string().regex(/^[0-9a-f]{32}$/).parse(deviceId))}/reset`, { method: "POST", body: { ip: await ip() } });
    revalidatePath("/akun");
    return { ok: true };
  } catch (e) {
    return fail(e instanceof z.ZodError ? new Error("Perangkat tidak valid.") : e);
  }
}

export async function saveProfile(_prev: FormResult, form: FormData): Promise<FormResult> {
  try {
    await asMember("/internal/member/profile", { method: "POST", body: { name: str(form, "name", 80) } });
    revalidatePath("/akun");
    return { ok: true, message: "Profil disimpan." };
  } catch (e) {
    return fail(e);
  }
}

export async function changePassword(_prev: FormResult, form: FormData): Promise<FormResult> {
  try {
    const next = str(form, "next");
    if (next !== str(form, "again")) return { ok: false, message: "Ulangi password baru dengan sama persis." };
    await asMember("/internal/member/password", { method: "POST", body: { current: str(form, "current"), next } });
    revalidatePath("/akun");
    return { ok: true, message: "Password disimpan. Perangkat lain otomatis keluar." };
  } catch (e) {
    return fail(e);
  }
}
