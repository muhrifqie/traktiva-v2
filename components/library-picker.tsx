"use client";

import { useEffect, useState } from "react";
import { ImageIcon, Library, Loader2 } from "lucide-react";
import { getLibrary } from "@/app/(dashboard)/video/project-actions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LibraryItem } from "@/lib/library";
import { mediaUrl } from "@/lib/media-url";

type Lib = { uploads: LibraryItem[]; generated: LibraryItem[] };

/** Pick a picture from the user's library (their uploads + earlier AI images) instead of uploading again. */
export function LibraryPicker({ open, onClose, onPick, title = "Ambil dari Pustaka" }: { open: boolean; onClose: () => void; onPick: (rel: string) => void; title?: string }) {
  const [lib, setLib] = useState<Lib | null>(null);
  const [tab, setTab] = useState<"uploads" | "generated">("uploads");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    getLibrary().then((l) => alive && setLib(l), () => alive && setLib({ uploads: [], generated: [] }));
    return () => {
      alive = false;
    };
  }, [open]);

  const items = lib?.[tab] ?? [];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Library className="size-4" /> {title}</DialogTitle>
          <DialogDescription>Semua foto yang pernah kamu unggah dan gambar hasil AI tersimpan di sini. Pilih satu untuk dipakai lagi.</DialogDescription>
        </DialogHeader>
        <div className="flex w-fit rounded-lg bg-muted p-0.5 text-xs font-medium">
          {(["uploads", "generated"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex h-7 items-center gap-1.5 rounded-md px-3 ${tab === t ? "bg-background shadow-xs ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t === "uploads" ? "Unggahanku" : "Hasil AI"}
              <span className="text-[10px] text-muted-foreground">{lib ? lib[t].length : ""}</span>
            </button>
          ))}
        </div>
        <div className="max-h-[55vh] overflow-y-auto">
          {!lib ? (
            <div className="grid place-items-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-12 text-center">
              <ImageIcon className="size-6 text-muted-foreground" />
              <p className="text-[13px] font-medium">{tab === "uploads" ? "Belum ada unggahan" : "Belum ada gambar AI"}</p>
              <p className="text-xs text-muted-foreground">{tab === "uploads" ? "Foto yang kamu unggah di proyek otomatis masuk ke sini." : "Gambar scene buatan AI akan muncul di sini."}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {items.map((it) => (
                <button
                  key={it.rel}
                  type="button"
                  title={it.source ? `${it.name} · ${it.source}` : it.name}
                  onClick={() => {
                    onPick(it.rel);
                    onClose();
                  }}
                  className="group relative aspect-square overflow-hidden rounded-lg border bg-muted outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <img src={mediaUrl(it.rel)} alt={it.name} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-4 pb-1 text-left text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {it.source ?? it.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
