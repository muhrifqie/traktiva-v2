"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, ImageIcon, Loader2, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { mediaUrl } from "@/lib/media-url";
import { usePersistentState } from "@/lib/use-persistent-state";
import { deleteFromLibrary, uploadToLibrary } from "./actions";
import { GaleriTabs } from "./tabs";

type Item = { rel: string; name: string; at: number; date: string; source?: string };

export function LibraryGrid({ tab, uploads, generated }: { tab: "uploads" | "ai"; uploads: Item[]; generated: Item[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = usePersistentState("galeri:q", "");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    const form = new FormData();
    for (const f of Array.from(files)) form.append("files", f);
    start(async () => {
      try {
        const n = await uploadToLibrary(form);
        toast.success(`${n} gambar masuk Pustaka`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal mengunggah");
      }
    });
    if (fileRef.current) fileRef.current.value = "";
  };
  const remove = async (it: Item) =>
    (await confirmDialog({ title: `Hapus "${it.name}" dari Pustaka?`, description: "Proyek yang sudah memakai gambar ini tidak terpengaruh.", danger: true })) &&
    start(async () => {
      try {
        await deleteFromLibrary(it.rel);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal");
      }
    });

  const all = tab === "ai" ? generated : uploads;
  const k = q.trim().toLowerCase();
  const items = k ? all.filter((it) => `${it.name} ${it.source ?? ""}`.toLowerCase().includes(k)) : all;

  return (
    <div
      className="relative flex-1 space-y-4"
      onDragOver={(e) => {
        if (tab !== "uploads") return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        if (tab !== "uploads") return;
        e.preventDefault();
        setDrag(false);
        upload(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <GaleriTabs current={tab} counts={{ uploads: uploads.length, ai: generated.length }} />
        <label className="ml-auto flex h-8 w-full items-center gap-2 rounded-lg border bg-card px-3 text-xs focus-within:border-ring sm:w-64">
          <Search className="size-3.5 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari gambar..." className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        {tab === "uploads" && (
          <button type="button" disabled={pending} onClick={() => fileRef.current?.click()} className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Unggah gambar
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>

      <p className="text-xs text-muted-foreground">
        {tab === "uploads"
          ? "Foto produk & gambar yang kamu unggah tersimpan di sini. Di Studio, pilih \"Dari Pustaka\" supaya tidak perlu unggah ulang."
          : "Gambar adegan buatan AI dari semua proyek. Bisa dipakai lagi sebagai gambar adegan di proyek lain."}
      </p>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-12 text-center">
          <ImageIcon className="size-7 text-muted-foreground" />
          <p className="text-sm font-medium">{k ? "Tidak ada yang cocok" : tab === "uploads" ? "Pustaka masih kosong" : "Belum ada gambar AI"}</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {tab === "uploads" ? "Tarik & lepas gambar ke sini, atau klik Unggah gambar. Foto yang kamu unggah di proyek juga otomatis masuk." : "Buat gambar adegan di Studio, hasilnya otomatis muncul di sini."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 2xl:grid-cols-8">
          {items.map((it) => (
            <figure key={it.rel} className="group relative overflow-hidden rounded-xl border bg-card">
              <a href={mediaUrl(it.rel)} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden bg-muted">
                <img src={mediaUrl(it.rel)} alt={it.name} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
              </a>
              <figcaption className="space-y-0.5 p-2">
                <p className="truncate text-[11px] font-medium">{it.source ?? it.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">{it.source ? `${it.name} · ` : ""}{it.date}</p>
              </figcaption>
              <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <a href={`${mediaUrl(it.rel)}?download`} aria-label="Unduh" className="grid size-7 place-items-center rounded-md bg-black/60 text-white hover:bg-black/80"><Download className="size-3.5" /></a>
                {tab === "uploads" && (
                  <button type="button" aria-label="Hapus dari Pustaka" onClick={() => remove(it)} className="grid size-7 place-items-center rounded-md bg-black/60 text-white hover:bg-destructive"><Trash2 className="size-3.5" /></button>
                )}
              </div>
            </figure>
          ))}
        </div>
      )}

      {drag && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl border-2 border-dashed border-primary bg-primary/10 text-sm font-medium text-brand-light">
          Lepas untuk menambahkan ke Pustaka
        </div>
      )}
    </div>
  );
}
