"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Copy, Eye, EyeOff, KeyRound, Link2, Loader2, QrCode, RotateCcw, ShieldCheck, ShieldOff, Unplug, Wallet } from "lucide-react";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  resetHwid,
  buyPlan, changePassword, claimKey, disableTwoFa, enableTwoFa, resetMyDevice, saveProfile, startTwoFa, type FormResult, type TwoFaSetup,
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

/** Free this PC's slot (two-step confirm; the server enforces the 7-day cooldown). */
/** Reset HWID of a license (all its PCs released), with a confirm modal; disabled while the daily allowance is used. */
export function ResetHwidButton({ licenseId, pcs, waitText }: { licenseId: number; pcs: number; waitText: string | null }) {
  if (waitText) return <span className="text-xs font-medium text-muted-foreground">Reset HWID lagi dalam {waitText}</span>;
  if (!pcs) return <span className="text-xs font-medium text-muted-foreground">Belum terkunci ke PC</span>;
  return (
    <ConfirmButton
      title="Reset HWID lisensi ini?"
      description={`${pcs} PC yang memakai key ini dilepas dan app di sana langsung terkunci. Setelah itu tempel key di PC baru. Bisa 1× per hari per lisensi.`}
      confirmLabel="Ya, reset HWID"
      destructive
      onConfirm={() => resetHwid(licenseId)}
    >
      <RotateCcw /> Reset HWID
    </ConfirmButton>
  );
}

export function ReleaseDevice({ id, name, allowed }: { id: string; name: string; allowed: boolean }) {
  if (!allowed) return null;
  return (
    <ConfirmButton
      title={`Lepas ${name}?`}
      description="App Traktiva di PC itu langsung terkunci dan slotnya kosong lagi, jadi key bisa diaktifkan di PC lain. Bisa 1× per hari per lisensi (sama dengan Reset HWID)."
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

const CodeInput = () => (
  <Input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="123456" aria-label="Kode 6 angka" className="w-32 text-center font-mono tracking-[0.3em]" />
);

/** Authenticator 2FA: scan a QR, confirm with a first code; turning it off needs a current code too. */
export function TwoFaForm({ on }: { on: boolean }) {
  const [setup, setSetup] = useState<TwoFaSetup | null>(null);
  const [loading, start] = useTransition();
  const [enState, enable, enPending] = useActionState(enableTwoFa, null);
  const [offState, disable, offPending] = useActionState(disableTwoFa, null);

  if (on)
    return (
      <form action={disable} className="grid gap-3">
        <p className="flex items-center gap-2 text-[0.8125rem] text-status-ok"><ShieldCheck className="size-4" /> Aktif: tiap masuk diminta kode dari aplikasi authenticator.</p>
        <div className="flex flex-wrap items-center gap-2">
          <CodeInput />
          <Button type="submit" variant="outline" disabled={offPending}>{offPending ? <Loader2 className="animate-spin" /> : <ShieldOff />} Matikan</Button>
        </div>
        <Note state={offState} />
      </form>
    );

  if (!setup?.ok)
    return (
      <div className="grid gap-3">
        {setup && !setup.ok && <p className="text-[0.8125rem] text-destructive" role="alert">{setup.message}</p>}
        <Button type="button" variant="outline" disabled={loading} onClick={() => start(async () => setSetup(await startTwoFa()))} className="justify-self-start">
          {loading ? <Loader2 className="animate-spin" /> : <QrCode />} Pasang verifikasi 2 langkah
        </Button>
      </div>
    );

  return (
    <form action={enable} className="grid gap-4 sm:grid-cols-[auto_1fr]">
      {/* SVG made on our server from the otpauth URI (qrcode lib); no third-party QR service sees the secret */}
      <div className="size-40 rounded-lg border bg-white p-2 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: setup.qr }} />
      <div className="grid content-start gap-3 text-[0.8125rem]">
        <p>1. Scan QR ini di Google Authenticator, Authy, atau 1Password.</p>
        <p className="text-xs text-muted-foreground">Tidak bisa scan? Masukkan kode ini: <span className="font-mono break-all text-foreground select-all">{setup.secret}</span></p>
        <p>2. Masukkan kode 6 angka yang muncul.</p>
        <div className="flex flex-wrap items-center gap-2">
          <CodeInput />
          <Button type="submit" disabled={enPending}>{enPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Aktifkan</Button>
        </div>
        <Note state={enState} />
      </div>
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
