"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, CircleAlert, Download, FolderOpen, Loader2, PencilRuler, RotateCw } from "lucide-react";
import type { VideoProject } from "@/lib/db/schema";
import { mediaUrl } from "@/lib/media-url";
import { renderOverlays } from "@/lib/render-overlays";
import { openProjectFolder } from "../project-actions";
import { exportQuick, prepareQuickEdit } from "./quick-actions";

type Project = Omit<VideoProject, "updatedAt"> & { updatedAt: number };

const STAGES = ["Menyusun suara & caption", "Menggambar caption", "Membuat video final 1080p"] as const;

/**
 * Result tab of a Video Pendek: no timeline editor. The ready-to-post version is prepared and exported on its own,
 * then shown with download / folder / schedule. "Edit di timeline" stays available for manual tweaks.
 */
export function QuickResult({ p, onEdit }: { p: Project; onEdit: () => void }) {
  const router = useRouter();
  const exported = !!(p.finalPath && p.edit?.exportedAt);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef<number | null>(null);

  useEffect(() => {
    if (exported || started.current === attempt) return; // dev StrictMode mounts twice: one export per attempt
    started.current = attempt;
    void (async () => {
      try {
        const edit = await prepareQuickEdit(p.id);
        setStage(1);
        const overlays = await renderOverlays(edit);
        setStage(2);
        await exportQuick(p.id, overlays);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal membuat video final");
      }
    })();
  }, [exported, attempt, p.id, router]);

  if (!exported) {
    return (
      <section className="flex flex-col items-center gap-4 rounded-xl border bg-card px-6 py-12 text-center">
        {error ? <CircleAlert className="size-8 text-destructive" /> : <Loader2 className="size-8 animate-spin text-muted-foreground" />}
        <div className="space-y-1">
          <p className="text-sm font-semibold">{error ? "Video final belum berhasil dibuat" : "Menyiapkan video final..."}</p>
          <p className="max-w-md text-xs text-muted-foreground">{error ?? "Suara, caption, dan export dibuat otomatis. Biasanya kurang dari satu menit."}</p>
        </div>
        {!error && (
          <ol className="w-full max-w-xs space-y-1.5 text-left">
            {STAGES.map((s, i) => (
              <li key={s} className={`flex items-center gap-2 text-xs ${i <= stage ? "text-foreground" : "text-muted-foreground"}`}>
                {i < stage ? <Check className="size-3.5 text-status-ok" /> : i === stage ? <Loader2 className="size-3.5 animate-spin" /> : <span className="size-3.5 rounded-full border" />}
                {s}
              </li>
            ))}
          </ol>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {error && (
            <button type="button" onClick={() => (setError(null), setStage(0), setAttempt((n) => n + 1))} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">
              <RotateCw className="size-4" /> Coba lagi
            </button>
          )}
          <button type="button" onClick={onEdit} className="flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-[13px] font-medium hover:bg-accent">
            <PencilRuler className="size-4" /> Edit di timeline
          </button>
        </div>
      </section>
    );
  }

  const src = `${mediaUrl(p.finalPath!)}?v=${p.edit!.exportedAt}`; // new export = new URL (no cached old video)
  return (
    <section className="grid gap-5 rounded-xl border bg-card p-4 md:grid-cols-[minmax(0,320px)_1fr]">
      <video src={src} controls playsInline className="aspect-[9/16] w-full rounded-lg bg-black object-contain" />
      <div className="flex flex-col gap-4">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Check className="size-4 text-status-ok" /> Video siap diposting</p>
          <p className="text-xs text-muted-foreground">Sudah lengkap dengan suara & caption, 1080p. Tersimpan juga di Galeri Video.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={src} download={`${(p.title || p.product.name || "video").slice(0, 60)}.mp4`} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">
            <Download className="size-4" /> Unduh
          </a>
          <Link href="/jadwal" className="flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-[13px] font-medium hover:bg-accent">
            <CalendarClock className="size-4" /> Jadwalkan upload
          </Link>
          <button type="button" onClick={() => void openProjectFolder(p.id)} className="flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-[13px] font-medium hover:bg-accent">
            <FolderOpen className="size-4" /> Buka folder
          </button>
        </div>
        {p.caption && (
          <div className="space-y-1">
            <p className="text-xs font-medium">Caption postingan</p>
            <p className="whitespace-pre-line rounded-lg border bg-background p-3 text-xs text-muted-foreground">{p.caption}</p>
          </div>
        )}
        <button type="button" onClick={onEdit} className="mt-auto flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <PencilRuler className="size-3.5" /> Mau ubah caption atau suara? Edit di timeline
        </button>
      </div>
    </section>
  );
}
