"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, ChevronsUpDown, Clapperboard, HardDrive, Info, Loader2, LogIn, Monitor, Plus, Settings, Users } from "lucide-react";
import { toast } from "sonner";
import { selectAccount } from "@/app/(dashboard)/akun/actions";
import { GoogleIcon } from "@/components/brand-icons";
import { Logo } from "@/components/logo";
import { PlatformIcon } from "@/components/platform-icon";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PLATFORM } from "@/lib/platforms";

export type SocialAccount = {
  id: number;
  platform: keyof typeof PLATFORM;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: "active" | "disabled" | "need_login";
};

export type UserInfo = {
  email: string | null; // primary Google account (the app has no separate user login yet)
  googleAccounts: number;
  socialAccounts: number;
  social: { selected: SocialAccount | null; list: SocialAccount[] }; // the account the user works with (sidebar)
  videos: number;
  appVersion: string;
  platform: string;
  // ponytail: license is a placeholder until the license server (docs/license-design.md) exists
  license: { status: "dev" | "active" | "expired"; plan: string; expiresAt: string | null; daysLeft: number | null };
};

const LICENSE = {
  dev: { label: "Mode pengembangan", cls: "bg-[#4ea7fc1a] text-[#4ea7fc]" },
  active: { label: "Aktif", cls: "bg-status-ok/10 text-status-ok" },
  expired: { label: "Kedaluwarsa", cls: "bg-destructive/10 text-destructive" },
} as const;

const OS: Record<string, string> = { win32: "Windows", darwin: "macOS", linux: "Linux" };

/** Profile photo of a social account (initial as fallback), with its platform mark in the corner. */
function SocialAvatar({ account, size = "size-8" }: { account: SocialAccount; size?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={`relative ${size} shrink-0`}>
      {account.avatarUrl && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element -- platform CDN avatars
        <img src={account.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="size-full rounded-full border object-cover" />
      ) : (
        <span className="grid size-full place-items-center rounded-full bg-muted text-[13px] font-semibold uppercase">{(account.displayName || account.username)[0]}</span>
      )}
      <span className="absolute -right-0.5 -bottom-0.5 grid size-3.5 place-items-center rounded-full bg-sidebar ring-1 ring-sidebar">
        <PlatformIcon platform={account.platform} className="size-2.5" />
      </span>
    </span>
  );
}

const accountName = (a: SocialAccount) => a.displayName || `@${a.username}`;

function Avatar({ email, size = "size-8" }: { email: string | null; size?: string }) {
  return email ? (
    <span className={`grid ${size} shrink-0 place-items-center rounded-lg bg-primary text-[13px] font-semibold uppercase text-primary-foreground`}>
      {email[0]}
    </span>
  ) : (
    <Logo className={`${size} shrink-0`} />
  );
}

/** Bottom-left of the sidebar: who is using the app + license; opens a detail panel. */
export function UserCard({ info }: { info: UserInfo }) {
  const router = useRouter();
  const [switching, startSwitch] = useTransition();
  const lic = LICENSE[info.license.status];
  const name = info.email ? info.email.split("@")[0] : "Pengguna Traktiva";
  const { selected, list } = info.social;

  // no social account yet: the card is just the way to log one in
  if (!selected) {
    return (
      <Link href="/akun" className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring">
        <span className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed text-muted-foreground"><LogIn className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">Silakan login</span>
          <span className="block truncate text-[11px] text-muted-foreground">Hubungkan akun sosmed</span>
        </span>
      </Link>
    );
  }

  const pick = (id: number) =>
    startSwitch(async () => {
      try {
        await selectAccount(id);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal mengganti akun");
      }
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[popup-open]:bg-sidebar-accent group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
        aria-label="Akun sosmed yang dipakai"
      >
        <SocialAvatar account={selected} />
        <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
          <span className="block truncate text-[13px] font-medium">{accountName(selected)}</span>
          <span className={`block truncate text-[11px] ${selected.status === "need_login" ? "text-amber-500" : "text-muted-foreground"}`}>
            {selected.status === "need_login" ? "Perlu login ulang" : `${PLATFORM[selected.platform].label} · @${selected.username}`}
          </span>
        </span>
        {switching ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : <ChevronsUpDown className="size-3.5 text-muted-foreground group-data-[collapsible=icon]:hidden" />}
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-72 p-0">
        <div className="p-1">
          <p className="px-2 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground">Akun sosmed</p>
          {list.map((a) => (
            <DropdownMenuItem key={a.id} disabled={switching} onClick={() => a.id !== selected.id && pick(a.id)} className="gap-2.5">
              <SocialAvatar account={a} size="size-6" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{accountName(a)}</span>
                <span className={`block truncate text-[11px] ${a.status === "need_login" ? "text-amber-500" : "text-muted-foreground"}`}>
                  {a.status === "need_login" ? "Perlu login ulang" : `@${a.username}`}
                </span>
              </span>
              {a.id === selected.id && <Check className="size-4 text-brand-light" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem render={<Link href="/akun" />} className="gap-2.5 text-muted-foreground">
            <span className="grid size-6 place-items-center rounded-full border border-dashed"><Plus className="size-3.5" /></span> Tambah akun
          </DropdownMenuItem>
        </div>
        <DropdownMenuSeparator className="my-0" />
        <div className="flex items-center gap-3 p-3">
          <Avatar email={info.email} size="size-10" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              {info.email ? <><GoogleIcon className="size-3" />{info.email}</> : "Belum ada akun Google"}
            </p>
          </div>
        </div>

        <div className="mx-3 rounded-lg border bg-muted/40 p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium"><BadgeCheck className="size-3.5 text-brand-light" /> Lisensi</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${lic.cls}`}>{lic.label}</span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-y-1 text-[11px]">
            <dt className="text-muted-foreground">Paket</dt>
            <dd className="text-right font-medium">{info.license.plan}</dd>
            <dt className="text-muted-foreground">Berlaku sampai</dt>
            <dd className="text-right font-medium">{info.license.expiresAt ?? "—"}</dd>
            <dt className="text-muted-foreground">Sisa waktu</dt>
            <dd className="text-right font-medium">{info.license.daysLeft != null ? `${info.license.daysLeft} hari` : "—"}</dd>
          </dl>
          {info.license.status === "dev" && (
            <p className="mt-2 text-[10px] leading-snug text-muted-foreground">Sistem lisensi belum diaktifkan di versi ini.</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 p-3">
          {[
            { icon: <GoogleIcon className="size-3.5" />, n: info.googleAccounts, label: "Google" },
            { icon: <Users className="size-3.5 text-black dark:text-white" />, n: info.socialAccounts, label: "Sosial" },
            { icon: <Clapperboard className="size-3.5 text-black dark:text-white" />, n: info.videos, label: "Video" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border p-2 text-center">
              <div className="flex items-center justify-center gap-1">{s.icon}<span className="text-sm font-semibold tabular-nums">{s.n}</span></div>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        <DropdownMenuSeparator className="my-0" />
        <div className="p-1">
          <DropdownMenuItem render={<Link href="/pengaturan" />}><Settings className="size-4" /> Pengaturan AI</DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/akun" />}><Users className="size-4" /> Kelola akun sosial</DropdownMenuItem>
        </div>
        <DropdownMenuSeparator className="my-0" />
        <div className="flex items-center gap-3 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><Info className="size-3" /> v{info.appVersion}</span>
          <span className="flex items-center gap-1"><Monitor className="size-3" /> {OS[info.platform] ?? info.platform}</span>
          <span className="flex items-center gap-1"><HardDrive className="size-3" /> Data lokal</span>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
