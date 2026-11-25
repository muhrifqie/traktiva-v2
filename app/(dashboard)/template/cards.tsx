"use client";

import { useRef, useState, useTransition } from "react";
import { Check, Clapperboard, Copy, Loader2, Mic, Palette, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { fillLine } from "@/lib/vo-templates";
import { createProjectFromConcept } from "../video/concept-actions";

// Cards of the server's template gallery (Galeri Template page + Buat Video Reels). Media are public URLs on
// download.traktiva.site; offline they stay a quiet placeholder.

export type ConceptCard = { id: number; title: string; summary: string; category: string; cover: string | null; preview: string | null; fresh: boolean; scenes: number; voice: string; bestFor: string; idea: string };
export type StyleCard = { id: number; title: string; summary: string; category: string; cover: string | null; preview: string | null; fresh: boolean; note: string };
export type ScriptCard = { id: number; title: string; summary: string; category: string; fresh: boolean; hint: string; lines: string[] };

const pill = "rounded-full px-2 py-0.5 text-[10px] font-semibold";

/** Cover image, or the preview video's first frame; the preview plays while hovered. */
function Media({ cover, preview, icon: I }: { cover: string | null; preview: string | null; icon: typeof Clapperboard }) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const still = cover ?? null;
  return (
    <div
      className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-gradient-to-br from-muted to-muted/30"
      onMouseEnter={() => void video.current?.play().catch(() => {})}
      onMouseLeave={() => video.current && (video.current.pause(), (video.current.currentTime = 0.5))}
    >
      {still && !failed && <img src={still} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover opacity-40 blur-xl" />}
      {preview && !failed ? (
        <video ref={video} src={`${preview}#t=0.5`} poster={still ?? undefined} muted loop playsInline preload="metadata" onError={() => setFailed(true)} className="absolute inset-0 m-auto h-full w-auto max-w-full object-cover shadow-lg" />
      ) : still && !failed ? (
        <img src={still} alt="" loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 m-auto h-full w-auto max-w-full object-cover shadow-lg" />
      ) : (
        <I className="size-6 text-muted-foreground/60" />
      )}
    </div>
  );
}

function Badges({ fresh, category }: { fresh: boolean; category: string }) {
  return (
    <div className="absolute top-2 left-2 flex gap-1">
      {fresh && <span className={`${pill} bg-primary/90 text-primary-foreground`}>Baru</span>}
      {category && <span className={`${pill} bg-black/60 font-medium text-white`}>{category}</span>}
    </div>
  );
}

export function ConceptTemplateCard({ c }: { c: ConceptCard }) {
  const [pending, start] = useTransition();
  const use = () =>
    start(async () => {
      try {
        await createProjectFromConcept(`tpl-${c.id}`); // redirects to the new project
      } catch (e) {
        if (e instanceof Error && !e.message.includes("NEXT_REDIRECT")) toast.error(e.message);
        else throw e;
      }
    });
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-ring/40">
      <div className="relative">
        <Media cover={c.cover} preview={c.preview} icon={Clapperboard} />
        <Badges fresh={c.fresh} category={c.category} />
        <span className={`${pill} absolute top-2 right-2 bg-black/60 font-medium text-white`}>Template</span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="text-[13px] font-semibold leading-snug">{c.title}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{c.summary || c.idea}</p>
        {c.bestFor && <p className="text-xs"><span className="text-muted-foreground">Cocok untuk: </span>{c.bestFor}</p>}
        <div className="mt-auto flex items-center gap-2 pt-2">
          <span className="flex min-w-0 flex-1 items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground">
            {c.scenes} scene · {c.voice === "none" ? <><VolumeX className="size-3" /> tanpa suara</> : <><Volume2 className="size-3" /> {c.voice === "male" ? "suara cowok" : "suara cewek"}</>}
          </span>
          <button type="button" disabled={pending} onClick={use} className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {pending && <Loader2 className="size-3.5 animate-spin" />} Pakai template
          </button>
        </div>
      </div>
    </article>
  );
}

export function StyleTemplateCard({ s }: { s: StyleCard }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <div className="relative">
        <Media cover={s.cover} preview={s.preview} icon={Palette} />
        <Badges fresh={s.fresh} category={s.category} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="text-[13px] font-semibold leading-snug">{s.title}</p>
        <p className="line-clamp-3 text-xs text-muted-foreground">{s.note || s.summary}</p>
        <p className="mt-auto pt-2 text-[11px] text-muted-foreground">Pakai di Editor proyek → tab <b className="font-medium text-foreground">Efek</b> → Format video laris.</p>
      </div>
    </article>
  );
}

export function ScriptTemplateCard({ s }: { s: ScriptCard }) {
  const [copied, setCopied] = useState<number | null>(null);
  const sample = (l: string) => fillLine(l, { name: "{nama}", price: "{harga}" });
  const copy = (i: number) =>
    navigator.clipboard.writeText(fillLine(s.lines[i], { name: "produk ini", price: "" })).then(() => {
      setCopied(i);
      toast.success("Naskah disalin");
      setTimeout(() => setCopied(null), 1500);
    });
  return (
    <article className="flex flex-col gap-2 rounded-xl border bg-card p-3.5">
      <div className="flex items-start gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted"><Mic className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold">
            {s.title}
            {s.fresh && <span className={`${pill} bg-primary/90 text-primary-foreground`}>Baru</span>}
          </p>
          <p className="text-xs text-muted-foreground">{s.hint || s.summary}</p>
        </div>
      </div>
      <ul className="grid gap-1.5">
        {s.lines.map((l, i) => (
          <li key={i} className="group/line flex items-start gap-2 rounded-lg border bg-background px-2.5 py-2 text-xs leading-relaxed">
            <span className="min-w-0 flex-1">{sample(l)}</span>
            <button type="button" onClick={() => void copy(i)} title="Salin naskah" aria-label="Salin naskah" className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
              {copied === i ? <Check className="size-3.5 text-status-ok" /> : <Copy className="size-3.5" />}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">Di Studio, pilih gaya <b className="font-medium text-foreground">{s.title}</b> di kotak Naskah voice-over: nama & harga produk diisi otomatis.</p>
    </article>
  );
}
