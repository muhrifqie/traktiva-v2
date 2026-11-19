"use client";

import { useState, useSyncExternalStore } from "react";
import { Download, Info, Megaphone, TriangleAlert, X } from "lucide-react";
import type { Announcement } from "@/lib/server-info";

type Update = { version: string; url: string; notes: string; mandatory: boolean } | null;

const KEY = "trk-dismissed-announcements";
const readDismissed = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};
const subscribe = (cb: () => void) => (window.addEventListener("storage", cb), () => window.removeEventListener("storage", cb));

const TONE = {
  info: { icon: Info, cls: "border-[#4ea7fc]/30 bg-[#4ea7fc]/8 text-[#9ccbff]" },
  warn: { icon: TriangleAlert, cls: "border-amber-300/30 bg-amber-300/8 text-amber-200" },
  critical: { icon: Megaphone, cls: "border-destructive/40 bg-destructive/10 text-red-200" },
} as const;

/** Top of every page: admin announcements + "update available" from the license server. */
export function ServerBanner({ announcements, update, licenseWarning }: { announcements: Announcement[]; update: Update; licenseWarning: string | null }) {
  const stored = useSyncExternalStore(subscribe, readDismissed, () => "");
  const [local, setLocal] = useState<string[]>([]);
  const dismissed = new Set([...stored.split(",").filter(Boolean), ...local]);
  const dismiss = (id: number) => {
    const next = [...dismissed, String(id)].slice(-50);
    setLocal(next);
    try {
      localStorage.setItem(KEY, next.join(","));
    } catch {}
  };
  // critical announcements stay until the admin switches them off
  const shown = announcements.filter((a) => a.level === "critical" || !dismissed.has(String(a.id)));
  if (!shown.length && !update && !licenseWarning) return null;

  return (
    <div className="grid gap-2">
      {licenseWarning && (
        <div className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] ${TONE.warn.cls}`}>
          <TriangleAlert className="size-4 shrink-0" />
          <span className="flex-1">{licenseWarning}</span>
        </div>
      )}
      {update && (
        <div className={`flex flex-wrap items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] ${update.mandatory ? TONE.critical.cls : TONE.info.cls}`}>
          <Download className="size-4 shrink-0" />
          <span className="flex-1">
            <b className="font-semibold">Versi {update.version} tersedia.</b>{" "}
            {update.mandatory ? "Update ini wajib: pasang sebelum lanjut bekerja." : update.notes.split("\n")[0]}
          </span>
          <a href={update.url} target="_blank" rel="noreferrer" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            Download
          </a>
        </div>
      )}
      {shown.map((a) => {
        const { icon: Icon, cls } = TONE[a.level];
        return (
          <div key={a.id} className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] ${cls}`}>
            <Icon className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{a.title}</p>
              {a.body && <p className="mt-0.5 whitespace-pre-line opacity-90">{a.body}</p>}
            </div>
            {a.level !== "critical" && (
              <button type="button" onClick={() => dismiss(a.id)} className="rounded-md p-1 opacity-70 hover:bg-white/10 hover:opacity-100" aria-label="Tutup pengumuman">
                <X className="size-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
