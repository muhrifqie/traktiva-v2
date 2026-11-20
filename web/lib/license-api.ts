import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// The only door to license data: the license server's internal API on the same machine (server/license/internal-api.mjs).
// Service token from env; every admin call also carries the admin's session, which the license server checks itself.
const BASE = process.env.LICENSE_INTERNAL_URL || "http://127.0.0.1:3822";
const TOKEN = process.env.LICENSE_INTERNAL_TOKEN || "";
export const SESSION_COOKIE = "trk_admin";

export type Plan = { id: string; label: string; days: number | null; devices: number; price: number };
export type Announcement = { id: number; title: string; body: string; level: "info" | "warn" | "critical"; active: number; ends_at: number | null; created_at: number; actor: string | null };
export type Release = { id: number; version: string; url: string; notes: string; mandatory: number; created_at: number; actor: string | null };
export type Site = { whatsapp?: string };
export type License = {
  id: number; key_hint: string; plan: string; max_devices: number; status: "active" | "suspended" | "revoked"; role: "member" | "admin";
  owner: string | null; // email of the member account that claimed this key
  expires_at: number | null; note: string | null; created_at: number; used: number; last_seen: number | null;
};
export type Device = { id: string; name: string | null; app_version: string | null; last_ip: string | null; status: "active" | "reset"; created_at: number; last_seen: number | null; hw_locked?: number };
export type AuditEvent = { id: number; at: number; event: string; license_id: number | null; device_id: string | null; ip: string | null; detail: string | null; actor: string | null; key_hint?: string | null; note?: string | null };

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function licenseApi<T>(path: string, opts: { method?: "GET" | "POST"; body?: unknown; session?: string; headers?: Record<string, string> } = {}): Promise<T> {
  if (!TOKEN) throw new ApiError("LICENSE_INTERNAL_TOKEN belum diatur di server web.", 500);
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: opts.method ?? "GET",
      cache: "no-store",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
        ...(opts.session ? { "x-admin-session": opts.session } : {}),
        ...opts.headers,
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError("Server lisensi tidak bisa dihubungi.", 503);
  }
  const json = (await res.json().catch(() => ({ ok: false, message: "Jawaban server lisensi tidak valid." }))) as { ok: boolean; message?: string } & T;
  if (!json.ok) throw new ApiError(json.message ?? "Gagal", res.status);
  return json;
}

/**
 * The logged-in admin, or a redirect to the login page. Called by every admin page AND every server action:
 * authorization never relies on middleware alone.
 */
export async function requireAdmin(): Promise<{ name: string; session: string }> {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!session) redirect("/admin/login");
  let name: string | null = null;
  try {
    name = (await licenseApi<{ name: string }>("/internal/admin/me", { session })).name;
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) throw e;
  }
  if (!name) redirect("/admin/login");
  return { name, session };
}

/** Call an admin endpoint as the logged-in admin. */
export async function asAdmin<T>(path: string, opts: { method?: "GET" | "POST"; body?: unknown } = {}) {
  const { session } = await requireAdmin();
  return licenseApi<T>(path, { ...opts, session });
}

// ---------------------------------------------------------------- public site + buyer area (no admin session)

export const MEMBER_COOKIE = "trk_member";
export type PublicInfo = { plans: Plan[]; site: Site; latest: { version: string; created_at: number } | null };
export type BuyerAnnouncement = { id: number; title: string; body: string; level: "info" | "warn" | "critical"; created_at: number };
export type MemberDevice = { id: string; name: string | null; app_version: string | null; created_at: number; last_seen: number | null; hw_locked: number };
export type MemberLicense = {
  id: number; key_hint: string; plan: string; planLabel: string; role: "admin" | "member"; status: License["status"];
  expires_at: number | null; max_devices: number; used: number; created_at: number;
  canResetAt: number | null; // null = this license may free a PC now (self-service, once per 7 days)
  devices: MemberDevice[];
};
export type MemberView = {
  user: { id: number; email: string; name: string | null; avatar: string | null; hasPassword: boolean; google: boolean; created_at: number };
  licenses: MemberLicense[];
  plans: Plan[];
  site: Site;
  announcements: BuyerAnnouncement[];
  latest: { version: string; url: string; notes: string; mandatory: number; created_at: number } | null;
};

/** Landing data; null when the license server is unreachable (the page still renders, without prices). */
export async function publicInfo(): Promise<PublicInfo | null> {
  try {
    return await licenseApi<PublicInfo>("/internal/public");
  } catch {
    return null;
  }
}

/** Call a member endpoint with this visitor's session (no session → ApiError 401). */
export async function asMember<T>(path: string, opts: { method?: "GET" | "POST"; body?: unknown } = {}) {
  const session = (await cookies()).get(MEMBER_COOKIE)?.value;
  if (!session) throw new ApiError("Sesi habis. Masuk lagi.", 401);
  return licenseApi<T>(path, { ...opts, headers: { "x-member-session": session } });
}

/** The signed-in member with their licenses, or a redirect to /masuk. */
export async function requireMember(): Promise<MemberView> {
  let view: MemberView | null = null;
  try {
    view = await asMember<MemberView>("/internal/member/me");
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) throw e;
  }
  if (!view) redirect("/masuk");
  return view;
}

/** Signed in? (cheap: cookie only, for the nav) */
export const hasMemberCookie = async () => !!(await cookies()).get(MEMBER_COOKIE)?.value;

/** Really signed in (session still valid on the server)? Used by /masuk and /daftar to skip the form. */
export async function memberSignedIn() {
  if (!(await hasMemberCookie())) return false;
  return asMember("/internal/member/me").then(() => true, () => false);
}

/** wa.me link with a prefilled message; null when no number is set in Pengaturan. */
export const waLink = (site: Site | undefined, text: string) => (site?.whatsapp ? `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(text)}` : null);
