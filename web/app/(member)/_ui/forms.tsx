"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Check, Copy, Eye, EyeOff, KeyRound, Link2, Loader2, RotateCcw, Unplug, Wallet } from "lucide-react";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  resetHwid,
  buyPlan, changePassword, claimKey, resetMyDevice, saveProfile, type FormResult,
} from "@/app/(site)/actions";

const label = "grid gap-1.5 text-xs font-medium";

function Note({ state }: { state: FormResult }) {
  if (!state?.message) return null;
  return (
    <p className={`text-[0.8125rem] ${state.ok ? "text-status-ok" : "text-destructive"}`} role={state.ok ? "status" : "alert"}>
      {state.message}
    </p>
  );
}

/** The full license key with copy (masked until shown); older keys only have their last 4 characters here. */
export function KeyBox({ licenseKey, hint, compact = false }: { licenseKey: string | null; hint: string; compact?: boolean }) {
  const [show, setShow] = useState(false);
  if (!licenseKey && compact)
    return (
      <p className="text-xs text-muted-foreground">
        <span className="font-mono text-sm text-foreground">TRK-····-····-····-{hint}</span> · key lengkap belum tersimpan. <Link href="/lisensi#tautkan" className="font-semibold underline">Tautkan ulang</Link>
      </p>
    );
  if (!licenseKey)
    return (
      <div className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
        <p className="font-mono text-[0.8125rem] text-foreground">TRK-····-····-····-{hint}</p>
        <p className="mt-1">Key lengkap ada di pesan dari penjual. Tautkan sekali lagi di <b>Tautkan key</b> supaya tersimpan di sini.</p>
      </div>
    );
  return (
    <div>
      {!compact && <p className="text-xs text-muted-foreground">Key lisensi (tempel di app Traktiva saat diminta)</p>}
      <div className={`${compact ? "" : "mt-1.5 "}flex items-center gap-1.5 rounded-lg border bg-muted/40 py-1 pr-1 pl-3`}>
        <span className="min-w-0 flex-1 truncate font-mono text-[0.8125rem] tracking-wide select-all">{show ? licenseKey : licenseKey.replace(/[A-Z0-9](?=.*-.{4}$)/g, "•")}</span>
        <Button type="button" size="icon-sm" variant="ghost" onClick={() => setShow(!show)} aria-label={show ? "Sembunyikan key" : "Tampilkan key"}>
          {show ? <EyeOff /> : <Eye />}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={async () => (await navigator.clipboard.writeText(licenseKey), toast.success("Key disalin"))}>
          <Copy /> Salin
        </Button>
      </div>
    </div>
  );
}

/** "Tautkan key": a key from the seller (WhatsApp purchase) into this account. Not needed for website purchases. */
export function ClaimForm() {
  const [state, action, pending] = useActionState(claimKey, null);
  const [key, setKey] = useState("");
  return (
    <form action={action} className="grid gap-3">
      <label className={label}>
        Key lisensi dari penjual
        <Input
          name="key"
          value={key}
          onChange={(e) => setKey(e.target.value.toUpperCase())}
          required
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          placeholder="TRK-XXXX-XXXX-XXXX-XXXX"
          className="font-mono tracking-wider"
        />
      </label>
      <Note state={state} />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? <Loader2 className="animate-spin" /> : <Link2 />} Tautkan ke akun
      </Button>
    </form>
  );
}

/** "Pindah PC" (server: reset HWID): every PC on the license is released, with a confirm modal; once a day per license. */
export function ResetHwidButton({ licenseId, pcs, waitText }: { licenseId: number; pcs: number; waitText: string | null }) {
  if (waitText) return <span className="text-xs font-medium text-muted-foreground">Bisa pindah PC lagi dalam {waitText}</span>;
  if (!pcs) return <span className="text-xs font-medium text-muted-foreground">Belum dipakai di PC</span>;
  return (
    <ConfirmButton
      title="Pindahkan key ke PC baru?"
      description={`${pcs} PC yang memakai key ini dilepas dan app di sana langsung terkunci. Setelah itu buka app di PC baru dan tempel key-nya. Bisa 1× per hari per lisensi.`}
      confirmLabel="Ya, lepas semua PC"
      destructive
      onConfirm={() => resetHwid(licenseId)}
    >
      <RotateCcw /> Pindah PC
    </ConfirmButton>
  );
}

export function ReleaseDevice({ id, name, allowed }: { id: string; name: string; allowed: boolean }) {
  if (!allowed) return null;
  return (
    <ConfirmButton
      title={`Lepas ${name}?`}
      description="App Traktiva di PC itu langsung terkunci dan slotnya kosong lagi, jadi key bisa diaktifkan di PC lain. Bisa 1× per hari per lisensi (dihitung sama dengan Pindah PC)."
      confirmLabel="Ya, lepas PC"
      destructive
      done={`${name} dilepas`}
      onConfirm={() => resetMyDevice(id)}
    >
      <Unplug /> Lepas PC
    </ConfirmButton>
  );
}

export function ProfileForm({ name, phone }: { name: string | null; phone: string | null }) {
  const [state, action, pending] = useActionState(saveProfile, null);
  const [value, setValue] = useState(name ?? "");
  const [wa, setWa] = useState(phone ? `0${phone.slice(2)}` : "");
  return (
    <form action={action} className="grid max-w-xl gap-3">
      <label className={label}>
        Nama
        <Input name="name" value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} />
      </label>
      <label className={label}>
        Nomor WhatsApp
        <Input name="phone" value={wa} onChange={(e) => setWa(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={20} placeholder="0812xxxxxxx" />
        <span className="font-normal text-muted-foreground">Untuk pengingat sebelum lisensi habis. Boleh dikosongkan.</span>
      </label>
      <Note state={state} />
      <Button type="submit" disabled={pending} className="justify-self-start">{pending ? <Loader2 className="animate-spin" /> : <Check />} Simpan</Button>
    </form>
  );
}

/** Change the password; Google-only accounts set one here (then email login works too). */
export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState(changePassword, null);
  return (
    <form action={action} className="grid max-w-xl gap-3">
      {hasPassword && (
        <label className={label}>Password sekarang<Input name="current" type="password" required autoComplete="current-password" /></label>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Password baru<Input name="next" type="password" required minLength={8} maxLength={200} autoComplete="new-password" placeholder="Minimal 8 karakter" /></label>
        <label className={label}>Ulangi password baru<Input name="again" type="password" required minLength={8} maxLength={200} autoComplete="new-password" /></label>
      </div>
      <Note state={state} />
      <Button type="submit" variant="outline" disabled={pending} className="justify-self-start">
        {pending ? <Loader2 className="animate-spin" /> : <KeyRound />} {hasPassword ? "Ganti password" : "Buat password"}
      </Button>
    </form>
  );
}

/** Buy a plan or renew a license online: creates the order, then redirects to the WaroengPay QRIS page. */
export function BuyButton({ plan, renew, label: text, variant = "default" }: { plan: string; renew?: number; label: string; variant?: "default" | "outline" }) {
  const [state, action, pending] = useActionState(buyPlan, null);
  return (
    <form action={action} className="grid gap-1.5">
      <input type="hidden" name="plan" value={plan} />
      {renew && <input type="hidden" name="renew" value={renew} />}
      <Button type="submit" variant={variant} disabled={pending} className="justify-self-start whitespace-nowrap">
        {pending ? <Loader2 className="animate-spin" /> : <Wallet />} {text}
      </Button>
      <Note state={state} />
    </form>
  );
}
