"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CloudDownload, Loader2, LogIn, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { checkMetaSession, checkTikTokSession, checkYouTubeSession, deleteAccount, syncTikTokAccount } from "./actions";
import { beginRun } from "./connect-progress";
import { connectMeta, connectTikTok, connectYouTube } from "./tiktok-connect";

type Props = { id: number; platform: string; username: string; hasSession: boolean; needsLogin: boolean };

const base = "flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors disabled:opacity-50";
const outline = `${base} border bg-background hover:bg-accent`;

/** Card footer actions: login / sync / check / delete. */
export function AccountActions({ id, platform, username, hasSession, needsLogin }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "check" | "login" | "sync" | "delete">(null);
  const isTikTok = platform === "tiktok";
  const isYouTube = platform === "youtube";
  const isMeta = platform === "instagram" || platform === "facebook";
  const canLogin = isTikTok || isYouTube || isMeta;
  const at = isTikTok ? `@${username}` : username;

  async function run(kind: NonNullable<typeof busy>, fn: () => Promise<void>) {
    setBusy(kind);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(null);
    }
  }

  const relogin = () =>
    // progress (login, then every scrape step) shows in the connect panel
    run("login", async () => {
      if (isMeta) await connectMeta(platform as "instagram" | "facebook", id);
      else if (isYouTube) await connectYouTube(id);
      else await connectTikTok(id);
    });

  const sync = () =>
    run("sync", async () => {
      // live progress (videos taken so far) in the connect panel
      const t = beginRun("tiktok", [["profile", "Profil & video"]], { title: "Sinkron data TikTok", doneTitle: "Sinkron selesai" });
      t.who(`@${username}`);
      const stop = t.watch(id, "profile", (p) => (p.stage === "Video" ? `${p.n ?? 0} video diambil` : p.stage === "Menyimpan" ? `Menyimpan ${p.n ?? 0} video...` : `${p.stage}...`));
      try {
        const r = await syncTikTokAccount(id);
        t.step("profile", "done", `${r.videos} video tersimpan`);
        t.finish(`${r.videos} video & statistik diperbarui.`);
      } catch (e) {
        t.fail(e instanceof Error ? e.message : "Sinkron gagal");
      } finally {
        stop();
      }
    });

  const check = () =>
    run("check", async () => {
      if (isMeta) {
        const r = await checkMetaSession(id);
        if (r.valid) toast.success(`Sesi ${at} masih aktif`);
        else if (r.checkpoint) toast.warning(`${at} diminta verifikasi keamanan. Klik Login lalu selesaikan di jendela yang terbuka.`);
        else if (r.other) toast.warning(`Profil browser ${at} sekarang login sebagai akun lain. Login ulang akun ini.`);
        else toast.warning(`Sesi ${at} habis, perlu login ulang`);
        return;
      }
      const r = await (isYouTube ? checkYouTubeSession : checkTikTokSession)(id);
      if (r.valid) toast.success(`Sesi ${at} masih aktif`);
      else toast.warning(`Sesi ${at} habis, perlu login ulang`);
    });

  const remove = () =>
    run("delete", async () => {
      if (!(await confirmDialog({ title: `Hapus @${username}?`, description: "Profil browser dan sesi login akun ini ikut dihapus.", danger: true }))) return;
      await deleteAccount(id);
      toast.success(`@${username} dihapus`);
    });

  const spin = <Loader2 className="size-3.5 animate-spin" />;

  return (
    <div className="flex items-center gap-1.5">
      {canLogin && (needsLogin || !hasSession) && (
        <button type="button" onClick={relogin} disabled={!!busy} className={`${base} flex-1 bg-primary text-primary-foreground hover:bg-primary/90`}>
          {busy === "login" ? spin : <LogIn className="size-3.5" />}
          Login
        </button>
      )}
      {canLogin && hasSession && !needsLogin && (
        <>
          {isTikTok && <button type="button" onClick={sync} disabled={!!busy} className={`${outline} flex-1`}>
            {busy === "sync" ? spin : <CloudDownload className="size-3.5" />}
            Sinkron
          </button>}
          <button type="button" onClick={check} disabled={!!busy} className={`${outline} flex-1`}>
            {busy === "check" ? spin : <RefreshCw className="size-3.5" />}
            Cek sesi
          </button>
        </>
      )}
      <button
        type="button"
        onClick={remove}
        disabled={!!busy}
        aria-label={`Hapus @${username}`}
        title="Hapus akun"
        className={`${base} border bg-background text-muted-foreground hover:border-destructive/40 hover:text-destructive`}
      >
        {busy === "delete" ? spin : <Trash2 className="size-3.5" />}
      </button>
    </div>
  );
}
