"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, Loader2, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { PlatformIcon } from "@/components/platform-icon";
import type { SocialAccount } from "@/components/user-card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { selectAccount } from "@/app/(dashboard)/akun/actions";
import { accountColor } from "@/lib/account-color";


const STATUS: Record<SocialAccount["status"], { dot: string; label: string }> = {
  active: { dot: "bg-status-ok", label: "Login" },
  need_login: { dot: "bg-destructive", label: "Perlu login" },
  disabled: { dot: "bg-muted-foreground", label: "Nonaktif" },
};

/** Avatar (or initial) ringed in the account's color, with its platform mark and login status. */
export function AccountAvatar({ a, size = "size-8", badge = true }: { a: Pick<SocialAccount, "id" | "username" | "avatarUrl" | "platform" | "status">; size?: string; badge?: boolean }) {
  const color = accountColor(a.id);
  return (
    <span className={`relative ${size} shrink-0`}>
      {a.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote avatar
        <img src={a.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-full rounded-full object-cover ring-2" style={{ ["--tw-ring-color" as string]: color }} />
      ) : (
        <span className="grid size-full place-items-center rounded-full text-[12px] font-semibold uppercase text-white" style={{ background: color }}>{a.username[0]}</span>
      )}
      {badge && (
        <>
          <span className="absolute -right-0.5 -bottom-0.5 grid size-3.5 place-items-center rounded-full bg-sidebar ring-1 ring-sidebar"><PlatformIcon platform={a.platform} className="size-2.5" /></span>
          <span className={`absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-sidebar ${STATUS[a.status].dot}`} />
        </>
      )}
    </span>
  );
}

/**
 * The account the app works with right now: Etalase, Performa akun and Jadwal all follow this choice
 * (settings.activeAccountId), so there is one place to switch instead of a picker per page.
 */
export function AccountSwitcher({ selected, list, rail }: { selected: SocialAccount | null; list: SocialAccount[]; rail: boolean }) {
  const [busy, start] = useTransition();
  if (!selected)
    return (
      <Link href="/akun" title={rail ? "Hubungkan akun" : undefined} className={`flex h-9 items-center gap-2 rounded-lg border border-dashed text-[13px] text-muted-foreground hover:bg-sidebar-accent hover:text-foreground ${rail ? "w-9 justify-center" : "px-2.5"}`}>
        <Plus className="size-4" /> {!rail && "Hubungkan akun"}
      </Link>
    );

  const pick = (id: number) =>
    id !== selected.id &&
    start(async () => {
      try {
        await selectAccount(id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal ganti akun");
      }
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`flex items-center gap-2.5 rounded-lg border bg-sidebar-accent/40 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[popup-open]:bg-sidebar-accent ${rail ? "size-9 justify-center border-transparent bg-transparent" : "w-full p-1.5 pl-2"}`}
        title={rail ? `Akun aktif: @${selected.username}` : undefined}
        aria-label={`Akun aktif @${selected.username}, ganti akun`}
      >
        <AccountAvatar a={selected} size={rail ? "size-7" : "size-8"} />
        {!rail && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">@{selected.username}</span>
              <span className="block truncate text-[11px] text-muted-foreground">Akun aktif · {STATUS[selected.status].label}</span>
            </span>
            {busy ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : <ChevronsUpDown className="size-3.5 text-muted-foreground" />}
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={rail ? "right" : "bottom"} align="start" sideOffset={6} className="w-64">
        <DropdownMenuGroup>
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Kerja pakai akun</DropdownMenuLabel>
        {list.map((a) => (
          <DropdownMenuItem key={a.id} onClick={() => pick(a.id)} className="gap-2.5 py-1.5">
            <AccountAvatar a={a} size="size-7" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px]">@{a.username}</span>
              <span className={`block text-[11px] ${a.status === "active" ? "text-muted-foreground" : "text-destructive"}`}>{STATUS[a.status].label}</span>
            </span>
            {a.id === selected.id && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/akun" />} className="gap-2.5"><Users className="size-4" /> Kelola akun sosial</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
