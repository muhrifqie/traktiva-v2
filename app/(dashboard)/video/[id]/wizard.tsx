"use client";

import { AccountAvatar } from "@/components/account-avatar";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown, ArrowLeft, ArrowUp, Check, CheckCircle2, CircleAlert, Crown, Film, Flame, Image as ImageIcon, Link2, ListChecks, Maximize2, Mic, Clapperboard, Clock, FolderOpen, ImagePlus, Images, Library, Loader2, Minus, PenLine, Plus, Save, SlidersHorizontal, Sparkles, Timer, Trash2, Upload, UserRound, Wand2, X, Zap, AlignLeft, BookOpen, LayoutGrid, MonitorPlay, Move, Package, ScanEye, Smartphone, Tag, Trophy, VolumeX, Wallet, Database, Store, ClipboardPaste, Layers, FileText, PackageOpen, Rocket, Scale, Search, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import type { VideoProject } from "@/lib/db/schema";
import { mediaUrl } from "@/lib/media-url";
import { CLIP_SECS, EXPLAIN, type ExplainKey, isSilent, PRESETS, PRO_CLIP_SEC, presetById, projectName, suggestFromRef, VERSIONS } from "@/lib/presets";
import {
  addScene, aiOutline, aiWriteScenes, applyShowcaseProduct, etalasePhotos, listEtalase, buildStoryboard, makeVersions, previewScript, quickMake, setSceneLine, deleteProject, generateImages, moveScene, openProjectFolder, pickFromLibrary, removePhoto, removeScene,
  renameProject, renderProject, saveProject, uploadPhotos, uploadSceneImage,
  applyProductPhoto,
} from "../project-actions";
import { LibraryPicker } from "@/components/library-picker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePersistentState } from "@/lib/use-persistent-state";
import { TimelineEditor } from "./editor";
import { QuickResult } from "./quick-result";
import { openLightbox, type LightboxItem } from "@/components/media-lightbox";
import { voiceLine } from "@/lib/voice";
import { SceneVoiceLine, usePlayer, VoicePanel, type ProjectVoiceState, type VoiceOption } from "./voice-panel";

type Project = Omit<VideoProject, "updatedAt"> & { updatedAt: number };

type Icon = React.ComponentType<{ className?: string }>;
// 3 steps on screen; the DB keeps the old 1–6 numbers (runners write 4/5/6), mapped here
const STEPS: { label: string; icon: Icon }[] = [
  { label: "Siapkan", icon: Package },
  { label: "Adegan", icon: LayoutGrid },
  { label: "Hasil", icon: Film },
];
const viewOf = (dbStep: number) => (dbStep <= 3 ? 1 : dbStep <= 5 ? 2 : 3);
const DB_STEP = [0, 1, 4, 6];
// Flow (Omni 1.2 Flash) video resolutions; 720p is the default (exported at 1080p either way)
const RESOLUTIONS = [
  { id: "360p", label: "360p", hint: "Lebih ringan, hasil di TikTok kurang tajam" },
  { id: "720p", label: "720p", hint: "Disarankan · di-export 1080p, tajam di TikTok" },
] as const;
// Gaya → "Video Pendek" / "Video Panjang": each tab has its own quick picks, scene range and clip lengths
const FORMATS = {
  short: {
    label: "Video Pendek", icon: Smartphone, desc: "1 klip langsung jadi video", min: 1, max: 1, secHint: "1 klip: 8–10 dtk paling pas",
    lengths: [
      { id: "s8", label: "Kilat", clips: 1, sec: 8, hint: "1 klip, paling cepat", icon: Zap },
      { id: "s10", label: "Sekali jadi", clips: 1, sec: 10, hint: "1 klip, hook + manfaat + ajakan", icon: Flame, best: true },
    ],
  },
  long: {
    label: "Video Panjang", icon: MonitorPlay, desc: "1–2 menit · penjelasan lengkap & advanced", min: 6, max: 12, secHint: "10 dtk pas untuk video panjang",
    lengths: [
      { id: "l60", label: "1 menit", clips: 6, sec: 10, hint: "6 bab", icon: Flame, best: true },
      { id: "l90", label: "1,5 menit", clips: 9, sec: 10, hint: "9 bab", icon: ListChecks },
      { id: "l120", label: "2 menit", clips: 12, sec: 10, hint: "12 bab", icon: BookOpen },
    ],
  },
} as const;
const EXPLAIN_ICONS: Record<ExplainKey, Icon> = { tutorial: BookOpen, compare: Scale, deep: Search, unbox: PackageOpen };
const FIELD_ICONS: Record<string, React.ComponentType<{ className?: string }>> = { background: ImageIcon, model: UserRound, voice: Mic };
const chip = (on: boolean) =>
  `flex h-8 items-center justify-center rounded-md text-xs font-medium transition-colors ${on ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-background hover:text-foreground"}`;
const pick = (on: boolean) => `relative rounded-lg border p-2.5 text-left transition-colors ${on ? "border-primary bg-primary/10 ring-1 ring-primary/40" : "bg-background hover:border-foreground/20 hover:bg-accent"}`;
/** Section heading used in every Studio step: icon tile, optional number, title, hint on the right. */
function SectionTitle({ n, icon: Icon, title, hint }: { n?: number; icon: Icon; title: string; hint?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-6 place-items-center rounded-md bg-muted text-black dark:text-white"><Icon className="size-3.5" /></span>
      <h3 className="text-[13px] font-semibold">{n != null && <span className="text-muted-foreground">{n}.</span>} {title}</h3>
      {hint && <span className="ml-auto text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}
/** Field label with a small icon (Studio forms). */
function FieldLabel({ icon: Icon, children, note }: { icon: Icon; children: React.ReactNode; note?: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="size-3.5" /> <span className="font-medium text-foreground/90">{children}</span>{note && <span className="text-[11px]">({note})</span>}
    </span>
  );
}
/** Empty step: what is missing and one button to fix it. */
function Empty({ icon: Icon, title, desc, action }: { icon: Icon; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-muted"><Icon className="size-5 text-muted-foreground" /></span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{desc}</p>
      {action}
    </div>
  );
}
const Stat = ({ icon: Icon, label, value }: { icon: Icon; label: string; value: React.ReactNode }) => (
  <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
    <Icon className="size-4 shrink-0 text-brand-light" />
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="truncate text-xs font-semibold">{value}</p>
    </div>
  </div>
);

const input = "w-full rounded-lg border bg-background px-3 py-2 text-[13px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-60";
const btn = "flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-[13px] font-medium disabled:opacity-60";
const primary = `${btn} bg-primary text-primary-foreground hover:bg-primary/90`;
const secondary = `${btn} border bg-background hover:bg-accent`;

export type FamilyItem = { id: number; key: string; status: string; progress: string | null; error: string | null; ready: boolean; images: number; clips: number; scenes: number; cover: string | null };

export function Wizard({
  project: p, hasGoogle, voice, voices, hasCartesia, family = [],
}: { project: Project; hasGoogle: boolean; voice: ProjectVoiceState; voices: VoiceOption[]; hasCartesia: boolean; family?: FamilyItem[] }) {
  const voiceLabel = voice.choice === "cartesia" ? `Cartesia · ${voice.voiceName ?? "suara pilihan"}` : voice.choice === "off" ? "tanpa suara" : "Bawaan Flow";
  const router = useRouter();
  const preset = presetById(p.presetId)!;
  const running = p.status === "running";
  const [step, setStep] = useState(viewOf(p.step));
  const [busy, start] = useTransition();

  // Poll while this video or one of its versions runs; images/clips appear one by one.
  const familyRunning = family.some((f) => f.status === "running");
  useEffect(() => {
    if (!running && !familyRunning) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [running, familyRunning, router]);

  // The runner jumps to "Hasil" when the final video is ready.
  const prevStatus = useRef(p.status);
  useEffect(() => {
    if (prevStatus.current === "running" && p.status === "done" && p.step >= 6) setStep(3);
    prevStatus.current = p.status;
  }, [p.status, p.step]);

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
    void saveProject(p.id, { step: DB_STEP[n] });
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
        {STEPS.map(({ label, icon: I }, i) => {
          const n = i + 1;
          const done = n < step;
          return (
            <button
              key={label}
              type="button"
              onClick={() => go(n)}
              aria-current={n === step ? "step" : undefined}
              className={`flex min-w-fit flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${n === step ? "bg-primary/10 text-brand-light" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
            >
              <span className={`grid size-6 place-items-center rounded-full ${n === step ? "bg-primary text-primary-foreground" : done ? "bg-status-ok/15 text-status-ok" : "bg-muted"}`}>
                {done ? <Check className="size-3.5" /> : <I className="size-3.5" />}
              </span>
              <span><span className="hidden text-[10px] opacity-60 sm:inline">{n}. </span>{label}</span>
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
          <CircleAlert className="size-4 shrink-0 text-status-progress" /> Tambahkan akun Google di Pengaturan supaya bisa membuat gambar & video.
        </Link>
      )}

      <section className="flex-1">
        {step === 1 && (
          <div className="space-y-4">
            <StepProduct key={p.options.showcaseId ?? ""} p={p} act={act} busy={busy} />
            {/* keyed by the saved style, not updatedAt: saving the product must not reset unsaved style choices */}
            <StepStyle key={`${p.presetId}|${JSON.stringify(p.options)}|${p.clipSec}`} p={p} busy={busy || running} act={act} onDone={() => setStep(2)} />
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            {family.length > 1 && <FamilyPanel family={family} current={p.id} busy={busy} act={act} />}
            {p.options.format !== "long" && p.scenes.length === 1 ? (
              <ShortScene key={p.updatedAt} p={p} busy={busy || running} act={act} onResult={() => go(3)} voice={voice} voices={voices} hasCartesia={hasCartesia} />
            ) : (<>
            <StepStoryboard key={p.updatedAt} p={p} busy={busy || running} act={act} ready={scenesReady} onNext={() => document.getElementById("render")?.scrollIntoView({ behavior: "smooth" })} onBack={() => go(1)} voice={voice} voices={voices} hasCartesia={hasCartesia} />
            {p.scenes.length > 0 && <StepRender p={p} busy={busy || running} act={act} ready={scenesReady} onBack={() => window.scrollTo({ top: 0, behavior: "smooth" })} voiceLabel={voiceLabel} />}
            </>)}
          </div>
        )}
        {step === 3 && <StepResult p={p} onBack={() => go(2)} />}
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

function Card({ title, desc, icon: Icon, children, footer }: { title: string; desc?: string; icon: Icon; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="space-y-5 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-black dark:text-white"><Icon className="size-4.5" /></span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
          </div>
        </div>
        {children}
      </div>
      {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3 sm:px-5">{footer}</div>}
    </div>
  );
}

function StepProduct({ p, busy, act }: { p: Project; busy: boolean; act: Act }) {
  // unsaved typing survives navigation; a new product source (Etalase) starts a fresh draft from the saved product
  const [draft, setDraft] = usePersistentState(`studio:${p.id}:product:${p.options.showcaseId ?? ""}`, { name: p.product.name, details: p.product.details, price: p.product.price, look: p.product.look ?? "" });
  const { name, details, price } = draft;
  const look = draft.look ?? "";
  const setLook = (v: string) => setDraft((d) => ({ ...d, look: v }));
  const setName = (v: string) => setDraft((d) => ({ ...d, name: v }));
  const setDetails = (v: string) => setDraft((d) => ({ ...d, details: v }));
  const setPrice = (v: string) => setDraft((d) => ({ ...d, price: v }));
  const custom = !!presetById(p.presetId)?.custom;
  const fileRef = useRef<HTMLInputElement>(null);

  // saved when a field loses focus, so the buttons below always use what was typed
  const saveDraft = () => {
    const look2 = look.trim() || null;
    if (name === p.product.name && details === p.product.details && price === p.product.price && look2 === (p.product.look ?? null)) return;
    act(() => saveProject(p.id, { product: { name, details, price, look: look2 } }));
  };
  const [more, setMore] = useState(!!look);
  const [etalase, setEtalase] = useState(false);
  const room = 3 - p.product.photos.length;
  // new photos are added after the existing ones (max 3 in total)
  const addFiles = (files: File[], ok?: string) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    if (room <= 0) return void toast.error("Sudah 3 foto. Hapus satu dulu untuk menambah.");
    const form = new FormData();
    for (const f of imgs.slice(0, room)) form.append("photos", f);
    act(() => uploadPhotos(p.id, form), ok);
  };
  const upload = (files: FileList | null) => {
    if (files?.length) addFiles(Array.from(files));
    if (fileRef.current) fileRef.current.value = "";
  };
  /** "Tempel foto": read an image from the clipboard (screenshot, copied image from a browser or chat). */
  const pasteClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const it of items) {
        const type = it.types.find((t) => /^image\/(png|jpeg|webp)$/.test(t)) ?? it.types.find((t) => t.startsWith("image/"));
        if (type) files.push(new File([await it.getType(type)], `tempel-${Date.now()}.${type.split("/")[1]}`, { type: type === "image/png" || type === "image/jpeg" || type === "image/webp" ? type : "image/png" }));
      }
      if (!files.length) return void toast.error("Clipboard tidak berisi gambar. Salin gambarnya dulu (klik kanan → Salin gambar).");
      addFiles(files, "Foto ditempel");
    } catch {
      toast.error("Clipboard tidak bisa dibaca. Coba tekan Ctrl+V di halaman ini.");
    }
  };
  // Ctrl+V anywhere on the page (outside text fields) adds a copied image too
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      addFiles(files, "Foto ditempel");
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  return (
    <Card icon={Package} title="1. Produk">
      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <section className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_130px]">
            <label className="block space-y-1.5">
              <FieldLabel icon={Tag}>Nama produk</FieldLabel>
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} onBlur={saveDraft} maxLength={200} placeholder="Contoh: Lipstik Matte Velvet" />
            </label>
            <label className="block space-y-1.5">
              <FieldLabel icon={Wallet} note="opsional">Harga</FieldLabel>
              <input className={input} value={price} onChange={(e) => setPrice(e.target.value)} onBlur={saveDraft} maxLength={60} placeholder="Rp 49.000" />
            </label>
          </div>
          <label className="block space-y-1.5">
            <FieldLabel icon={AlignLeft} note="opsional">Keunggulan</FieldLabel>
            <textarea className={input} rows={2} value={details} onChange={(e) => setDetails(e.target.value)} onBlur={saveDraft} maxLength={1000} placeholder="Warna, bahan, kelebihan utama" />
          </label>
          {more ? (
            <label className="block space-y-1.5">
              <FieldLabel icon={ScanEye} note="diisi AI dari foto">Tampilan produk</FieldLabel>
              <textarea className={input} rows={2} value={look} onChange={(e) => setLook(e.target.value)} onBlur={saveDraft} maxLength={900} placeholder="Bentuk, warna, tutup, posisi logo" />
            </label>
          ) : (
            <button type="button" onClick={() => setMore(true)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><Plus className="size-3" /> Koreksi tampilan produk (opsional)</button>
          )}
        </section>
        <section className="space-y-2">
          <FieldLabel icon={ImagePlus} note={`${p.product.photos.length}/3`}>Foto produk</FieldLabel>
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
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" disabled={busy} onClick={() => setEtalase(true)} className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 text-xs font-medium text-brand-light hover:bg-primary/15 disabled:opacity-60" title="Isi nama, harga, keunggulan, dan foto dari produk etalase TikTok">
              <Store className="size-3.5" /> Dari Etalase
            </button>
            <button type="button" disabled={busy || room <= 0} onClick={() => void pasteClipboard()} className="flex h-8 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium hover:bg-accent disabled:opacity-60" title="Tempel gambar dari clipboard (atau tekan Ctrl+V)">
              <ClipboardPaste className="size-3.5" /> Tempel foto
            </button>
          </div>
          {!custom && !p.product.photos.length && <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400"><CircleAlert className="mt-px size-3.5 shrink-0" /> Tambahkan minimal 1 foto supaya bisa lanjut.</p>}
          {p.options.showcaseId && <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Database className="size-3" /> Detail lengkap produk dari Etalase dipakai AI</p>}
          <EtalasePicker open={etalase} onClose={() => setEtalase(false)} onPick={(sid, photos) => act(async () => { const r = await applyShowcaseProduct(p.id, sid, photos); toast.success(`Produk terisi dari Etalase · ${r.photos} foto`); })} />
        </section>
      </div>
      {busy && <span className="sr-only">Menyimpan</span>}
    </Card>
  );
}

/** Every final video of this product (A = main, B–E = versions): status and progress at a glance, one click to open. */
function FamilyPanel({ family, current, busy, act }: { family: FamilyItem[]; current: number; busy: boolean; act: Act }) {
  const done = family.filter((f) => f.ready).length;
  const waiting = family.filter((f) => !f.ready && f.status !== "running");
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Layers className="size-4 text-brand-light" />
        <p className="text-[13px] font-semibold">{family.length} video final</p>
        <span className="text-xs text-muted-foreground">{done}/{family.length} siap pakai</span>
        <div className="ml-auto h-1.5 w-32 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-status-ok transition-all" style={{ width: `${(done / family.length) * 100}%` }} /></div>
        {waiting.length > 0 && (
          <button type="button" disabled={busy} onClick={() => act(async () => { await quickMake(family[0].id); }, `${waiting.length} video mulai dibuat`)} className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            <Rocket className="size-3.5" /> Jalankan {waiting.length} sisanya
          </button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {family.map((f) => {
          const state = f.ready ? "ok" : f.status === "running" ? "run" : f.status === "failed" ? "fail" : "idle";
          const pct = f.scenes ? Math.round(((f.images + f.clips) / (f.scenes * 2)) * 100) : 0;
          return (
            <Link key={f.id} href={`/video/${f.id}`} className={`flex items-center gap-2.5 rounded-lg border p-2 transition-colors hover:bg-accent ${f.id === current ? "border-primary/60 bg-primary/5" : "bg-background"}`}>
              <div className="relative size-11 shrink-0 overflow-hidden rounded-md bg-muted">
                {f.cover && <img src={mediaUrl(f.cover)} alt="" className="size-full object-cover" />}
                <span className="absolute top-0.5 left-0.5 rounded bg-black/70 px-1 text-[10px] font-bold text-white">{f.key}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className={`flex items-center gap-1 text-xs font-medium ${state === "ok" ? "text-status-ok" : state === "fail" ? "text-destructive" : ""}`}>
                  {state === "ok" ? <CheckCircle2 className="size-3.5" /> : state === "run" ? <Loader2 className="size-3.5 animate-spin text-brand-light" /> : state === "fail" ? <CircleAlert className="size-3.5" /> : <Clock className="size-3.5 text-muted-foreground" />}
                  {state === "ok" ? "Siap pakai" : state === "run" ? "Dibuat" : state === "fail" ? "Gagal" : "Belum jalan"}
                  {f.id === current && <span className="ml-auto text-[10px] font-normal text-muted-foreground">dibuka</span>}
                </p>
                <p className="truncate text-[11px] text-muted-foreground" title={f.error ?? f.progress ?? ""}>{state === "fail" ? f.error : state === "run" ? f.progress : state === "ok" ? "Buka untuk export" : `${f.images}/${f.scenes} gambar`}</p>
                {state === "run" && <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(4, pct)}%` }} /></div>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

type EtalaseItem = Awaited<ReturnType<typeof listEtalase>>[number];

/** Pick a product from the TikTok showcase: first the account (each has its own etalase; skipped with one account), then the product; its full page fills the project's product. */
function EtalasePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (showcaseId: number, photos: string[]) => void }) {
  const [items, setItems] = useState<EtalaseItem[] | null>(null);
  const [q, setQ] = useState("");
  const [acct, setAcct] = useState<number | null>(null); // step 1: whose etalase
  // step 2: the chosen product's photos (max 3 selected)
  const [chosen, setChosen] = useState<{ id: number; title: string; photos: string[] | null; error?: string } | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const choose = (x: EtalaseItem) => {
    setChosen({ id: x.id, title: x.title, photos: null });
    setSel([]);
    etalasePhotos(x.id).then(
      (r) => {
        setChosen((c) => (c?.id === x.id ? { ...c, photos: r.photos } : c));
        setSel(r.photos.slice(0, 3));
      },
      (e) => setChosen((c) => (c?.id === x.id ? { ...c, photos: [], error: e instanceof Error ? e.message : "Gagal mengambil foto" } : c)),
    );
  };
  const toggle = (src: string) => setSel((s) => (s.includes(src) ? s.filter((x) => x !== src) : s.length >= 3 ? s : [...s, src]));
  const close = () => {
    setChosen(null);
    onClose();
  };
  useEffect(() => {
    if (!open) return;
    let live = true;
    void listEtalase().then((r) => live && setItems(r), () => live && setItems([]));
    return () => {
      live = false;
    };
  }, [open]);
  const accts = [...new Map((items ?? []).map((x) => [x.accountId, { id: x.accountId, username: x.username, displayName: x.displayName, avatarUrl: x.avatarUrl, status: x.status, platform: "tiktok" as const }])).values()];
  const count = (id: number) => (items ?? []).filter((x) => x.accountId === id).length;
  const current = accts.length === 1 ? accts[0] : accts.find((a) => a.id === acct);
  const k = q.trim().toLowerCase();
  const shown = (items ?? []).filter((x) => x.accountId === current?.id && (!k || x.title.toLowerCase().includes(k)));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-2xl">
        {chosen ? (
          <>
            <DialogHeader>
              <DialogTitle>Pilih foto produk</DialogTitle>
              <DialogDescription className="line-clamp-1">{chosen.title}</DialogDescription>
            </DialogHeader>
            {chosen.error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">{chosen.error}</p>}
            <div className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {chosen.photos == null && [0, 1, 2, 3].map((i) => <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />)}
              {chosen.photos?.map((src) => {
                const n = sel.indexOf(src);
                const full = n < 0 && sel.length >= 3;
                return (
                  <button key={src} type="button" onClick={() => toggle(src)} disabled={full} aria-pressed={n >= 0}
                    className={`relative aspect-square overflow-hidden rounded-lg border-2 transition ${n >= 0 ? "border-primary" : "border-transparent"} ${full ? "opacity-40" : "hover:opacity-90"}`}>
                    <img src={mediaUrl(src)} alt="" className="size-full object-cover" />
                    <span className={`absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full text-xs font-bold ${n >= 0 ? "bg-primary text-primary-foreground" : "bg-black/50 text-white ring-1 ring-white/70"}`}>{n >= 0 ? n + 1 : ""}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setChosen(null)} className="flex h-9 items-center gap-1.5 rounded-lg border bg-background px-3 text-[13px] font-medium hover:bg-accent"><ArrowLeft className="size-4" /> Produk lain</button>
              <span className="mr-auto text-xs text-muted-foreground">{chosen.photos == null ? "Mengambil foto dari TikTok..." : `${sel.length}/3 dipilih · klik untuk pilih / batal`}</span>
              <button type="button" disabled={!sel.length} onClick={() => { onPick(chosen.id, sel); close(); }} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                <Check className="size-4" /> Pakai {sel.length || ""} foto
              </button>
            </div>
          </>
        ) : items && !current && accts.length > 1 ? (
          <>
            <DialogHeader>
              <DialogTitle>Ambil dari Etalase</DialogTitle>
              <DialogDescription>Pilih akun dulu. Setiap akun punya isi etalase sendiri.</DialogDescription>
            </DialogHeader>
            <div className="grid max-h-[55vh] gap-2 overflow-y-auto sm:grid-cols-2">
              {accts.map((a) => (
                <button key={a.id} type="button" onClick={() => { setAcct(a.id); setQ(""); }} className="flex items-center gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:border-ring/50">
                  <AccountAvatar a={a} size="size-10" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{a.displayName || `@${a.username}`}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">@{a.username}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">{count(a.id)} produk</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
        <DialogHeader>
          <DialogTitle>Ambil dari Etalase</DialogTitle>
          <DialogDescription>Pilih produk, lalu pilih fotonya (maks. 3). Nama, harga, dan keunggulan ikut terisi.</DialogDescription>
        </DialogHeader>
        {current && (
          <div className="flex items-center gap-2">
            {accts.length > 1 && <button type="button" onClick={() => setAcct(null)} className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border bg-background px-3 text-[13px] font-medium hover:bg-accent"><ArrowLeft className="size-4" /> Ganti akun</button>}
            <span className="text-[12px] text-muted-foreground">Etalase</span>
            <span className="flex min-w-0 items-center gap-2 text-[13px]"><AccountAvatar a={current} size="size-6" /><span className="truncate font-medium">@{current.username}</span></span>
          </div>
        )}
        <label className="flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-[13px] focus-within:border-ring">
          <Search className="size-4 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari produk..." className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <div className="max-h-[55vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items == null && [0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-44 animate-pulse rounded-lg bg-muted" />)}
          {shown.map((x) => (
            <button key={x.id} type="button" onClick={() => choose(x)} className="group overflow-hidden rounded-lg border bg-background text-left transition-colors hover:border-ring/50">
              <div className="relative aspect-square bg-muted">
                {x.cover && <img src={mediaUrl(x.cover)} alt="" loading="lazy" className="size-full object-cover" />}
                {!x.inStock && <span className="absolute top-1.5 left-1.5 rounded bg-black/70 px-1.5 py-px text-[10px] text-white">Stok habis</span>}
                {x.detailAt && <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-px text-[10px] text-white">Detail ✓</span>}
              </div>
              <div className="space-y-0.5 p-2">
                <p className="line-clamp-2 text-[11px] leading-snug font-medium">{x.title}</p>
                <p className="text-xs font-semibold">{x.price}</p>
              </div>
            </button>
          ))}
          {items && !shown.length && <p className="col-span-full py-8 text-center text-xs text-muted-foreground">{items.length ? "Tidak ada yang cocok." : "Etalase masih kosong. Sinkronkan dulu di menu Etalase."}</p>}
        </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Produk tanpa tanda &ldquo;Detail ✓&rdquo; diambil dulu dari TikTok (±15 dtk).</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StepStyle({ p, busy, act, onDone }: { p: Project; busy: boolean; act: Act; onDone: () => void }) {
  const preset = presetById(p.presetId)!;
  const refSec = Number(p.options.refDuration) || 0;
  const suggestion = suggestFromRef(refSec);
  // a project that never chose a format starts as the KaloData suggestion, else "Video Pendek · 1 klip × 10 dtk"
  const start = p.options.format ? null : suggestion ?? { format: "short" as const, clips: 1, clipSec: 10 };
  const [options, setOptions] = useState(start ? { ...p.options, format: start.format, clips: String(start.clips) } : p.options);
  const [clipSec, setClipSec] = useState(start?.clipSec ?? p.clipSec);
  const baseCount = preset.custom ? Math.max(1, p.scenes.length || 5) : preset.scenes(p.product, options).length;
  const clips = Number(options.clips) || baseCount;
  const dirty = JSON.stringify(options) !== JSON.stringify(p.options) || clipSec !== p.clipSec;
  const needProduct = !p.product.name.trim() ? "Isi nama produk dulu" : !preset.custom && !p.product.photos.length ? "Tambah minimal 1 foto produk" : null;
  const scriptReady = p.options.written === "1" && p.scenes.length > 0 && !dirty;
  const outlineLines = (options.outline ?? "").split("\n").filter((l) => l.trim());
  const [outlining, setOutlining] = useState(false);
  const total = clips * clipSec;
  const isVersion = !!p.options.versionOf;
  const madeVersions = (p.options.versions ?? "").split(",").filter(Boolean);
  const finals = isVersion || madeVersions.length ? 1 : Math.min(VERSIONS.length, Number(options.finals) || 1);
  const [showPro, setShowPro] = useState(clipSec >= PRO_CLIP_SEC);
  const [showConcepts, setShowConcepts] = useState(false);
  const toastVersions = (made: { id: number; title: string }[]) =>
    made.length && toast.success(`${made.length} video versi lain dibuat (#${made.map((m) => m.id).join(", #")})`, { description: "AI sedang menulis storyboard-nya. Buka dari halaman Proyek Video.", duration: 8000 });
  const format = options.format === "long" ? "long" : "short";
  const F = FORMATS[format];
  const switchFormat = (k: keyof typeof FORMATS) => {
    if (k === format) return;
    const def = FORMATS[k].lengths.find((l) => "best" in l && l.best) ?? FORMATS[k].lengths[0];
    setOptions({ ...options, format: k, clips: String(def.clips) });
    setClipSec(def.sec);
  };
  const applySuggestion = () => {
    if (!suggestion) return;
    setOptions({ ...options, format: suggestion.format, clips: String(suggestion.clips) });
    setClipSec(suggestion.clipSec);
  };
  const suggested = !!suggestion && format === suggestion.format && clips === suggestion.clips && clipSec === suggestion.clipSec;

  const outline = () => {
    setOutlining(true);
    act(async () => {
      try {
        const lines = await aiOutline(p.id, options, clipSec);
        // saved right away: the refresh after this action re-reads the project
        await saveProject(p.id, { options: { ...options, outline: lines.join("\n") }, clipSec });
      } finally {
        setOutlining(false);
      }
    }, "Kerangka bab siap, cek dan ubah kalau perlu");
  };
  const preview = () =>
    act(async () => {
      toastVersions(await previewScript(p.id, options, clipSec));
    }, "Naskah siap. Cek di bawah, ubah kalimatnya kalau perlu.");
  const makeNow = async () => {
    const what = `${finals} video final · ${clips} klip × ${clipSec} dtk (±${mmss(total * 1000)}). Gambar, klip, suara, dan caption dibuat otomatis (±${Math.max(3, clips * finals * 2)} menit), lalu terbuka di editor untuk diekspor.`;
    if (!(await confirmDialog({ title: "Buat video sekarang?", description: `${what} Memakai kuota akun Google di Flow.`, confirmLabel: "Buat video" }))) return;
    act(async () => {
      if (!scriptReady) {
        await saveProject(p.id, { options, clipSec });
        await buildStoryboard(p.id, { versions: false });
      }
      const r = await quickMake(p.id);
      toast.success(r.versions ? `${r.versions + 1} video dibuat bersamaan` : "Video sedang dibuat", { description: "Progres tiap video tampil di tab Adegan. Kamu boleh pindah halaman." });
      onDone(); // straight to the Adegan tab to watch it
    });
  };
  const build = async () => {
    if (p.scenes.length && !(await confirmDialog({ title: "Susun ulang storyboard?", description: "Adegan lama, termasuk gambar yang sudah dibuat, akan diganti dengan susunan baru.", confirmLabel: "Susun ulang" }))) return;
    act(async () => {
      await saveProject(p.id, { options, clipSec });
      toastVersions(await buildStoryboard(p.id));
      onDone();
    });
  };

  const label = "text-xs font-medium text-muted-foreground";
  return (
    <Card
      icon={Clapperboard}
      title="2. Video"
      footer={
        <>
          <p className="mr-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {needProduct ? (
              <span className="flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400"><CircleAlert className="size-3.5" /> {needProduct}</span>
            ) : (
              <>
                <span className="font-semibold">{finals} video</span>
                <span className="text-muted-foreground">· ±{mmss(total * 1000)} · ±{Math.max(3, clips * finals * 2)} menit proses</span>
                {clips * finals > 6 && <span className="text-amber-600 dark:text-amber-400">· boros kuota Flow</span>}
              </>
            )}
          </p>
          <button type="button" className={secondary} disabled={busy || !!needProduct} onClick={preview} title="AI menulis naskahnya dulu, kamu cek sebelum gambar & klip dibuat">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} {scriptReady ? "Tulis ulang naskah" : "Cek naskah dulu"}
          </button>
          <button type="button" className={primary} disabled={busy || !!needProduct || (format === "long" && !outlineLines.length && !scriptReady)} onClick={makeNow} title={format === "long" && !outlineLines.length ? "Susun kerangka bab dulu" : undefined}>
            <Rocket className="size-4" /> Buat video sekarang
          </button>
        </>
      }
    >
      {/* concept: one line, the full list only on demand */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${label} w-20`}>Konsep</span>
          <span className="text-[13px] font-semibold">{preset.title}</span>
          <button type="button" onClick={() => setShowConcepts((v) => !v)} className="text-xs text-brand-light hover:underline">{showConcepts ? "Tutup" : "Ganti"}</button>
          {p.options.refVideo && (
            <button type="button" onClick={() => openLightbox([{ src: p.options.refVideo, kind: "video", label: "Video terlaris (referensi gaya)" }])} className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              <Trophy className="size-3.5 text-amber-500" /> Referensi terlaris
            </button>
          )}
        </div>
        {showConcepts && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Konsep">
            {PRESETS.filter((x) => x.available).map((x) => {
              const on = x.id === preset.id;
              return (
                <button key={x.id} type="button" role="radio" aria-checked={on} disabled={busy}
                  onClick={() => { setShowConcepts(false); if (!on) act(() => saveProject(p.id, { presetId: x.id }), p.scenes.length ? "Konsep diganti. Buat ulang videonya untuk menerapkan." : undefined); }}
                  className={pick(on)}>
                  <span className="line-clamp-1 text-[13px] font-semibold">{x.title}</span>
                  <span className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{x.bestFor}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* format */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${label} w-20`}>Format</span>
        <div className="inline-flex rounded-lg bg-muted p-0.5" role="tablist" aria-label="Format video">
          {(Object.keys(FORMATS) as (keyof typeof FORMATS)[]).map((k) => {
            const T = FORMATS[k];
            return (
              <button key={k} type="button" role="tab" aria-selected={format === k} onClick={() => switchFormat(k)} className={`${chip(format === k)} gap-1.5 px-3`}>
                <T.icon className="size-3.5" /> {T.label}
              </button>
            );
          })}
        </div>
        {suggestion && !suggested && (
          <button type="button" onClick={applySuggestion} className="flex items-center gap-1 text-[11px] text-brand-light hover:underline">
            <TrendingUp className="size-3.5" /> Saran KaloData: {suggestion.clips} klip × {suggestion.clipSec} dtk
          </button>
        )}
      </div>

      {/* Flow video resolution (Omni 1.2 Flash offers 360p / 720p), saved as options.resolution.
          ponytail: UI only for now — flow2api doesn't forward a resolution to Omni yet, so clips still come back
          720p; wiring it (flow2api + lib/projects.ts render) is Rifq's backend task. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${label} w-20`}>Resolusi</span>
        <div className="inline-flex rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Resolusi video Flow">
          {RESOLUTIONS.map((r) => {
            const on = (options.resolution ?? "720p") === r.id;
            return (
              <button key={r.id} type="button" role="radio" aria-checked={on} title={r.hint} onClick={() => setOptions({ ...options, resolution: r.id })} className={`${chip(on)} px-3`}>
                {r.label}
              </button>
            );
          })}
        </div>
        <span className="text-[11px] text-muted-foreground">{RESOLUTIONS.find((r) => r.id === (options.resolution ?? "720p"))?.hint}</span>
      </div>

      {/* short = one clip: just pick how many seconds; long = three length picks */}
      {format === "short" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${label} w-20`}>Durasi</span>
          <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Durasi video">
            {CLIP_SECS.filter((x) => x < PRO_CLIP_SEC || showPro).map((x) => (
              <button key={x} type="button" role="radio" aria-checked={clipSec === x} onClick={() => { setClipSec(x); setOptions({ ...options, clips: "1" }); }} className={`${chip(clipSec === x && clips === 1)} min-w-11 gap-1 px-2`}>
                {x} dtk{x >= PRO_CLIP_SEC && <Crown className="size-3 text-amber-400" />}
              </button>
            ))}
            {!showPro && <button type="button" onClick={() => setShowPro(true)} className="flex h-8 items-center gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"><Crown className="size-3 text-amber-400" /> 11–15</button>}
          </div>
          {clipSec >= PRO_CLIP_SEC && <span className="text-[11px] text-amber-600 dark:text-amber-400">Butuh Google AI Plus/Pro/Ultra</span>}
        </div>
      ) : (
      <div className="flex flex-wrap items-start gap-2">
        <span className={`${label} w-20 pt-2`}>Panjang</span>
        <div className="grid flex-1 grid-cols-3 gap-2" role="radiogroup" aria-label="Panjang video">
          {F.lengths.map((l) => {
            const on = clips === l.clips && clipSec === l.sec;
            return (
              <button key={l.id} type="button" role="radio" aria-checked={on} onClick={() => { setClipSec(l.sec); setOptions({ ...options, clips: String(l.clips) }); }} className={pick(on)}>
                <span className="flex items-center gap-1.5 text-[13px] font-semibold"><l.icon className={`size-4 ${on ? "text-brand-light" : "text-muted-foreground"}`} /> {l.label}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">±{l.clips * l.sec} dtk</span>
              </button>
            );
          })}
        </div>
      </div>
      )}

      {/* number of finals */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${label} w-20`}>Jumlah</span>
        {isVersion ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground"><Link2 className="size-3.5" /> Versi tambahan dari <Link href={`/video/${p.options.versionOf}`} className="text-brand-light hover:underline">#{p.options.versionOf}</Link></span>
        ) : madeVersions.length ? (
          <span className="flex flex-wrap items-center gap-1.5 text-xs">
            <CheckCircle2 className="size-3.5 text-emerald-500" /> {madeVersions.length + 1} video:
            {madeVersions.map((id, i) => <Link key={id} href={`/video/${id}`} className="rounded-md border px-1.5 py-0.5 text-[11px] hover:bg-accent">Versi {VERSIONS[i + 1]?.key ?? i + 2} #{id}</Link>)}
          </span>
        ) : (
          <>
            <div className="inline-flex rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Jumlah video final">
              {VERSIONS.map((v, i) => (
                <button key={v.key} type="button" role="radio" aria-checked={finals === i + 1} onClick={() => setOptions({ ...options, finals: String(i + 1) })} className={`${chip(finals === i + 1)} px-3`}>
                  {i + 1} video
                </button>
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground" title={VERSIONS.slice(0, finals).map((v) => `Versi ${v.key}: ${v.desc}`).join("\n")}>{finals > 1 ? `${finals} hook berbeda` : format === "short" ? "Tip: lebih dari 1 video = tes hook" : ""}</span>
          </>
        )}
      </div>

      {format === "long" && (
        <div className="space-y-3 rounded-lg border bg-background/40 p-3">
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Jenis penjelasan">
            <span className={`${label} mr-1`}>Jenis</span>
            {EXPLAIN.map((x) => {
              const on = (options.explain ?? "deep") === x.key;
              const I = EXPLAIN_ICONS[x.key];
              return (
                <button key={x.key} type="button" role="radio" aria-checked={on} title={x.desc} onClick={() => setOptions({ ...options, explain: x.key, outline: "" })}
                  className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium ${on ? "border-primary bg-primary/10 text-brand-light" : "bg-background text-muted-foreground hover:text-foreground"}`}>
                  <I className="size-3.5" /> {x.label}
                </button>
              );
            })}
          </div>
          <textarea
            className={`${input} text-xs!`}
            rows={Math.min(12, Math.max(3, outlineLines.length + 1))}
            value={options.outline ?? ""}
            onChange={(e) => setOptions({ ...options, outline: e.target.value })}
            placeholder={"Kerangka bab: satu baris = satu adegan.\nContoh: Masalahnya: kulit kusam habis seharian di luar"}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={outline} className="flex h-8 items-center gap-1.5 rounded-lg border bg-background px-3 text-xs font-medium hover:bg-accent disabled:opacity-60">
              {outlining ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5 text-black dark:text-white" />} {outlineLines.length ? "Susun ulang dengan AI" : "Susun kerangka dengan AI"}
            </button>
            <span className="text-[11px] text-muted-foreground">{outlineLines.length ? `${outlineLines.length}/${clips} bab` : "Wajib untuk video panjang"}</span>
          </div>
        </div>
      )}

      {scriptReady && (
        <div className="space-y-1.5">
          <p className={label}>Naskah <span className="font-normal">(ubah langsung)</span></p>
          {p.scenes.map((sc, i) => {
            const line = voiceLine(sc.motionPrompt);
            return (
              <div key={`${i}-${p.updatedAt}`} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center text-[11px] font-semibold text-muted-foreground">{i + 1}</span>
                {line != null ? (
                  <input
                    defaultValue={line}
                    disabled={busy}
                    aria-label={`Kalimat adegan ${i + 1}`}
                    onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== line && act(() => setSceneLine(p.id, i, e.target.value), "Kalimat disimpan")}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:border-ring"
                  />
                ) : (
                  <p className="line-clamp-1 text-[11px] text-muted-foreground">{sc.label}: {sc.motionPrompt.split(/(?<=[.!?])\s/)[0]}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* everything else */}
      <details className="group rounded-lg border">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
          <SlidersHorizontal className="size-3.5" /> Pengaturan lanjutan
          <span className="ml-auto text-[11px] font-normal">{format === "long" ? `${clips} adegan × ${clipSec} dtk · ` : ""}{preset.fields.map((f) => f.type === "select" ? f.options.find((o) => o.value === (options[f.key] ?? f.default))?.label : null).filter(Boolean).join(" · ")}</span>
        </summary>
        <div className="space-y-4 border-t p-3">
          {preset.fields.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {preset.fields.map((f) => (
                <label key={f.key} className="block space-y-1.5">
                  <FieldLabel icon={FIELD_ICONS[f.key] ?? SlidersHorizontal}>{f.label}</FieldLabel>
                  {f.type === "select" ? (
                    <select className={input} value={options[f.key] ?? f.default} onChange={(e) => setOptions({ ...options, [f.key]: e.target.value })}>
                      {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input className={input} value={options[f.key] ?? f.default} placeholder={f.placeholder} onChange={(e) => setOptions({ ...options, [f.key]: e.target.value })} />
                  )}
                </label>
              ))}
            </div>
          )}
          {format === "long" && (<>
          <div className="space-y-1.5">
            <FieldLabel icon={Clock}>Detik per adegan</FieldLabel>
            <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Detik per adegan">
              {CLIP_SECS.filter((x) => (format === "long" ? x >= 6 : x < PRO_CLIP_SEC || showPro)).map((x) => (
                <button key={x} type="button" role="radio" aria-checked={clipSec === x} onClick={() => setClipSec(x)} className={`${chip(clipSec === x)} min-w-10 gap-1 px-2`}>
                  {x}s{x >= PRO_CLIP_SEC && <Crown className="size-3 text-amber-400" />}
                </button>
              ))}
            </div>
            {clipSec >= PRO_CLIP_SEC && <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400"><CircleAlert className="mt-px size-3.5 shrink-0" /> Di atas 10 dtk butuh Google AI Plus/Pro/Ultra.</p>}
          </div>
          <div className="flex items-center justify-between gap-3">
            <FieldLabel icon={Clapperboard}>Jumlah adegan</FieldLabel>
            <div className="flex items-center rounded-lg border bg-background">
              <button type="button" aria-label="Kurangi adegan" disabled={clips <= F.min} onClick={() => setOptions({ ...options, clips: String(clips - 1) })} className="grid size-8 place-items-center rounded-l-lg hover:bg-accent disabled:opacity-40"><Minus className="size-3.5" /></button>
              <span className="w-9 text-center text-sm font-semibold tabular-nums" aria-live="polite">{clips}</span>
              <button type="button" aria-label="Tambah adegan" disabled={clips >= F.max} onClick={() => setOptions({ ...options, clips: String(clips + 1) })} className="grid size-8 place-items-center rounded-r-lg hover:bg-accent disabled:opacity-40"><Plus className="size-3.5" /></button>
            </div>
          </div>
          </>)}
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs">
            <button type="button" disabled={busy || !!needProduct} onClick={build} className="flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50"><LayoutGrid className="size-3.5" /> Atur storyboard manual</button>
            {p.scenes.length > 0 && (
              <button type="button" disabled={busy} onClick={() => act(async () => { await saveProject(p.id, { options, clipSec, step: 4 }); toastVersions(await makeVersions(p.id)); onDone(); })} className="flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50">
                <Save className="size-3.5" /> Simpan, pakai storyboard lama
              </button>
            )}
          </div>
        </div>
      </details>
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
        {started && <span suppressHydrationWarning className="font-mono text-xs tabular-nums text-muted-foreground">{mmss(now - started)}</span>}
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
      {/* Gemini QC: does the generated image match the product photos? */}
      {kind === "image" && src && !live && scene?.check && (
        <span
          title={scene.check.note}
          className={`absolute inset-x-1 bottom-1 truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white ${scene.check.ok ? "bg-emerald-600/85" : "bg-amber-600/90"}`}
        >
          {scene.check.ok ? "✓ Cocok dengan produk" : `⚠ ${scene.check.note || "Produk beda dari foto"}`}
        </span>
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
        <p className="absolute inset-x-0 bottom-0 bg-destructive/90 p-1.5 text-[10px] leading-tight text-white">{scene.error}</p>
      )}
    </div>
  );
}

/**
 * Adegan tab for "Video Pendek" (one clip = the whole video): a big preview and three clear steps
 * (gambar → klip → hasil) with one obvious button each; prompts and voice settings tucked away.
 */
function ShortScene({ p, busy, act, onResult, voice, voices, hasCartesia }: { p: Project; busy: boolean; act: Act; onResult: () => void; voice: ProjectVoiceState; voices: VoiceOption[]; hasCartesia: boolean }) {
  const router = useRouter();
  const sc = p.scenes[0];
  const running = p.status === "running";
  const working = running && (sc.state === "queued" || sc.state === "working");
  const silent = !!presetById(p.presetId)?.silent;
  const fileRef = useRef<HTMLInputElement>(null);
  const line = voiceLine(sc.motionPrompt);
  const [prompts, setPrompts] = useState({ imagePrompt: sc.imagePrompt, motionPrompt: sc.motionPrompt });
  const savePrompts = () =>
    (prompts.imagePrompt !== sc.imagePrompt || prompts.motionPrompt !== sc.motionPrompt) &&
    act(() => saveProject(p.id, { scenes: [{ label: sc.label, ...prompts }] }), "Prompt disimpan");
  const upload = (files: FileList | null) => {
    if (!files?.[0]) return;
    const form = new FormData();
    form.append("image", files[0]);
    act(() => uploadSceneImage(p.id, 0, form), "Gambar dipasang");
    if (fileRef.current) fileRef.current.value = "";
  };

  type St = "done" | "run" | "todo" | "wait";
  const imgSt: St = sc.image ? "done" : working ? "run" : "todo";
  const clipSt: St = sc.clip ? "done" : working && sc.image ? "run" : sc.image ? "todo" : "wait";
  const resSt: St = p.edit ? "done" : running && sc.clip ? "run" : sc.clip ? "todo" : "wait";
  const steps: { st: St; title: string; hint: string; action?: React.ReactNode }[] = [
    {
      st: imgSt,
      title: "Gambar",
      hint: imgSt === "done" ? (sc.check && !sc.check.ok ? `⚠ ${sc.check.note || "Produk beda dari foto"}` : "Frame pertama video") : imgSt === "run" ? sc.stage ?? "Sedang dibuat..." : "AI membuat frame pertama dari foto produk",
      action: (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" disabled={busy} onClick={() => act(() => generateImages(p.id, 0))} className={tinyBtn}><Sparkles className="size-3.5" /> {sc.image ? "Buat ulang" : "Buat gambar"}</button>
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={tinyBtn}><Upload className="size-3.5" /> Unggah</button>
          {sc.check && !sc.check.ok && p.product.photos.length > 0 && <button type="button" disabled={busy} onClick={() => act(() => applyProductPhoto(p.id, 0), "Foto produk asli dipakai")} className={tinyBtn}><ImageIcon className="size-3.5" /> Pakai foto asli</button>}
        </div>
      ),
    },
    {
      st: clipSt,
      title: `Klip video (${p.clipSec} dtk)`,
      hint: clipSt === "done" ? "Klip jadi" : clipSt === "run" ? sc.stage ?? "Flow sedang membuat klip..." : clipSt === "wait" ? "Setelah gambar jadi" : "Gambar siap, tinggal dibuat klipnya",
      action: sc.image ? <button type="button" disabled={busy} onClick={() => act(() => renderProject(p.id), "Klip sedang dibuat")} className={tinyBtn}><Clapperboard className="size-3.5" /> {sc.clip ? "Buat ulang klip" : "Buat klip"}</button> : null,
    },
    {
      st: resSt,
      title: "Suara, caption & export",
      hint: resSt === "done" ? "Siap diekspor di tab Hasil" : resSt === "run" ? p.progress ?? "Menyusun..." : resSt === "wait" ? "Setelah klip jadi" : "Buka editor untuk menambah suara & caption",
      action: sc.clip ? <button type="button" onClick={onResult} className={`${tinyBtn} border-primary/50 bg-primary/10 text-brand-light`}><Film className="size-3.5" /> Buka hasil</button> : null,
    },
  ];
  const dot = (st: St, i: number) =>
    st === "done" ? <span className="grid size-7 place-items-center rounded-full bg-status-ok/15 text-status-ok"><Check className="size-4" /></span>
    : st === "run" ? <span className="grid size-7 place-items-center rounded-full bg-primary/15 text-brand-light"><Loader2 className="size-4 animate-spin" /></span>
    : <span className={`grid size-7 place-items-center rounded-full text-xs font-semibold ${st === "todo" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>;

  return (
    <Card icon={Clapperboard} title="Video kamu" desc={`1 klip ${p.clipSec} dtk = 1 video jadi. Ikuti 3 langkah di kanan.`}>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files)} />
      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <div className="mx-auto w-full max-w-[220px] space-y-2">
          <SceneMedia scene={sc} kind={sc.clip ? "video" : "image"} running={running} scenes={p.scenes} />
          {sc.styleRef && <p className="text-center text-[10px] text-muted-foreground">Gaya meniru video terlaris</p>}
        </div>
        <div className="min-w-0 space-y-5">
          <ol className="space-y-0">
            {steps.map((x, i) => (
              <li key={x.title} className="relative flex gap-3 pb-4 last:pb-0">
                {i < steps.length - 1 && <span className={`absolute top-8 bottom-0 left-3.5 w-px ${x.st === "done" ? "bg-status-ok/40" : "bg-border"}`} aria-hidden />}
                {dot(x.st, i)}
                <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
                  <p className="text-[13px] font-semibold">{x.title}</p>
                  <p className={`text-[11px] ${x.hint.startsWith("⚠") ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>{x.hint}</p>
                  {x.action && !working && x.action}
                </div>
              </li>
            ))}
          </ol>

          {!silent && (
            <div className="space-y-1.5 rounded-lg border bg-background/40 p-3">
              <div className="flex items-center gap-2">
                <FieldLabel icon={Mic}>Kalimat di video</FieldLabel>
                <button type="button" disabled={busy} onClick={() => act(() => aiWriteScenes(p.id, 0), "Naskah ditulis ulang AI")} className="ml-auto flex items-center gap-1 text-[11px] text-brand-light hover:underline disabled:opacity-50"><Wand2 className="size-3" /> Tulis ulang AI</button>
              </div>
              <input
                key={`${p.updatedAt}-line`}
                defaultValue={line ?? ""}
                disabled={busy}
                placeholder="Kalimat yang diucapkan di video"
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== line && act(() => setSceneLine(p.id, 0, e.target.value), "Kalimat disimpan")}
                className="w-full rounded-md border bg-background px-2.5 py-2 text-[13px] outline-none focus:border-ring"
              />
              <p className="text-[10px] text-muted-foreground">Maks ±{Math.round(p.clipSec * 2.5)} kata supaya muat {p.clipSec} dtk. Mengubah kalimat membuat klip perlu dibuat ulang.</p>
            </div>
          )}

          <details className="rounded-lg border">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"><SlidersHorizontal className="size-3.5" /> Prompt & suara (lanjutan)</summary>
            <div className="space-y-3 border-t p-3">
              <label className="block space-y-1">
                <FieldLabel icon={ImageIcon}>Prompt gambar</FieldLabel>
                <textarea className={`${input} text-xs!`} rows={4} disabled={busy} value={prompts.imagePrompt} onChange={(e) => setPrompts({ ...prompts, imagePrompt: e.target.value })} onBlur={savePrompts} />
              </label>
              <label className="block space-y-1">
                <FieldLabel icon={Move}>Prompt gerak</FieldLabel>
                <textarea className={`${input} text-xs!`} rows={3} disabled={busy} value={prompts.motionPrompt} onChange={(e) => setPrompts({ ...prompts, motionPrompt: e.target.value })} onBlur={savePrompts} />
              </label>
              <VoicePanel projectId={p.id} state={voice} voices={voices} hasKey={hasCartesia} disabled={busy} locked={silent ? "Konsep ini tanpa suara (video disinkronkan ke musik di CapCut)." : null} onSaved={() => router.refresh()} />
            </div>
          </details>
        </div>
      </div>
    </Card>
  );
}

const tinyBtn = "flex h-7 items-center gap-1 rounded-md border bg-background px-2.5 text-[11px] font-medium hover:bg-accent disabled:opacity-50";

function StepStoryboard({
  p, busy, act, ready, onNext, onBack, voice, voices, hasCartesia,
}: { p: Project; busy: boolean; act: Act; ready: boolean; onNext: () => void; onBack: () => void; voice: ProjectVoiceState; voices: VoiceOption[]; hasCartesia: boolean }) {
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
    return (
      <Card icon={LayoutGrid} title="Storyboard" desc="Gambar dan prompt tiap adegan.">
        <Empty icon={LayoutGrid} title="Storyboard masih kosong" desc="Atur videonya di langkah Siapkan, lalu tekan Buat video sekarang atau Atur storyboard manual." action={<button type="button" className={`${primary} mt-2`} onClick={onBack}><Package className="size-4" /> Ke langkah Siapkan</button>} />
      </Card>
    );
  }
  const aiTodo = p.scenes.filter((s) => !(s.own && s.image));
  const missing = p.scenes.filter((s) => !s.image).length;
  const tiny = "flex h-7 items-center justify-center gap-1 rounded-md border text-[11px] font-medium hover:bg-accent disabled:opacity-50";

  return (
    <Card
      icon={LayoutGrid}
      title="Storyboard"
      desc={custom
        ? "Racik tiap adegan: tulis prompt sendiri, pasang gambarmu, atau minta AI membuatkan. Atur urutannya sesukamu."
        : "Cek gambar tiap adegan sebelum dirender. Mau beda? Ubah prompt, pasang gambarmu sendiri, atau tambah adegan."}
      footer={
        <>
          {dirty && <button type="button" className={secondary} disabled={busy} onClick={() => act(() => saveProject(p.id, { scenes }), "Tersimpan")}><Save className="size-4" /> Simpan perubahan</button>}
          <button type="button" className={secondary} disabled={busy} onClick={() => aiWrite()} title="Gemini menulis ulang semua prompt: lebih detail, realistis, tidak terlihat AI">
            {writing === "all" ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} {writing === "all" ? "AI menulis..." : "Tulis prompt dengan AI"}
          </button>
          {aiTodo.length > 0 && (
            <button type="button" className={secondary} disabled={busy} onClick={() => saveThen(() => generateImages(p.id))}>
              <Sparkles className="size-4" /> {missing === p.scenes.length ? "Buat semua gambar (AI)" : `Buat ulang ${aiTodo.length} gambar AI`}
            </button>
          )}
          <button type="button" className={primary} disabled={busy || !ready || dirty} onClick={onNext} title={!ready ? "Semua adegan perlu gambar" : undefined}>
            Ke render <ArrowDown className="size-4" />
          </button>
        </>
      }
    >
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files)} />
      <SectionTitle n={1} icon={Mic} title="Suara video" />
      <VoicePanel
        projectId={p.id}
        state={voice}
        voices={voices}
        hasKey={hasCartesia}
        disabled={busy}
        locked={silentConcept ? "Konsep ini tanpa suara (video disinkronkan ke musik di CapCut)." : null}
        onSaved={() => router.refresh()}
      />
      <SectionTitle n={2} icon={Images} title="Adegan" hint={missing ? `${p.scenes.length - missing}/${p.scenes.length} punya gambar` : `${p.scenes.length} adegan siap`} />
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {scenes.map((s, i) => {
          const server = p.scenes[i];
          return (
            <div key={i} className="flex gap-3 rounded-lg border bg-background p-3">
              <div className="w-28 shrink-0 space-y-1.5">
                <div className="relative">
                  <SceneMedia scene={server} kind="image" running={p.status === "running"} scenes={p.scenes} />
                  {server?.own && server.image && <span className="absolute top-1 left-1 rounded bg-black/65 px-1.5 py-px text-[9px] font-medium text-white">Gambarmu</span>}
                  {server?.check && !server.check.ok && p.status !== "running" && p.product.photos.length > 0 && (
                    <button type="button" onClick={() => act(() => applyProductPhoto(p.id, i), "Foto produk asli dipakai untuk adegan ini")} className="mt-1 w-full rounded-md border border-amber-500/50 bg-amber-500/10 px-1.5 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-500/20 dark:text-amber-300" title="Klipnya nanti dibuat dari foto produk asli, jadi produknya pasti sama">
                      Pakai foto produk asli
                    </button>
                  )}
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
                <div className="flex flex-wrap items-center gap-1">
                  <span className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${server?.image ? "bg-status-ok/15 text-status-ok" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                  <input
                    value={s.label}
                    maxLength={60}
                    disabled={busy}
                    onChange={(e) => edit(i, "label", e.target.value)}
                    aria-label="Nama adegan"
                    className="min-w-28 flex-1 rounded-md bg-transparent px-1 py-0.5 text-xs font-semibold outline-none hover:bg-accent focus:bg-accent"
                  />
                  <button
                    type="button"
                    aria-label="Tulis prompt adegan ini dengan AI"
                    title="Tulis ulang prompt adegan ini dengan AI"
                    disabled={busy}
                    onClick={() => aiWrite(i)}
                    className="grid size-6 place-items-center rounded-md text-black dark:text-white hover:bg-accent disabled:opacity-30"
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
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><ImageIcon className="size-3" /> Prompt gambar {server?.own && server.image ? "(tidak dipakai, sudah ada gambarmu)" : ""}</span>
                  <textarea
                    className={`${input} text-xs!`}
                    rows={4}
                    disabled={busy}
                    value={s.imagePrompt}
                    placeholder="Gambarkan adegannya: siapa, memegang apa, di mana, cahaya seperti apa. Contoh: tangan wanita memegang botol serum di meja marmer, cahaya pagi, foto vertikal realistis"
                    onChange={(e) => edit(i, "imagePrompt", e.target.value)}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Move className="size-3" /> Prompt gerak (untuk video)</span>
                  <textarea
                    className={`${input} text-xs!`}
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
  const doneClips = p.scenes.filter((s) => s.clip).length;
  const silent = isSilent(p.presetId, p.options);
  if (!p.scenes.length)
    return (
      <Card icon={Clapperboard} title="Render" desc="Buat klip tiap adegan, lalu gabung jadi satu video.">
        <Empty icon={Clapperboard} title="Belum ada adegan untuk dirender" desc="Susun storyboard dan buat gambar tiap adegan dulu." action={<button type="button" className={`${primary} mt-2`} onClick={onBack}><LayoutGrid className="size-4" /> Ke storyboard</button>} />
      </Card>
    );
  return (
    <div id="render" className="scroll-mt-4">
    <Card
      icon={Clapperboard}
      title="Render"
      desc="Flow membuat klip tiap adegan, lalu semuanya digabung jadi satu video. Klip yang sudah jadi tidak dibuat ulang."
      footer={
        <>
          <button type="button" className={secondary} onClick={onBack}><ArrowLeft className="size-4" /> Storyboard</button>
          <button type="button" className={primary} disabled={busy || !ready} onClick={() => act(() => renderProject(p.id), "Render masuk antrean")}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Clapperboard className="size-4" />} {doneClips ? "Lanjutkan render" : "Render video"}
          </button>
        </>
      }
    >
      {!ready && <p className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"><CircleAlert className="size-4 shrink-0" /> Semua adegan perlu gambar dulu. <button type="button" onClick={onBack} className="font-semibold underline underline-offset-2">Kembali ke storyboard</button></p>}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat icon={Clapperboard} label="Klip" value={`${p.scenes.length} × ${p.clipSec} dtk`} />
        <Stat icon={Timer} label="Durasi video" value={`±${mmss(p.scenes.length * p.clipSec * 1000)}`} />
        <Stat icon={silent ? VolumeX : Mic} label="Suara" value={silent ? "Tanpa suara (pakai musik)" : voiceLabel} />
        <Stat icon={CheckCircle2} label="Klip jadi" value={`${doneClips}/${p.scenes.length}`} />
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full rounded-full bg-status-ok transition-all" style={{ width: `${p.scenes.length ? (doneClips / p.scenes.length) * 100 : 0}%` }} /></div>
      <SectionTitle icon={Film} title="Klip per adegan" />
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
    </div>
  );
}

function StepResult({ p, onBack }: { p: Project; onBack: () => void }) {
  // Video Pendek: straight to the finished video (no timeline); the editor only on request. Video Panjang: editor.
  const [manual, setManual] = useState(false);
  if (!p.finalPath) {
    return (
      <Card icon={Film} title="Hasil" desc="Edit, caption, dan export video final.">
        <Empty icon={Film} title="Video belum dirender" desc="Selesaikan langkah Render dulu. Setelah klipnya jadi, editor video terbuka di sini." action={<button type="button" className={`${primary} mt-2`} onClick={onBack}><Clapperboard className="size-4" /> Ke langkah Render</button>} />
      </Card>
    );
  }
  if (p.options.format !== "long" && !manual) return <QuickResult p={p} onEdit={() => setManual(true)} />;
  return <TimelineEditor p={p} />;
}
