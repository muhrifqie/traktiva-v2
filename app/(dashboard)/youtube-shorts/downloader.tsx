"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Download, FolderOpen, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import type { ChannelShorts, DownloadJob } from "@/lib/youtube";
import { downloadShorts, downloadStatus, openShortsFolder, readChannel, updateDownloader } from "./actions";

const num = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const LIMITS = [
  { v: 0, label: "Semua Shorts" },
  { v: 10, label: "10 terbaru" },
  { v: 30, label: "30 terbaru" },
  { v: 100, label: "100 terbaru" },
];

// Paste a channel → list every Short → download them all (or the newest N) into ~/Videos/Traktiva/YouTube Shorts/<channel>.
export function ShortsDownloader({ initialJob }: { initialJob: DownloadJob | null }) {
  const [input, setInput] = useState("");
  const [channel, setChannel] = useState<ChannelShorts | null>(null);
  const [job, setJob] = useState(initialJob);
  const [limit, setLimit] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reading, startRead] = useTransition();
  const running = !!job?.running;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => setJob(await downloadStatus()), 1500);
    return () => clearInterval(t);
  }, [running]);

  const read = () =>
    startRead(async () => {
      setError(null);
      const r = await readChannel(input);
      if ("error" in r) return setError(r.error ?? "Gagal membaca channel.");
      setChannel(r.ok);
    });

  const sameChannel = channel && job?.handle === channel.handle;
  const have = new Set([...(channel?.downloaded ?? []), ...(sameChannel ? job.done : [])]);
  const picked = channel ? (limit ? channel.shorts.slice(0, limit) : channel.shorts) : [];
  const todo = picked.filter((s) => !have.has(s.id));

  const download = async () => {
    if (!channel) return;
    const r = await downloadShorts(channel.handle, todo.map((s) => s.id));
    if ("error" in r) return toast.error(r.error);
    setJob(r.ok ?? null);
    toast.success(`Mengunduh ${todo.length} Shorts dari ${channel.channel}`);
  };

  const update = async () => {
    const t = toast.loading("Memperbarui pengunduh…");
    const r = await updateDownloader();
    if ("error" in r) toast.error(r.error, { id: t });
    else toast.success(r.ok || "Pengunduh sudah versi terbaru", { id: t });
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => (e.preventDefault(), read())}
        className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Link channel atau @nama, contoh youtube.com/@namachannel"
          aria-label="Channel YouTube"
          className="h-9 min-w-60 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
        />
        <button type="submit" disabled={reading || !input.trim()} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {reading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Cek channel
        </button>
      </form>

      {error && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={update} className="flex items-center gap-1 text-xs font-medium hover:underline"><RefreshCw className="size-3" /> Perbarui pengunduh</button>
        </div>
      )}

      {job && (job.running || job.total > 0) && (
        <div className="space-y-2 rounded-xl border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            {job.running ? <Loader2 className="size-4 animate-spin text-primary" /> : <Check className="size-4 text-status-ok" />}
            <span className="flex-1 font-medium">
              {job.running ? `Mengunduh ${job.handle}: ${job.done.length}/${job.total}` : `Selesai ${job.handle}: ${job.done.length}/${job.total} Shorts`}
              {job.failed > 0 && <span className="ml-1.5 font-normal text-destructive">({job.failed} gagal)</span>}
            </span>
            <button type="button" onClick={() => openShortsFolder(job.folder)} className="flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium hover:bg-accent">
              <FolderOpen className="size-3.5" /> Buka folder
            </button>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${job.total ? (job.done.length / job.total) * 100 : 0}%` }} />
          </div>
          {job.error && <p className="text-xs text-destructive">{job.error}</p>}
        </div>
      )}

      {channel && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{channel.channel} <span className="font-normal text-muted-foreground">{channel.handle}</span></p>
              <p className="text-xs text-muted-foreground">{channel.shorts.length} Shorts · {have.size} sudah diunduh</p>
            </div>
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} aria-label="Jumlah yang diunduh" className="h-9 rounded-lg border bg-background px-2 text-[13px]">
              {LIMITS.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}
            </select>
            <button type="button" onClick={download} disabled={running || !todo.length} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              <Download className="size-4" /> {todo.length ? `Unduh ${todo.length} Shorts` : "Semua sudah diunduh"}
            </button>
          </div>

          {channel.shorts.length === 0 ? (
            <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Channel ini belum punya Shorts.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {channel.shorts.map((s) => {
                const done = have.has(s.id);
                const now = job?.running && job.current === s.id;
                return (
                  <a key={s.id} href={`https://www.youtube.com/shorts/${s.id}`} target="_blank" rel="noreferrer" title={s.title} className={`group relative block overflow-hidden rounded-lg border bg-muted ${picked.includes(s) ? "" : "opacity-45"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail, no optimizer in the desktop app */}
                    {s.thumb && <img src={s.thumb} alt="" loading="lazy" className="aspect-[9/16] w-full object-cover" />}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 pt-6 text-white">
                      <p className="line-clamp-2 text-[11px] leading-tight">{s.title}</p>
                      {s.views != null && <p className="text-[10px] opacity-80">{num.format(s.views)} views</p>}
                    </div>
                    {(done || now) && (
                      <span className={`absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full text-white ${done ? "bg-status-ok" : "bg-primary"}`}>
                        {done ? <Check className="size-3" /> : <Loader2 className="size-3 animate-spin" />}
                      </span>
                    )}
                  </a>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
