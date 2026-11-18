"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Clapperboard, Download, ExternalLink, Film, Maximize2, Search, Send, X } from "lucide-react";
import { PostDialog, type PostVideo } from "@/components/post-dialog";
import { openLightbox, type LightboxItem } from "@/components/media-lightbox";
import { mediaUrl } from "@/lib/media-url";
import { usePersistentState } from "@/lib/use-persistent-state";
import type { GalleryVideo } from "@/lib/video-gallery";

type Item = GalleryVideo & { date: string };

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const toPost = (v: Item): PostVideo => ({ video: v.rel, label: v.label, projectId: v.projectId, caption: v.caption, productId: v.productId });
const POST_BADGE: Record<string, { label: string; cls: string }> = {
  posted: { label: "Terposting", cls: "bg-status-ok text-white" },
  scheduled: { label: "Terjadwal", cls: "bg-[#5e6ad2] text-white" },
  queued: { label: "Antre posting", cls: "bg-black/70 text-white" },
  posting: { label: "Sedang diposting", cls: "bg-status-progress text-white" },
  failed: { label: "Posting gagal", cls: "bg-destructive text-white" },
};

export function VideoGrid({ videos }: { videos: Item[] }) {
  const router = useRouter();
  const [q, setQ] = usePersistentState("galeri-video:q", "");
  const k = q.trim().toLowerCase();
  const shown = useMemo(() => (k ? videos.filter((v) => `${v.project} ${v.label} ${v.concept}`.toLowerCase().includes(k)) : videos), [videos, k]);
  const items: LightboxItem[] = shown.map((v) => ({ src: v.rel, kind: "video", label: `${v.project} · ${v.label}` }));
  const [selected, setSelected] = useState<string[]>([]);
  const [posting, setPosting] = useState<PostVideo[] | null>(null);
  const toggle = (rel: string) => setSelected((s) => (s.includes(rel) ? s.filter((x) => x !== rel) : [...s, rel]));

  // renders finish in the background: pick up new videos without a manual refresh
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), 20_000);
    return () => clearInterval(t);
  }, [router]);

  if (!videos.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-12 text-center">
        <Film className="size-7 text-muted-foreground" />
        <p className="text-sm font-medium">Belum ada video jadi</p>
        <p className="max-w-sm text-xs text-muted-foreground">Video yang selesai dirender di Proyek Video atau dari Etalase otomatis muncul di sini.</p>
        <Link href="/video" className="mt-2 flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">
          <Clapperboard className="size-4" /> Buat video
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <label className="flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border bg-card px-3 text-[13px] focus-within:border-ring">
        <Search className="size-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari produk, varian, atau konsep..." className="min-w-0 flex-1 bg-transparent outline-none" />
        {k && <span className="text-[11px] text-muted-foreground">{shown.length}</span>}
      </label>

      <div className={`sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs backdrop-blur ${selected.length ? "border-primary/40 bg-primary/10" : "bg-card/80"}`}>
        {selected.length ? (
          <>
            <span className="font-medium">{selected.length} video dipilih</span>
            <button type="button" onClick={() => setSelected([])} className="flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-3" /> Batal pilih</button>
            <button type="button" onClick={() => setPosting(videos.filter((v) => selected.includes(v.rel)).map(toPost))} className="ml-auto flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              <Send className="size-3.5" /> Posting {selected.length} video
            </button>
          </>
        ) : (
          <span className="text-muted-foreground">Klik Posting di video, atau centang beberapa untuk diposting sekaligus.</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {shown.map((v, i) => (
          <article key={v.rel} className={`group flex flex-col overflow-hidden rounded-xl border bg-card transition-colors ${selected.includes(v.rel) ? "border-primary ring-1 ring-primary" : "hover:border-ring/40"}`}>
            <div className="relative aspect-[9/16] bg-black">
              <video
                src={`${mediaUrl(v.rel)}#t=0.5`}
                muted
                playsInline
                loop
                preload="metadata"
                onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
                onMouseLeave={(e) => {
                  e.currentTarget.pause();
                  e.currentTarget.currentTime = 0.5;
                }}
                onClick={() => openLightbox(items, i)}
                className="size-full cursor-pointer object-cover"
              />
              <button type="button" onClick={() => openLightbox(items, i)} aria-label="Putar besar" className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-md bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100">
                <Maximize2 className="size-3.5" />
              </button>
              <button
                type="button"
                role="checkbox"
                aria-checked={selected.includes(v.rel)}
                aria-label={`Pilih ${v.label}`}
                onClick={() => toggle(v.rel)}
                className={`absolute top-1.5 left-1.5 grid size-6 place-items-center rounded-md border-2 transition-colors ${selected.includes(v.rel) ? "border-primary bg-primary text-primary-foreground" : "border-white/80 bg-black/45 text-transparent opacity-80 hover:opacity-100"}`}
              >
                <Check className="size-3.5" />
              </button>
              {v.posts.length > 0 && (
                <div className="pointer-events-none absolute right-1.5 bottom-1.5 flex flex-col items-end gap-0.5">
                  {v.posts.slice(0, 2).map((p, k) => (
                    <span key={k} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${POST_BADGE[p.status]?.cls ?? "bg-black/70 text-white"}`}>
                      {POST_BADGE[p.status]?.label ?? p.status} @{p.username}
                    </span>
                  ))}
                </div>
              )}
              {v.sec && <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[10px] text-white">{v.sec} dtk</span>}
            </div>
            <div className="flex flex-1 flex-col gap-0.5 p-2.5">
              <p className="line-clamp-2 text-xs leading-snug font-medium" title={v.project}>{v.project}</p>
              <p className="truncate text-[11px] text-muted-foreground" title={v.label}>{v.label}</p>
              <p className="text-[10px] text-muted-foreground">{v.date} · {mb(v.size)}</p>
              <div className="mt-auto flex gap-1.5 pt-1.5">
                <button type="button" onClick={() => setPosting([toPost(v)])} className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-primary text-[11px] font-medium text-primary-foreground hover:bg-primary/90">
                  <Send className="size-3.5" /> Posting
                </button>
                <a href={`${mediaUrl(v.rel)}?download`} download aria-label="Unduh" title="Unduh" className="grid size-7 place-items-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground">
                  <Download className="size-3.5" />
                </a>
                <Link href={`/video/${v.projectId}`} aria-label="Buka proyek" title="Buka proyek" className="grid size-7 place-items-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground">
                  <ExternalLink className="size-3.5" />
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
      <PostDialog
        videos={posting}
        onClose={() => {
          setPosting(null);
          setSelected([]);
          router.refresh();
        }}
      />
    </div>
  );
}
