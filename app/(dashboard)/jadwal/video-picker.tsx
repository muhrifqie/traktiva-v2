"use client";

import { useState } from "react";
import { Check, Film, Play } from "lucide-react";
import { openLightbox } from "@/components/media-lightbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mediaUrl } from "@/lib/media-url";
import type { Uploadable } from "./actions";

/**
 * The video(s) to post: a small card in the form (thumbnails of the picked videos + project name) that opens a gallery
 * of every exported video, grouped by project. Videos are picked one by one within a project (main video, variants
 * A–D); picking a video of another project switches to that project. `scheduled` = already has a job (shown, still
 * pickable: posting the same video to another account is fine).
 */
export function VideoPicker({
  videos, projectId, picked, scheduled, onChange,
}: {
  videos: Uploadable[];
  projectId: number | null;
  picked: string[];
  scheduled: (v: Uploadable) => boolean;
  onChange: (projectId: number, picked: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  // draft inside the dialog; applied with "Pakai"
  const [draft, setDraft] = useState<{ projectId: number | null; picked: string[] }>({ projectId, picked });
  const groups = [...new Map(videos.map((v) => [v.projectId, v.title])).entries()].map(([id, title]) => ({ id, title, items: videos.filter((v) => v.projectId === id) }));
  const chosen = videos.filter((v) => picked.includes(v.video));
  const title = groups.find((g) => g.id === projectId)?.title;

  const toggle = (v: Uploadable) =>
    setDraft((d) =>
      d.projectId !== v.projectId
        ? { projectId: v.projectId, picked: [v.video] } // another project: start over with this video
        : { projectId: d.projectId, picked: d.picked.includes(v.video) ? d.picked.filter((x) => x !== v.video) : [...d.picked, v.video] },
    );
  const openGallery = () => {
    setDraft({ projectId, picked });
    setOpen(true);
  };

  return (
    <>
      <button type="button" onClick={openGallery} className="flex w-full items-center gap-2.5 rounded-md border bg-background p-1.5 pr-3 text-left hover:border-ring/50">
        <span className="flex shrink-0 gap-1">
          {chosen.length ? (
            chosen.slice(0, 4).map((v) => (
              <span key={v.video} className="relative block h-12 w-[27px] overflow-hidden rounded bg-black">
                <video src={`${mediaUrl(v.video)}#t=0.5`} muted preload="metadata" className="size-full object-cover" />
              </span>
            ))
          ) : (
            <span className="grid h-12 w-[27px] place-items-center rounded bg-muted"><Film className="size-3.5 text-muted-foreground" /></span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{title ?? "Belum ada video dipilih"}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{chosen.length ? `${chosen.length} video: ${chosen.map((v) => v.label).join(", ")}` : "Klik untuk memilih dari galeri"}</span>
        </span>
        <span className="shrink-0 rounded-md border px-2.5 py-1 text-[12px] font-medium">{chosen.length ? "Ganti video" : "Pilih video"}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-x-hidden overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Pilih video</DialogTitle>
            <DialogDescription>Video yang sudah jadi, terbaru di depan. Pilih satu atau beberapa video dari proyek yang sama (video utama dan variannya).</DialogDescription>
          </DialogHeader>
          {/* one gallery grid, newest first; a project's videos (main + variants) sit next to each other */}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {videos.map((v) => {
              const on = draft.projectId === v.projectId && draft.picked.includes(v.video);
              const done = scheduled(v);
              return (
                <div key={v.video} className={`relative min-w-0 overflow-hidden rounded-lg border-2 transition-colors ${on ? "border-primary" : "border-transparent hover:border-ring/40"}`}>
                  <button type="button" onClick={() => toggle(v)} aria-pressed={on} aria-label={`${on ? "Batal pilih" : "Pilih"} ${v.title} ${v.label}`} className="block w-full text-left">
                    <span className="relative block aspect-[9/16] bg-black">
                      <video src={`${mediaUrl(v.video)}#t=0.5`} muted preload="metadata" className="size-full object-cover" />
                      <span className={`absolute top-1.5 left-1.5 grid size-5 place-items-center rounded-full border-2 ${on ? "border-primary bg-primary text-primary-foreground" : "border-white/80 bg-black/30"}`}>{on && <Check className="size-3" />}</span>
                      {done && <span className="absolute inset-x-1.5 bottom-1.5 rounded bg-black/70 px-1 py-0.5 text-center text-[10px] text-white">Sudah dijadwalkan</span>}
                    </span>
                    <span className="block px-1.5 pt-1 pb-1.5">
                      <span className="line-clamp-2 text-[11px] leading-snug font-medium">{v.title}</span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">{v.label}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openLightbox([{ src: v.video, kind: "video", label: `${v.title} · ${v.label}` }])}
                    className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70"
                    aria-label={`Putar ${v.label}`}
                  >
                    <Play className="size-3" />
                  </button>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button
              disabled={!draft.picked.length || draft.projectId == null}
              onClick={() => {
                if (draft.projectId != null && draft.picked.length) onChange(draft.projectId, draft.picked);
                setOpen(false);
              }}
            >
              {draft.picked.length ? `Pakai ${draft.picked.length} video` : "Pilih video dulu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
