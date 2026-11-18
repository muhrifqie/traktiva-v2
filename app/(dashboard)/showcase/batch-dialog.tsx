"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, Check, Clapperboard, Clock, Copy, Globe, Loader2, Users, Zap } from "lucide-react";
import { DEFAULT_VIDEO_SEC, MAX_VIDEOS, VIDEO_SECS } from "@/lib/presets";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { startBatchVideos } from "./actions";

// Etalase batch: N selected products → N finished videos. 1 worker makes 1 whole video at a time
// (photos, storyboard, scene images, clips, final.mp4); the other products wait for a free worker.

export type BatchDefaults = { accounts: number; workers: number; engine: Engine; max: number; maxVideos: number };
type Engine = "auto" | "api" | "browser";
type Concept = { id: string; title: string; bestFor: string; auto: boolean };

const ENGINES: { id: Engine; label: string; hint: string; icon: typeof Zap }[] = [
  { id: "auto", label: "Otomatis", hint: "Lewat API (cepat). Kalau API bermasalah, pindah ke browser akun.", icon: Zap },
  { id: "api", label: "API saja", hint: "Hanya mesin video (flow2api). Paling cepat.", icon: Bot },
  { id: "browser", label: "Browser saja", hint: "Buka Flow di browser akun & isi otomatis. Lebih lambat.", icon: Globe },
];

/** ±1 video at a time per Google account: each video already runs its scenes in parallel. */
const recommended = (accounts: number, videos: number, max: number) => Math.max(1, Math.min(videos, max, Math.max(1, accounts)));

export function BatchDialog({
  open, productIds, concepts, defaults, onClose, onStarted,
}: { open: boolean; productIds: number[]; concepts: Concept[]; defaults: BatchDefaults; onClose: () => void; onStarted: () => void }) {
  const videos = productIds.length;
  const auto = concepts.filter((c) => c.auto);
  const [concept, setConcept] = useState<string | null>(null);
  const [workers, setWorkers] = useState<number | null>(null);
  const [engine, setEngine] = useState<Engine>(defaults.engine);
  const [sec, setSec] = useState<number>(DEFAULT_VIDEO_SEC);
  const [perProduct, setPerProduct] = useState(1);
  const [busy, setBusy] = useState(false);

  const top = Math.max(1, Math.min(defaults.max, videos));
  const rec = recommended(defaults.accounts, videos, defaults.max);
  const w = Math.min(workers ?? Math.min(defaults.workers, top), top);
  const pickedConcept = concept ?? auto[0]?.id ?? null;
  const choices = [...new Set([1, 2, 3, 4, 5, 6, 8, 10].filter((n) => n <= top).concat(top))].sort((a, b) => a - b);
  const heavy = w > Math.max(1, defaults.accounts) * 2;
  const rounds = Math.ceil(videos / w);

  const start = async () => {
    if (!pickedConcept) return;
    setBusy(true);
    try {
      const r = await startBatchVideos({ showcaseIds: productIds, presetId: pickedConcept, workers: w, engine, sec, videos: perProduct });
      toast.success(`${r.count} produk masuk antrean (${r.count * perProduct} video) · ${w} dikerjakan bersamaan`, {
        action: { label: "Lihat proyek", onClick: () => window.location.assign("/proyek") },
      });
      onStarted();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memulai");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        <div className="max-h-[78vh] space-y-5 overflow-y-auto p-5">
          <DialogHeader className="gap-1 text-left">
            <DialogTitle className="flex items-center gap-2 text-[15px]">
              <span className="grid size-8 place-items-center rounded-full bg-primary/12 text-brand-light"><Clapperboard className="size-4" /></span>
              Buat video otomatis untuk {videos} produk
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed">
              Tiap video: 1 gambar awal + 1 klip utuh sepanjang durasi yang dipilih. Hasilnya muncul di{" "}
              <Link href="/proyek" className="underline">Proyek Video</Link>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-xs font-medium">Konsep video</p>
            <div className="grid gap-1.5 sm:grid-cols-2" role="radiogroup" aria-label="Konsep video">
              {auto.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={pickedConcept === c.id}
                  onClick={() => setConcept(c.id)}
                  className={`rounded-lg border p-2.5 text-left transition-colors ${pickedConcept === c.id ? "border-primary/50 bg-primary/10" : "bg-background hover:bg-accent"}`}
                >
                  <span className="flex items-center gap-1.5 text-[13px] font-medium">{pickedConcept === c.id && <Check className="size-3.5 text-brand-light" />}{c.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[11px] text-muted-foreground">{c.bestFor}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-medium"><Copy className="size-3.5" /> Video per produk</p>
            <div className="flex w-fit rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Video per produk">
              {Array.from({ length: Math.min(MAX_VIDEOS, defaults.maxVideos) }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={perProduct === n}
                  onClick={() => setPerProduct(n)}
                  className={`flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors ${perProduct === n ? "bg-background text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {n} video
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {perProduct > 1 ? "Produk sama, tiap video beda angle kamera & pembahasan (Unboxing · Masalah → solusi · Harga & promo · Detail & kualitas)." : "1 video per produk."}{" "}
              Total {videos * perProduct} video.
            </p>
          </div>

          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-medium"><Clock className="size-3.5" /> Durasi tiap video</p>
            <div className="flex w-fit rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Durasi video">
              {VIDEO_SECS.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={sec === n}
                  onClick={() => setSec(n)}
                  className={`flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors ${sec === n ? "bg-background text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {n} dtk
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-medium"><Users className="size-3.5" /> Pekerja (1 pekerja = 1 produk sampai videonya jadi)</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Jumlah pekerja">
              {choices.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={w === n}
                  onClick={() => setWorkers(n)}
                  className={`relative flex h-9 min-w-11 items-center justify-center rounded-lg border px-3 font-mono text-[13px] tabular-nums transition-colors ${w === n ? "border-primary/50 bg-primary/10 text-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
                >
                  {n}
                  {n === rec && <span className="absolute -top-1.5 -right-1.5 rounded-full bg-status-ok px-1 font-sans text-[9px] font-semibold text-white">✓</span>}
                </button>
              ))}
            </div>
            <p className={`text-[11px] ${heavy ? "text-status-progress" : "text-muted-foreground"}`}>
              {w} produk dikerjakan bersamaan{videos > w ? `, ${videos - w} lainnya antre (±${rounds} gelombang)` : ""}.{" "}
              {heavy
                ? `Lebih dari 2 video per akun Google: akun lebih mudah kena limit/captcha. Disarankan ${rec} untuk ${defaults.accounts} akun.`
                : `Disarankan ${rec} untuk ${defaults.accounts} akun Google aktif.`}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">Cara membuat</p>
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Cara membuat">
              {ENGINES.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  role="radio"
                  aria-checked={engine === e.id}
                  onClick={() => setEngine(e.id)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${engine === e.id ? "border-primary/50 bg-primary/10" : "bg-background text-muted-foreground hover:bg-accent"}`}
                >
                  <e.icon className="size-3.5" /> {e.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{ENGINES.find((e) => e.id === engine)!.hint}</p>
          </div>

          <p className="rounded-lg bg-muted/60 p-2.5 text-[11px] text-muted-foreground">
            Foto produk diambil otomatis (3 foto pertama galeri). Per video: 1 gambar + 1 klip {sec} dtk, jadi {videos * perProduct} gambar + {videos * perProduct} klip. Video yang gagal bisa dilanjutkan dari halaman proyeknya.
          </p>
        </div>
        <DialogFooter className="m-0 flex-row justify-end gap-2 border-t bg-muted/40 px-5 py-3">
          <button type="button" disabled={busy} onClick={onClose} className="flex h-9 items-center rounded-lg border bg-background px-3.5 text-[13px] font-medium hover:bg-accent disabled:opacity-60">Batal</button>
          <button
            type="button"
            disabled={busy || !pickedConcept || !defaults.accounts}
            title={!defaults.accounts ? "Tambahkan akun Google di Pengaturan AI dulu" : undefined}
            onClick={start}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Clapperboard className="size-4" />} Mulai {videos * perProduct} video · {w} pekerja
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
