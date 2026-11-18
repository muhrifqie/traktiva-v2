"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteProfile, isProfileKey } from "@/lib/browser/camoufox";
import { camoufoxStatus, installCamoufox } from "@/lib/browser/camoufox-install";
import { engineStatus, installEngine, restartEngine, stopEngine } from "@/lib/engine/flow2api-engine";
import { db } from "@/lib/db";
import { googleAccounts } from "@/lib/db/schema";
import { deleteFlowSession, refreshFlowCredits, upsertFlowSession } from "@/lib/flow2api";
import { cancelGoogleLogin, getGoogleLogin, refreshGoogleSession, startGoogleLogin } from "@/lib/platforms/google";

// Google accounts are the only AI setting: one Camoufox profile per account holds the Google login,
// from which Flow (video) and later Gemini (text) cookies are taken. No API keys anywhere.

const Id = z.number().int().positive();
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const refresh = () => {
  revalidatePath("/pengaturan");
  revalidatePath("/video");
  revalidatePath("/proyek");
};

export async function startGoogleConnect(accountId?: number) {
  let key: string | undefined;
  if (accountId) {
    const a = await db.select().from(googleAccounts).where(eq(googleAccounts.id, Id.parse(accountId))).get();
    if (a && isProfileKey(a.sessionKey)) key = a.sessionKey;
  }
  return startGoogleLogin(key);
}

type ConnectPoll =
  | { status: "waiting"; stage: "google" | "flow" | "verify"; email: string | null }
  | { status: "failed" | "cancelled"; error?: string }
  | { status: "done"; email: string; credits: number | null };

export async function pollGoogleConnect(loginId: string): Promise<ConnectPoll> {
  const s = getGoogleLogin(z.string().uuid().parse(loginId));
  if (!s) return { status: "failed", error: "Sesi login tidak ditemukan. Coba lagi." };
  if (s.status === "failed" || s.status === "cancelled") return { status: s.status, error: s.error };
  if (s.status !== "done" || !s.result) return { status: "waiting", stage: s.stage, email: s.email };

  // Stage 3: flow2api validates the cookie set (it rejects incomplete/invalid sessions) and reports credits.
  const email = s.result.email;
  const existing =
    (await db.select().from(googleAccounts).where(eq(googleAccounts.sessionKey, s.sessionKey)).get()) ??
    (await db.select().from(googleAccounts).where(eq(googleAccounts.email, email)).get());
  try {
    const reg = await upsertFlowSession({ tokenId: existing?.flowTokenId, st: s.result.st, cookies: s.result.cookies, remark: `Traktiva ${email}` });
    if (reg.email && reg.email.toLowerCase() !== email) {
      throw new Error(`Akun tidak cocok: Google ${email}, Flow ${reg.email}. Coba login ulang.`);
    }
    const values = { email, sessionKey: s.sessionKey, flowTokenId: reg.id, credits: reg.credits, status: "active" as const, lastError: null, lastSyncAt: new Date() };
    await db.insert(googleAccounts).values(values).onConflictDoUpdate({ target: googleAccounts.email, set: values });
    // Same Google account re-added from a fresh profile: the old browser profile is now unused.
    if (existing && existing.sessionKey !== s.sessionKey && isProfileKey(existing.sessionKey)) {
      await deleteProfile(existing.sessionKey).catch(() => {});
    }
    refresh();
    return { status: "done", email, credits: reg.credits };
  } catch (e) {
    return { status: "failed", error: `Sesi Flow ditolak: ${errMsg(e)}` };
  }
}

export async function cancelGoogleConnect(loginId: string) {
  await cancelGoogleLogin(z.string().uuid().parse(loginId));
}

/** Headless cookie refresh + push to flow2api + credit check. */
export async function syncGoogleAccount(id: number) {
  const a = await db.select().from(googleAccounts).where(eq(googleAccounts.id, Id.parse(id))).get();
  if (!a) throw new Error("Akun tidak ditemukan");
  try {
    const s = await refreshGoogleSession(a.sessionKey);
    if (!s) {
      await db.update(googleAccounts).set({ status: "need_login", lastError: "Sesi Google habis, login ulang.", lastSyncAt: new Date() }).where(eq(googleAccounts.id, a.id));
      refresh();
      return { ok: false as const, error: "Sesi Google habis, login ulang." };
    }
    const reg = await upsertFlowSession({ tokenId: a.flowTokenId, st: s.st, cookies: s.cookies, remark: `Traktiva ${a.email}` });
    const credits = reg.credits ?? (reg.id ? await refreshFlowCredits(reg.id).catch(() => null) : null);
    await db.update(googleAccounts).set({ flowTokenId: reg.id, credits, status: "active", lastError: null, lastSyncAt: new Date() }).where(eq(googleAccounts.id, a.id));
    refresh();
    return { ok: true as const, credits };
  } catch (e) {
    await db.update(googleAccounts).set({ status: "error", lastError: errMsg(e).slice(0, 300) }).where(eq(googleAccounts.id, a.id));
    refresh();
    return { ok: false as const, error: errMsg(e) };
  }
}

export async function deleteGoogleAccount(id: number) {
  const a = await db.select().from(googleAccounts).where(eq(googleAccounts.id, Id.parse(id))).get();
  if (!a) return;
  if (a.flowTokenId) await deleteFlowSession(a.flowTokenId).catch(() => {});
  await db.delete(googleAccounts).where(eq(googleAccounts.id, a.id));
  if (isProfileKey(a.sessionKey)) await deleteProfile(a.sessionKey).catch(() => {});
  refresh();
}


// ---------- speed ----------


// ---------- voice-over (Flow / Cartesia / ElevenLabs) ----------

async function voiceLib() {
  const [settings, cartesia, kalo] = await Promise.all([import("@/lib/settings"), import("@/lib/cartesia"), import("@/lib/kalo")]);
  return { ...settings, ...cartesia, setKv: kalo.setKv };
}

export async function setVoiceProvider(provider: string) {
  const { VOICE_PROVIDERS, getSettings, updateSettings } = await voiceLib();
  if (!(VOICE_PROVIDERS as readonly string[]).includes(provider)) throw new Error("Pilihan suara tidak dikenal.");
  if (provider === "elevenlabs") throw new Error("ElevenLabs segera hadir.");
  const v = getSettings().voice;
  if (provider === "cartesia" && !v.cartesiaKey) throw new Error("Masukkan API key Cartesia dulu.");
  updateSettings({ voice: { ...v, provider: provider as "flow" | "cartesia" } });
  refresh();
}

/** Save (after checking it works) the Cartesia key; also caches the Indonesian voice list. */
export async function saveCartesiaKey(key: string) {
  const { listVoices, getSettings, updateSettings, setKv } = await voiceLib();
  const k = key.trim();
  if (!/^sk_car_\w{10,}$/.test(k)) throw new Error("Format API key Cartesia tidak valid (diawali sk_car_).");
  const voices = await listVoices(k, "id");
  await setKv("cartesia:voices:id", voices);
  const v = getSettings().voice;
  const keep = voices.find((x) => x.id === v.cartesiaVoiceId) ?? voices.find((x) => /fem/i.test(x.gender ?? "")) ?? voices[0];
  updateSettings({ voice: { ...v, cartesiaKey: k, cartesiaVoiceId: keep?.id, cartesiaVoiceName: keep?.name } });
  refresh();
  return voices.length;
}

export async function removeCartesiaKey() {
  const { getSettings, updateSettings } = await voiceLib();
  const v = getSettings().voice;
  updateSettings({ voice: { provider: v.provider === "cartesia" ? "flow" : v.provider, speed: v.speed } });
  refresh();
}

export async function chooseCartesiaVoice(id: string, name: string) {
  const { getSettings, updateSettings } = await voiceLib();
  updateSettings({ voice: { ...getSettings().voice, cartesiaVoiceId: z.string().min(8).max(80).parse(id), cartesiaVoiceName: name.slice(0, 60) } });
  refresh();
}

export async function setVoiceSpeed(speed: number) {
  const { getSettings, updateSettings } = await voiceLib();
  updateSettings({ voice: { ...getSettings().voice, speed: Math.min(1.5, Math.max(0.6, z.number().parse(speed))) } });
  refresh();
}

/** Short sample of a voice (few credits) as a data URL the browser can play. */
export async function previewCartesiaVoice(id: string) {
  const { getSettings, synthesize } = await voiceLib();
  const v = getSettings().voice;
  if (!v.cartesiaKey) throw new Error("Masukkan API key Cartesia dulu.");
  const wav = await synthesize(v.cartesiaKey, "Halo! Ini contoh suaraku buat video jualan kamu. Cek keranjang kuning ya!", id, { speed: v.speed });
  return `data:audio/wav;base64,${wav.toString("base64")}`;
}

/** Start (or resume) the Camoufox download in the background. */
export async function downloadCamoufox() {
  void installCamoufox().catch(() => {});
  return camoufoxStatus();
}

/** Video engine controls for the engine card. Install runs in the background; poll /api/engine. */
export async function installVideoEngine() {
  void installEngine().catch(() => {});
  return engineStatus();
}

export async function restartVideoEngine() {
  try {
    await restartEngine();
  } catch {} // the reason is shown from engineStatus().error
  revalidatePath("/pengaturan");
  return engineStatus();
}

export async function stopVideoEngine() {
  await stopEngine();
  return engineStatus();
}

/** Visible Flow window on the account's own browser profile (first-run setup, checking things by hand). */
export async function openFlowForAccount(id: number) {
  const a = await db.select().from(googleAccounts).where(eq(googleAccounts.id, Id.parse(id))).get();
  if (!a) throw new Error("Akun tidak ditemukan");
  const { openFlowWindow } = await import("@/lib/platforms/flow-browser");
  await openFlowWindow(a.sessionKey);
}
