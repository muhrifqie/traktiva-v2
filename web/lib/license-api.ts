import "server-only";
import { cache } from "react";
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
  constructor(message: string, readonly status: number, readonly code?: string) {
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
  const json = (await res.json().catch(() => ({ ok: false, message: "Jawaban server lisensi tidak valid." }))) as { ok: boolean; message?: string; code?: string } & T;
  if (!json.ok) throw new ApiError(json.message ?? "Gagal", res.status, json.code);
  return json;
}

export type AdminIdentity = { name: string; kind: "admin" | "member"; headers: Record<string, string> };

/**
 * The logged-in admin, or a redirect. Called by every admin page AND every server action (authorization never relies
 * on middleware alone). Two ways in: the legacy admin login (trk_admin), or a member account with the admin role
 * (trk_member) — the license server checks the role and, by default, that the account has 2FA switched on.
 */
export async function requireAdmin(): Promise<AdminIdentity> {
  const jar = await cookies();
  const tries: Record<string, string>[] = [];
  const legacy = jar.get(SESSION_COOKIE)?.value;
  if (legacy) tries.push({ "x-admin-session": legacy });
  const member = jar.get(MEMBER_COOKIE)?.value;
  if (member) tries.push({ "x-member-session": member });
  for (const headers of tries) {
    try {
      const me = await licenseApi<{ name: string; kind: "admin" | "member" }>("/internal/admin/me", { headers });
      return { name: me.name, kind: me.kind, headers };
    } catch (e) {
      if (e instanceof ApiError && e.code === "need_2fa") redirect("/pengaturan?perlu2fa=1#keamanan");
      if (!(e instanceof ApiError && e.status === 401)) throw e;
    }
  }
  redirect("/admin/login");
}

/** Call an admin endpoint as the logged-in admin. */
export async function asAdmin<T>(path: string, opts: { method?: "GET" | "POST"; body?: unknown } = {}) {
  const { headers } = await requireAdmin();
  return licenseApi<T>(path, { ...opts, headers });
}

// ---------------------------------------------------------------- public site + buyer area (no admin session)

export const MEMBER_COOKIE = "trk_member";
export type PublicInfo = { plans: Plan[]; site: Site; latest: { version: string; created_at: number } | null; buyOnline?: boolean };
export type BuyerAnnouncement = { id: number; title: string; body: string; level: "info" | "warn" | "critical"; created_at: number };
export type MemberDevice = { id: string; name: string | null; app_version: string | null; created_at: number; last_seen: number | null; hw_locked: number };
export type MemberLicense = {
  id: number; key_hint: string; plan: string; planLabel: string; role: "admin" | "member"; status: License["status"];
  expires_at: number | null; max_devices: number; used: number; created_at: number;
  canResetAt: number | null; // null = this license may free a PC now (self-service, once per 7 days)
  key: string | null; // full key for its owner (bought online or linked); null = only key_hint is known
  devices: MemberDevice[];
};
export type MemberView = {
  user: { id: number; email: string; name: string | null; avatar: string | null; hasPassword: boolean; google: boolean; created_at: number; phone: string | null; isAdmin: boolean; totp: boolean };
  licenses: MemberLicense[];
  plans: Plan[];
  site: Site;
  announcements: BuyerAnnouncement[];
  latest: { version: string; url: string; notes: string; mandatory: number; created_at: number } | null;
  releases: { version: string; url: string; notes: string; mandatory: number; created_at: number }[];
  buyOnline: boolean;
};
export type MemberSession = { id: number; created_at: number | null; last_seen: number | null; ip: string | null; ua: string | null; current: boolean };
export type MemberOrder = { id: string; plan: string; license_id: number | null; base_amount: number; amount: number | null; status: "pending" | "paid" | "expired" | "cancelled" | "mismatch"; created_at: number; paid_at: number | null; pay_url: string | null; livemode: number };

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

/** The signed-in member (one request per page render), or null without a valid session. */
export const memberMe = cache(async (): Promise<MemberView | null> => {
  if (!(await cookies()).get(MEMBER_COOKIE)?.value) return null;
  try {
    return await asMember<MemberView>("/internal/member/me");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
});

/** The signed-in member with their licenses, or a redirect to /masuk. */
export const requireMember = cache(async (): Promise<MemberView> => {
  const view = await memberMe();
  if (!view) redirect("/masuk");
  return view;
});

export type MemberEvent = { id: number; at: number; event: string; license_id: number | null; device_id: string | null; detail: string | null; key_hint: string | null; device_name: string | null; ip: string | null };
/** This member's account + license activity (newest first, max 200); empty when it cannot be loaded. */
export const myActivity = cache(() => asMember<{ events: MemberEvent[] }>("/internal/member/activity").then((r) => r.events, () => [] as MemberEvent[]));

/** This member's online orders (newest first); empty when the list cannot be loaded. */
export const myOrders = cache(() => asMember<{ orders: MemberOrder[] }>("/internal/member/orders").then((r) => r.orders, () => [] as MemberOrder[]));

/** Signed in? (cheap: cookie only, for the nav) */
export const hasMemberCookie = async () => !!(await cookies()).get(MEMBER_COOKIE)?.value;

/** Really signed in (session still valid on the server)? Used by /masuk and /daftar to skip the form. */
export async function memberSignedIn() {
  if (!(await hasMemberCookie())) return false;
  return asMember("/internal/member/me").then(() => true, () => false);
}

/** wa.me link with a prefilled message; null when no number is set in Pengaturan. */
export const waLink = (site: Site | undefined, text: string) => (site?.whatsapp ? `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(text)}` : null);
