import type { Metadata } from "next";
import { KeyRound, LaptopMinimal, LogIn, ShieldCheck, UserRound } from "lucide-react";
import { asMember, requireMember, type MemberSession } from "@/lib/license-api";
import { PasswordForm, ProfileForm, TwoFaForm } from "@/app/(member)/_ui/forms";
import { Notice, PageTitle, Panel } from "@/app/(member)/_ui/ui";
import { SessionList } from "./sessions";

export const metadata: Metadata = { title: "Pengaturan" };

function Method({ label, on, detail }: { label: string; on: boolean; detail: string }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span className={`size-2 rounded-full ${on ? "bg-status-ok" : "bg-muted-foreground/30"}`} />
      <span className="font-medium">{label}</span>
      <span className="ml-auto text-[0.8125rem] text-muted-foreground">{detail}</span>
    </li>
  );
}

export default async function Settings({ searchParams }: { searchParams: Promise<{ perlu2fa?: string }> }) {
  const [v, q, sessions] = await Promise.all([
    requireMember(),
    searchParams,
    asMember<{ sessions: MemberSession[] }>("/internal/member/sessions").then((r) => r.sessions, () => [] as MemberSession[]),
  ]);
  const u = v.user;
  return (
    <div className="grid gap-5">
      <PageTitle title="Pengaturan" sub="Profil, cara masuk, dan keamanan akun." />
      {(q.perlu2fa || (u.isAdmin && !u.totp)) && (
        <Notice tone="warn" icon={ShieldCheck}>Panel admin butuh verifikasi 2 langkah. Pasang di kartu Verifikasi 2 langkah, lalu buka Panel admin lagi.</Notice>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel id="profil" title="Profil" icon={UserRound}>
          <ProfileForm name={u.name} phone={u.phone} />
        </Panel>
        <Panel id="keamanan" title="Verifikasi 2 langkah" icon={ShieldCheck} desc={u.totp ? undefined : "Kode 6 angka dari aplikasi authenticator setiap kali masuk. Wajib untuk admin."}>
          <TwoFaForm on={u.totp} />
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel id="masuk" title="Cara masuk" icon={LogIn}>
          <ul className="-mt-2 mb-5 divide-y text-[0.8125rem]">
            <Method label="Email & password" on={u.hasPassword} detail={u.hasPassword ? u.email : "Belum dibuat"} />
            <Method label="Google" on={u.google} detail={u.google ? "Terhubung" : "Masuk dengan Google memakai email ini untuk menautkan"} />
          </ul>
          <p className="mb-3 flex items-center gap-2 text-[0.8125rem] font-semibold"><KeyRound className="size-4 text-leaf-ink" /> {u.hasPassword ? "Ganti password" : "Buat password"}</p>
          <PasswordForm hasPassword={u.hasPassword} />
        </Panel>
        <Panel id="sesi" title="Perangkat & sesi" icon={LaptopMinimal} desc="Browser yang sedang masuk ke akun ini. Ada yang tidak kamu kenal? Keluarkan, lalu ganti password.">
          <SessionList sessions={sessions} />
        </Panel>
      </div>
    </div>
  );
}
