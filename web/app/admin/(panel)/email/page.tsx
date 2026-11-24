import { CircleAlert, Clock, MailCheck, Send } from "lucide-react";
import { fmtTime } from "@/lib/format";
import { asAdmin } from "@/lib/license-api";
import { PageHead } from "../ui";
import { BroadcastForm, EmailSettingsForm, RetryButton, type Audiences, type EmailSettings } from "./forms";

type Status = {
  configured: boolean; from: string | null; settings: EmailSettings; sentToday: number; pending: number; failed: number; audiences: Audiences;
  recent: { id: number; to_email: string; kind: string; subject: string; created_at: number; sent_at: number | null; tries: number; error: string | null; batch: string | null }[];
};

const KIND: Record<string, string> = {
  "code:register": "Kode daftar", "code:reset": "Kode lupa password", welcome: "Selamat datang", payment: "Pembayaran", reminders: "Pengingat",
  security: "Keamanan", broadcast: "Broadcast", "broadcast-test": "Tes broadcast",
};

export default async function EmailPage() {
  const s = await asAdmin<Status>("/internal/email");
  const stats = [
    { icon: Send, label: "Terkirim hari ini", value: `${s.sentToday} / ${s.settings.dailyCap}` },
    { icon: Clock, label: "Antre", value: s.pending },
    { icon: CircleAlert, label: "Gagal", value: s.failed, warn: s.failed > 0 },
  ];
  return (
    <>
      <PageHead title="Email" sub={s.configured ? `Dikirim dari ${s.from}` : "SMTP belum diatur: isi data/smtp.json di server lisensi"}>
        <RetryButton failed={s.failed} />
      </PageHead>
      {!s.configured && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-[0.8125rem] text-amber-700 dark:text-amber-300">
          <CircleAlert className="size-4" /> Email tidak terkirim sampai SMTP diatur. Antrean tetap disimpan.
        </p>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {stats.map(({ icon: I, label, value, warn }) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><I className="size-3.5" /> {label}</p>
            <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${warn ? "text-amber-600 dark:text-amber-300" : ""}`}>{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <BroadcastForm audiences={s.audiences} cap={s.settings.dailyCap} />
        <EmailSettingsForm initial={s.settings} />
      </div>
      <section className="mt-4 rounded-xl border bg-card">
        <header className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold"><MailCheck className="size-4 text-brand-light" /> Kiriman terakhir</header>
        {s.recent.length ? (
          <div className="overflow-x-auto [scrollbar-width:none]">
            <table className="w-full text-[0.8125rem]">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium"><th>Penerima</th><th>Jenis</th><th>Subjek</th><th>Status</th><th>Dibuat</th></tr>
              </thead>
              <tbody className="divide-y [&>tr>td]:px-4 [&>tr>td]:py-2.5">
                {s.recent.map((m) => (
                  <tr key={m.id}>
                    <td className="max-w-48 truncate">{m.to_email}</td>
                    <td className="whitespace-nowrap text-muted-foreground">{KIND[m.kind] ?? m.kind}</td>
                    <td className="max-w-72 truncate">{m.subject}</td>
                    <td className="whitespace-nowrap">
                      {m.sent_at ? (
                        <span className="rounded-full bg-status-ok/12 px-2 py-0.5 text-[0.6875rem] font-semibold text-status-ok">Terkirim</span>
                      ) : m.tries >= 5 ? (
                        <span title={m.error ?? ""} className="rounded-full bg-destructive/12 px-2 py-0.5 text-[0.6875rem] font-semibold text-destructive">Gagal</span>
                      ) : (
                        <span title={m.error ?? ""} className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[0.6875rem] font-semibold text-amber-600 dark:text-amber-300">{m.tries ? `Coba lagi (${m.tries}×)` : "Antre"}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-muted-foreground">{fmtTime(m.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">Belum ada email.</p>
        )}
      </section>
    </>
  );
}
