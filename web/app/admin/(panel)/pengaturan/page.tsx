import { fmtTime } from "@/lib/format";
import { asAdmin, requireAdmin, type Plan, type Site } from "@/lib/license-api";
import { HwidForm, PaymentsForm, RemindersForm, RemoteForm, SecurityForm, SiteForm } from "./app-forms";
import { PageHead } from "../ui";
import { PasswordForm } from "./password-form";
import { PlansForm } from "./plans-form";

type Settings = { plans: Plan[]; site: Site; remote: Record<string, string | number | boolean>; hwid: { tolerance: number };
  security: { requireAdmin2fa: boolean }; reminders: { enabled: boolean; webhook: string }; payments: { enabled: boolean; configured: boolean; testMode: boolean };
  admins: { name: string; created_at: number; last_login: number | null }[] };

export default async function SettingsPage() {
  const { plans, site, remote, hwid, admins, security, reminders, payments } = await asAdmin<Settings>("/internal/settings");
  return (
    <>
      <PageHead title="Pengaturan" />
      <div className="grid gap-4">
        <PlansForm plans={plans} />
        <SiteForm whatsapp={site.whatsapp ?? ""} />
        <PaymentsForm {...payments} />
        <HwidForm tolerance={hwid.tolerance} />
        <SecurityForm on={security.requireAdmin2fa} />
        <RemindersForm {...reminders} />
        <RemoteForm remote={remote} />
        {(await requireAdmin()).kind === "admin" && <PasswordForm />}
        <section className="rounded-xl border bg-card">
          <header className="border-b px-4 py-3">
            <p className="text-sm font-semibold">Admin lama (token)</p>
            <p className="text-xs text-muted-foreground">Admin baru cukup dibuat di menu Member (centang Admin). Akun token lama tetap bisa masuk.</p>
          </header>
          <ul className="divide-y text-[0.8125rem]">
            {admins.map((a) => (
              <li key={a.name} className="flex justify-between px-4 py-2.5">
                <span className="font-semibold">{a.name}</span>
                <span className="text-muted-foreground">Login terakhir {fmtTime(a.last_login)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
