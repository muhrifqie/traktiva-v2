"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { asMember, licenseApi, MEMBER_COOKIE } from "@/lib/license-api";
import { safeNext } from "@/lib/google";
import { finishSignIn, TWOFA_COOKIE } from "@/lib/member-session";

export type FormResult = { ok: false; message: string } | { ok: true; message?: string } | null;
const fail = (e: unknown): FormResult => {
  if (e instanceof Error && "digest" in e) throw e; // let redirect() through
  return { ok: false, message: e instanceof Error ? e.message : "Gagal" };
};
const ip = async () => (await headers()).get("x-real-ip") ?? "local";
const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").slice(0, max);

type SignIn = { session?: string; maxAge?: number; needCode?: boolean; ticket?: string };

export async function register(_prev: FormResult, form: FormData): Promise<FormResult> {
  let to: string;
  try {
    const r = await licenseApi<SignIn>("/internal/member/register", {
      method: "POST",
      body: { name: str(form, "name", 80), email: str(form, "email", 254), password: str(form, "password"), ip: await ip() },
    });
    to = await finishSignIn(r, safeNext(form.get("next")));
  } catch (e) {
    return fail(e);
  }
  redirect(to);
}

export async function login(_prev: FormResult, form: FormData): Promise<FormResult> {
  let to: string;
  try {
    const r = await licenseApi<SignIn>("/internal/member/login", {
      method: "POST",
      body: { email: str(form, "email", 254), password: str(form, "password"), ip: await ip() },
    });
    to = await finishSignIn(r, safeNext(form.get("next")));
  } catch (e) {
    return fail(e);
  }
  redirect(to);
}

/** Second step: the 6-digit code from the authenticator app. */
export async function verifyCode(_prev: FormResult, form: FormData): Promise<FormResult> {
  const jar = await cookies();
  let saved: { ticket?: string; next?: string } = {};
  try {
    saved = JSON.parse(jar.get(TWOFA_COOKIE)?.value ?? "{}");
  } catch {}
  if (!saved.ticket) return { ok: false, message: "Waktu habis. Masuk lagi dari awal." };
  let to: string;
  try {
    const r = await licenseApi<SignIn>("/internal/member/login/2fa", { method: "POST", body: { ticket: saved.ticket, code: str(form, "code", 10).replace(/\s/g, ""), ip: await ip() } });
    jar.delete(TWOFA_COOKIE);
    to = await finishSignIn(r, safeNext(saved.next));
  } catch (e) {
    return fail(e);
  }
  redirect(to);
}

/** "Atur password" link: set the password, then signed in (via the code step when 2FA is on). */
export async function setPasswordFromLink(_prev: FormResult, form: FormData): Promise<FormResult> {
  const password = str(form, "password");
  if (password !== str(form, "again")) return { ok: false, message: "Ulangi password dengan sama persis." };
  let to: string;
  try {
    const r = await licenseApi<SignIn>("/internal/member/password-token", { method: "POST", body: { token: str(form, "token", 100), password, ip: await ip() } });
    to = await finishSignIn(r, "/akun");
  } catch (e) {
    return fail(e);
  }
  redirect(to);
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
    await asMember("/internal/member/profile", { method: "POST", body: { name: str(form, "name", 80), phone: str(form, "phone", 30) } });
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

// ---- verifikasi 2 langkah (authenticator app)

export type TwoFaSetup = { ok: true; secret: string; qr: string } | { ok: false; message: string };

/** New secret + QR (SVG) to scan; nothing changes until a first code is confirmed. */
export async function startTwoFa(): Promise<TwoFaSetup> {
  try {
    const r = await asMember<{ secret: string; uri: string }>("/internal/member/2fa/setup", { method: "POST", body: {} });
    const QRCode = (await import("qrcode")).default;
    const qr = await QRCode.toString(r.uri, { type: "svg", margin: 1, color: { dark: "#000000", light: "#ffffff" } });
    return { ok: true, secret: r.secret, qr };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Gagal" };
  }
}

export async function enableTwoFa(_prev: FormResult, form: FormData): Promise<FormResult> {
  try {
    await asMember("/internal/member/2fa/enable", { method: "POST", body: { code: str(form, "code", 10).replace(/\s/g, "") } });
    revalidatePath("/akun");
    return { ok: true, message: "Verifikasi 2 langkah aktif." };
  } catch (e) {
    return fail(e);
  }
}

export async function disableTwoFa(_prev: FormResult, form: FormData): Promise<FormResult> {
  try {
    await asMember("/internal/member/2fa/disable", { method: "POST", body: { code: str(form, "code", 10).replace(/\s/g, "") } });
    revalidatePath("/akun");
    return { ok: true, message: "Verifikasi 2 langkah dimatikan." };
  } catch (e) {
    return fail(e);
  }
}

// ---- beli / perpanjang online (WaroengPay QRIS)

/** Create the order on the license server, then send the buyer to WaroengPay's payment page. */
export async function buyPlan(_prev: FormResult, form: FormData): Promise<FormResult> {
  let payUrl: string;
  try {
    const renew = Number(form.get("renew")) || undefined;
    const r = await asMember<{ id: string; payUrl: string }>("/internal/member/orders", { method: "POST", body: { plan: str(form, "plan", 20), renew } });
    payUrl = r.payUrl;
  } catch (e) {
    return fail(e);
  }
  if (!/^https:\/\//.test(payUrl)) return { ok: false, message: "Halaman bayar tidak valid. Coba lagi." };
  redirect(payUrl);
}
