"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Coins, Loader2, LogIn, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { GoogleIcon } from "@/components/brand-icons";
import { deleteGoogleAccount, pollGoogleConnect, startGoogleConnect, syncGoogleAccount } from "./actions";

type Account = { id: number; email: string; credits: number | null; status: "active" | "need_login" | "error"; lastError: string | null; lastSync: string | null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function connect(accountId: number | undefined, onStep: (m: string) => void) {
  const { loginId } = await startGoogleConnect(accountId);
  onStep("Langkah 1/3 · Login akun Google di jendela yang terbuka...");
  let last = "";
  for (;;) {
    await sleep(1500);
    const s = await pollGoogleConnect(loginId);
    if (s.status === "done") return s;
    if (s.status !== "waiting") throw new Error(s.error || "Login gagal");
    const msg =
      s.stage === "google"
        ? "Langkah 1/3 · Login akun Google di jendela yang terbuka..."
        : `Langkah 2/3 · ${s.email} masuk, menyambungkan ke Flow...`;
    if (msg !== last) onStep((last = msg));
  }
}

const btn = "flex h-8 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-xs font-medium hover:bg-accent disabled:opacity-50";

export function GoogleAccounts({ accounts, ready }: { accounts: Account[]; ready: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(null);
    }
  }

  const login = (accountId?: number) =>
    run(`login-${accountId ?? "new"}`, async () => {
      const t = toast.loading("Membuka jendela login Google...");
      try {
        const s = await connect(accountId, (m) => toast.loading(m, { id: t }));
        toast.success(`${s.email} tersambung${s.credits != null ? ` · ${s.credits} kredit` : ""}`, { id: t });
      } catch (e) {
        toast.dismiss(t);
        throw e;
      }
    });

  const sync = (a: Account) =>
    run(`sync-${a.id}`, async () => {
      const r = await syncGoogleAccount(a.id);
      if (r.ok) toast.success(`${a.email} diperbarui${r.credits != null ? ` · ${r.credits} kredit` : ""}`);
      else toast.error(r.error);
    });

  const remove = (a: Account) =>
    run(`del-${a.id}`, async () => {
      if (!(await confirmDialog({ title: `Hapus ${a.email}?`, description: "Sesi login akun ini ikut dihapus dari Traktiva. Kamu bisa menambahkannya lagi nanti.", danger: true }))) return;
      await deleteGoogleAccount(a.id);
    });

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg border bg-background"><GoogleIcon className="size-5" /></span>
          <div>
          <p className="text-sm font-semibold">Akun Google</p>
          <p className="text-xs text-muted-foreground">Login sekali, lalu video dibuat otomatis memakai kredit Flow akun ini.</p>
          </div>
        </div>
        <button type="button" onClick={() => login()} disabled={!!busy || !ready} title={ready ? undefined : "Mesin video belum terpasang"} className="flex h-8 items-center gap-1.5 rounded-lg border bg-background px-3 text-xs font-medium shadow-xs hover:bg-accent disabled:opacity-60">
          {busy === "login-new" ? <Loader2 className="size-3.5 animate-spin" /> : <GoogleIcon className="size-3.5" />} Tambah akun Google
        </button>
      </div>

      {accounts.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          Belum ada akun. Pakai <b>akun Google khusus bot</b>, bukan akun utama.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {accounts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <span className="relative shrink-0"><GoogleIcon className="size-5" />{a.status === "active" ? <CircleCheck className="absolute -right-1 -bottom-1 size-3 rounded-full bg-card text-status-ok" /> : <CircleAlert className="absolute -right-1 -bottom-1 size-3 rounded-full bg-card text-status-progress" />}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{a.email}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {a.status === "active" ? `Disinkron ${a.lastSync ?? "-"}` : a.lastError ?? "Perlu login ulang"}
                </p>
              </div>
              <span className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium" title="Sisa kredit Flow">
                <Coins className="size-3 text-black dark:text-white" />
                {a.credits ?? "—"}
              </span>
              {a.status === "active" ? (
                <button type="button" onClick={() => sync(a)} disabled={!!busy} className={btn}>
                  {busy === `sync-${a.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Sinkron
                </button>
              ) : (
                <button type="button" onClick={() => login(a.id)} disabled={!!busy || !ready} className={btn}>
                  {busy === `login-${a.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <LogIn className="size-3.5" />} Login ulang
                </button>
              )}
              <button type="button" onClick={() => remove(a)} disabled={!!busy} aria-label={`Hapus ${a.email}`} className={`${btn} text-muted-foreground hover:text-destructive`}>
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
