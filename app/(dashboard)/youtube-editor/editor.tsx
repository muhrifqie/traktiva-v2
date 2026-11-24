"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, CheckCheck, Columns2, Crop, Eye, FolderOpen, Gamepad2, LayoutPanelLeft, Loader2, Palette, PieChart, Play, Ratio, RefreshCw, Rows2, Save, Shuffle, Square, Video, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { mediaUrl } from "@/lib/media-url";
import type { EditorJob, SourceFile } from "@/lib/youtube-editor";
import { SIZES, type EditorSettings, type Fill, type Fit, type Size } from "@/lib/youtube-editor-config";
import { openMediaFolder, previewFrame, refreshLists, renderStatus, renderVideos, saveEditorSettings, stopRender } from "./actions";

const KEY = "trk-yt-editor"; // picks, settings and gameplay mode survive a refresh or an app restart
type Saved = { channel: string; picked: string[]; games: string[]; random: boolean }; // the configuration itself lives in settings.json
const RED = "#ff3333";

function Segmented<T extends string>({ value, onChange, items, disabled }: { value: T; onChange: (v: T) => void; items: { v: T; label: React.ReactNode }[]; disabled?: boolean }) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-muted p-0.5">
      {items.map((it) => (
        <button key={it.v} type="button" disabled={disabled} onClick={() => onChange(it.v)} aria-pressed={value === it.v} className={`flex h-7 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors disabled:opacity-50 ${value === it.v ? "bg-[#ff3333] text-white shadow-xs" : "text-muted-foreground hover:text-foreground"}`}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** One setting: colored icon + label, then its control. */
function Field({ icon: Icon, color, label, children }: { icon: LucideIcon; color: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <span className="grid size-5 place-items-center rounded-md" style={{ background: `${color}22`, color }}><Icon className="size-3" /></span>
        {label}
      </p>
      {children}
    </div>
  );
}

/** Size button: the frame's shape drawn at its aspect ratio, name and pixels. */
function SizeButton({ size, active, onClick, disabled }: { size: Size; active: boolean; onClick: () => void; disabled?: boolean }) {
  const [w, h] = size.split("x").map(Number);
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors disabled:opacity-50 ${active ? "border-[#ff3333] bg-[#ff3333]/10" : "hover:bg-accent"}`}>
      <span className="grid size-7 shrink-0 place-items-center">
        <span className={`block rounded-[3px] border-2 ${active ? "border-[#ff3333]" : "border-muted-foreground/60"}`} style={w >= h ? { width: 22, height: Math.round((22 * h) / w) } : { height: 24, width: Math.round((24 * w) / h) }} />
      </span>
      <span className="min-w-0">
        <span className={`block text-xs font-semibold ${active ? "text-[#ff3333]" : ""}`}>{SIZES[size].label}</span>
        <span className="block text-[10px] text-muted-foreground tabular-nums">{SIZES[size].note}</span>
      </span>
    </button>
  );
}

/** The frame being made, drawn small (until a real preview frame is ready): which part holds which video. */
function LayoutSketch({ cfg }: { cfg: EditorSettings }) {
  const [w, h] = cfg.size.split("x").map(Number);
  const part = "grid place-items-center text-[10px] font-medium";
  const track = `${cfg.ratio}fr ${100 - cfg.ratio}fr`;
  return (
    <div className="grid h-full w-full overflow-hidden" style={{ aspectRatio: `${w} / ${h}`, ...(cfg.layout === "side" ? { gridTemplateColumns: track } : { gridTemplateRows: track }) }}>
      <span className={`${part} bg-sky-500/20 text-sky-700 dark:text-sky-300`}><Video className="mb-0.5 size-4" />Asli</span>
      <span className={`${part} bg-[#ff3333]/15 text-[#ff3333]`}><Gamepad2 className="mb-0.5 size-4" />Gameplay</span>
    </div>
  );
}

// Pick downloaded Shorts + gameplay clips, set size/layout/share/fit (with a real preview frame), render one video each.
export function VideoEditor({ originals, initialGameplay, initialResults, initialJob, initialSettings }: { originals: { channel: string; files: SourceFile[] }[]; initialGameplay: SourceFile[]; initialResults: SourceFile[]; initialJob: EditorJob | null; initialSettings: EditorSettings }) {
  const [channel, setChannel] = useState(originals[0]?.channel ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [games, setGames] = useState<Set<string>>(new Set());
  const [gameplay, setGameplay] = useState(initialGameplay);
  const [results, setResults] = useState(initialResults);
  const [cfg, setCfg] = useState<EditorSettings>(initialSettings);
  const [saved, setSaved] = useState(true);
  const set = <K extends keyof EditorSettings>(k: K, v: EditorSettings[K]) => {
    setSaved(false);
    setCfg((c) => ({ ...c, [k]: v }));
  };
  const [random, setRandom] = useState(true);
  const [preview, setPreview] = useState<{ url: string | null; busy: boolean; error: string | null }>({ url: null, busy: false, error: null });
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
      localStorage.setItem(KEY, JSON.stringify({ channel, picked: [...picked], games: [...games], random } satisfies Saved));
    } catch {}
  }, [channel, picked, games, random]);

  // the configuration is saved on the server (settings.json) a moment after each change
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(async () => {
      try {
        await saveEditorSettings(cfg);
        setSaved(true);
      } catch {
        toast.error("Konfigurasi Editor gagal disimpan");
      }
    }, 600);
    return () => clearTimeout(t);
  }, [cfg]);

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

  // real preview: one frame of the result from the first picked original + gameplay, redone when a setting changes
  const sampleOriginal = (chosen[0] ?? files[0])?.rel;
  const sampleGame = (gameplay.find((g) => games.has(g.rel)) ?? gameplay[0])?.rel;
  useEffect(() => {
    if (!sampleOriginal || !sampleGame) return;
    let live = true;
    const t = setTimeout(async () => {
      setPreview((p) => ({ ...p, busy: true, error: null }));
      const r = await previewFrame(sampleOriginal, sampleGame, cfg);
      if (!live) return;
      if ("error" in r) setPreview((p) => ({ ...p, busy: false, error: r.error ?? "Gagal membuat preview" }));
      else setPreview({ url: `${mediaUrl(r.ok!)}?v=${Date.now()}`, busy: false, error: null });
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [sampleOriginal, sampleGame, cfg]);
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
    const r = await renderVideos({ originals: chosen.map((f) => f.rel), gameplay: [...games], settings: cfg, random });
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
          {/* preview: the real frame once made, the sketch until then (or without gameplay) */}
          <div className="relative mx-auto flex max-h-[340px] items-center justify-center overflow-hidden rounded-lg border bg-muted" style={{ aspectRatio: cfg.size.replace("x", " / "), width: cfg.size === "1920x1080" ? "100%" : cfg.size === "1080x1080" ? "75%" : "56%" }}>
            {preview.url && sampleGame ? (
              // eslint-disable-next-line @next/next/no-img-element -- generated local preview frame
              <img src={preview.url} alt="Preview hasil" className="h-full w-full object-contain" />
            ) : (
              <LayoutSketch cfg={cfg} />
            )}
            {preview.busy && <span className="absolute inset-0 grid place-items-center bg-background/40"><Loader2 className="size-5 animate-spin" /></span>}
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            <Eye className="mr-1 inline size-3" />
            {preview.error ? <span className="text-destructive">{preview.error}</span> : sampleGame ? "Preview frame dari video yang dipilih" : "Tambahkan gameplay untuk preview sungguhan"}
          </p>

          <Field icon={Ratio} color={RED} label="Ukuran hasil">
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(SIZES) as Size[]).map((sz) => <SizeButton key={sz} size={sz} active={cfg.size === sz} onClick={() => set("size", sz)} disabled={running} />)}
            </div>
          </Field>
          <Field icon={LayoutPanelLeft} color="#0ea5e9" label="Tata letak">
            <Segmented value={cfg.layout} onChange={(v) => set("layout", v)} disabled={running} items={[{ v: "side", label: <><Columns2 className="size-3.5" /> Kiri–kanan</> }, { v: "stack", label: <><Rows2 className="size-3.5" /> Atas–bawah</> }]} />
          </Field>
          <Field icon={PieChart} color="#8b5cf6" label="Porsi video asli : gameplay">
            <Segmented value={String(cfg.ratio) as "50" | "60" | "70"} onChange={(v) => set("ratio", Number(v) as EditorSettings["ratio"])} disabled={running} items={[{ v: "50", label: "50 : 50" }, { v: "60", label: "60 : 40" }, { v: "70", label: "70 : 30" }]} />
          </Field>
          <Field icon={Crop} color="#f59e0b" label="Mode tampil">
            <div className="grid grid-cols-2 gap-2">
              {([["fitOriginal", "Video asli", Video], ["fitGame", "Gameplay", Gamepad2]] as const).map(([k, label, Icon]) => (
                <div key={k} className="space-y-1">
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Icon className="size-3" /> {label}</p>
                  <Segmented value={cfg[k]} onChange={(v: Fit) => set(k, v)} disabled={running} items={[{ v: "cover", label: "Penuh" }, { v: "contain", label: "Utuh" }]} />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground"><b>Penuh</b>: memenuhi bagiannya (tepi terpotong). <b>Utuh</b>: tidak terpotong, sisanya diisi warna latar.</p>
          </Field>
          <Field icon={Palette} color="#10b981" label="Warna latar (mode Utuh)">
            <div className="grid grid-cols-3 gap-1.5">
              {([["blur", "Blur", "linear-gradient(135deg,#94a3b8,#475569)"], ["black", "Hitam", "#000"], ["white", "Putih", "#fff"]] as [Fill, string, string][]).map(([v, label, bg]) => (
                <button key={v} type="button" onClick={() => set("fill", v)} disabled={running} aria-pressed={cfg.fill === v} className={`flex h-8 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium disabled:opacity-50 ${cfg.fill === v ? "border-[#ff3333] bg-[#ff3333]/10 text-[#ff3333]" : "hover:bg-accent"}`}>
                  <span className="size-3.5 rounded-full border" style={{ background: bg }} /> {label}
                </button>
              ))}
            </div>
          </Field>
          <Field icon={Shuffle} color="#ec4899" label="Klip gameplay per video">
            <Segmented value={random ? "acak" : "urut"} onChange={(v) => setRandom(v === "acak")} disabled={running} items={[{ v: "acak", label: <><Shuffle className="size-3.5" /> Acak</> }, { v: "urut", label: "Bergiliran" }]} />
          </Field>
          <p className="flex items-center gap-1.5 border-t pt-2.5 text-[11px] text-muted-foreground">
            {saved ? <Save className="size-3.5 text-status-ok" /> : <Loader2 className="size-3.5 animate-spin" />}
            {saved ? "Konfigurasi tersimpan" : "Menyimpan konfigurasi…"} · suara dari video asli, gameplay dibisukan
          </p>
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
