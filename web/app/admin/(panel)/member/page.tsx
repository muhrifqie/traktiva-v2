import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { fmtDate, fmtTime } from "@/lib/format";
import { asAdmin, requireAdmin } from "@/lib/license-api";
import { PageHead } from "../ui";
import { CreateMember, MemberRowActions } from "./forms";

type Member = {
  id: number; email: string; name: string | null; phone: string | null; is_admin: number; created_at: number; last_login: number | null;
  has_password: number; google: number; licenses: number;
};

export default async function Members({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const [{ members }, me] = await Promise.all([
    asAdmin<{ members: Member[] }>(`/internal/members?${new URLSearchParams({ q })}`),
    requireAdmin(),
  ]);
  return (
    <>
      <PageHead title="Member" sub={`${members.length}${members.length === 300 ? "+" : ""} akun`}>
        <CreateMember />
      </PageHead>
      <form className="relative mb-3 w-full max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={q} placeholder="Cari email atau nama" className="pl-8" />
      </form>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-[0.8125rem]">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium">
              <th>Akun</th><th>Masuk lewat</th><th>Lisensi</th><th>Daftar</th><th>Login terakhir</th><th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.map((m) => (
              <tr key={m.id} className="hover:bg-muted/40 [&>td]:px-4 [&>td]:py-2.5">
                <td className="max-w-72">
                  <p className="truncate font-semibold">
                    {m.email}
                    {!!m.is_admin && <span className="ml-2 rounded-full bg-amber-300/12 px-1.5 py-px text-[0.625rem] font-semibold text-amber-200">Admin</span>}
                  </p>
                  <p className="truncate text-[0.6875rem] text-muted-foreground">{[m.name, m.phone && `WA ${m.phone}`].filter(Boolean).join(" · ") || "—"}</p>
                </td>
                <td className="text-muted-foreground">{[m.has_password && "Email", m.google && "Google"].filter(Boolean).join(" + ") || "Belum atur password"}</td>
                <td className="tabular-nums">{m.licenses}</td>
                <td className="whitespace-nowrap">{fmtDate(m.created_at)}</td>
                <td className="whitespace-nowrap text-muted-foreground">{fmtTime(m.last_login)}</td>
                <td className="text-right"><MemberRowActions id={m.id} email={m.email} admin={!!m.is_admin} self={me.kind === "member" && me.name === m.email} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!members.length && <p className="py-10 text-center text-sm text-muted-foreground">{q ? "Tidak ada yang cocok." : "Belum ada member."}</p>}
      </div>
    </>
  );
}
