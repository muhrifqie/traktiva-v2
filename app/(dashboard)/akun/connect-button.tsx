"use client";

import { Loader2, Plus } from "lucide-react";
import { PLATFORM } from "@/lib/platforms";
import { useConnect } from "./tiktok-connect";

/** "Hubungkan …" button for one platform (YouTube, Instagram, Facebook pages). */
export function ConnectButton({ platform, label }: { platform: "youtube" | "instagram" | "facebook"; label?: string }) {
  const { busy, connect } = useConnect();
  return (
    <button
      type="button"
      onClick={() => connect(platform)}
      disabled={!!busy}
      className="flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground shadow-xs hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
      {busy ? "Menunggu login..." : label ?? `Hubungkan ${PLATFORM[platform].label}`}
    </button>
  );
}
