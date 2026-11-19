"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, Clock, Download, Eye, Film, FolderKanban, Play, Search, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { openLightbox } from "@/components/media-lightbox";
import { mediaUrl } from "@/lib/media-url";
import type { GalleryVideo } from "@/lib/video-gallery";
import { removeGalleryVideo } from "./actions";

const FILTERS = [
  { id: "semua", label: "Semua" },
  { id: "baru", label: "Belum diposting" },
  { id: "terjadwal", label: "Terjadwal" },
  { id: "terposting", label: "Terposting" },
  { id: "gagal", label: "Gagal upload" },
] as const;
const when = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const STATUS: Record<GalleryVideo["status"], { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  baru: { label: "Belum diposting", cls: "bg-black/65 text-white", icon: Film },
  terjadwal: { label: "Terjadwal", cls: "bg-[#5e6ad2] text-white", icon: Clock },
  terposting: { label: "Terposting", cls: "bg-emerald-600 text-white", icon: CheckCircle2 },
  gagal: { label: "Gagal upload", cls: "bg-destructive text-white", icon: TriangleAlert },
};

/** Every exported final and hook variant: preview on hover, play, schedule, download. */
export function VideoGrid({ videos }: { videos: GalleryVideo[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("semua");
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const count = (id: string) => (id === "semua" ? videos.length : videos.filter((v) => v.status === id).length);
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return videos.filter((v) => (filter === "semua" || v.status === filter) && (!k || `${v.title} ${v.hook ?? ""} ${v.caption}`.toLowerCase().includes(k)));
  }, [videos, filter, q]);

  const remove = async (v: GalleryVideo) => {
    if (!(await confirmDialog({ title: "Hapus dari Galeri Video?", description: `“${v.title}” (${v.label}) dihapus dari galeri. File di folder proyeknya tetap ada.`, confirmLabel: "Hapus", danger: true }))) return;
    start(async () => {
      try {
        await removeGalleryVideo(v.rel);
        toast.success("Dihapus dari galeri");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal menghapus");
      }
    });
  };

  if (!videos.length)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center">
        <Film className="size-7 text-muted-foreground" />
        <p className="text-sm font-medium">Belum ada video jadi</p>
        <p className="max-w-sm text-xs text-muted-foreground">Setiap kali kamu Export di editor (termasuk varian hook A/B), videonya otomatis tersimpan di sini.</p>
      </div>
    );

  return (
    <div className="flex-1 space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${filter === f.id ? "border-primary/50 bg-primary/10 text-brand-light" : "bg-card text-muted-foreground hover:text-foreground"}`}
          >
            {f.label}
            <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{count(f.id)}</span>
          </button>
        ))}
        <label className="ml-auto flex h-8 w-full items-center gap-2 rounded-lg border bg-card px-2.5 sm:w-64">
          <Search className="size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari judul, hook, caption..." className="min-w-0 flex-1 bg-transparent text-xs outline-none" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {shown.map((v) => {
          const S = STATUS[v.status];
          return (
            <article key={v.rel} className="group overflow-hidden rounded-xl border bg-card">
              <button type="button" onClick={() => openLightbox([{ src: v.rel, kind: "video", label: `${v.title} · ${v.label}` }])} className="relative block aspect-[9/16] w-full bg-black" aria-label={`Putar ${v.title}`}>
                <video
                  src={`${mediaUrl(v.rel)}#t=0.6`}
                  muted
                  playsInline
                  loop
                  preload="metadata"
                  className="size-full object-cover"
                  onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
                  onMouseLeave={(e) => (e.currentTarget.pause(), (e.currentTarget.currentTime = 0.6))}
                />
                <span className={`absolute top-2 left-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${S.cls}`}><S.icon className="size-3" /> {S.label}</span>
                {v.label !== "Video utama" && <span className="absolute top-2 right-2 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-black">{v.label.replace("Varian ", "")}</span>}
                <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100"><Play className="size-9 rounded-full bg-black/45 p-2 text-white" /></span>
                {v.views != null && <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white"><Eye className="size-3" /> {compact.format(v.views)}</span>}
              </button>
              <div className="space-y-1.5 p-2.5">
                <p className="line-clamp-1 text-[13px] font-medium" title={v.title}>{v.title}</p>
                {v.hook && <p className="line-clamp-2 text-[11px] text-muted-foreground">“{v.hook}”</p>}
                <p className="text-[10px] text-muted-foreground">
                  {v.status === "terjadwal" && v.scheduledAt ? `Tayang ${when.format(v.scheduledAt)}` : v.status === "terposting" && v.postedAt ? `Diposting ${when.format(v.postedAt)}` : `Diekspor ${when.format(v.at)}`} · {v.sizeMb} MB
                </p>
                <div className="flex items-center gap-1 pt-0.5">
                  {v.projectId && v.status !== "terposting" && (
                    <Link href={`/jadwal?project=${v.projectId}`} className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90">
                      <CalendarClock className="size-3.5" /> {v.status === "terjadwal" ? "Atur" : "Jadwalkan"}
                    </Link>
                  )}
                  <a href={`${mediaUrl(v.rel)}?download`} title="Unduh" className="grid size-7 place-items-center rounded-md border hover:bg-accent"><Download className="size-3.5" /></a>
                  {v.projectId && <Link href={`/video/${v.projectId}`} title="Buka proyek" className="grid size-7 place-items-center rounded-md border hover:bg-accent"><FolderKanban className="size-3.5" /></Link>}
                  <button type="button" title="Hapus dari galeri" disabled={pending} onClick={() => void remove(v)} className="grid size-7 place-items-center rounded-md border text-muted-foreground hover:bg-accent hover:text-destructive"><Trash2 className="size-3.5" /></button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!shown.length && <p className="py-8 text-center text-xs text-muted-foreground">Tidak ada video untuk filter ini.</p>}
    </div>
  );
}
