"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { PlatformIcon } from "@/components/platform-icon";
import { PLATFORMS } from "@/lib/db/schema";
import { PLATFORM } from "@/lib/platforms";
import { syncShowcase } from "../showcase/actions";
import { syncYouTubeAccount } from "../youtube-performa/actions";
import { pollTikTokLogin, pollYouTubeLogin, startTikTokLogin, startYouTubeLogin, syncTikTokAccount } from "./actions";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Opens a Chrome login window (server side), polls until the user logs in, then pulls the profile.
 * accountId = re-login an existing account on its own browser profile.
 */
export async function connectTikTok(accountId?: number, onStep?: (msg: string) => void) {
  const { loginId } = await startTikTokLogin(accountId);
  onStep?.("Silakan login di jendela TikTok yang terbuka...");
  for (;;) {
    await sleep(1500);
    const s = await pollTikTokLogin(loginId);
    if (s.status === "identifying") onStep?.("Login terdeteksi, mengenali akun...");
    if (s.status === "done") {
      onStep?.(`@${s.username} tersambung, mengambil data profil...`);
      await syncTikTokAccount(s.accountId).catch(() => {}); // profile sync is best-effort; login already saved
      // the showcase too, so TikTok Shop is filled right away (after the profile: one profile = one browser at a time)
      onStep?.(`Mengambil etalase produk @${s.username}...`);
      const showcase = await syncShowcase(s.accountId).catch(() => null); // not an affiliate yet / TikTok busy: the hourly sync retries
      return { ...s, showcaseCount: showcase?.count ?? null };
    }
    if (s.status === "failed" || s.status === "cancelled") throw new Error(s.error || "Login gagal");
  }
}

/** Same flow for YouTube: Google sign-in in its own Chrome profile, the session stays in that profile. */
export async function connectYouTube(accountId?: number, onStep?: (msg: string) => void) {
  const { loginId } = await startYouTubeLogin(accountId);
  onStep?.("Silakan login akun Google/YouTube di jendela yang terbuka...");
  for (;;) {
    await sleep(1500);
    const s = await pollYouTubeLogin(loginId);
    if (s.status === "identifying") onStep?.("Login terdeteksi, mengenali channel...");
    if (s.status === "done") {
      // pull videos + Insight right away, so Performa is filled without pressing anything
      onStep?.(`${s.username} tersambung, mengambil data dari YouTube Studio (±1 menit)...`);
      const synced = await syncYouTubeAccount(s.accountId).catch(() => null); // no channel yet / Studio busy: the auto-sync retries
      return { ...s, videos: synced?.videos ?? null };
    }
    if (s.status === "failed" || s.status === "cancelled") throw new Error(s.error || "Login gagal");
  }
}

export function useConnect() {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "tiktok" | "youtube">(null);
  async function connect(platform: "tiktok" | "youtube" = "tiktok") {
    setBusy(platform);
    const t = toast.loading(`Membuka jendela login ${PLATFORM[platform].label}...`);
    try {
      if (platform === "youtube") {
        const s = await connectYouTube(undefined, (msg) => toast.loading(msg, { id: t }));
        toast.success(`${s.created ? `${s.username} tersambung` : `Sesi ${s.username} diperbarui`}${s.videos != null ? ` · ${s.videos} video` : ""}`, { id: t });
      } else {
        const s = await connectTikTok(undefined, (msg) => toast.loading(msg, { id: t }));
        const shop = s.showcaseCount != null ? ` · ${s.showcaseCount} produk etalase` : "";
        toast.success(`${s.created ? `@${s.username} tersambung` : `Sesi @${s.username} diperbarui`}${shop}`, { id: t });
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Login gagal", { id: t });
    } finally {
      setBusy(null);
    }
  }
  return { busy, connect };
}

// Platforms with a working login flow; the rest show as "Segera".
const READY = new Set(["tiktok", "youtube"]);

export function TikTokConnectButton() {
  const { busy, connect } = useConnect();
  return (
    <button
      type="button"
      onClick={() => connect("tiktok")}
      disabled={!!busy}
      className="flex h-8 items-center gap-2 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-xs hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
      {busy ? "Menunggu login..." : "Hubungkan TikTok"}
    </button>
  );
}

/** "Add account" tile at the end of the grid: one row per platform. */
export function ConnectTile() {
  const { busy, connect } = useConnect();
  return (
    <div className="flex min-h-56 flex-col rounded-xl border border-dashed bg-card/40 p-4">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-muted text-black dark:text-white"><Plus className="size-4" /></span>
        <div>
          <p className="text-[13px] font-semibold">Hubungkan akun baru</p>
          <p className="text-xs text-muted-foreground">Login sekali, data akun terisi otomatis.</p>
        </div>
      </div>
      <div className="mt-3 grid flex-1 grid-cols-2 gap-1.5">
        {PLATFORMS.map((p) => {
          const ready = READY.has(p);
          return (
            <button
              key={p}
              type="button"
              disabled={!ready || !!busy}
              onClick={() => connect(p as "tiktok" | "youtube")}
              title={ready ? `Hubungkan ${PLATFORM[p].label}` : "Segera hadir"}
              className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-left text-xs font-medium hover:border-ring/40 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background"
            >
              {busy === p ? <Loader2 className="size-4 animate-spin" /> : <PlatformIcon platform={p} className="size-4" />}
              {PLATFORM[p].label}
              {!ready && <span className="ml-auto text-[10px] font-normal text-muted-foreground">Segera</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function YouTubeConnectButton({ label = "Hubungkan YouTube" }: { label?: string }) {
  const { busy, connect } = useConnect();
  return (
    <button
      type="button"
      onClick={() => connect("youtube")}
      disabled={!!busy}
      className="flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground shadow-xs hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
      {busy ? "Menunggu login..." : label}
    </button>
  );
}
