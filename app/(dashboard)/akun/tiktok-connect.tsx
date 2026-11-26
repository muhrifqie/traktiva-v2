"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { PlatformIcon } from "@/components/platform-icon";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PLATFORMS } from "@/lib/db/schema";
import { PLATFORM } from "@/lib/platforms";
import { syncShowcase } from "../showcase/actions";
import { beginRun, type Tracker } from "./connect-progress";
import { syncYouTubeAccount } from "../youtube-performa/actions";
import { pollMetaLogin, pollTikTokLogin, syncFacebookPages, pollYouTubeLogin, startMetaLogin, startTikTokLogin, startYouTubeLogin, syncTikTokAccount } from "./actions";

type Connectable = "tiktok" | "youtube" | "instagram" | "facebook";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fail = (t: Tracker, e: unknown): never => {
  t.fail(e instanceof Error ? e.message : "Login gagal");
  throw e;
};

/**
 * Opens a Chrome login window (server side), polls until the user logs in, then pulls the profile, its videos and the
 * showcase. Every step and counter shows in the progress panel (connect-progress.tsx).
 * accountId = re-login an existing account on its own browser profile.
 */
export async function connectTikTok(accountId?: number, onStep?: (msg: string) => void) {
  const t = beginRun("tiktok", [["login", "Login di jendela TikTok"], ["identify", "Mengenali akun"], ["profile", "Profil & video"], ["showcase", "Etalase TikTok Shop"]]);
  try {
    const { loginId } = await startTikTokLogin(accountId);
    onStep?.("Silakan login di jendela TikTok yang terbuka...");
    for (;;) {
      await sleep(1500);
      const s = await pollTikTokLogin(loginId);
      if (s.status === "identifying") t.step("identify", "run");
      if (s.status === "done") {
        t.who(`@${s.username}`);
        t.step("profile", "run", "Membuka profil...");
        let stop = t.watch(s.accountId, "profile", (p) => (p.stage === "Video" ? `${p.n ?? 0} video diambil` : p.stage === "Menyimpan" ? `Menyimpan ${p.n ?? 0} video...` : `${p.stage}...`));
        const prof = await syncTikTokAccount(s.accountId).catch(() => null); // best-effort; login already saved
        stop();
        t.step("profile", prof ? "done" : "skip", prof ? `${prof.videos} video tersimpan` : "Dilewati, dicoba lagi otomatis nanti");
        // the showcase too, so TikTok Shop is filled right away (after the profile: one profile = one browser at a time)
        t.step("showcase", "run", "Membuka TikTok Shop...");
        stop = t.watch(s.accountId, "showcase", (p) => (p.total ? `Foto produk ${p.n ?? 0}/${p.total}` : `${p.stage}...`));
        const showcase = await syncShowcase(s.accountId).catch(() => null); // not an affiliate yet / TikTok busy: the hourly sync retries
        stop();
        t.step("showcase", showcase ? "done" : "skip", showcase ? `${showcase.count} produk` : "Belum bisa dibaca (belum affiliate / TikTok sibuk)");
        t.finish(`${s.created ? "Akun baru tersambung" : "Sesi diperbarui"}${prof ? ` · ${prof.videos} video` : ""}${showcase ? ` · ${showcase.count} produk etalase` : ""}.`);
        return { ...s, showcaseCount: showcase?.count ?? null };
      }
      if (s.status === "failed" || s.status === "cancelled") throw new Error(s.error || "Login gagal");
    }
  } catch (e) {
    return fail(t, e);
  }
}

/** Same flow for YouTube: Google sign-in in its own Chrome profile, then every video, Insight and monetization. */
export async function connectYouTube(accountId?: number, onStep?: (msg: string) => void) {
  const t = beginRun("youtube", [["login", "Login akun Google/YouTube"], ["identify", "Mengenali channel"], ["studio", "Data YouTube Studio"]]);
  try {
    const { loginId } = await startYouTubeLogin(accountId);
    onStep?.("Silakan login akun Google/YouTube di jendela yang terbuka...");
    for (;;) {
      await sleep(1500);
      const s = await pollYouTubeLogin(loginId);
      if (s.status === "identifying") t.step("identify", "run");
      if (s.status === "done") {
        t.who(s.username);
        t.step("studio", "run", "Membuka YouTube Studio (±1 menit)...");
        const stop = t.watch(s.accountId, "studio", (p) => `${p.stage}${p.n ? ` · ${p.n} video` : ""}...`);
        const synced = await syncYouTubeAccount(s.accountId).catch(() => null); // no channel yet / Studio busy: the auto-sync retries
        stop();
        t.step("studio", synced ? "done" : "skip", synced ? `${synced.videos} video, Insight 28 hari & monetisasi` : "Belum bisa dibaca, dicoba lagi otomatis");
        t.finish(`${s.created ? "Channel baru tersambung" : "Sesi diperbarui"}${synced ? ` · ${synced.videos} video` : ""}.`);
        return { ...s, videos: synced?.videos ?? null };
      }
      if (s.status === "failed" || s.status === "cancelled") throw new Error(s.error || "Login gagal");
    }
  } catch (e) {
    return fail(t, e);
  }
}

/** Instagram / Facebook: their own login page in a Chrome profile; a security check is finished by the user there. */
export async function connectMeta(platform: "instagram" | "facebook", accountId?: number, onStep?: (msg: string) => void) {
  const label = PLATFORM[platform].label;
  const t = beginRun(platform, [["login", `Login di jendela ${label}`], ["identify", "Mengenali akun"], ...(platform === "facebook" ? ([["pages", "Page yang kamu kelola"]] as [string, string][]) : [])]);
  try {
    const { loginId } = await startMetaLogin(platform, accountId);
    onStep?.(`Silakan login ${label} di jendela yang terbuka (selesaikan verifikasi kalau diminta)...`);
    for (;;) {
      await sleep(1500);
      const s = await pollMetaLogin(loginId);
      if (s.status === "identifying") t.step("identify", "run");
      if (s.status === "done") {
        t.who(s.username);
        if (platform !== "facebook") {
          t.finish(s.created ? "Akun baru tersambung." : "Sesi diperbarui.");
          return s;
        }
        t.step("pages", "run", "Membaca Page...");
        const fb = await syncFacebookPages(s.accountId).catch(() => null); // Facebook busy: "Muat ulang" on the card retries
        const pages = fb ? fb.list.filter((x) => x.kind === "page").length : null;
        t.step("pages", fb ? "done" : "skip", fb ? `${pages} Page` : "Belum bisa dibaca, klik Muat ulang di kartu akun");
        t.finish(`${s.created ? "Akun baru tersambung" : "Sesi diperbarui"}${pages != null ? ` · ${pages} Page` : ""}.`);
        return { ...s, pages };
      }
      if (s.status === "failed" || s.status === "cancelled") throw new Error(s.error || "Login gagal");
    }
  } catch (e) {
    return fail(t, e);
  }
}

/** Starts a connect flow; its progress shows in the panel (no toasts). */
export function useConnect() {
  const router = useRouter();
  const [busy, setBusy] = useState<null | Connectable>(null);
  async function connect(platform: Connectable = "tiktok") {
    setBusy(platform);
    try {
      if (platform === "instagram" || platform === "facebook") await connectMeta(platform);
      else if (platform === "youtube") await connectYouTube();
      else await connectTikTok();
      router.refresh();
    } catch {
      // shown in the progress panel
    } finally {
      setBusy(null);
    }
  }
  return { busy, connect };
}

// Platforms with a working login flow; the rest show as "Segera".
const READY = new Set(["tiktok", "youtube", "instagram", "facebook"]);

// what each platform is used for in Traktiva (the "Tambahkan akun" picker)
const USE: Record<string, string> = {
  tiktok: "Upload video, jadwal, etalase TikTok Shop, statistik",
  youtube: "Upload Shorts, statistik YouTube Studio",
  instagram: "Upload Reels dan jadwalnya",
  facebook: "Upload Reels ke Page yang kamu kelola",
  shopee: "Shopee Video & etalase",
};

/** Page header "Tambahkan akun": a popup to pick the platform, then that platform's login window opens. */
export function AddAccountButton({ counts = {} }: { counts?: Record<string, number> }) {
  const { busy, connect } = useConnect();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!!busy}
        className="flex h-8 items-center gap-2 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-xs hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {busy ? `Menunggu login ${PLATFORM[busy].label}...` : "Tambahkan akun"}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-4 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tambahkan akun</DialogTitle>
            <DialogDescription>Pilih media sosialnya. Jendela login terbuka; login sekali, data akun terisi otomatis.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {PLATFORMS.map((p) => {
              const ready = READY.has(p);
              const n = counts[p] ?? 0;
              return (
                <button
                  key={p}
                  type="button"
                  disabled={!ready}
                  onClick={() => (setOpen(false), void connect(p as Connectable))}
                  className="group flex items-start gap-3 rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-background"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border bg-muted transition-transform group-hover:scale-105 group-disabled:scale-100">
                    <PlatformIcon platform={p} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                      {PLATFORM[p].label}
                      {!ready ? (
                        <span className="rounded-full bg-muted px-1.5 text-[10px] font-normal text-muted-foreground">Segera</span>
                      ) : n > 0 ? (
                        <span className="rounded-full bg-muted px-1.5 text-[10px] font-normal tabular-nums text-muted-foreground">{n} akun</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{USE[p]}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">Satu akun cukup login di satu laptop. Login di dua laptop bersamaan bisa memicu limit/ban dari platform.</p>
        </DialogContent>
      </Dialog>
    </>
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
              onClick={() => connect(p as Connectable)}
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
