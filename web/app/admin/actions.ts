"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { asAdmin, licenseApi, SESSION_COOKIE, type License, type Plan } from "@/lib/license-api";

// Every action re-checks the admin session (asAdmin → requireAdmin): pages hide buttons, actions enforce.
export type Result<T = object> = ({ ok: true } & T) | { ok: false, message: string };
const fail = (e: unknown): { ok: false; message: string } => {
  if (e instanceof Error && "digest" in e) throw e; // let Next's redirect()/notFound() through
  return { ok: false, message: e instanceof Error ? e.message : "Gagal" };
};

export async function login(_prev: Result | null, form: FormData): Promise<Result> {
  const username = String(form.get("username") ?? "").trim().slice(0, 40);
  const password = String(form.get("password") ?? "").slice(0, 200);
  if (!username || !password) return { ok: false, message: "Isi username dan password." };
  // client IP for the per-IP lockout: nginx sets X-Real-IP (overwriting anything the client sent); none via SSH tunnel
  const ip = (await headers()).get("x-real-ip") ?? "local";
  try {
    const r = await licenseApi<{ session: string; maxAge: number }>("/internal/admin/login", { method: "POST", body: { username, password, ip } });
    (await cookies()).set(SESSION_COOKIE, r.session, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.ADMIN_COOKIE_SECURE === "1", // on once the panel is served over HTTPS (domain)
      path: "/",
      maxAge: r.maxAge,
    });
  } catch (e) {
    return fail(e);
  }
  redirect("/admin");
}

export async function logout() {
  const jar = await cookies();
  const session = jar.get(SESSION_COOKIE)?.value;
  if (session) await licenseApi("/internal/admin/logout", { method: "POST", session }).catch(() => {});
  jar.delete(SESSION_COOKIE);
  redirect("/admin/login");
}

const Create = z.object({
  plan: z.string().min(1).max(20),
  days: z.coerce.number().int().min(1).max(3650).optional(),
  devices: z.coerce.number().int().min(1).max(20),
  count: z.coerce.number().int().min(1).max(200),
  note: z.string().trim().max(200).optional(),
  role: z.enum(["member", "admin"]).default("member"),
});
export type CreatedKeys = { keys: { id: number; key: string }[]; plan: string; days: number | null; devices: number; role: "member" | "admin" };

export async function createKeys(input: z.input<typeof Create>): Promise<Result<CreatedKeys>> {
  try {
    const body = Create.parse(input);
    const r = await asAdmin<CreatedKeys>("/internal/licenses", { method: "POST", body });
    revalidatePath("/admin", "layout");
    return { ok: true, ...r };
  } catch (e) {
    return fail(e instanceof z.ZodError ? new Error("Isian tidak valid.") : e);
  }
}

const LicenseAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), status: z.enum(["active", "suspended", "revoked"]) }),
  z.object({ action: z.literal("extend"), days: z.number().int().min(1).max(3650) }),
  z.object({ action: z.literal("lifetime") }),
  z.object({ action: z.literal("role"), role: z.enum(["member", "admin"]) }),
  z.object({ action: z.literal("unclaim") }),
  z.object({ action: z.literal("edit"), note: z.string().max(200), devices: z.coerce.number().int().min(1).max(20) }),
]);

export async function updateLicense(id: number, input: z.input<typeof LicenseAction>): Promise<Result<{ license: License }>> {
  try {
    const r = await asAdmin<{ license: License }>(`/internal/licenses/${z.number().int().positive().parse(id)}`, { method: "POST", body: LicenseAction.parse(input) });
    revalidatePath("/admin", "layout");
    return { ok: true, license: r.license };
  } catch (e) {
    return fail(e);
  }
}

export async function resetDevice(deviceId: string): Promise<Result> {
  try {
    await asAdmin(`/internal/devices/${encodeURIComponent(z.string().regex(/^[0-9a-f]{32}$/).parse(deviceId))}/reset`, { method: "POST" });
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function changePassword(current: string, next: string): Promise<Result> {
  if (String(next).length < 10) return { ok: false, message: "Password baru minimal 10 karakter." };
  try {
    await asAdmin("/internal/admin/password", { method: "POST", body: { current: String(current).slice(0, 200), next: String(next).slice(0, 200) } });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const Plans = z.array(
  z.object({ id: z.string(), label: z.string().min(1).max(30), days: z.coerce.number().int().min(1).max(3650).nullable(), devices: z.coerce.number().int().min(1).max(20), price: z.coerce.number().int().min(0) }),
).min(1).max(10);

export async function savePlans(plans: Plan[]): Promise<Result> {
  try {
    await asAdmin("/internal/settings", { method: "POST", body: { plans: Plans.parse(plans) } });
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e instanceof z.ZodError ? new Error("Isian paket tidak valid.") : e);
  }
}


// ---- pusat informasi (announcements, releases, site + app settings)

const Announce = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(2000),
  level: z.enum(["info", "warn", "critical"]),
  days: z.coerce.number().int().min(0).max(365),
});
export async function createAnnouncement(input: z.input<typeof Announce>): Promise<Result> {
  try {
    await asAdmin("/internal/announcements", { method: "POST", body: Announce.parse(input) });
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e instanceof z.ZodError ? new Error("Judul wajib diisi (maks 120 karakter).") : e);
  }
}

export async function announcementAction(id: number, action: "on" | "off" | "delete"): Promise<Result> {
  try {
    await asAdmin(`/internal/announcements/${z.number().int().positive().parse(id)}`, { method: "POST", body: { action: z.enum(["on", "off", "delete"]).parse(action) } });
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const Release = z.object({
  version: z.string().trim().regex(/^v?\d+\.\d+\.\d+$/),
  url: z.string().trim().url().startsWith("https://"),
  notes: z.string().trim().max(4000),
  mandatory: z.boolean(),
});
export async function createRelease(input: z.input<typeof Release>): Promise<Result> {
  try {
    await asAdmin("/internal/releases", { method: "POST", body: Release.parse(input) });
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e instanceof z.ZodError ? new Error("Versi harus seperti 1.2.0 dan link harus https://") : e);
  }
}

export async function deleteRelease(id: number): Promise<Result> {
  try {
    await asAdmin(`/internal/releases/${z.number().int().positive().parse(id)}/delete`, { method: "POST" });
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveSite(site: { whatsapp: string }): Promise<Result> {
  try {
    await asAdmin("/internal/settings", { method: "POST", body: { site: { whatsapp: z.string().max(30).parse(site.whatsapp) } } });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const Remote = z.record(z.string().min(1).max(40), z.union([z.string().max(500), z.number(), z.boolean()]));
export async function saveHwid(tolerance: number): Promise<Result> {
  try {
    await asAdmin("/internal/settings", { method: "POST", body: { hwid: { tolerance: z.number().int().min(0).max(6).parse(tolerance) } } });
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveRemote(remote: Record<string, string | number | boolean>): Promise<Result> {
  try {
    await asAdmin("/internal/settings", { method: "POST", body: { remote: Remote.parse(remote) } });
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e instanceof z.ZodError ? new Error("Setelan app tidak valid.") : e);
  }
}
