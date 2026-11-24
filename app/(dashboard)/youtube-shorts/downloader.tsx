"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, CheckCheck, CirclePause, Download, ExternalLink, Eye, EyeOff, FileText, FolderOpen, History, ImageIcon, Loader2, Music, RefreshCw, Search, Settings2, Square, Video, X } from "lucide-react";
import { toast } from "sonner";
import type { ChannelShorts, DownloadJob, DownloadOptions, PendingDownload } from "@/lib/youtube";
import { discardPending, downloadShorts, downloadStatus, openShortsFolder, readChannel, resumeDownload, stopDownload, updateDownloader } from "./actions";

const num = new Intl.NumberFormat("id-ID");
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const QUALITY: { v: DownloadOptions["quality"]; label: string }[] = [
  { v: "best", label: "Terbaik" },
  { v: "1080", label: "1080p" },
  { v: "720", label: "720p" },
  { v: "480", label: "480p" },
];
const MIN_VIEWS = [0, 1_000, 10_000, 100_000, 1_000_000];
const DEFAULTS: DownloadOptions = { quality: "best", format: "video", thumbnail: false, description: false };
const KEY = "trk-yt-download";
const STATE = "trk-yt-download-state"; // the open channel, selection and filters: survive a refresh or an app restart

type Saved = { input: string; channel: ChannelShorts | null; picked: string[]; sort: "new" | "views"; minViews: number; hideDone: boolean };
function loadState(): Saved | null {
  try {
    return JSON.parse(localStorage.getItem(STATE) ?? "null");
  } catch {
    return null;
  }
}

// settings are a per-PC convenience: remembered in localStorage, defaults when it is unavailable
function loadOptions(): DownloadOptions {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

/** Small segmented control (one choice out of a few). */
function Segmented<T extends string>({ value, onChange, items, disabled }: { value: T; onChange: (v: T) => void; items: { v: T; label: React.ReactNode }[]; disabled?: boolean }) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-muted p-0.5">
      {items.map((it) => (
        <button
          key={it.v}
          type="button"
          disabled={disabled}
          onClick={() => onChange(it.v)}
          aria-pressed={value === it.v}
          className={`flex h-7 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors disabled:opacity-50 ${value === it.v ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, icon: Icon, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; icon: typeof ImageIcon; label: string; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
      <Icon className="size-4 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[#ff3333]" />
    </label>
  );
}

// Paste a channel → pick Shorts (all, newest N, or one by one) → download with the chosen quality/format into
// ~/Videos/Traktiva/YouTube Shorts/<channel>. The settings panel stays on screen while scrolling the grid.
export function ShortsDownloader({ initialJob, history, pending: initialPending }: { initialJob: DownloadJob | null; history: { handle: string; files: number }[]; pending: PendingDownload | null }) {
  const [input, setInput] = useState("");
  const [channel, setChannel] = useState<ChannelShorts | null>(null);
  const [job, setJob] = useState(initialJob);
  const [error, setError] = useState<string | null>(null);
  const [reading, startRead] = useTransition();
  const [opts, setOpts] = useState<DownloadOptions>(DEFAULTS);
  const [sort, setSort] = useState<"new" | "views">("new");
  const [minViews, setMinViews] = useState(0);
  const [hideDone, setHideDone] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(initialPending);
  const restored = useRef(false);
  const running = !!job?.running;

  // remembered settings and the last open channel, read after mount (no localStorage during the server render)
  useEffect(() => {
    const saved = loadOptions();
    const st = loadState();
    const t = setTimeout(() => {
      setOpts(saved);
      if (st) {
        setInput(st.input ?? "");
        setChannel(st.channel ?? null);
        setPicked(new Set(st.picked ?? []));
        setSort(st.sort ?? "new");
        setMinViews(st.minViews ?? 0);
        setHideDone(!!st.hideDone);
      }
      restored.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!restored.current) return; // never overwrite the saved state with the empty first render
    try {
      const st: Saved = { input, channel, picked: [...picked], sort, minViews, hideDone };
      localStorage.setItem(STATE, JSON.stringify(st));
    } catch {}
  }, [input, channel, picked, sort, minViews, hideDone]);
  const setOpt = <K extends keyof DownloadOptions>(k: K, v: DownloadOptions[K]) =>
    setOpts((o) => {
      const next = { ...o, [k]: v };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => setJob(await downloadStatus()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const read = (value = input) =>
    startRead(async () => {
      setError(null);
      const r = await readChannel(value);
      if ("error" in r) return setError(r.error ?? "Gagal membaca channel.");
      if (!r.ok) return;
      setChannel(r.ok);
      // start with every Short not downloaded yet selected
      const have = new Set(r.ok.downloaded[opts.format]);
      setPicked(new Set(r.ok.shorts.filter((s) => !have.has(s.id)).map((s) => s.id)));
    });

  const sameJob = channel && job?.handle === channel.handle && job.format === opts.format;
  const have = useMemo(() => new Set([...(channel?.downloaded[opts.format] ?? []), ...(sameJob ? job!.done : [])]), [channel, opts.format, sameJob, job]);
  const shown = useMemo(() => {
    const list = (channel?.shorts ?? []).filter((s) => (s.views ?? 0) >= minViews && !(hideDone && have.has(s.id)));
    return sort === "views" ? [...list].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)) : list;
  }, [channel, minViews, hideDone, have, sort]);
  const todo = (channel?.shorts ?? []).filter((s) => picked.has(s.id) && !have.has(s.id));

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const pickFirst = (n: number) => setPicked(new Set(shown.filter((s) => !have.has(s.id)).slice(0, n).map((s) => s.id)));

  const download = async () => {
    if (!channel || !todo.length) return;
    const r = await downloadShorts(channel.handle, todo.map((s) => s.id), opts);
    if ("error" in r) return toast.error(r.error);
    setJob(r.ok ?? null);
    toast.success(`Mengunduh ${todo.length} ${opts.format === "audio" ? "audio" : "Shorts"} dari ${channel.channel}`);
  };

  const update = async () => {
    const t = toast.loading("Memperbarui pengunduh…");
    const r = await updateDownloader();
    if ("error" in r) toast.error(r.error, { id: t });
    else toast.success(r.ok || "Pengunduh sudah versi terbaru", { id: t });
  };

  const resume = async () => {
    const r = await resumeDownload();
    if ("error" in r) return toast.error(r.error);
    setPending(null);
    setJob(r.ok ?? null);
    toast.success("Unduhan dilanjutkan");
  };
  const close = () => {
    setChannel(null);
    setInput("");
    setPicked(new Set());
  };

  const currentTitle = job?.current ? (channel?.shorts.find((s) => s.id === job.current)?.title ?? job.current) : null;
  const pct = job?.total ? ((job.done.length + (job.percent ?? 0) / 100) / job.total) * 100 : 0;

  const banner = pending && !running && (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[13px]">
      <CirclePause className="size-4 text-amber-500" />
      <span className="flex-1">
        Unduhan <b>{pending.handle}</b> terhenti sebelum selesai (app ditutup): {pending.ids.length} {pending.options.format === "audio" ? "audio" : "Shorts"} tersisa.
      </span>
      <button type="button" onClick={resume} className="h-8 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">Lanjutkan</button>
      <button type="button" onClick={() => void discardPending().then(() => setPending(null))} className="h-8 rounded-lg px-3 text-xs hover:bg-accent">Abaikan</button>
    </div>
  );
  const searchBox = (
    <>
      <form onSubmit={(e) => (e.preventDefault(), read())} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 pl-3">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tempel link channel atau @nama, contoh youtube.com/@namachannel"
          aria-label="Channel YouTube"
          className="h-9 min-w-60 flex-1 bg-transparent text-sm outline-none"
        />
        <button type="submit" disabled={reading || !input.trim()} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {reading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Cek channel
        </button>
      </form>

      {history.length > 0 && (
        <div className={`flex flex-wrap items-center gap-1.5 text-xs ${channel ? "" : "justify-center"}`}>
          <span className="flex items-center gap-1 text-muted-foreground"><History className="size-3.5" /> Pernah diunduh:</span>
          {history.map((h) => (
            <button
              key={h.handle}
              type="button"
              disabled={reading}
              onClick={() => (setInput(h.handle), read(h.handle))}
              className="flex h-7 items-center gap-1.5 rounded-full border bg-card px-2.5 hover:bg-accent disabled:opacity-50"
            >
              {h.handle} <span className="tabular-nums text-muted-foreground">{h.files}</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={update} className="flex items-center gap-1 text-xs font-medium hover:underline"><RefreshCw className="size-3" /> Perbarui pengunduh</button>
        </div>
      )}

    </>
  );

  // nothing open: the search sits in the middle of the page
  if (!channel)
    return (
      <div className="flex flex-1 flex-col items-center justify-center pb-16">
        <div className="w-full max-w-2xl space-y-4">
          <div className="space-y-1 text-center">
            <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-[#ff3333]/10 text-[#ff3333]">
              {reading ? <Loader2 className="size-6 animate-spin" /> : <Download className="size-6" />}
            </span>
            <p className="text-base font-semibold">{reading ? "Membaca channel…" : "Unduh Shorts dari satu channel"}</p>
            <p className="text-xs text-muted-foreground">Tempel link channel, pilih Shorts yang mau diambil, atur kualitas dan format, lalu unduh. Yang sudah pernah diunduh otomatis dilewati.</p>
          </div>
          {banner}
          {searchBox}
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      {banner}
      {searchBox}
      {channel && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-3">
            <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote YouTube avatar */}
              {channel.avatar ? <img src={channel.avatar} alt="" referrerPolicy="no-referrer" className="size-11 rounded-full bg-muted object-cover" /> : <span className="size-11 rounded-full bg-muted" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{channel.channel} <span className="font-normal text-muted-foreground">{channel.handle}</span></p>
                <p className="text-xs text-muted-foreground">
                  {channel.subscribers != null && `${compact.format(channel.subscribers)} subscriber · `}
                  {num.format(channel.shorts.length)} Shorts · {num.format(have.size)} sudah diunduh ({opts.format === "audio" ? "audio" : "video"})
                </p>
              </div>
              <a href={channel.url} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" title="Buka di YouTube"><ExternalLink className="size-4" /></a>
              <button type="button" onClick={close} disabled={running} title="Tutup channel" aria-label="Tutup channel" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"><X className="size-4" /></button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="w-48"><Segmented value={sort} onChange={setSort} items={[{ v: "new", label: "Terbaru" }, { v: "views", label: "Terpopuler" }]} /></div>
              <select value={minViews} onChange={(e) => setMinViews(Number(e.target.value))} aria-label="Minimal penayangan" className="h-8 rounded-lg border bg-card px-2 text-xs">
                {MIN_VIEWS.map((v) => <option key={v} value={v}>{v ? `≥ ${compact.format(v)} views` : "Semua views"}</option>)}
              </select>
              <button type="button" onClick={() => setHideDone((v) => !v)} className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 ${hideDone ? "border-primary/40 bg-primary/10" : "bg-card hover:bg-accent"}`}>
                {hideDone ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} Sembunyikan yang sudah diunduh
              </button>
              <span className="ml-auto flex items-center gap-1">
                <span className="text-muted-foreground">Pilih:</span>
                {[10, 30].map((n) => <button key={n} type="button" onClick={() => pickFirst(n)} className="h-8 rounded-lg px-2 hover:bg-accent">{n} teratas</button>)}
                <button type="button" onClick={() => pickFirst(Infinity)} className="flex h-8 items-center gap-1 rounded-lg px-2 hover:bg-accent"><CheckCheck className="size-3.5" /> Semua</button>
                <button type="button" onClick={() => setPicked(new Set())} className="flex h-8 items-center gap-1 rounded-lg px-2 hover:bg-accent"><X className="size-3.5" /> Kosongkan</button>
              </span>
            </div>

            {shown.length === 0 ? (
              <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{channel.shorts.length ? "Tidak ada Shorts yang cocok dengan filter." : "Channel ini belum punya Shorts."}</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
                {shown.map((s) => {
                  const done = have.has(s.id);
                  const on = picked.has(s.id) && !done;
                  const now = running && job?.current === s.id;
                  return (
                    <div key={s.id} className={`group relative overflow-hidden rounded-lg border bg-muted transition-shadow ${on ? "ring-2 ring-[#ff3333]" : ""} ${done ? "opacity-60" : ""}`}>
                      <button type="button" disabled={done} onClick={() => toggle(s.id)} title={s.title} aria-pressed={on} aria-label={`${on ? "Batal pilih" : "Pilih"} ${s.title}`} className="block w-full text-left disabled:cursor-default">
                        {/* eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail */}
                        {s.thumb ? <img src={s.thumb} alt="" loading="lazy" className="aspect-[9/16] w-full object-cover" /> : <span className="block aspect-[9/16]" />}
                        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-1.5 pt-8 text-white">
                          <span className="line-clamp-2 text-[11px] leading-tight">{s.title}</span>
                          {s.views != null && <span className="text-[10px] opacity-80">{compact.format(s.views)} views</span>}
                        </span>
                      </button>
                      <span className={`pointer-events-none absolute top-1.5 left-1.5 grid size-5 place-items-center rounded-md border text-white ${done ? "border-transparent bg-status-ok" : on ? "border-transparent bg-[#ff3333]" : "border-white/70 bg-black/30"}`}>
                        {(done || on) && <Check className="size-3" />}
                      </span>
                      {now && (
                        <span className="absolute inset-x-1.5 top-1/2 -translate-y-1/2 rounded-md bg-black/70 px-2 py-1 text-center text-[11px] font-medium text-white tabular-nums">
                          <Loader2 className="mr-1 inline size-3 animate-spin" />{Math.round(job?.percent ?? 0)}%
                        </span>
                      )}
                      <a href={`https://www.youtube.com/shorts/${s.id}`} target="_blank" rel="noreferrer" title="Tonton di YouTube" className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-md bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
                        <ExternalLink className="size-3" />
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* settings + action, stays in view while the grid scrolls */}
          <aside className="space-y-3 lg:sticky lg:top-0">
            <section className="space-y-3 rounded-xl border bg-card p-4">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold"><Settings2 className="size-4 text-muted-foreground" /> Pengaturan unduhan</h3>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Format</p>
                <Segmented value={opts.format} onChange={(v) => setOpt("format", v)} disabled={running} items={[{ v: "video", label: <><Video className="size-3.5" /> Video MP4</> }, { v: "audio", label: <><Music className="size-3.5" /> Audio M4A</> }]} />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Kualitas video</p>
                <Segmented value={opts.quality} onChange={(v) => setOpt("quality", v)} disabled={running || opts.format === "audio"} items={QUALITY} />
                <p className="text-[11px] text-muted-foreground">{opts.format === "audio" ? "Audio saja, kualitas video tidak dipakai." : "H.264 + AAC, bisa langsung diunggah ke TikTok. Kalau resolusi itu tidak ada, diambil yang terdekat di bawahnya."}</p>
              </div>
              <div className="space-y-2 border-t pt-3">
                <Toggle icon={ImageIcon} label="Simpan thumbnail (.jpg)" checked={opts.thumbnail} onChange={(v) => setOpt("thumbnail", v)} disabled={running} />
                <Toggle icon={FileText} label="Simpan deskripsi (.txt)" checked={opts.description} onChange={(v) => setOpt("description", v)} disabled={running} />
              </div>
            </section>

            {job && (job.running || job.total > 0) && job.handle === channel.handle ? (
              <section className="space-y-2.5 rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 text-[13px] font-medium">
                  {job.running ? <Loader2 className="size-4 animate-spin text-[#ff3333]" /> : <Check className="size-4 text-status-ok" />}
                  <span className="flex-1">{job.running ? "Mengunduh" : job.cancelled ? "Dibatalkan" : "Selesai"} {job.done.length}/{job.total}</span>
                  {job.failed > 0 && <span className="text-xs text-destructive">{job.failed} gagal</span>}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#ff3333] transition-[width]" style={{ width: `${pct}%` }} /></div>
                {currentTitle && <p className="truncate text-xs text-muted-foreground" title={currentTitle}>{Math.round(job.percent ?? 0)}% · {currentTitle}</p>}
                {job.error && <p className="text-xs text-destructive">{job.error}</p>}
                <div className="grid grid-cols-2 gap-2">
                  {job.running ? (
                    <button type="button" onClick={() => void stopDownload()} className="flex h-8 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium hover:border-destructive/40 hover:text-destructive"><Square className="size-3.5" /> Batalkan</button>
                  ) : (
                    <span />
                  )}
                  <button type="button" onClick={() => openShortsFolder(job.folder)} className="flex h-8 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium hover:bg-accent"><FolderOpen className="size-3.5" /> Buka folder</button>
                </div>
              </section>
            ) : null}

            <button
              type="button"
              onClick={download}
              disabled={running || !todo.length}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {running ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {running ? "Sedang mengunduh…" : todo.length ? `Unduh ${num.format(todo.length)} ${opts.format === "audio" ? "audio" : "Shorts"}` : "Pilih Shorts dulu"}
            </button>
            <p className="text-center text-[11px] text-muted-foreground">
              {opts.format === "audio" ? "Audio M4A" : `MP4 ${QUALITY.find((q) => q.v === opts.quality)?.label}`} · disimpan di Videos\Traktiva\YouTube Shorts
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
