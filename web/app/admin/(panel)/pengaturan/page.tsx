import { fmtTime } from "@/lib/format";
import { asAdmin, type Plan, type Site } from "@/lib/license-api";
import { HwidForm, RemoteForm, SiteForm } from "./app-forms";
import { PageHead } from "../ui";
import { PasswordForm } from "./password-form";
import { PlansForm } from "./plans-form";

type Settings = { plans: Plan[]; site: Site; remote: Record<string, string | number | boolean>; hwid: { tolerance: number }; admins: { name: string; created_at: number; last_login: number | null }[] };

export default async function SettingsPage() {
  const { plans, site, remote, hwid, admins } = await asAdmin<Settings>("/internal/settings");
  return (
    <>
      <PageHead title="Pengaturan" />
      <div className="grid gap-4">
        <PlansForm plans={plans} />
        <SiteForm whatsapp={site.whatsapp ?? ""} />
        <HwidForm tolerance={hwid.tolerance} />
        <RemoteForm remote={remote} />
        <PasswordForm />
        <section className="rounded-xl border bg-card">
          <header className="border-b px-4 py-3">
            <p className="text-sm font-semibold">Admin</p>
            <p className="text-xs text-muted-foreground">Tambah admin / reset password lupa lewat SSH: <code className="font-mono">node admin.mjs add-admin &lt;nama&gt;</code></p>
          </header>
          <ul className="divide-y text-[13px]">
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
