"use client";

import { useState, useTransition } from "react";
import { FlaskConical, Loader2, RotateCcw, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/confirm-button";
import { retryEmails, saveEmailSettings, sendBroadcast } from "../../actions";

export type EmailSettings = { welcome: boolean; payment: boolean; reminders: boolean; dailyCap: number };
export type Audiences = Record<"all" | "active" | "expiring" | "none", number>;

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}>
      <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

const AUTO: { key: keyof Omit<EmailSettings, "dailyCap">; title: string; text: string }[] = [
  { key: "welcome", title: "Selamat datang", text: "Setelah daftar (email atau Google): 3 langkah mulai pakai." },
  { key: "payment", title: "Pembayaran diterima", text: "Struk QRIS: paket, nominal, key …1234, masa aktif." },
  { key: "reminders", title: "Pengingat lisensi", text: "7 hari & 1 hari sebelum habis, dan saat sudah habis." },
];

/** Automatic mails on/off + the daily cap. Codes and security notices are always sent. */
export function EmailSettingsForm({ initial }: { initial: EmailSettings }) {
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const save = (next: EmailSettings) =>
    start(async () => {
      const r = await saveEmailSettings(next);
      if (r.ok) toast.success("Setelan email disimpan");
      else toast.error(r.message);
    });
  return (
    <section className="rounded-xl border bg-card">
      <header className="border-b px-4 py-3">
        <p className="text-sm font-semibold">Email otomatis</p>
        <p className="text-xs text-muted-foreground">Kode daftar, kode lupa password, dan peringatan keamanan selalu dikirim.</p>
      </header>
      <ul className="divide-y">
        {AUTO.map(({ key, title, text }) => (
          <li key={key} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[0.8125rem] font-medium">{title}</p>
              <p className="text-xs text-muted-foreground">{text}</p>
            </div>
            <Toggle on={v[key]} label={title} onChange={(on) => { const next = { ...v, [key]: on }; setV(next); save(next); }} />
          </li>
        ))}
        <li className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[0.8125rem] font-medium">Batas kirim per hari</p>
            <p className="text-xs text-muted-foreground">Gmail gratis ±500/hari. Sisanya menunggu besok (00.00 WIB).</p>
          </div>
          <Input type="number" min={10} max={2000} value={v.dailyCap} onChange={(e) => setV({ ...v, dailyCap: Number(e.target.value) })} className="w-24" aria-label="Batas kirim per hari" />
          <Button size="sm" variant="outline" disabled={pending} onClick={() => save(v)}>{pending ? <Loader2 className="animate-spin" /> : <Save />} Simpan</Button>
        </li>
      </ul>
    </section>
  );
}

const AUDIENCE_LABEL: Record<keyof Audiences, string> = { all: "Semua member", active: "Punya lisensi aktif", expiring: "Lisensi habis ≤ 7 hari", none: "Belum punya lisensi" };

/** Write once, send a test to yourself, then queue it for an audience. */
export function BroadcastForm({ audiences, cap }: { audiences: Audiences; cap: number }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<keyof Audiences>("all");
  const [ctaUrl, setCtaUrl] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [pending, start] = useTransition();
  const count = audiences[audience];
  const days = Math.ceil(count / cap);
  const test = () =>
    start(async () => {
      const r = await sendBroadcast({ subject, message, audience, ctaUrl, ctaLabel, test: true });
      if (r.ok) toast.success(`Email tes terkirim ke ${r.to}`);
      else toast.error(r.message);
    });
  const send = async () => {
    const r = await sendBroadcast({ subject, message, audience, ctaUrl, ctaLabel, test: false });
    if (!r.ok) return r;
    setSubject(""); setMessage(""); setCtaUrl(""); setCtaLabel("");
    return { ok: true, message: `${r.queued} email masuk antrean` };
  };
  return (
    <section className="rounded-xl border bg-card">
      <header className="border-b px-4 py-3">
        <p className="text-sm font-semibold">Broadcast email</p>
        <p className="text-xs text-muted-foreground">Info fitur, promo, atau pemberitahuan. Ada link berhenti berlangganan di setiap email.</p>
      </header>
      <div className="grid gap-3 p-4">
        <label className="grid gap-1.5 text-xs font-medium">
          Penerima
          <select value={audience} onChange={(e) => setAudience(e.target.value as keyof Audiences)} className="h-9 rounded-lg border bg-background px-2.5 text-[0.8125rem]">
            {(Object.keys(AUDIENCE_LABEL) as (keyof Audiences)[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]} ({audiences[a]})</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium">Subjek<Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="Contoh: Fitur baru: jadwal upload ke banyak akun" /></label>
        <label className="grid gap-1.5 text-xs font-medium">
          Pesan
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={5000} rows={7} placeholder={"Tulis seperti chat biasa.\n\nBaris kosong = paragraf baru. Sapaan \"Halo <nama>\" dan salam penutup ditambahkan otomatis."} className="rounded-lg border bg-background px-3 py-2 text-[0.8125rem] leading-relaxed outline-none focus:border-ring" />
        </label>
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <label className="grid gap-1.5 text-xs font-medium">Link tombol (opsional)<Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://traktiva.site/fitur" /></label>
          <label className="grid gap-1.5 text-xs font-medium">Teks tombol<Input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} maxLength={40} placeholder="Lihat selengkapnya" /></label>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="outline" disabled={pending} onClick={test}>{pending ? <Loader2 className="animate-spin" /> : <FlaskConical />} Kirim tes ke saya</Button>
          {count > 0 && subject.trim().length >= 3 && message.trim().length >= 10 ? (
            <ConfirmButton
              variant="default"
              size="default"
              title={`Kirim ke ${count} member?`}
              description={`Penerima: ${AUDIENCE_LABEL[audience]}. Email masuk antrean dan terkirim bertahap${days > 1 ? `, sekitar ${days} hari karena batas ${cap}/hari` : ""}. Member yang berhenti berlangganan tidak ikut.`}
              confirmLabel="Ya, kirim"
              onConfirm={send}
            >
              <Send /> Kirim ke {count} member
            </ConfirmButton>
          ) : (
            <Button disabled><Send /> Kirim ke {count} member</Button>
          )}
        </div>
      </div>
    </section>
  );
}

export function RetryButton({ failed }: { failed: number }) {
  const [pending, start] = useTransition();
  if (!failed) return null;
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => {
      const r = await retryEmails();
      if (r.ok) toast.success(`${r.retried} email dicoba lagi`);
      else toast.error(r.message);
    })}>
      {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Coba lagi {failed} yang gagal
    </Button>
  );
}
