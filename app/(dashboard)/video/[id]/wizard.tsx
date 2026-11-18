"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, CircleAlert, Maximize2, Clapperboard, Clock, Download, FolderOpen, Send, ImagePlus, Images, Library, Loader2, PenLine, Plus, Sparkles, Store, Trash2, Upload, Wand2, X,
} from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import type { VideoProject } from "@/lib/db/schema";
import { mediaUrl } from "@/lib/media-url";
import { isSilent, isVideosMode, MAX_VIDEOS, presetById, projectName, VIDEO_SECS, videoFile } from "@/lib/presets";
import {
  addScene, aiWriteScenes, buildStoryboard, deleteProject, generateImages, moveScene, openProjectFolder, pickFromLibrary, removePhoto, removeScene,
  pickShowcaseProduct, renameProject, renderProject, saveProject, uploadPhotos, uploadSceneImage,
} from "../project-actions";
import { LibraryPicker } from "@/components/library-picker";
import { PostDialog, type PostVideo } from "@/components/post-dialog";
import { ShowcasePicker } from "@/components/showcase-picker";
import { usePersistentState } from "@/lib/use-persistent-state";
import { TimelineEditor } from "./editor";
import { openLightbox, type LightboxItem } from "@/components/media-lightbox";
import { voiceLine } from "@/lib/voice";
import { SceneVoiceLine, usePlayer, VoicePanel, type ProjectVoiceState, type VoiceOption } from "./voice-panel";

type Project = Omit<VideoProject, "updatedAt"> & { updatedAt: number };
/** Scene errors can be long (debug screenshot path, retry notes): keep the overlay readable, full text on hover. */
const shortError = (e: string) => e.replace(/\s*\(screenshot: [^)]*\)/g, "").replace(/\s*\(sudah dicoba \d+×\)/, "").replace(/\[browser\]\s*/g, "");

const STEPS = ["Konsep", "Produk", "Gaya", "Storyboard", "Render", "Hasil"];
const CLIP_SECS = [4, 6, 8, 10]; // Racikan Sendiri: per scene

const input = "w-full rounded-lg border bg-background px-3 py-2 text-[13px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-60";
const btn = "flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-[13px] font-medium disabled:opacity-60";
const primary = `${btn} bg-primary text-primary-foreground hover:bg-primary/90`;
const secondary = `${btn} border bg-background hover:bg-accent`;
const seg = (on: boolean) =>
  `flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors ${on ? "bg-background text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`;

export function Wizard({
  project: p, hasGoogle, voice, voices, hasCartesia, maxVideos,
}: { project: Project; hasGoogle: boolean; voice: ProjectVoiceState; voices: VoiceOption[]; hasCartesia: boolean; maxVideos: number }) {
  const voiceLabel = voice.choice === "cartesia" ? `Cartesia · ${voice.voiceName ?? "suara pilihan"}` : voice.choice === "off" ? "tanpa suara" : "Bawaan Flow";
  const router = useRouter();
  const preset = presetById(p.presetId)!;
  const running = p.status === "running";
  const [step, setStep] = useState(p.step);
  const [busy, start] = useTransition();

  // Poll while a stage runs; images/clips appear one by one.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [running, router]);

  // The runner jumps to "Hasil" when the final video is ready.
  const prevStatus = useRef(p.status);
  useEffect(() => {
    if (prevStatus.current === "running" && p.status === "done") setStep(6);
    prevStatus.current = p.status;
  }, [p.status]);

  /** Run a server action, toast its error, refresh server data. */
  const act = (fn: () => Promise<unknown>, ok?: string) =>
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal");
      }
    });

  const go = (n: number) => {
    setStep(n);
    void saveProject(p.id, { step: n });
  };

  const scenesReady = p.scenes.length > 0 && p.scenes.every((s) => s.image);

  return (
    <div className="flex flex-1 flex-col gap-5">
      {/* header */}
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/proyek" className="grid size-9 place-items-center rounded-lg border bg-card hover:bg-accent" aria-label="Kembali ke Proyek"><ArrowLeft className="size-4" /></Link>
        <div className="min-w-0 flex-1">
          <ProjectTitle p={p} act={act} />
          <p className="truncate text-xs text-muted-foreground">Studio · {preset.title}</p>
        </div>
        <button type="button" className={secondary} onClick={() => act(() => openProjectFolder(p.id))}><FolderOpen className="size-4" />Folder</button>
        <button
          type="button"
          disabled={running || busy}
          className={`${secondary} hover:text-destructive`}
          aria-label="Hapus proyek"
          onClick={async () => {
            if (!(await confirmDialog({ title: "Hapus proyek ini?", description: "Folder gambar dan video proyek ini di perangkat ikut dihapus. Tidak bisa dibatalkan.", danger: true }))) return;
            act(async () => {
              await deleteProject(p.id, true);
              router.push("/proyek");
            });
          }}
        >
          <Trash2 className="size-4" />
        </button>
      </header>

      {/* stepper */}
      <nav className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1" aria-label="Langkah">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          return (
            <button
              key={label}
              type="button"
              onClick={() => go(n)}
              className={`flex min-w-fit flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${n === step ? "bg-primary/10 text-brand-light" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
            >
              <span className={`grid size-5 place-items-center rounded-full text-[10px] ${n === step ? "bg-primary text-primary-foreground" : done ? "bg-status-ok/15 text-status-ok" : "bg-muted"}`}>
                {done ? <Check className="size-3" /> : n}
              </span>
              {label}
            </button>
          );
        })}
      </nav>

      {/* run status */}
      {running && <RunPanel p={p} />}
      {p.status === "failed" && p.error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13px]">
          <CircleAlert className="size-4 shrink-0 text-destructive" />
          {p.error}
        </div>
      )}
      {!hasGoogle && (
        <Link href="/pengaturan" className="flex items-center gap-2 rounded-xl border border-status-progress/40 bg-status-progress/10 px-4 py-3 text-[13px]">
          <CircleAlert className="size-4 shrink-0 text-status-progress" /> Tambahkan akun Google di Pengaturan AI supaya bisa membuat gambar & video.
        </Link>
      )}

      <section className="flex-1">
        {step === 1 && <StepConcept preset={preset} p={p} onNext={() => go(2)} />}
        {step === 2 && <StepProduct p={p} busy={busy} act={act} onNext={() => go(3)} />}
        {step === 3 && <StepStyle p={p} busy={busy} act={act} onDone={() => setStep(4)} maxVideos={maxVideos} />}
        {step === 4 && <StepStoryboard key={p.updatedAt} p={p} busy={busy || running} act={act} ready={scenesReady} onNext={() => go(5)} voice={voice} voices={voices} hasCartesia={hasCartesia} />}
        {step === 5 && <StepRender p={p} busy={busy || running} act={act} ready={scenesReady} onBack={() => go(4)} voiceLabel={voiceLabel} />}
        {step === 6 && <StepResult p={p} />}
      </section>
    </div>
  );
}

type Act = (fn: () => Promise<unknown>, ok?: string) => void;

/** Project name in the Studio header; click to rename in place. */
function ProjectTitle({ p, act }: { p: Project; act: Act }) {
  const name = projectName(p);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const save = () => {
    setEditing(false);
    if (value.trim() && value.trim() !== name) act(() => renameProject(p.id, value), "Nama disimpan");
  };
  return editing ? (
    <input
      autoFocus
      value={value}
      maxLength={120}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") setEditing(false);
      }}
      className="w-full max-w-md rounded-md border bg-background px-2 py-0.5 text-lg font-semibold tracking-tight outline-none focus:border-ring"
    />
  ) : (
    <button type="button" onClick={() => { setValue(name); setEditing(true); }} title="Klik untuk ganti nama" className="group flex max-w-full items-center gap-1.5 text-left">
      <h1 className="truncate text-lg font-semibold tracking-tight">{name}</h1>
      <PenLine className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

function Card({ title, desc, children, footer }: { title: string; desc?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="space-y-4 p-4 sm:p-5">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
        </div>
        {children}
      </div>
      {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3 sm:px-5">{footer}</div>}
    </div>
  );
}

function StepConcept({ preset, p, onNext }: { preset: NonNullable<ReturnType<typeof presetById>>; p: Project; onNext: () => void }) {
  return (
    <Card
      title={preset.title}
      desc={preset.summary}
      footer={
        <>
          <Link href="/video" className={secondary}>Ganti konsep</Link>
          <button type="button" className={primary} onClick={onNext}>Lanjut <ArrowRight className="size-4" /></button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {preset.pipeline.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5 text-xs">
            {i > 0 && <ArrowRight className="size-3.5 text-muted-foreground" />}
            <span className="rounded-lg border bg-background px-2.5 py-1">{s}</span>
          </span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Alurnya: isi info produk + foto, pilih gaya, cek storyboard (gambar tiap adegan), lalu render klip dan gabung jadi satu video. Semua file tersimpan di folder proyek di perangkatmu.
      </p>
      {p.options.refVideo && (
        <div className="flex gap-3 rounded-lg border bg-background p-3">
          <video src={mediaUrl(p.options.refVideo)} controls preload="metadata" className="aspect-[9/16] w-32 shrink-0 rounded-md bg-black object-contain" />
          <div className="min-w-0 space-y-1 text-xs">
            <p className="font-semibold">Video referensi (terlaris di KaloData)</p>
            <p className="text-muted-foreground">{p.options.refCaption || "Tanpa caption"}</p>
            <p className="text-[11px] text-muted-foreground">4 frame dari video ini jadi referensi gaya di tiap adegan storyboard. Footage aslinya tidak dipakai di videomu.</p>
          </div>
        </div>
      )}
    </Card>
  );
}

function StepProduct({ p, busy, act, onNext }: { p: Project; busy: boolean; act: Act; onNext: () => void }) {
  // unsaved typing survives navigation; keyed by the saved version so stale drafts are ignored after a save
  const [draft, setDraft] = usePersistentState(`studio:${p.id}:product:${p.updatedAt}`, { name: p.product.name, details: p.product.details, price: p.product.price });
  const { name, details, price } = draft;
  const setName = (v: string) => setDraft((d) => ({ ...d, name: v }));
  const setDetails = (v: string) => setDraft((d) => ({ ...d, details: v }));
  const setPrice = (v: string) => setDraft((d) => ({ ...d, price: v }));
  const [picking, setPicking] = useState(false);
  const custom = !!presetById(p.presetId)?.custom;
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    const form = new FormData();
    for (const f of Array.from(files)) form.append("photos", f);
    act(() => uploadPhotos(p.id, form));
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Card
      title="Produk"
      desc={custom ? "Foto produk opsional: dipakai sebagai acuan saat AI membuat gambar. Lewati kalau semua adegan pakai gambarmu sendiri." : "Foto produk jadi acuan AI supaya bentuk dan warnanya sama persis."}
      footer={
        <button
          type="button"
          className={primary}
          disabled={busy || !name.trim() || (!custom && !p.product.photos.length)}
          onClick={() => act(async () => { await saveProject(p.id, { product: { name, details, price }, step: 3 }); onNext(); })}
        >
          Lanjut <ArrowRight className="size-4" />
        </button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">Nama produk</span>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="Contoh: Lipstik Matte Velvet 24 Jam" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">Detail singkat <span className="font-normal text-muted-foreground">(opsional)</span></span>
            <textarea className={input} rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} placeholder="Warna, bahan, keunggulan utama" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">Harga <span className="font-normal text-muted-foreground">(opsional)</span></span>
            <input className={input} value={price} onChange={(e) => setPrice(e.target.value)} maxLength={60} placeholder="Rp 49.000" />
          </label>
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-medium">Foto produk <span className="font-normal text-muted-foreground">(1–3, latar polos lebih bagus)</span></span>
          <div className="grid grid-cols-3 gap-2">
            {p.product.photos.map((rel) => (
              <div key={rel} className="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
                <img src={mediaUrl(rel)} alt="" onClick={() => openLightbox(p.product.photos.map((x, i) => ({ src: x, kind: "image" as const, label: `Foto produk ${i + 1}` })), p.product.photos.indexOf(rel))} className="size-full cursor-zoom-in object-cover" />
                <button
                  type="button"
                  aria-label="Hapus foto"
                  onClick={() => act(() => removePhoto(p.id, rel))}
                  className="absolute top-1 right-1 grid size-6 place-items-center rounded-md bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            {p.product.photos.length < 3 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-accent"
              >
                {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
                Tambah foto
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => upload(e.target.files)} />
          <button type="button" disabled={busy} onClick={() => setPicking(true)} className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border text-xs font-medium hover:bg-accent disabled:opacity-60">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Store className="size-3.5" />} Ambil dari Etalase (nama, harga &amp; foto otomatis)
          </button>
          <ShowcasePicker
            open={picking}
            onClose={() => setPicking(false)}
            onPick={(it, chosen) =>
              act(async () => {
                const t = toast.loading("Mengambil data & foto produk...");
                try {
                  const r = await pickShowcaseProduct(p.id, it.id, chosen);
                  setDraft({ name: r.name, details: r.details, price: r.price }); // the form holds its own draft
                  toast.success(`Produk dipasang · ${r.photos} foto dipakai`, { id: t });
                } catch (e) {
                  toast.dismiss(t);
                  throw e;
                }
              })
            }
          />
        </div>
      </div>
    </Card>
  );
}

function StepStyle({ p, busy, act, onDone, maxVideos }: { p: Project; busy: boolean; act: Act; onDone: () => void; maxVideos: number }) {
  const preset = presetById(p.presetId)!;
  const [options, setOptions] = useState(p.options);
  const [clipSec, setClipSec] = useState(p.clipSec);

  const build = async () => {
    if (p.scenes.length && !(await confirmDialog({ title: "Susun ulang storyboard?", description: "Adegan lama, termasuk gambar yang sudah dibuat, akan diganti dengan susunan baru.", confirmLabel: "Susun ulang" }))) return;
    act(async () => {
      await saveProject(p.id, { options, clipSec });
      await buildStoryboard(p.id);
      onDone();
    });
  };

  return (
    <Card
      title="Gaya"
      desc="Pilihan ini mengisi prompt tiap adegan. Semua masih bisa diedit di storyboard."
      footer={
        <>
          {p.scenes.length > 0 && (
            <button type="button" className={secondary} disabled={busy} onClick={() => act(async () => { await saveProject(p.id, { options, clipSec, step: 4 }); onDone(); })}>
              Simpan, pakai storyboard lama
            </button>
          )}
          <button type="button" className={primary} disabled={busy} onClick={build}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {p.scenes.length ? "Susun ulang storyboard" : "Susun storyboard"}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {preset.fields.map((f) => (
          <label key={f.key} className="block space-y-1.5">
            <span className="text-xs font-medium">{f.label}</span>
            {f.type === "select" ? (
              <select className={input} value={options[f.key] ?? f.default} onChange={(e) => setOptions({ ...options, [f.key]: e.target.value })}>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input className={input} value={options[f.key] ?? f.default} placeholder={f.placeholder} onChange={(e) => setOptions({ ...options, [f.key]: e.target.value })} />
            )}
          </label>
        ))}
        {presetById(p.presetId)?.custom ? (
          <div className="space-y-1.5">
            <span className="text-xs font-medium">Durasi per klip</span>
            <div className="flex w-fit rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Durasi per klip">
              {CLIP_SECS.map((s) => <button key={s} type="button" onClick={() => setClipSec(s)} className={seg(clipSec === s)}>{s} dtk</button>)}
            </div>
          </div>
        ) : (
          <>
          <div className="space-y-1.5">
            <span className="text-xs font-medium">Jumlah video</span>
            <div className="flex w-fit rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Jumlah video">
              {/* only as many as this PC can make at once */}
              {Array.from({ length: Math.min(MAX_VIDEOS, maxVideos) }, (_, i) => i + 1).map((n) => (
                <button key={n} type="button" role="radio" aria-checked={Math.min(Number(options.videos) || 1, maxVideos) === n} onClick={() => setOptions({ ...options, videos: String(n) })} className={seg(Math.min(Number(options.videos) || 1, maxVideos) === n)}>
                  {n} video
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {Math.min(Number(options.videos) || 1, maxVideos) > 1
                ? "Produk sama, tiap video beda angle kamera & pembahasan: 1 Unboxing · 2 Masalah → solusi · 3 Harga & promo · 4 Detail & kualitas."
                : "Satu video. Pilih lebih dari 1 untuk variasi angle & pembahasan."}
            </p>
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-medium">Durasi video</span>
            <div className="flex w-fit rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Durasi video">
              {VIDEO_SECS.map((s) => <button key={s} type="button" onClick={() => setClipSec(s)} className={seg(clipSec === s)}>{s} dtk</button>)}
            </div>
            <p className="text-[11px] text-muted-foreground">Panjang tiap video jadi: 1 gambar awal + 1 klip utuh tanpa potongan.</p>
          </div>
          </>
        )}
      </div>
    </Card>
  );
}

const mmss = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/** Current time, ticking every second while `active` (for live elapsed timers). */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

type Scene = Project["scenes"][number];

/** Scenes taking part in the latest run (they share its queuedAt). */
const runScenes = (scenes: Scene[]) => {
  const last = Math.max(0, ...scenes.map((s) => s.queuedAt ?? 0));
  return last ? scenes.filter((s) => s.queuedAt === last) : [];
};

function RunPanel({ p }: { p: Project }) {
  const now = useNow(true);
  const scenes = runScenes(p.scenes);
  const done = scenes.filter((s) => s.state === "done").length;
  const failed = scenes.filter((s) => s.state === "failed").length;
  const working = scenes.filter((s) => s.state === "working").length;
  const queued = scenes.filter((s) => s.state === "queued").length;
  const started = scenes[0]?.queuedAt;
  const pct = scenes.length ? Math.round(scenes.reduce((n, s) => n + (s.state === "done" || s.state === "failed" ? 100 : s.state === "working" ? s.pct ?? 0 : 0), 0) / scenes.length) : 0;
  return (
    <div className="space-y-2.5 rounded-xl border border-status-progress/40 bg-status-progress/10 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        <Loader2 className="size-4 shrink-0 animate-spin text-status-progress" />
        <span className="min-w-0 flex-1 truncate font-medium">{p.progress ?? "Memproses..."}</span>
        {started && <span className="font-mono text-xs tabular-nums text-muted-foreground">{mmss(now - started)}</span>}
      </div>
      {scenes.length > 0 && (
        <>
          <div className="h-1.5 overflow-hidden rounded-full bg-background/60">
            <div className="h-full rounded-full bg-status-progress transition-[width] duration-700" style={{ width: `${Math.max(pct, working ? 4 : 0)}%` }} />
          </div>
          <p className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
            <span><b className="text-foreground">{done}</b> selesai</span>
            <span><b className="text-foreground">{working}</b> dibuat bersamaan</span>
            {queued > 0 && <span><b className="text-foreground">{queued}</b> antre</span>}
            {failed > 0 && <span className="text-destructive">{failed} gagal</span>}
            <span className="ml-auto">Boleh tinggalkan halaman ini</span>
            <b className="font-mono tabular-nums text-foreground">{pct}%</b>
          </p>
        </>
      )}
    </div>
  );
}

/** Scene thumbnail with live state overlay (queued / working + timer / error). */
/** All finished media of a project's scenes, for the in-app viewer (← / → between scenes). */
function sceneGallery(scenes: Scene[], kind: "image" | "video"): LightboxItem[] {
  return scenes.flatMap((s, i) => {
    const src = kind === "video" ? s.clip ?? s.image : s.image;
    return src ? [{ src, kind: kind === "video" && s.clip ? ("video" as const) : ("image" as const), label: `${i + 1}. ${s.label}` }] : [];
  });
}

function SceneMedia({ scene, kind, running, scenes }: { scene?: Scene; kind: "image" | "video"; running: boolean; scenes?: Scene[] }) {
  const live = running && (scene?.state === "queued" || scene?.state === "working");
  const now = useNow(live && scene?.state === "working");
  const src = kind === "video" ? scene?.clip ?? scene?.image : scene?.image;
  const isVideo = kind === "video" && !!scene?.clip;
  const view = () => {
    if (!scenes || !src) return;
    const items = sceneGallery(scenes, kind);
    openLightbox(items, items.findIndex((x) => x.src === src));
  };
  return (
    <div className="group/media relative grid aspect-[9/16] place-items-center overflow-hidden rounded-lg bg-muted">
      {src ? (
        isVideo ? (
          <video src={mediaUrl(src)} controls preload="metadata" className="size-full object-cover" />
        ) : (
          <img src={mediaUrl(src)} alt="" onClick={scenes ? view : undefined} className={`size-full object-cover ${scenes ? "cursor-zoom-in" : ""}`} />
        )
      ) : live ? null : (
        <Images className="size-5 text-muted-foreground" />
      )}
      {src && scenes && !live && (
        <button type="button" onClick={view} aria-label="Lihat besar" title="Lihat besar" className="absolute top-1 right-1 grid size-6 place-items-center rounded-md bg-black/55 text-white opacity-0 transition-opacity group-hover/media:opacity-100 focus-visible:opacity-100">
          <Maximize2 className="size-3.5" />
        </button>
      )}
      {live && scene && (
        <div className={`absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2 text-center text-white ${src ? "bg-black/55" : "bg-black/35"}`}>
          {scene.state === "working" ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              <span className="font-mono text-xs tabular-nums">
                {scene.pct != null && <b>{scene.pct}% · </b>}
                {mmss(now - (scene.startedAt ?? now))}
              </span>
              {scene.pct != null && (
                <span className="h-1 w-3/4 overflow-hidden rounded-full bg-white/25">
                  <span className="block h-full rounded-full bg-white transition-[width] duration-700" style={{ width: `${scene.pct}%` }} />
                </span>
              )}
              <span className="line-clamp-3 text-[10px] leading-tight opacity-90">{scene.stage ?? "Sedang dibuat..."}</span>
            </>
          ) : (
            <>
              <Clock className="size-4 opacity-80" />
              <span className="text-[10px] opacity-90">Antre</span>
            </>
          )}
        </div>
      )}
      {!live && scene?.error && (kind === "image" || !scene.clip) && (
        <p title={scene.error} className="absolute inset-x-0 bottom-0 line-clamp-4 bg-destructive/90 p-1.5 text-[10px] leading-tight text-white">{shortError(scene.error)}</p>
      )}
    </div>
  );
}

function StepStoryboard({
  p, busy, act, ready, onNext, voice, voices, hasCartesia,
}: { p: Project; busy: boolean; act: Act; ready: boolean; onNext: () => void; voice: ProjectVoiceState; voices: VoiceOption[]; hasCartesia: boolean }) {
  const router = useRouter();
  const player = usePlayer();
  const silentConcept = !!presetById(p.presetId)?.silent;
  const custom = !!presetById(p.presetId)?.custom;
  const [scenes, setScenes] = usePersistentState(
    `studio:${p.id}:scenes:${p.updatedAt}`,
    p.scenes.map(({ label, imagePrompt, motionPrompt }) => ({ label, imagePrompt, motionPrompt })),
  );
  const [picking, setPicking] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<number | null>(null);
  const dirty = scenes.some((s, i) => s.label !== p.scenes[i]?.label || s.imagePrompt !== p.scenes[i]?.imagePrompt || s.motionPrompt !== p.scenes[i]?.motionPrompt);
  const edit = (i: number, k: "label" | "imagePrompt" | "motionPrompt", v: string) => setScenes(scenes.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  // structural changes (add/move/remove/upload) save typed text first so nothing is lost
  const saveThen = (fn: () => Promise<unknown>, ok?: string) => act(async () => { if (dirty) await saveProject(p.id, { scenes }); await fn(); }, ok);
  // which AI rewrite is running ("all" or a scene index) — Gemini takes ~15 s
  const [writing, setWriting] = useState<"all" | number | null>(null);
  const aiWrite = (index?: number) => {
    setWriting(index ?? "all");
    saveThen(async () => {
      try {
        await aiWriteScenes(p.id, index);
      } finally {
        setWriting(null);
      }
    }, index != null ? "Prompt adegan ditulis ulang AI" : "Semua prompt ditulis ulang AI");
  };

  const upload = (files: FileList | null) => {
    const i = uploadFor.current;
    if (!files?.[0] || i == null) return;
    const form = new FormData();
    form.append("image", files[0]);
    saveThen(() => uploadSceneImage(p.id, i, form), "Gambar dipasang");
    if (fileRef.current) fileRef.current.value = "";
  };

  if (!p.scenes.length) {
    return <Card title="Storyboard" desc="Belum ada adegan. Pilih gaya lalu susun storyboard dulu."><p className="text-xs text-muted-foreground">Kembali ke langkah Gaya.</p></Card>;
  }
  const aiTodo = p.scenes.filter((s) => !(s.own && s.image));
  const missing = p.scenes.filter((s) => !s.image).length;
  const tiny = "flex h-7 items-center justify-center gap-1 rounded-md border text-[11px] font-medium hover:bg-accent disabled:opacity-50";

  return (
    <Card
      title="Storyboard"
      desc={custom
        ? "Racik tiap adegan: tulis prompt sendiri, pasang gambarmu, atau minta AI membuatkan. Atur urutannya sesukamu."
        : "Cek gambar tiap adegan sebelum dirender. Mau beda? Ubah prompt, pasang gambarmu sendiri, atau tambah adegan."}
      footer={
        <>
          {dirty && <button type="button" className={secondary} disabled={busy} onClick={() => act(() => saveProject(p.id, { scenes }), "Tersimpan")}>Simpan perubahan</button>}
          <button type="button" className={secondary} disabled={busy} onClick={() => aiWrite()} title="Gemini menulis ulang semua prompt: lebih detail, realistis, tidak terlihat AI">
            {writing === "all" ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} {writing === "all" ? "AI menulis..." : "Tulis prompt dengan AI"}
          </button>
          {aiTodo.length > 0 && (
            <button type="button" className={secondary} disabled={busy} onClick={() => saveThen(() => generateImages(p.id))}>
              <Sparkles className="size-4" /> {missing === p.scenes.length ? "Buat semua gambar (AI)" : `Buat ulang ${aiTodo.length} gambar AI`}
            </button>
          )}
          <button type="button" className={primary} disabled={busy || !ready || dirty} onClick={onNext} title={!ready ? "Semua adegan perlu gambar" : undefined}>
            Lanjut ke render <ArrowRight className="size-4" />
          </button>
        </>
      }
    >
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files)} />
      <VoicePanel
        projectId={p.id}
        state={voice}
        voices={voices}
        hasKey={hasCartesia}
        disabled={busy}
        locked={silentConcept ? "Konsep ini tanpa suara (video disinkronkan ke musik di CapCut)." : null}
        onSaved={() => router.refresh()}
      />
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {scenes.map((s, i) => {
          const server = p.scenes[i];
          return (
            <div key={i} className="flex gap-3 rounded-lg border bg-background p-3">
              <div className="w-28 shrink-0 space-y-1.5">
                <div className="relative">
                  <SceneMedia scene={server} kind="image" running={p.status === "running"} scenes={p.scenes} />
                  {server?.own && server.image && <span className="absolute top-1 left-1 rounded bg-black/65 px-1.5 py-px text-[9px] font-medium text-white">Gambarmu</span>}
                  {server?.styleRef && (
                    <button type="button" onClick={() => openLightbox([{ src: server.styleRef!, kind: "image", label: "Referensi gaya (dari video terlaris)" }])} title="Referensi gaya (dari video terlaris): AI meniru angle & cahayanya" className="absolute right-1 bottom-1 overflow-hidden rounded-md border-2 border-white/80 shadow">
                      <img src={mediaUrl(server.styleRef)} alt="Referensi gaya" className="h-12 w-8 object-cover" />
                    </button>
                  )}
                </div>
                <button type="button" disabled={busy || !s.imagePrompt.trim()} title={!s.imagePrompt.trim() ? "Tulis prompt gambar dulu" : undefined} onClick={() => saveThen(() => generateImages(p.id, i))} className={`${tiny} w-full`}>
                  <Sparkles className="size-3" /> {server?.image && !server.own ? "Buat ulang AI" : "Buat dengan AI"}
                </button>
                <button type="button" disabled={busy} onClick={() => { uploadFor.current = i; fileRef.current?.click(); }} className={`${tiny} w-full`}>
                  <Upload className="size-3" /> Unggah gambar
                </button>
                <button type="button" disabled={busy} onClick={() => setPicking(i)} className={`${tiny} w-full`}>
                  <Library className="size-3" /> Dari Pustaka
                </button>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">{i + 1}.</span>
                  <input
                    value={s.label}
                    maxLength={60}
                    disabled={busy}
                    onChange={(e) => edit(i, "label", e.target.value)}
                    aria-label="Nama adegan"
                    className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-xs font-semibold outline-none hover:bg-accent focus:bg-accent"
                  />
                  <button
                    type="button"
                    aria-label="Tulis prompt adegan ini dengan AI"
                    title="Tulis ulang prompt adegan ini dengan AI"
                    disabled={busy}
                    onClick={() => aiWrite(i)}
                    className="grid size-6 place-items-center rounded-md text-[#a99bff] hover:bg-accent disabled:opacity-30"
                  >
                    {writing === i ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                  </button>
                  <button type="button" aria-label="Geser ke atas" disabled={busy || i === 0} onClick={() => saveThen(() => moveScene(p.id, i, -1))} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                  <button type="button" aria-label="Geser ke bawah" disabled={busy || i === scenes.length - 1} onClick={() => saveThen(() => moveScene(p.id, i, 1))} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
                  <button
                    type="button"
                    aria-label="Hapus adegan"
                    disabled={busy || scenes.length <= 1}
                    onClick={async () => (await confirmDialog({ title: `Hapus adegan "${s.label}"?`, description: "Gambar dan klip adegan ini dilepas dari proyek.", danger: true })) && saveThen(() => removeScene(p.id, i))}
                    className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-30"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <label className="block space-y-1">
                  <span className="text-[11px] text-muted-foreground">Prompt gambar {server?.own && server.image ? "(tidak dipakai, sudah ada gambarmu)" : ""}</span>
                  <textarea
                    className={`${input} text-xs`}
                    rows={4}
                    disabled={busy}
                    value={s.imagePrompt}
                    placeholder="Gambarkan adegannya: siapa, memegang apa, di mana, cahaya seperti apa. Contoh: tangan wanita memegang botol serum di meja marmer, cahaya pagi, foto vertikal realistis"
                    onChange={(e) => edit(i, "imagePrompt", e.target.value)}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] text-muted-foreground">Prompt gerak (untuk video)</span>
                  <textarea
                    className={`${input} text-xs`}
                    rows={3}
                    disabled={busy}
                    value={s.motionPrompt}
                    placeholder='Apa yang bergerak? Contoh: tangan memutar botol pelan, kamera mendekat, suara: "Serum ini bikin glowing!"'
                    onChange={(e) => edit(i, "motionPrompt", e.target.value)}
                  />
                </label>
                {!silentConcept && <SceneVoiceLine line={voiceLine(s.motionPrompt)} state={voice} hasKey={hasCartesia} player={player} />}
              </div>
            </div>
          );
        })}
        <button
          type="button"
          disabled={busy || scenes.length >= 12}
          onClick={() => saveThen(() => addScene(p.id), "Adegan ditambah")}
          className="flex min-h-40 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-xs text-muted-foreground transition-colors hover:border-ring/40 hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <Plus className="size-5" /> Tambah adegan
          <span className="text-[11px]">{scenes.length}/12 adegan</span>
        </button>
      </div>
      <LibraryPicker
        open={picking != null}
        onClose={() => setPicking(null)}
        title="Pilih gambar untuk adegan"
        onPick={(rel) => {
          const i = picking;
          if (i != null) saveThen(() => pickFromLibrary(p.id, rel, { kind: "scene", index: i }), "Gambar dipasang");
        }}
      />
    </Card>
  );
}

function StepRender({ p, busy, act, ready, onBack, voiceLabel }: { p: Project; busy: boolean; act: Act; ready: boolean; onBack: () => void; voiceLabel: string }) {
  const preset = presetById(p.presetId)!;
  const doneClips = p.scenes.filter((s) => s.clip).length;
  return (
    <Card
      title="Render"
      desc={`${p.scenes.length === 1 ? `1 klip utuh · video ${p.clipSec} dtk` : `${p.scenes.length} klip × ${p.clipSec} dtk ≈ ${p.scenes.length * p.clipSec} dtk`}${isSilent(p.presetId, p.options) ? ", tanpa suara (sinkronkan ke beat di CapCut)" : `, suara: ${voiceLabel}`}. Klip yang sudah jadi tidak dibuat ulang.`}
      footer={
        <>
          <button type="button" className={secondary} onClick={onBack}><ArrowLeft className="size-4" /> Storyboard</button>
          <button type="button" className={primary} disabled={busy || !ready} onClick={() => act(() => renderProject(p.id), "Render masuk antrean")}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Clapperboard className="size-4" />} {doneClips ? "Lanjutkan render" : "Render video"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
        {p.scenes.map((s, i) => (
          <div key={i} className="space-y-1.5">
            <SceneMedia scene={s} kind="video" running={p.status === "running"} scenes={p.scenes} />
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {s.clip ? <Check className="size-3 text-status-ok" /> : <span className="size-3" />}
              {i + 1}. {s.label}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StepResult({ p }: { p: Project }) {
  if (isVideosMode(p.options)) return <VideosResult p={p} />;
  if (!p.finalPath) {
    return <Card title="Hasil" desc="Video belum dirender."><p className="text-xs text-muted-foreground">Selesaikan langkah Render dulu.</p></Card>;
  }
  return <TimelineEditor p={p} />;
}

/** "videos" mode result: every variant is its own finished video (same product, different angle & talk). */
function VideosResult({ p }: { p: Project }) {
  const [posting, setPosting] = useState<PostVideo[] | null>(null);
  const done = p.scenes.map((s, i) => ({ s, i, file: videoFile(p.folder, i) })).filter((x) => x.s.clip);
  if (!done.length) {
    return <Card title="Hasil" desc="Video belum dirender."><p className="text-xs text-muted-foreground">Selesaikan langkah Render dulu.</p></Card>;
  }
  const items: LightboxItem[] = done.map((x) => ({ src: x.file, kind: "video", label: x.s.label }));
  const toPost = (x: (typeof done)[number]): PostVideo => ({ video: x.file, label: x.s.label, projectId: p.id, caption: p.caption ?? "", productId: p.options.productId ?? null });
  return (
    <Card
      title={`Hasil · ${done.length} video`}
      footer={
        <button type="button" onClick={() => setPosting(done.map(toPost))} className={primary}>
          <Send className="size-4" /> Posting {done.length > 1 ? `semua (${done.length})` : "ke TikTok"}
        </button>
      }
      desc={`${p.clipSec} dtk per video. Produk sama, beda angle & pembahasan: siap diunggah terpisah.${done.length < p.scenes.length ? ` ${p.scenes.length - done.length} video belum jadi, render lagi untuk melanjutkan.` : ""}`}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {done.map((x, k) => (
          <div key={x.file} className="space-y-1.5">
            <div className="group relative aspect-[9/16] overflow-hidden rounded-xl border bg-black">
              <video src={`${mediaUrl(x.file)}#t=0.5`} controls preload="metadata" className="size-full object-contain" />
              <button type="button" onClick={() => openLightbox(items, k)} aria-label="Lihat besar" className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-md bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100">
                <Maximize2 className="size-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <p className="min-w-0 flex-1 truncate text-xs font-medium" title={x.s.label}>{x.s.label}</p>
              <button type="button" onClick={() => setPosting([toPost(x)])} aria-label="Posting video ini" title="Posting ke TikTok" className="grid size-7 place-items-center rounded-md border hover:bg-accent">
                <Send className="size-3.5" />
              </button>
              <a href={`${mediaUrl(x.file)}?download`} download className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium hover:bg-accent">
                <Download className="size-3.5" /> Unduh
              </a>
            </div>
          </div>
        ))}
      </div>
      <PostDialog videos={posting} onClose={() => setPosting(null)} />
    </Card>
  );
}
