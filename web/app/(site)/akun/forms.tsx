"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, KeyRound, Loader2, QrCode, ShieldCheck, ShieldOff, Unplug, Wallet } from "lucide-react";
import { buyPlan, changePassword, claimKey, disableTwoFa, enableTwoFa, resetMyDevice, saveProfile, startTwoFa, type FormResult, type TwoFaSetup } from "../actions";

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

export function ProfileForm({ name, phone }: { name: string | null; phone: string | null }) {
  const [state, action, pending] = useActionState(saveProfile, null);
  const [value, setValue] = useState(name ?? "");
  const [wa, setWa] = useState(phone ? `0${phone.slice(2)}` : "");
  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-2 text-[14px] font-medium">
        Nama
        <input name="name" value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} className={field} />
      </label>
      <label className="grid gap-2 text-[14px] font-medium">
        Nomor WhatsApp
        <input name="phone" value={wa} onChange={(e) => setWa(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={20} placeholder="0812xxxxxxx" className={field} />
        <span className="text-[12px] font-normal text-[var(--site-muted)]">Untuk pengingat sebelum lisensi habis. Boleh dikosongkan.</span>
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

const codeField = `${field} w-36 text-center font-mono text-[18px] tracking-[0.3em]`;
const CodeInput = () => <input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="123456" className={codeField} aria-label="Kode 6 angka" />;

/** Authenticator 2FA: scan a QR, confirm with a first code; turning it off needs a current code too. */
export function TwoFaForm({ on }: { on: boolean }) {
  const [setup, setSetup] = useState<TwoFaSetup | null>(null);
  const [loading, start] = useTransition();
  const [enState, enable, enPending] = useActionState(enableTwoFa, null);
  const [offState, disable, offPending] = useActionState(disableTwoFa, null);

  if (on)
    return (
      <form action={disable} className="grid gap-3">
        <p className="flex items-center gap-2 text-[14px] text-[var(--site-signal)]"><ShieldCheck className="size-4" /> Aktif: tiap masuk diminta kode dari aplikasi authenticator.</p>
        <div className="flex flex-wrap items-center gap-2">
          <CodeInput />
          <button type="submit" disabled={offPending} className="site-pill-outline site-sm disabled:opacity-60">
            {offPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldOff className="size-4" />} Matikan
          </button>
        </div>
        <Note state={offState} />
      </form>
    );

  if (!setup?.ok)
    return (
      <div className="grid gap-3">
        <p className="text-[13px] text-[var(--site-muted)]">Lindungi akun dengan kode dari Google Authenticator, Authy, atau 1Password. Wajib untuk akun admin.</p>
        {setup && !setup.ok && <p className="text-[14px] text-red-300" role="alert">{setup.message}</p>}
        <button type="button" disabled={loading} onClick={() => start(async () => setSetup(await startTwoFa()))} className="site-pill-outline site-sm justify-self-start disabled:opacity-60">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />} Pasang verifikasi 2 langkah
        </button>
      </div>
    );

  return (
    <form action={enable} className="grid gap-3">
      <p className="text-[13px] text-[var(--site-body)]">1. Scan QR ini di aplikasi authenticator.</p>
      {/* SVG made on our server from the otpauth URI (qrcode lib); no third-party QR service sees the secret */}
      <div className="size-44 rounded-xl bg-white p-2 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: setup.qr }} />
      <p className="text-[12px] text-[var(--site-muted)]">Tidak bisa scan? Masukkan kode ini manual: <span className="font-mono break-all text-[var(--site-body)] select-all">{setup.secret}</span></p>
      <p className="text-[13px] text-[var(--site-body)]">2. Masukkan kode 6 angka yang muncul.</p>
      <div className="flex flex-wrap items-center gap-2">
        <CodeInput />
        <button type="submit" disabled={enPending} className="site-pill site-sm disabled:opacity-60">
          {enPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Aktifkan
        </button>
      </div>
      <Note state={enState} />
    </form>
  );
}

/** Buy a plan or renew a license online: creates the order, then redirects to the WaroengPay QRIS page. */
export function BuyButton({ plan, renew, label, outline = false }: { plan: string; renew?: number; label: string; outline?: boolean }) {
  const [state, action, pending] = useActionState(buyPlan, null);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="plan" value={plan} />
      {renew && <input type="hidden" name="renew" value={renew} />}
      <button type="submit" disabled={pending} className={`${outline ? "site-pill-outline" : "site-pill"} site-sm justify-self-start disabled:opacity-60`}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />} {label}
      </button>
      <Note state={state} />
    </form>
  );
}
