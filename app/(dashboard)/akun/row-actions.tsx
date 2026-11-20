"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CloudDownload, Loader2, LogIn, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { checkTikTokSession, deleteAccount, syncTikTokAccount } from "./actions";
import { connectTikTok } from "./tiktok-connect";

type Props = { id: number; platform: string; username: string; hasSession: boolean; needsLogin: boolean };

const base = "flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors disabled:opacity-50";
const outline = `${base} border bg-background hover:bg-accent`;

/** Card footer actions: login / sync / check / delete. */
export function AccountActions({ id, platform, username, hasSession, needsLogin }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "check" | "login" | "sync" | "delete">(null);
  const isTikTok = platform === "tiktok";

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
    run("login", async () => {
      const t = toast.loading(`Membuka login @${username}...`);
      try {
        const s = await connectTikTok(id, (msg) => toast.loading(msg, { id: t }));
        toast.success(`Sesi @${s.username} diperbarui${s.showcaseCount != null ? ` · ${s.showcaseCount} produk etalase` : ""}`, { id: t });
      } catch (e) {
        toast.dismiss(t);
        throw e;
      }
    });

  const sync = () =>
    run("sync", async () => {
      const t = toast.loading(`Mengambil data @${username} dari TikTok...`);
      try {
        const r = await syncTikTokAccount(id);
        toast.success(`${r.videos} video & statistik @${username} diperbarui`, { id: t });
      } catch (e) {
        toast.dismiss(t);
        throw e;
      }
    });

  const check = () =>
    run("check", async () => {
      const r = await checkTikTokSession(id);
      if (r.valid) toast.success(`Sesi @${username} masih aktif`);
      else toast.warning(`Sesi @${username} habis, perlu login ulang`);
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
      {isTikTok && (needsLogin || !hasSession) && (
        <button type="button" onClick={relogin} disabled={!!busy} className={`${base} flex-1 bg-primary text-primary-foreground hover:bg-primary/90`}>
          {busy === "login" ? spin : <LogIn className="size-3.5" />}
          Login
        </button>
      )}
      {isTikTok && hasSession && !needsLogin && (
        <>
          <button type="button" onClick={sync} disabled={!!busy} className={`${outline} flex-1`}>
            {busy === "sync" ? spin : <CloudDownload className="size-3.5" />}
            Sinkron
          </button>
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
