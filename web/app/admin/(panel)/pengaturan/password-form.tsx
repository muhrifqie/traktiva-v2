"use client";

import { useRef, useTransition } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changePassword } from "../../actions";

/** Change your own password. Other sessions of this admin are logged out; this one stays. */
export function PasswordForm() {
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const next = String(f.get("next"));
    if (next !== f.get("again")) return void toast.error("Ulangi password baru dengan sama persis.");
    start(async () => {
      const r = await changePassword(String(f.get("current")), next);
      if (!r.ok) return void toast.error(r.message);
      toast.success("Password diganti. Sesi di perangkat lain sudah keluar.");
      form.current?.reset();
    });
  };
  return (
    <form ref={form} onSubmit={submit} className="rounded-xl border bg-card">
      <header className="border-b px-4 py-3">
        <p className="text-sm font-semibold">Ganti password</p>
        <p className="text-xs text-muted-foreground">Minimal 10 karakter. Simpan di password manager.</p>
      </header>
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <label className="grid gap-1.5 text-xs font-medium">Password sekarang<Input name="current" type="password" autoComplete="current-password" required /></label>
        <label className="grid gap-1.5 text-xs font-medium">Password baru<Input name="next" type="password" autoComplete="new-password" minLength={10} maxLength={200} required /></label>
        <label className="grid gap-1.5 text-xs font-medium">Ulangi password baru<Input name="again" type="password" autoComplete="new-password" minLength={10} maxLength={200} required /></label>
      </div>
      <div className="flex justify-end border-t px-4 py-3">
        <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <KeyRound />} Ganti password</Button>
      </div>
    </form>
  );
}
