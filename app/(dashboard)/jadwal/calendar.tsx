"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { accountColor } from "@/lib/account-color";

// Calendar view of the upload queue (read-only): month or week, one chip per upload in its WIB day. Scheduling and
// changes stay in the list view (board.tsx), which "Jadwalkan video" opens.
export type CalJob = { id: number; scheduledAt: number; status: "queued" | "uploading" | "done" | "failed" | "cancelled"; accountId: number; username: string; title: string | null };

const TZ = "Asia/Jakarta";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }); // 2026-11-24
const time = new Intl.DateTimeFormat("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const monthTitle = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", month: "long", year: "numeric" });
const longDay = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
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
      <b className="font-semibold tabular-nums">{time.format(j.scheduledAt)}</b> @{j.username}
      {j.title ? <span className="opacity-80"> · {j.title}</span> : null}
    </span>
  );
}

export function JadwalCalendar({ jobs, today: todayKey }: { jobs: CalJob[]; today: string }) {
  const [y, m, d] = todayKey.split("-").map(Number);
  const today = utc(y, m - 1, d);
  const [mode, setMode] = useState<"bulan" | "minggu">("bulan");
  const [anchor, setAnchor] = useState(today); // any day inside the shown month/week
  const [picked, setPicked] = useState<string>(todayKey);

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
  const pickedJobs = byDay.get(picked) ?? [];
  const pickedDate = new Date(`${picked}T00:00:00Z`);
  const limit = mode === "minggu" ? 99 : 3;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section className="flex min-w-0 flex-col rounded-xl border bg-card">
        <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
          <button type="button" onClick={() => move(-1)} className="grid size-8 place-items-center rounded-md hover:bg-accent" aria-label="Sebelumnya"><ChevronLeft className="size-4" /></button>
          <button type="button" onClick={() => move(1)} className="grid size-8 place-items-center rounded-md hover:bg-accent" aria-label="Berikutnya"><ChevronRight className="size-4" /></button>
          <p className="min-w-40 text-base font-semibold capitalize">{title}</p>
          <button type="button" onClick={() => { setAnchor(today); setPicked(todayKey); }} className="h-7 rounded-md border px-2.5 text-xs font-medium hover:bg-accent">Hari ini</button>
          <div className="ml-auto flex rounded-lg border bg-background p-0.5">
            {(["bulan", "minggu"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setMode(v)} className={`h-7 rounded-md px-3 text-xs font-medium capitalize ${mode === v ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{v}</button>
            ))}
          </div>
        </header>
        <div className="grid grid-cols-7 border-b text-center text-[11px] font-medium text-muted-foreground">
          {WEEKDAYS.map((w) => <span key={w} className="py-2">{w}</span>)}
        </div>
        <div className={`grid flex-1 grid-cols-7 ${mode === "bulan" ? "auto-rows-[minmax(92px,1fr)]" : "auto-rows-[minmax(320px,1fr)]"}`}>
          {days.map((day, i) => {
            const k = keyOf(day);
            const list = byDay.get(k) ?? [];
            const isToday = k === todayKey;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setPicked(k)}
                className={`flex min-w-0 flex-col gap-1 border-b p-1.5 text-left transition-colors hover:bg-accent/40 ${i % 7 !== 6 ? "border-r" : ""} ${picked === k ? "bg-primary/[0.06] ring-1 ring-primary/40 ring-inset" : ""} ${inMonth(day) ? "" : "opacity-40"}`}
              >
                <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs tabular-nums ${isToday ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground"}`}>{day.getUTCDate()}</span>
                {list.slice(0, limit).map((j) => <Chip key={j.id} j={j} />)}
                {list.length > limit && <span className="px-1 text-[10px] text-muted-foreground">+{list.length - limit} lainnya</span>}
              </button>
            );
          })}
        </div>
      </section>

      {/* the picked day */}
      <aside className="flex flex-col rounded-xl border bg-card">
        <header className="border-b px-4 py-3">
          <p className="text-sm font-semibold capitalize">{longDay.format(pickedDate)}</p>
          <p className="text-xs text-muted-foreground">{pickedJobs.length ? `${pickedJobs.length} upload` : "Belum ada upload"}</p>
        </header>
        <ul className="flex-1 divide-y">
          {pickedJobs.map((j) => (
            <li key={j.id} className="grid gap-1 px-4 py-2.5 text-[13px]">
              <span className="flex items-center gap-2">
                <b className="font-semibold tabular-nums">{time.format(j.scheduledAt)}</b>
                <span className="truncate text-muted-foreground"><i className="mr-1 inline-block size-2 rounded-full align-middle" style={{ background: accountColor(j.accountId) }} />@{j.username}</span>
                <span className={`ml-auto shrink-0 rounded-full border px-1.5 py-px text-[10px] font-medium ${CHIP[j.status].cls}`}>{CHIP[j.status].label}</span>
              </span>
              {j.title && <span className="truncate text-xs text-muted-foreground">{j.title}</span>}
            </li>
          ))}
          {!pickedJobs.length && (
            <li className="grid place-items-center gap-2 px-4 py-10 text-center text-xs text-muted-foreground">
              <CalendarClock className="size-6 opacity-60" />
              Tidak ada upload di hari ini.
            </li>
          )}
        </ul>
        <div className="border-t p-3">
          <Link href="/jadwal?tampilan=daftar" className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" /> Jadwalkan video
          </Link>
        </div>
      </aside>
    </div>
  );
}
