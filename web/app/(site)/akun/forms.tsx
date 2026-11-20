"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, KeyRound, Loader2, Unplug } from "lucide-react";
import { changePassword, claimKey, resetMyDevice, saveProfile, type FormResult } from "../actions";

const field = "h-11 rounded-xl border border-white/15 bg-black/30 px-3.5 text-[15px] outline-none placeholder:text-white/25 focus:border-[var(--site-signal)]";

function Note({ state }: { state: FormResult }) {
  if (!state?.message) return null;
  return (
    <p className={`text-[14px] ${state.ok ? "text-[var(--site-signal)]" : "text-red-300"}`} role={state.ok ? "status" : "alert"}>
      {state.message}
    </p>
  );
}

/** "Tambah lisensi": claim a key into this account. */
export function ClaimForm({ big = false }: { big?: boolean }) {
  const [state, action, pending] = useActionState(claimKey, null);
  const [key, setKey] = useState("");
  return (
    <form action={(f) => action(f)} className="grid gap-3">
      <label className="grid gap-2 text-[15px] font-medium">
        Key lisensi
        <input
          name="key"
          value={key}
          onChange={(e) => setKey(e.target.value.toUpperCase())}
          required
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          placeholder="TRK-XXXX-XXXX-XXXX-XXXX"
          className={`${field} font-mono tracking-wider ${big ? "h-14 text-[17px]" : ""}`}
        />
      </label>
      <Note state={state} />
      <button type="submit" disabled={pending} className={`site-pill ${big ? "" : "site-sm"} disabled:opacity-60`}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Tambahkan ke akun
      </button>
    </form>
  );
}

/** Free this PC's slot (two-step confirm; the server enforces the 7-day cooldown). */
export function ReleaseDevice({ id, name, allowed }: { id: string; name: string; allowed: boolean }) {
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!allowed) return null;
  const go = () =>
    start(async () => {
      const r = await resetMyDevice(id);
      if (r && !r.ok) setError(r.message);
      setAsk(false);
    });
  if (error) return <span className="text-[13px] text-red-300">{error}</span>;
  return ask ? (
    <span className="flex flex-wrap items-center gap-2 text-[13px]">
      <span className="text-[var(--site-body)]">Lepas {name}? App di PC itu akan terkunci.</span>
      <button type="button" onClick={go} disabled={pending} className="rounded-full bg-white px-3 py-1.5 font-semibold text-black hover:bg-[#d4d4d8] disabled:opacity-60">
        {pending ? <Loader2 className="inline size-3.5 animate-spin" /> : "Ya, lepas"}
      </button>
      <button type="button" onClick={() => setAsk(false)} className="px-2 py-1.5 text-[var(--site-muted)] hover:text-white">Batal</button>
    </span>
  ) : (
    <button type="button" onClick={() => setAsk(true)} className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-[13px] hover:border-white/50">
      <Unplug className="size-3.5" /> Lepas PC
    </button>
  );
}

export function ProfileForm({ name }: { name: string | null }) {
  const [state, action, pending] = useActionState(saveProfile, null);
  const [value, setValue] = useState(name ?? "");
  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-2 text-[14px] font-medium">
        Nama
        <input name="name" value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} className={field} />
      </label>
      <Note state={state} />
      <button type="submit" disabled={pending} className="site-pill-outline site-sm justify-self-start disabled:opacity-60">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Simpan
      </button>
    </form>
  );
}

/** Change the password; Google-only accounts set one here (then email login works too). */
export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState(changePassword, null);
  return (
    <form action={action} className="grid gap-3">
      {hasPassword && (
        <label className="grid gap-2 text-[14px] font-medium">
          Password sekarang
          <input name="current" type="password" required autoComplete="current-password" className={field} />
        </label>
      )}
      <label className="grid gap-2 text-[14px] font-medium">
        Password baru
        <input name="next" type="password" required minLength={8} maxLength={200} autoComplete="new-password" placeholder="Minimal 8 karakter" className={field} />
      </label>
      <label className="grid gap-2 text-[14px] font-medium">
        Ulangi password baru
        <input name="again" type="password" required minLength={8} maxLength={200} autoComplete="new-password" className={field} />
      </label>
      <Note state={state} />
      <button type="submit" disabled={pending} className="site-pill-outline site-sm justify-self-start disabled:opacity-60">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} {hasPassword ? "Ganti password" : "Buat password"}
      </button>
    </form>
  );
}
