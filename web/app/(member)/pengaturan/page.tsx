import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ChevronRight, KeyRound, LaptopMinimal, LogIn, Mail, UserRound } from "lucide-react";
import { asMember, requireMember, type MemberSession } from "@/lib/license-api";
import { PasswordForm, ProfileForm } from "@/app/(member)/_ui/forms";
import { PageTitle, Panel } from "@/app/(member)/_ui/ui";
import { SessionList } from "./sessions";
import { EmailNews } from "./email-news";

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

export default async function Settings() {
  const [v, sessions] = await Promise.all([
    requireMember(),
    asMember<{ sessions: MemberSession[] }>("/internal/member/sessions").then((r) => r.sessions, () => [] as MemberSession[]),
  ]);
  const u = v.user;
  return (
    <div className="grid gap-5">
      <PageTitle title="Pengaturan" sub="Profil, cara masuk, dan keamanan akun." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel id="profil" title="Profil" icon={UserRound}>
          <ProfileForm name={u.name} phone={u.phone} />
        </Panel>
        <Panel id="masuk" title="Cara masuk" icon={LogIn}>
          <ul className="-mt-2 mb-5 divide-y text-[0.8125rem]">
            <Method label="Email & password" on={u.hasPassword} detail={u.hasPassword ? u.email : "Belum dibuat"} />
            <Method label="Google" on={u.google} detail={u.google ? "Terhubung" : "Masuk dengan Google memakai email ini untuk menautkan"} />
          </ul>
          <p className="mb-3 flex items-center gap-2 text-[0.8125rem] font-semibold"><KeyRound className="size-4 text-brand-light" /> {u.hasPassword ? "Ganti password" : "Buat password"}</p>
          <PasswordForm hasPassword={u.hasPassword} />
        </Panel>
      </div>
      <Panel id="email" title="Email" icon={Mail} desc={`Dikirim ke ${u.email}`}>
        <EmailNews on={u.emailNews} />
      </Panel>
      <Panel id="sesi" title="Perangkat & sesi" icon={LaptopMinimal} desc="Browser yang sedang masuk ke akun ini. Ada yang tidak kamu kenal? Keluarkan, lalu ganti password.">
        <SessionList sessions={sessions} />
      </Panel>
      <Link href="/aktivitas" className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3.5 hover:bg-muted/40">
        <Activity className="size-4 text-brand-light" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Aktivitas akun</span>
          <span className="block text-xs text-muted-foreground">Riwayat masuk, aktivasi PC, pembayaran, dan perubahan keamanan.</span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>
    </div>
  );
}
