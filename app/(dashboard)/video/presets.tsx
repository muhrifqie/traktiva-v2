"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ImageIcon, Loader2, PenLine, Plus, Trash2, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BACKDROPS, CONCEPT_VOICES, defaultOptions, MOODS, PRESETS } from "@/lib/presets";
import type { MyConcept } from "@/lib/settings";
import { createMyConcept, createProjectFromConcept, deleteMyConcept } from "./concept-actions";
import { createProject } from "./project-actions";

const BADGE = { Stabil: "bg-status-ok/90 text-white", Baru: "bg-primary/90 text-primary-foreground", Segera: "bg-black/60 text-white", Bebas: "bg-[#8b7cf6]/90 text-white" } as const;

/** Example frame that fades in once loaded; missing files stay a quiet placeholder (no broken-image icon). */
function Frame({ src }: { src: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const img = ref.current; // the image may have finished loading before hydration attached onLoad
    if (img?.complete && img.naturalWidth > 0) setOk(true);
  }, []);
  return (
    <>
      {!ok && <ImageIcon className="absolute inset-0 m-auto size-4 text-muted-foreground/50" />}
      <img
        ref={ref}
        src={src}
        alt=""
        loading="lazy"
        onLoad={() => setOk(true)}
        className={`size-full object-cover transition-[opacity,transform] duration-500 group-hover:scale-105 ${ok ? "opacity-100" : "opacity-0"}`}
      />
    </>
  );
}

const DUMMY = { name: "Produk", details: "", price: "", photos: [] };
const field = "w-full rounded-lg border bg-background px-3 py-2 text-[13px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20";
const label = "mb-1 block text-xs font-medium";

/** "+ Buat konsep sendiri": a popup form; the saved concept shows up as a card in the gallery below. */
export function NewConceptButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const blank = { name: "", idea: "", scenes: 3, background: "", cast: "", mood: "natural", voice: "female", hook: "" };
  const [form, setForm] = useState(blank);
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = () =>
    start(async () => {
      try {
        const c = await createMyConcept(form);
        toast.success(`Konsep "${c.name}" dibuat`);
        setOpen(false);
        setForm(blank);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal menyimpan konsep");
      }
    });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">
        <Plus className="size-4" /> Buat konsep sendiri
      </button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Buat konsep sendiri</DialogTitle>
            <DialogDescription>Ceritakan video yang kamu mau. Konsepnya tersimpan sebagai kartu dan bisa dipakai berkali-kali; AI menyusun scene-nya mengikuti ceritamu.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div>
              <label className={label} htmlFor="concept-name">Nama konsep</label>
              <input id="concept-name" autoFocus required maxLength={60} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Contoh: Unboxing santai di kamar" className={field} />
            </div>
            <div>
              <label className={label} htmlFor="concept-idea">Videonya ingin seperti apa?</label>
              <textarea
                id="concept-idea"
                required
                minLength={10}
                maxLength={1500}
                rows={5}
                value={form.idea}
                onChange={(e) => set("idea", e.target.value)}
                placeholder="Contoh: Buka paket di atas kasur, tunjukkan isi satu per satu dari dekat, lalu dipakai langsung. Suasana santai, cahaya pagi dari jendela, gaya ngobrol ke teman."
                className={`${field} resize-y`}
              />
              <p className="mt-1 text-right text-[11px] text-muted-foreground">{form.idea.length}/1500</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={label} htmlFor="concept-cast">Siapa yang tampil? <span className="font-normal text-muted-foreground">· kosongkan = AI yang atur</span></label>
                <textarea
                  id="concept-cast"
                  rows={3}
                  maxLength={300}
                  value={form.cast}
                  onChange={(e) => set("cast", e.target.value)}
                  placeholder={"Contoh: cewek setengah badan dari pinggang ke bawah pakai celana, wajah tidak kelihatan.\nAtau: cewek berhijab ngomong ke kamera sambil pegang produk."}
                  className={`${field} resize-y`}
                />
              </div>
              <div>
                <label className={label} htmlFor="concept-mood">Suasana</label>
                <select id="concept-mood" value={form.mood} onChange={(e) => set("mood", e.target.value)} className={field}>
                  {MOODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="concept-voice">Suara video</label>
                <select id="concept-voice" value={form.voice} onChange={(e) => set("voice", e.target.value)} className={field}>
                  {CONCEPT_VOICES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="concept-scenes">Scene per video</label>
                <select id="concept-scenes" value={form.scenes} onChange={(e) => set("scenes", Number(e.target.value))} className={field}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} scene (±{n * 10} dtk)</option>)}
                </select>
              </div>
            </div>
            <p className="-mt-1 text-[11px] text-muted-foreground">1 scene = 1 potongan video ±10 dtk dengan 1 gambar & 1 gerakan; semua scene digabung jadi satu video.</p>
            <div>
              <label className={label} htmlFor="concept-bg">Background <span className="font-normal text-muted-foreground">· kosongkan = AI pilih sesuai produk</span></label>
              <input id="concept-bg" maxLength={300} value={form.background === "auto" ? "" : form.background} onChange={(e) => set("background", e.target.value)} placeholder="Contoh: meja kayu dekat jendela, ada tanaman kecil, cahaya pagi" className={field} />
            </div>
            <div>
              <label className={label} htmlFor="concept-hook">Kalimat pembuka (hook) <span className="font-normal text-muted-foreground">· opsional</span></label>
              <input id="concept-hook" maxLength={150} value={form.hook} onChange={(e) => set("hook", e.target.value)} placeholder="Contoh: Jangan beli sebelum lihat ini!" className={field} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" disabled={pending} onClick={() => setOpen(false)} className="h-9 rounded-lg border px-3.5 text-[13px] font-medium hover:bg-accent disabled:opacity-60">Batal</button>
              <button type="submit" disabled={pending || !form.name.trim() || form.idea.trim().length < 10} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                {pending && <Loader2 className="size-3.5 animate-spin" />} Simpan konsep
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Card of one of the owner's own concepts (first in the gallery). */
function MyConceptCard({ c, busy, onUse }: { c: MyConcept; busy: boolean; onUse: () => void }) {
  const router = useRouter();
  const [removing, startRemove] = useTransition();
  const remove = async () => {
    if (!(await confirmDialog({ title: `Hapus konsep "${c.name}"?`, description: "Proyek yang sudah dibuat dari konsep ini tetap ada.", confirmLabel: "Hapus", danger: true }))) return;
    startRemove(async () => {
      await deleteMyConcept(c.id);
      router.refresh();
    });
  };
  const backdrop = !c.background || c.background === "auto" ? "Otomatis" : BACKDROPS.find((b) => b.value === c.background)?.label ?? c.background;
  const OLD: Record<string, string> = { hands: "Tangan saja", woman: "Cewek", man: "Cowok", none: "Tanpa orang" };
  const cast = c.cast ? OLD[c.cast] ?? c.cast : undefined;
  const mood = MOODS.find((x) => x.value === c.mood)?.label;
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-ring/40">
      <div className="relative flex aspect-[16/7] flex-col justify-end gap-1 bg-gradient-to-br from-muted to-muted/30 p-4">
        <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">Konsep saya</span>
        <span className="grid size-9 place-items-center rounded-full bg-background/70 text-black dark:text-white"><PenLine className="size-4" /></span>
        <p className="line-clamp-2 text-xs italic text-muted-foreground">&ldquo;{c.idea}&rdquo;</p>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <p className="text-[13px] font-semibold leading-snug">{c.name}</p>
        <p className="line-clamp-3 text-xs text-muted-foreground">{c.idea}</p>
        {(cast || mood) && <p className="text-xs"><span className="text-muted-foreground">Gaya: </span>{[cast, mood].filter(Boolean).join(" · ")}</p>}
        <p className="text-xs"><span className="text-muted-foreground">Background: </span>{backdrop}</p>
        <div className="mt-auto flex items-center gap-2 pt-2">
          <span className="flex flex-1 items-center gap-1 text-[11px] text-muted-foreground">
            {c.scenes} scene · {c.audio === "off" ? <><VolumeX className="size-3" /> tanpa suara</> : <><Volume2 className="size-3" /> {c.voice === "male" ? "suara cowok" : c.voice === "female" ? "suara cewek" : "pakai suara"}</>}
          </span>
          <button type="button" title="Hapus konsep" aria-label="Hapus konsep" disabled={removing || busy} onClick={remove} className="grid size-8 place-items-center rounded-lg border text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-60">
            {removing ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          </button>
          <button type="button" disabled={busy} onClick={onUse} className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            Pakai konsep ini
          </button>
        </div>
      </div>
    </article>
  );
}

export function PresetGallery({ mine }: { mine: MyConcept[] }) {
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<string | null>(null);
  const run = (id: string, go: () => Promise<void>) => {
    setPicked(id);
    start(async () => {
      try {
        await go(); // redirects to the wizard
      } catch (e) {
        if (e instanceof Error && !e.message.includes("NEXT_REDIRECT")) toast.error(e.message);
        else throw e;
      }
    });
  };
  const pick = (id: string) => run(id, () => createProject(id));

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {mine.map((c) => (
        <MyConceptCard key={c.id} c={c} busy={pending} onUse={() => run(c.id, () => createProjectFromConcept(c.id))} />
      ))}
      {/* the free-form preset is reached through "+ Buat konsep sendiri", not as its own card */}
      {PRESETS.filter((p) => !p.custom).map((p) => {
        const scenes = p.available ? p.scenes(DUMMY, defaultOptions(p)).length : 0;
        const frames = p.available ? Math.min(3, scenes) : 3;
        return (
          <article key={p.id} className={`group flex flex-col overflow-hidden rounded-xl border bg-card transition-colors ${p.available ? "hover:border-ring/40" : "opacity-70"}`}>
            {/* example frames: what the result looks like */}
            <div className={`relative grid gap-1 bg-muted/60 p-1 ${frames === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
              {Array.from({ length: frames }, (_, i) => i + 1).map((n) => (
                <div key={n} className={`relative overflow-hidden rounded-md bg-muted ${frames === 2 ? "aspect-[27/32]" : "aspect-[9/16]"}`}>
                  {/* ?v: the example files get regenerated now and then; skip the browser's old copy */}
                  <Frame src={`/presets/${p.id}-${n}.jpg?v=3`} />
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] font-medium text-white">{n}</span>
                </div>
              ))}
              <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">Contoh hasil</span>
              {p.badge && <span className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur ${BADGE[p.badge]}`}>{p.badge}</span>}
            </div>

            <div className="flex flex-1 flex-col gap-1.5 p-3">
              <p className="text-[13px] font-semibold leading-snug">{p.title}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{p.summary}</p>
              <p className="text-xs"><span className="text-muted-foreground">Cocok untuk: </span>{p.bestFor}</p>
              <div className="flex flex-wrap items-center gap-1 pt-0.5">
                {p.pipeline.map((step, i) => (
                  <span key={step} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    {i > 0 && <ArrowRight className="size-3" />}
                    <span className="rounded-md border bg-background px-1.5 py-0.5">{step}</span>
                  </span>
                ))}
              </div>
              <div className="mt-auto flex items-center gap-2 pt-2">
                <span className="flex-1 text-[11px] text-muted-foreground">
                  {p.available ? `${scenes} scene · ±${scenes * 6} detik${p.silent ? " · tanpa suara" : ""}` : "Segera hadir"}
                </span>
                <button
                  type="button"
                  disabled={!p.available || pending}
                  onClick={() => pick(p.id)}
                  className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                >
                  {pending && picked === p.id ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {p.available ? "Pakai konsep ini" : "Segera"}
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
