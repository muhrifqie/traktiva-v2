"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { PlatformIcon } from "@/components/platform-icon";
import { accountColor } from "@/lib/account-color";

// Calendar view of the upload queue (read-only): month or week, one chip per upload in its WIB day. Clicking a day in the
// month opens its week (every upload, no "+N"). Scheduling and changes stay in the list view (board.tsx), which the
// "Jadwalkan video" button in the page header opens.
export type CalJob = { id: number; scheduledAt: number; status: "queued" | "uploading" | "done" | "failed" | "cancelled"; accountId: number; username: string; platform: "tiktok" | "instagram" | "facebook" | "youtube" | "shopee"; title: string | null };

const TZ = "Asia/Jakarta";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }); // 2026-11-24
const time = new Intl.DateTimeFormat("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const monthTitle = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", month: "long", year: "numeric" });
const longDay = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }); // "Selasa, 24 November"
const WEEKDAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

const CHIP: Record<CalJob["status"], { label: string; cls: string }> = {
  queued: { label: "Antre", cls: "border-[#5e6ad2]/30 bg-[#5e6ad2]/10 text-[#7b86f0]" },
  uploading: { label: "Mengunggah", cls: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  done: { label: "Terposting", cls: "border-status-ok/30 bg-status-ok/10 text-status-ok" },
  failed: { label: "Gagal", cls: "border-destructive/30 bg-destructive/10 text-destructive" },
  cancelled: { label: "Dibatalkan", cls: "border-border bg-muted text-muted-foreground line-through" },
};

/** Calendar days are plain dates: build them in UTC so no local offset shifts a day. */
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const mondayOf = (d: Date) => utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7));

function Chip({ j }: { j: CalJob }) {
  const s = CHIP[j.status];
  return (
    <span title={`${time.format(j.scheduledAt)} · @${j.username}${j.title ? ` · ${j.title}` : ""} · ${s.label}`} className={`block truncate rounded-md border border-l-[3px] px-1.5 py-0.5 text-[11px] ${s.cls}`} style={{ borderLeftColor: accountColor(j.accountId) }}>
      <b className="font-semibold tabular-nums">{time.format(j.scheduledAt)}</b> <PlatformIcon platform={j.platform} className="inline size-3 align-[-2px]" /> {j.platform === "youtube" ? "" : "@"}{j.username}
      {j.title ? <span className="opacity-80"> · {j.title}</span> : null}
    </span>
  );
}

export function JadwalCalendar({ jobs, today: todayKey }: { jobs: CalJob[]; today: string }) {
  const [y, m, d] = todayKey.split("-").map(Number);
  const today = utc(y, m - 1, d);
  const [mode, setMode] = useState<"bulan" | "minggu">("bulan");
  const [anchor, setAnchor] = useState(today); // any day inside the shown month/week
  const router = useRouter();

  const byDay = useMemo(() => {
    const map = new Map<string, CalJob[]>();
    for (const j of [...jobs].sort((a, b) => a.scheduledAt - b.scheduledAt)) {
      const k = dayKey.format(j.scheduledAt);
      map.set(k, [...(map.get(k) ?? []), j]);
    }
    return map;
  }, [jobs]);

  const days = useMemo(() => {
    const start = mode === "minggu" ? mondayOf(anchor) : mondayOf(utc(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
    const count = mode === "minggu" ? 7 : 42;
    return Array.from({ length: count }, (_, i) => utc(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i));
  }, [mode, anchor]);

  const move = (dir: -1 | 1) =>
    setAnchor(mode === "minggu" ? utc(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate() + 7 * dir) : utc(anchor.getUTCFullYear(), anchor.getUTCMonth() + dir, 1));
  const title = mode === "minggu" ? `${longDay.format(days[0]).split(", ")[1] ?? ""} – ${longDay.format(days[6]).split(", ")[1] ?? ""}` : monthTitle.format(anchor);
  const inMonth = (day: Date) => mode === "minggu" || day.getUTCMonth() === anchor.getUTCMonth();
  const limit = mode === "minggu" ? 99 : 3;

  return (
    <div className="flex flex-1 flex-col">
      <section className="flex min-w-0 flex-col rounded-xl border bg-card">
        <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
          <button type="button" onClick={() => move(-1)} className="grid size-8 place-items-center rounded-md hover:bg-accent" aria-label="Sebelumnya"><ChevronLeft className="size-4" /></button>
          <button type="button" onClick={() => move(1)} className="grid size-8 place-items-center rounded-md hover:bg-accent" aria-label="Berikutnya"><ChevronRight className="size-4" /></button>
          <p className="min-w-40 text-base font-semibold capitalize">{title}</p>
          <button type="button" onClick={() => setAnchor(today)} className="h-7 rounded-md border px-2.5 text-xs font-medium hover:bg-accent">Hari ini</button>
          <div className="ml-auto flex rounded-lg border bg-background p-0.5">
            {(["bulan", "minggu"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setMode(v)} className={`h-7 rounded-md px-3 text-xs font-medium capitalize ${mode === v ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{v}</button>
            ))}
          </div>
        </header>
        <div className="grid grid-cols-7 border-b text-center text-[11px] font-medium text-muted-foreground">
          {WEEKDAYS.map((w) => <span key={w} className="py-2">{w}</span>)}
        </div>
        <div className={`grid grid-cols-7 ${mode === "bulan" ? "auto-rows-[minmax(92px,auto)]" : "auto-rows-[minmax(160px,auto)]"}`}>
          {days.map((day, i) => {
            const k = keyOf(day);
            const list = byDay.get(k) ?? [];
            const isToday = k === todayKey;
            const past = k < todayKey;
            return (
              <button
                key={k}
                type="button"
                disabled={past}
                // a day from today on: schedule a video on that date (the form opens with the date filled in)
                onClick={() => !past && router.push(`/jadwal?tampilan=daftar&tanggal=${k}`)}
                title={past ? undefined : "Jadwalkan video di tanggal ini"}
                className={`group flex min-w-0 flex-col gap-1 border-b p-1.5 text-left transition-colors ${past ? "cursor-default" : "hover:bg-accent/40"} ${i % 7 !== 6 ? "border-r" : ""} ${isToday ? "bg-primary/[0.04]" : ""} ${inMonth(day) ? "" : "opacity-40"}`}
              >
                <span className="flex items-center justify-between">
                  <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs tabular-nums ${isToday ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground"}`}>{day.getUTCDate()}</span>
                  {!past && <Plus className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />}
                </span>
                {list.slice(0, limit).map((j) => <Chip key={j.id} j={j} />)}
                {list.length > limit && <span className="px-1 text-[10px] text-muted-foreground">+{list.length - limit} lainnya</span>}
              </button>
            );
          })}
        </div>
      </section>

    </div>
  );
}
