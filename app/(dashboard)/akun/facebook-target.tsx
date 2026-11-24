"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Flag, Loader2, RefreshCw, User } from "lucide-react";
import { toast } from "sonner";
import type { FacebookIdentities } from "@/lib/platforms/meta";
import { setFacebookTarget, syncFacebookPages } from "./actions";

/** Facebook card block: who uploads post as — the personal profile or one of the Pages this account manages. */
export function FacebookTarget({ accountId, data }: { accountId: number; data: FacebookIdentities | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const reload = async () => {
    setBusy("reload");
    try {
      const r = await syncFacebookPages(accountId);
      toast.success(`${r.list.filter((x) => x.kind === "page").length} Page ditemukan`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membaca Page");
    } finally {
      setBusy(null);
    }
  };
  const choose = async (id: string, name: string) => {
    setBusy(id);
    try {
      await setFacebookTarget(accountId, id);
      toast.success(`Upload Facebook akan diposting sebagai ${name}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-1.5 rounded-lg border bg-background/50 p-2">
      <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
        Posting sebagai
        <button type="button" onClick={() => void reload()} disabled={!!busy} className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-foreground disabled:opacity-50">
          {busy === "reload" ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} {data ? "Muat ulang" : "Baca Page"}
        </button>
      </div>
      {data ? (
        <div className="space-y-1">
          {data.list.map((x) => {
            const on = data.target === x.id;
            return (
              <button key={x.id} type="button" onClick={() => !on && void choose(x.id, x.name)} disabled={!!busy} aria-pressed={on} className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs ${on ? "border-[#3b82f6]/60 bg-[#3b82f6]/10" : "border-transparent hover:bg-accent"}`}>
                <span className={`grid size-6 shrink-0 place-items-center rounded-full ${x.kind === "page" ? "bg-[#3b82f6]/15 text-[#3b82f6]" : "bg-muted text-muted-foreground"}`}>
                  {x.kind === "page" ? <Flag className="size-3" /> : <User className="size-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{x.name}</span>
                  <span className="block text-[10px] text-muted-foreground">{x.kind === "page" ? "Page" : "Profil pribadi"}</span>
                </span>
                {busy === x.id ? <Loader2 className="size-3.5 animate-spin" /> : on ? <Check className="size-3.5 text-[#3b82f6]" /> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Belum dibaca. Klik “Baca Page” untuk mengambil profil pribadi dan Page yang kamu kelola.</p>
      )}
    </div>
  );
}
