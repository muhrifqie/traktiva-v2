"use client";

import { LogOut, Monitor, Smartphone } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { fmtTime } from "@/lib/format";
import type { MemberSession } from "@/lib/license-api";
import { revokeSessions } from "@/app/(site)/actions";

/** "Chrome · Windows" from a user agent (good enough to recognise your own devices). */
function device(ua: string | null) {
  if (!ua) return { label: "Perangkat tidak dikenal", phone: false };
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return { label: os ? `${browser} · ${os}` : browser, phone: /iPhone|iPad|Android|Mobile/.test(ua) };
}

export function SessionList({ sessions }: { sessions: MemberSession[] }) {
  const others = sessions.filter((s) => !s.current).length;
  return (
    <div className="grid gap-4">
      <ul className="-my-1 divide-y ">
        {sessions.map((s) => {
          const d = device(s.ua);
          const Icon = d.phone ? Smartphone : Monitor;
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3.5">
              <Icon className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[0.8125rem] font-medium">
                  {d.label}
                  {s.current && <span className="rounded-full bg-status-ok/12 px-2 py-0.5 text-[0.6875rem] font-semibold text-status-ok">Perangkat ini</span>}
                </p>
                <p className="text-[0.8125rem] text-muted-foreground">
                  {s.ip && s.ip !== "?" ? `IP ${s.ip} · ` : ""}aktif {fmtTime(s.last_seen ?? s.created_at)}{s.created_at ? ` · masuk ${fmtTime(s.created_at)}` : ""}
                </p>
              </div>
              {!s.current && (
                <ConfirmButton
                  title={`Keluarkan ${d.label}?`}
                  description="Browser itu langsung keluar dari akun ini. Kalau bukan perangkatmu, ganti password juga."
                  confirmLabel="Keluarkan"
                  destructive
                  onConfirm={() => revokeSessions({ id: s.id })}
                >
                  <LogOut /> Keluarkan
                </ConfirmButton>
              )}
            </li>
          );
        })}
      </ul>
      {others > 0 && (
        <ConfirmButton
          title={`Keluar dari ${others} perangkat lain?`}
          description="Semua browser lain langsung keluar dari akun ini. Perangkat yang sedang kamu pakai tetap masuk."
          confirmLabel="Keluarkan semua"
          destructive
          onConfirm={() => revokeSessions({ all: true })}
          className="justify-self-start"
        >
          <LogOut /> Keluar dari {others} perangkat lain
        </ConfirmButton>
      )}
    </div>
  );
}
