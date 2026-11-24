"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers, Loader2 } from "lucide-react";
import { AccountAvatar } from "@/components/account-avatar";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ChannelOption = { id: number; name: string; handle: string; avatarUrl: string | null; status: string; synced: boolean };

/** Channel picker for Performa: "Semua channel" (side-by-side stats) or one channel; the choice lives in ?akun=. */
export function ChannelSelect({ channels, current }: { channels: ChannelOption[]; current: "all" | number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const value = String(current);
  const pick = (c: ChannelOption | undefined) =>
    c ? (
      <span className="flex min-w-0 items-center gap-2">
        <AccountAvatar a={{ ...c, username: c.handle, platform: "youtube" }} size="size-5" />
        <span className="truncate">{c.name}</span>
        {c.handle !== c.name && <span className="truncate text-xs text-muted-foreground">@{c.handle}</span>}
      </span>
    ) : (
      <span className="flex items-center gap-2">
        <span className="grid size-5 place-items-center rounded-full bg-muted"><Layers className="size-3" /></span>
        Semua channel <span className="text-xs text-muted-foreground">{channels.length}</span>
      </span>
    );

  return (
    <Select value={value} onValueChange={(v) => start(() => router.push(`/youtube-performa?akun=${v}`))}>
      <SelectTrigger aria-label="Pilih channel" className="h-9 min-w-56 max-w-80 bg-card">
        {pending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        <SelectValue>{(v: string) => pick(channels.find((c) => String(c.id) === v))}</SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-80">
        {channels.length > 1 && (
          <>
            <SelectItem value="all">{pick(undefined)}</SelectItem>
            <SelectSeparator />
          </>
        )}
        <SelectGroup>
          <SelectLabel>Channel</SelectLabel>
          {channels.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {pick(c)}
              {c.status !== "active" ? <span className="text-[10px] text-destructive">perlu login</span> : !c.synced && <span className="text-[10px] text-muted-foreground">belum sinkron</span>}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
