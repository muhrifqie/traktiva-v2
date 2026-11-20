import Link from "next/link";
import { Activity, CalendarClock, KeyRound, Megaphone, Monitor, Rocket, TriangleAlert } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { asAdmin, type AuditEvent, type Plan } from "@/lib/license-api";
import { CreateKeyButton } from "./create-key";
import { EventList, PageHead } from "./ui";

type Summary = {
  active: number; expiringSoon: number; expired: number; inactive: number; online: number;
  activationsToday: number; failedToday: number; byPlan: { plan: string; n: number }[]; recent: AuditEvent[]; plans: Plan[];
  versions: { version: string; n: number }[];
  latest: { version: string; mandatory: number; created_at: number } | null;
  expiring: { id: number; key_hint: string; note: string | null; plan: string; expires_at: number }[];
  liveAnnouncements: { id: number; title: string; level: string }[];
};

const LEVEL_DOT: Record<string, string> = { info: "bg-[#4ea7fc]", warn: "bg-amber-300", critical: "bg-destructive" };

function Panel({ title, href, link, children }: { title: string; href?: string; link?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center border-b px-4 py-3 text-sm font-semibold">
        {title}
        {href && <Link href={href} className="ml-auto text-xs font-normal text-muted-foreground hover:text-foreground">{link}</Link>}
      </header>
      {children}
    </section>
  );
}

export default async function Overview() {
  const s = await asAdmin<Summary>("/internal/summary");
  const planName = (id: string) => s.plans.find((p) => p.id === id)?.label ?? id;
  const fieldTotal = s.versions.reduce((a, v) => a + v.n, 0);
  const onLatest = s.latest ? (s.versions.find((v) => v.version === s.latest!.version)?.n ?? 0) : 0;
  const stats = [
    { icon: KeyRound, k: "Lisensi aktif", v: s.active, sub: s.byPlan.length ? s.byPlan.map((p) => `${planName(p.plan)} ${p.n}`).join(" · ") : "Belum ada", href: "/admin/lisensi?status=active" },
    { icon: Monitor, k: "Perangkat online", v: s.online, sub: "heartbeat 10 menit terakhir", href: "/admin/lisensi" },
    { icon: Activity, k: "Aktivasi 24 jam", v: s.activationsToday, sub: s.failedToday ? `${s.failedToday} percobaan gagal` : "tanpa percobaan gagal", href: "/admin/log" },
    { icon: TriangleAlert, k: "Perlu perhatian", v: s.expiringSoon + s.expired, sub: `${s.expiringSoon} habis ≤ 7 hari · ${s.expired} sudah habis`, href: "/admin/lisensi?status=expired", warn: s.expiringSoon + s.expired > 0 },
  ];

  return (
    <>
      <PageHead title="Ringkasan" sub="Pusat informasi Traktiva: lisensi, app di lapangan, pengumuman">
        <CreateKeyButton plans={s.plans} />
      </PageHead>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ icon: Icon, k, v, sub, href, warn }) => (
          <Link key={k} href={href} className={`group rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 ${warn ? "border-amber-300/30" : ""}`}>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className={`size-3.5 ${warn ? "text-amber-300" : ""}`} />{k}</p>
            <p className="mt-1.5 text-3xl font-semibold tabular-nums">{v}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
          </Link>
        ))}
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        {/* app versions in the field */}
        <Panel title="Versi app di lapangan" href="/admin/rilis" link="Rilis">
          <div className="p-4">
            <div className="flex items-baseline gap-2">
              <Rocket className="size-4 self-center text-brand-light" />
              <p className="text-sm">{s.latest ? <>Terbaru <b className="font-mono">v{s.latest.version}</b>{s.latest.mandatory ? " · wajib" : ""}</> : "Belum ada rilis"}</p>
              {s.latest && fieldTotal > 0 && <p className="ml-auto text-xs text-muted-foreground">{Math.round((onLatest / fieldTotal) * 100)}% sudah update</p>}
            </div>
            {s.versions.length ? (
              <ul className="mt-3 grid gap-2">
                {s.versions.map((v) => (
                  <li key={v.version} className="grid grid-cols-[64px_1fr_28px] items-center gap-2 text-xs">
                    <span className="font-mono">v{v.version}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <span className={`block h-full rounded-full ${v.version === s.latest?.version ? "bg-status-ok" : "bg-muted-foreground/60"}`} style={{ width: `${(v.n / fieldTotal) * 100}%` }} />
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">{v.n}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">Belum ada PC aktif 7 hari terakhir.</p>
            )}
          </div>
        </Panel>

        {/* expiring soon */}
        <Panel title="Habis ≤ 7 hari" href="/admin/lisensi?status=active" link="Semua lisensi">
          {s.expiring.length ? (
            <ul className="divide-y">
              {s.expiring.map((l) => (
                <li key={l.id}>
                  <Link href={`/admin/lisensi/${l.id}`} className="flex items-center gap-2 px-4 py-2.5 text-[13px] hover:bg-muted/40">
                    <CalendarClock className="size-3.5 text-amber-300" />
                    <span className="font-mono">…{l.key_hint}</span>
                    <span className="truncate text-muted-foreground">{l.note ?? planName(l.plan)}</span>
                    <span className="ml-auto text-xs whitespace-nowrap">{fmtDate(l.expires_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">Tidak ada yang segera habis.</p>
          )}
        </Panel>

        {/* live announcements */}
        <Panel title="Pengumuman tayang" href="/admin/pengumuman" link="Kelola">
          {s.liveAnnouncements.length ? (
            <ul className="divide-y">
              {s.liveAnnouncements.map((a) => (
                <li key={a.id} className="flex items-center gap-2.5 px-4 py-2.5 text-[13px]">
                  <span className={`size-2 shrink-0 rounded-full ${LEVEL_DOT[a.level] ?? "bg-muted-foreground"}`} />
                  <span className="truncate">{a.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Link href="/admin/pengumuman" className="flex items-center justify-center gap-2 px-4 py-6 text-xs text-muted-foreground hover:text-foreground">
              <Megaphone className="size-3.5" /> Tidak ada. Buat pengumuman
            </Link>
          )}
        </Panel>
      </div>

      <Panel title="Aktivitas terbaru" href="/admin/log" link="Lihat semua">
        <div className="px-4">
          <EventList events={s.recent} />
        </div>
      </Panel>
    </>
  );
}
