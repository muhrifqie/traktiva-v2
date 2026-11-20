"use client";

import { useState, useTransition } from "react";
import { Loader2, LogOut, Monitor, Smartphone } from "lucide-react";
import { fmtTime } from "@/lib/format";
import type { MemberSession } from "@/lib/license-api";
import { revokeSessions } from "../../actions";

/** "Chrome · Windows" from a user agent (good enough to recognise your own devices). */
function device(ua: string | null) {
  if (!ua) return { label: "Perangkat tidak dikenal", phone: false };
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return { label: os ? `${browser} · ${os}` : browser, phone: /iPhone|iPad|Android|Mobile/.test(ua) };
}

export function SessionList({ sessions }: { sessions: MemberSession[] }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (target: number | "all") => {
    setBusy(target);
    start(async () => {
      const r = await revokeSessions(target === "all" ? { all: true } : { id: target });
      setNote(r ? { ok: r.ok, text: r.message ?? "" } : null);
      setBusy(null);
    });
  };
  const others = sessions.filter((s) => !s.current).length;
  return (
    <div className="grid gap-4">
      <ul className="-my-1 divide-y divide-white/8">
        {sessions.map((s) => {
          const d = device(s.ua);
          const Icon = d.phone ? Smartphone : Monitor;
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3.5">
              <Icon className="size-5 shrink-0 text-[var(--site-body)]" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
                  {d.label}
                  {s.current && <span className="rounded-full bg-[var(--site-signal)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--site-signal)]">Perangkat ini</span>}
                </p>
                <p className="text-[13px] text-[var(--site-muted)]">
                  {s.ip && s.ip !== "?" ? `IP ${s.ip} · ` : ""}aktif {fmtTime(s.last_seen ?? s.created_at)}{s.created_at ? ` · masuk ${fmtTime(s.created_at)}` : ""}
                </p>
              </div>
              {!s.current && (
                <button type="button" onClick={() => run(s.id)} disabled={pending} className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-[13px] hover:border-white/50 disabled:opacity-50">
                  {busy === s.id ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />} Keluarkan
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {note && <p className={`text-[14px] ${note.ok ? "text-[var(--site-signal)]" : "text-red-300"}`} role="status">{note.text}</p>}
      {others > 0 && (
        <button type="button" onClick={() => run("all")} disabled={pending} className="site-pill-outline site-sm justify-self-start disabled:opacity-60">
          {busy === "all" ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />} Keluar dari {others} perangkat lain
        </button>
      )}
    </div>
  );
}
