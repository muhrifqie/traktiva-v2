"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, CheckCheck, Columns2, FolderOpen, Gamepad2, Loader2, Play, RefreshCw, Rows2, Shuffle, Square, Video, X } from "lucide-react";
import { toast } from "sonner";
import { mediaUrl } from "@/lib/media-url";
import type { EditorJob, Layout, SourceFile } from "@/lib/youtube-editor";
import { openMediaFolder, refreshLists, renderStatus, renderVideos, stopRender } from "./actions";

const KEY = "trk-yt-editor"; // picks, layout and gameplay mode survive a refresh or an app restart
type Saved = { channel: string; picked: string[]; games: string[]; layout: Layout; random: boolean };

function Segmented<T extends string>({ value, onChange, items, disabled }: { value: T; onChange: (v: T) => void; items: { v: T; label: React.ReactNode }[]; disabled?: boolean }) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-muted p-0.5">
      {items.map((it) => (
        <button key={it.v} type="button" disabled={disabled} onClick={() => onChange(it.v)} aria-pressed={value === it.v} className={`flex h-7 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors disabled:opacity-50 ${value === it.v ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** The frame being made, drawn small: which half holds which video. */
function LayoutPreview({ layout }: { layout: Layout }) {
  const half = "grid place-items-center text-[10px] font-medium";
  return (
    <div className={`mx-auto grid aspect-[9/16] w-28 overflow-hidden rounded-lg border ${layout === "side" ? "grid-cols-2" : "grid-rows-2"}`}>
      <span className={`${half} bg-sky-500/20 text-sky-700 dark:text-sky-300`}><Video className="mb-0.5 size-4" />Asli</span>
      <span className={`${half} bg-[#ff3333]/15 text-[#ff3333]`}><Gamepad2 className="mb-0.5 size-4" />Gameplay</span>
    </div>
  );
}

// Pick downloaded Shorts (left) + gameplay clips, choose the layout, render: one 1080×1920 Short per original.
export function VideoEditor({ originals, initialGameplay, initialResults, initialJob }: { originals: { channel: string; files: SourceFile[] }[]; initialGameplay: SourceFile[]; initialResults: SourceFile[]; initialJob: EditorJob | null }) {
  const [channel, setChannel] = useState(originals[0]?.channel ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [games, setGames] = useState<Set<string>>(new Set());
  const [gameplay, setGameplay] = useState(initialGameplay);
  const [results, setResults] = useState(initialResults);
  const [layout, setLayout] = useState<Layout>("side");
  const [random, setRandom] = useState(true);
  const [job, setJob] = useState(initialJob);
  const restored = useRef(false);
  const running = !!job?.running;

  // restore the last picks after mount (no localStorage during the server render)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
        if (s) {
          if (originals.some((c) => c.channel === s.channel)) setChannel(s.channel);
          setPicked(new Set(s.picked));
          setGames(new Set(s.games));
          setLayout(s.layout ?? "side");
          setRandom(s.random ?? true);
        }
      } catch {}
      restored.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, [originals]);
  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ channel, picked: [...picked], games: [...games], layout, random } satisfies Saved));
    } catch {}
  }, [channel, picked, games, layout, random]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      const j = await renderStatus();
      setJob(j);
      if (!j?.running) setResults((await refreshLists()).results);
    }, 1500);
    return () => clearInterval(t);
  }, [running]);

  const files = useMemo(() => originals.find((c) => c.channel === channel)?.files ?? [], [originals, channel]);
  const chosen = files.filter((f) => picked.has(f.rel));
  const toggle = (set: Set<string>, rel: string) => {
    const n = new Set(set);
    if (n.has(rel)) n.delete(rel);
    else n.add(rel);
    return n;
  };

  const reload = async () => {
    const r = await refreshLists();
    setGameplay(r.gameplay);
    setResults(r.results);
    setGames((g) => new Set([...g].filter((x) => r.gameplay.some((y) => y.rel === x))));
    toast.success(`${r.gameplay.length} klip gameplay`);
  };

  const render = async () => {
    const r = await renderVideos({ originals: chosen.map((f) => f.rel), gameplay: [...games], layout, random });
    if ("error" in r) return toast.error(r.error);
    setJob(r.ok ?? null);
    toast.success(`Merender ${chosen.length} video`);
  };

  const pct = job?.total ? ((job.done.length + job.failed.length) / job.total) * 100 : 0;

  if (!originals.length)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center">
        <Columns2 className="size-7 text-muted-foreground" />
        <p className="text-sm font-medium">Belum ada video asli</p>
        <p className="max-w-sm text-xs text-muted-foreground">Unduh Shorts dulu di menu Unduh Shorts. Hasilnya otomatis muncul di sini untuk digabung dengan gameplay.</p>
        <Link href="/youtube-shorts" className="mt-2 flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">Buka Unduh Shorts</Link>
      </div>
    );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        {/* 1. originals */}
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <header className="flex flex-wrap items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-300"><Video className="size-4" /></span>
            <h3 className="text-[13px] font-semibold">1. Video asli</h3>
            <span className="text-xs text-muted-foreground">{chosen.length} dipilih</span>
            <select value={channel} onChange={(e) => (setChannel(e.target.value), setPicked(new Set()))} aria-label="Channel" className="ml-auto h-8 rounded-lg border bg-background px-2 text-xs">
              {originals.map((c) => <option key={c.channel} value={c.channel}>{c.channel} ({c.files.length})</option>)}
            </select>
            <button type="button" onClick={() => setPicked(new Set(files.map((f) => f.rel)))} className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs hover:bg-accent"><CheckCheck className="size-3.5" /> Semua</button>
            <button type="button" onClick={() => setPicked(new Set())} className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs hover:bg-accent"><X className="size-3.5" /> Kosongkan</button>
          </header>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
            {files.map((f) => {
              const on = picked.has(f.rel);
              return (
                <button key={f.rel} type="button" onClick={() => setPicked((p) => toggle(p, f.rel))} aria-pressed={on} title={f.name} className={`relative overflow-hidden rounded-lg border bg-muted text-left ${on ? "ring-2 ring-sky-500" : ""}`}>
                  <video src={`${mediaUrl(f.rel)}#t=1`} preload="metadata" muted className="aspect-[9/16] w-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/85 to-transparent p-1.5 pt-6 text-[11px] leading-tight text-white">{f.name}</span>
                  <span className={`absolute top-1.5 left-1.5 grid size-5 place-items-center rounded-md border text-white ${on ? "border-transparent bg-sky-500" : "border-white/70 bg-black/30"}`}>{on && <Check className="size-3" />}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 2. gameplay */}
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <header className="flex flex-wrap items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-[#ff3333]/15 text-[#ff3333]"><Gamepad2 className="size-4" /></span>
            <h3 className="text-[13px] font-semibold">2. Video gameplay</h3>
            <span className="text-xs text-muted-foreground">{games.size ? `${games.size} dipilih` : "kosong = pakai semua"}</span>
            <button type="button" onClick={() => void openMediaFolder("gameplay")} className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs hover:bg-accent"><FolderOpen className="size-3.5" /> Buka folder Gameplay</button>
            <button type="button" onClick={reload} title="Muat ulang daftar" aria-label="Muat ulang daftar" className="grid size-8 place-items-center rounded-lg border hover:bg-accent"><RefreshCw className="size-3.5" /></button>
          </header>
          {gameplay.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {gameplay.map((f) => {
                const on = games.has(f.rel);
                return (
                  <button key={f.rel} type="button" onClick={() => setGames((g) => toggle(g, f.rel))} aria-pressed={on} title={f.name} className={`relative overflow-hidden rounded-lg border bg-muted text-left ${on ? "ring-2 ring-[#ff3333]" : ""}`}>
                    <video src={`${mediaUrl(f.rel)}#t=2`} preload="metadata" muted className="aspect-video w-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 to-transparent p-1.5 pt-5 text-[11px] text-white">{f.name}</span>
                    <span className={`absolute top-1.5 left-1.5 grid size-5 place-items-center rounded-md border text-white ${on ? "border-transparent bg-[#ff3333]" : "border-white/70 bg-black/30"}`}>{on && <Check className="size-3" />}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
              Belum ada klip gameplay. Klik <b>Buka folder Gameplay</b>, taruh video gameplay (mp4) di sana, lalu tekan muat ulang. Pakai rekaman gameplay milikmu sendiri atau yang bebas dipakai.
            </p>
          )}
        </section>
      </div>

      {/* settings + action, stays in view */}
      <aside className="space-y-3 lg:sticky lg:top-0">
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <LayoutPreview layout={layout} />
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Tata letak (1080×1920)</p>
            <Segmented value={layout} onChange={setLayout} disabled={running} items={[{ v: "side", label: <><Columns2 className="size-3.5" /> Kiri–kanan</> }, { v: "stack", label: <><Rows2 className="size-3.5" /> Atas–bawah</> }]} />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Klip gameplay per video</p>
            <Segmented value={random ? "acak" : "urut"} onChange={(v) => setRandom(v === "acak")} disabled={running} items={[{ v: "acak", label: <><Shuffle className="size-3.5" /> Acak</> }, { v: "urut", label: "Bergiliran" }]} />
          </div>
          <p className="text-[11px] text-muted-foreground">Suara dari video asli. Gameplay tanpa suara, diputar ulang dari titik acak supaya tiap hasil beda.</p>
        </section>

        {job && (job.running || job.total > 0) && (
          <section className="space-y-2.5 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-[13px] font-medium">
              {job.running ? <Loader2 className="size-4 animate-spin text-[#ff3333]" /> : <Check className="size-4 text-status-ok" />}
              <span className="flex-1">{job.running ? "Merender" : job.cancelled ? "Dibatalkan" : "Selesai"} {job.done.length}/{job.total}</span>
              {job.failed.length > 0 && <span className="text-xs text-destructive">{job.failed.length} gagal</span>}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#ff3333] transition-[width]" style={{ width: `${pct}%` }} /></div>
            {job.current && <p className="truncate text-xs text-muted-foreground">{job.current}</p>}
            {job.failed.map((f) => <p key={f} className="text-[11px] text-destructive">{f}</p>)}
            {job.running && <button type="button" onClick={() => void stopRender()} className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border text-xs font-medium hover:border-destructive/40 hover:text-destructive"><Square className="size-3.5" /> Batalkan</button>}
          </section>
        )}

        <button type="button" onClick={render} disabled={running || !chosen.length} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          {running ? "Sedang merender…" : chosen.length ? `Render ${chosen.length} video` : "Pilih video asli dulu"}
        </button>

        {results.length > 0 && (
          <section className="space-y-2 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <h3 className="flex-1 text-[13px] font-semibold">Hasil terbaru</h3>
              <button type="button" onClick={() => void openMediaFolder("results")} className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs hover:bg-accent"><FolderOpen className="size-3.5" /> Folder</button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {results.slice(0, 9).map((r) => (
                <a key={r.rel} href={mediaUrl(r.rel)} target="_blank" rel="noreferrer" title={r.name} className="overflow-hidden rounded-md border bg-muted">
                  <video src={`${mediaUrl(r.rel)}#t=1`} preload="metadata" muted className="aspect-[9/16] w-full object-cover" />
                </a>
              ))}
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}
