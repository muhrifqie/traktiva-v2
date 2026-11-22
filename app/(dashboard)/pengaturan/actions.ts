"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteProfile, isProfileKey } from "@/lib/browser/chrome";
import { db } from "@/lib/db";
import { googleAccounts } from "@/lib/db/schema";
import { deleteFlowSession, refreshFlowCredits, refreshFlowLimit, upsertFlowSession } from "@/lib/flow2api";
import { cancelGoogleLogin, getGoogleLogin, refreshGoogleSession, startGoogleLogin } from "@/lib/platforms/google";

// Google accounts are the only AI setting: one Chrome profile per account holds the Google login,
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
    void refreshFlowLimit().catch(() => {}); // one more account can carry more parallel jobs: start queued ones now
    // Same Google account re-added from a fresh profile: the old browser profile is now unused.
    if (existing && existing.sessionKey !== s.sessionKey && isProfileKey(existing.sessionKey)) {
      await deleteProfile(existing.sessionKey).catch(() => {});
    }
    void import("@/lib/ai-standby").then((m) => m.warmAiBrowsers()); // Gemini standby uses this profile again
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
  // must not be skipped silently: a session left in flow2api keeps being used for generations
  if (a.flowTokenId) await deleteFlowSession(a.flowTokenId).catch((e) => {
    if (!/flow2api 404/.test(String(e))) throw new Error(`Gagal melepas akun dari mesin video: ${errMsg(e)}`);
  });
  await db.delete(googleAccounts).where(eq(googleAccounts.id, a.id));
  void refreshFlowLimit().catch(() => {});
  if (isProfileKey(a.sessionKey)) await deleteProfile(a.sessionKey).catch(() => {});
  refresh();
}


// ---------- voice-over (Flow / Cartesia) ----------

async function voiceLib() {
  const [settings, cartesia, kalo] = await Promise.all([import("@/lib/settings"), import("@/lib/cartesia"), import("@/lib/kalo")]);
  return { ...settings, ...cartesia, setKv: kalo.setKv };
}

export async function setVoiceProvider(provider: string) {
  const { VOICE_PROVIDERS, getSettings, updateSettings } = await voiceLib();
  if (!(VOICE_PROVIDERS as readonly string[]).includes(provider)) throw new Error("Pilihan suara tidak dikenal.");
  const v = getSettings().voice;
  if (provider === "cartesia" && !v.cartesiaKey) throw new Error("Masukkan API key Cartesia dulu.");
  updateSettings({ voice: { ...v, provider: provider as "flow" | "cartesia" } });
  refresh();
}

/** Save (after checking it works) the Cartesia key; also caches the Indonesian voice list and makes Cartesia the default. */
export async function saveCartesiaKey(key: string) {
  const { listVoices, getSettings, updateSettings, setKv } = await voiceLib();
  const k = key.trim();
  if (!/^sk_car_\w{10,}$/.test(k)) throw new Error("Format API key Cartesia tidak valid (diawali sk_car_).");
  const voices = await listVoices(k, "id");
  await setKv("cartesia:voices:id", voices);
  const v = getSettings().voice;
  const keep = voices.find((x) => x.id === v.cartesiaVoiceId) ?? voices.find((x) => /fem/i.test(x.gender ?? "")) ?? voices[0];
  // the key is only asked for after picking Cartesia, so saving it also switches the default to Cartesia
  updateSettings({ voice: { ...v, provider: "cartesia", cartesiaKey: k, cartesiaVoiceId: keep?.id, cartesiaVoiceName: keep?.name } });
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
  const wav = await synthesize(v.cartesiaKey, "Halo! Ini contoh suaraku buat video jualan kamu. Cek keranjang di bawah ya!", id, { speed: v.speed });
  return `data:audio/wav;base64,${wav.toString("base64")}`;
}

// ---------------------------------------------------------------- ChatGPT (writer)

export async function startChatgptConnect() {
  const { startChatgptLogin } = await import("@/lib/platforms/chatgpt");
  const { getSettings } = await import("@/lib/settings");
  const key = getSettings().chatgpt?.profileKey;
  return startChatgptLogin(key && isProfileKey(key) ? key : undefined);
}

export async function pollChatgptConnect(loginId: string): Promise<{ status: "waiting" | "failed" | "cancelled" | "done"; email?: string | null; error?: string }> {
  const { getChatgptLogin } = await import("@/lib/platforms/chatgpt");
  const { updateSettings } = await import("@/lib/settings");
  const s = getChatgptLogin(z.string().uuid().parse(loginId));
  if (!s) return { status: "failed", error: "Sesi login tidak ditemukan. Coba lagi." };
  if (s.status !== "done") return { status: s.status, error: s.error, email: s.email };
  updateSettings({ chatgpt: { profileKey: s.profileKey, email: s.email, connectedAt: Date.now() } });
  void import("@/lib/ai-standby").then((m) => m.warmAiBrowsers()); // park the fresh login right away
  refresh();
  return { status: "done", email: s.email };
}

export async function testChatgpt() {
  const { askChatGPT } = await import("@/lib/platforms/chatgpt");
  const { getSettings } = await import("@/lib/settings");
  const key = getSettings().chatgpt?.profileKey;
  if (!key) throw new Error("ChatGPT belum dihubungkan.");
  const t0 = Date.now();
  const answer = await askChatGPT(key, 'Balas HANYA dengan JSON ini tanpa penjelasan: {"ok":true}', 120_000);
  return { ok: /"ok"\s*:\s*true/.test(answer), seconds: Math.round((Date.now() - t0) / 1000), answer: answer.slice(0, 120) };
}

export async function disconnectChatgpt() {
  const { getSettings, updateSettings } = await import("@/lib/settings");
  const key = getSettings().chatgpt?.profileKey;
  updateSettings({ chatgpt: null });
  if (key) await (await import("@/lib/browser/chrome")).stopStandby(key);
  if (key && isProfileKey(key)) await deleteProfile(key).catch(() => {});
  refresh();
}

const Writing = z.object({
  cta: z.string().trim().min(3).max(80),
  replace: z.array(z.object({ from: z.string().trim().min(2).max(40), to: z.string().trim().max(40) })).max(12),
  notes: z.string().trim().max(500),
});

/** Pengaturan → Aturan naskah: CTA, banned words (auto-swapped) and extra notes for every AI writer. */
export async function saveWritingRules(input: z.input<typeof Writing>) {
  const { updateSettings } = await import("@/lib/settings");
  updateSettings({ writing: Writing.parse(input) });
  revalidatePath("/pengaturan");
}
