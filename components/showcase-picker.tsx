"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CircleAlert, ImageIcon, Loader2, Maximize2, Search, Store } from "lucide-react";
import { listShowcaseForPick, showcaseGallery, type ShowcasePick } from "@/app/(dashboard)/video/project-actions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { openLightbox } from "@/components/media-lightbox";
import { mediaUrl } from "@/lib/media-url";

const MAX_PHOTOS = 3;

/**
 * Pick a product from the TikTok showcase (etalase) as the video's product, in two steps:
 * 1) the product, 2) which of its photos (1–3) the AI should use as reference.
 */
export function ShowcasePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (item: ShowcasePick, photos: string[]) => void }) {
  const [items, setItems] = useState<ShowcasePick[] | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<ShowcasePick | null>(null);
  const [gal, setGal] = useState<{ id: number; gallery?: string[]; fromKalodata?: boolean; error?: string } | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listShowcaseForPick().then((l) => alive && setItems(l), () => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [open]);

  // step 2: load the product's gallery (Kalodata, cached 24 h) and preselect the first photos
  useEffect(() => {
    if (!sel) return;
    let alive = true;
    showcaseGallery(sel.id).then(
      (g) => {
        if (!alive) return;
        setGal({ id: sel.id, ...g });
        setChosen(g.gallery.slice(0, MAX_PHOTOS));
      },
      (e) => alive && setGal({ id: sel.id, error: e instanceof Error ? e.message : "Gagal memuat foto" }),
    );
    return () => {
      alive = false;
    };
  }, [sel]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = items ?? [];
    return needle ? list.filter((it) => `${it.title} ${it.shopName ?? ""}`.toLowerCase().includes(needle)) : list;
  }, [items, q]);
  const accounts = new Set(items?.map((i) => i.account)).size;

  const close = () => {
    setSel(null);
    setGal(null);
    setChosen([]);
    onClose();
  };
  const back = () => {
    setSel(null);
    setGal(null);
    setChosen([]);
  };
  const toggle = (src: string) =>
    setChosen((c) => (c.includes(src) ? c.filter((x) => x !== src) : c.length >= MAX_PHOTOS ? c : [...c, src]));

  const current = sel && gal?.id === sel.id ? gal : null;
  const gallery = current?.gallery ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-3xl">
        {!sel ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Store className="size-4" /> Pilih produk dari Etalase</DialogTitle>
              <DialogDescription>Pilih produknya dulu, lalu pilih foto mana yang dipakai sebagai acuan AI.</DialogDescription>
            </DialogHeader>

            <label className="flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-[13px] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
              <Search className="size-4 text-muted-foreground" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama produk atau toko..." className="min-w-0 flex-1 bg-transparent outline-none" />
              {items && <span className="text-[11px] text-muted-foreground">{shown.length} produk{accounts > 1 ? ` · ${accounts} akun` : ""}</span>}
            </label>

            <div className="max-h-[58vh] overflow-y-auto">
              {!items ? (
                <div className="grid place-items-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-1 py-12 text-center">
                  <Store className="size-6 text-muted-foreground" />
                  <p className="text-[13px] font-medium">Etalase masih kosong</p>
                  <p className="text-xs text-muted-foreground">Tambah produk ke etalase TikTok atau sinkronkan dulu di menu <Link href="/showcase" className="underline">TikTok Shop</Link>.</p>
                </div>
              ) : shown.length === 0 ? (
                <p className="py-12 text-center text-xs text-muted-foreground">Tidak ada produk yang cocok dengan &quot;{q}&quot;.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {shown.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => setSel(it)}
                      className="group flex flex-col overflow-hidden rounded-lg border bg-background text-left transition-colors hover:border-primary/50 hover:bg-accent"
                    >
                      <div className="relative aspect-square w-full bg-muted">
                        {it.cover ? (
                          // eslint-disable-next-line @next/next/no-img-element -- local media
                          <img src={mediaUrl(it.cover)} alt="" loading="lazy" className="size-full object-cover" />
                        ) : (
                          <span className="grid size-full place-items-center"><ImageIcon className="size-5 text-muted-foreground" /></span>
                        )}
                        {!it.inStock && <span className="absolute top-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">Stok habis</span>}
                        {it.labels[0] && <span className="absolute right-1.5 bottom-1.5 rounded bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-white">{it.labels[0]}</span>}
                      </div>
                      <div className="space-y-0.5 p-2">
                        <p className="line-clamp-2 text-xs leading-snug font-medium">{it.title}</p>
                        <p className="flex items-baseline gap-1.5 text-[13px] font-semibold">
                          {it.price}
                          {it.originalPrice && it.originalPrice !== it.price && <span className="text-[10px] font-normal text-muted-foreground line-through">{it.originalPrice}</span>}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {it.shopName ?? "-"}{it.commission ? ` · komisi ${it.commission}` : ""}{accounts > 1 ? ` · @${it.account}` : ""}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 pr-6">
                <button type="button" onClick={back} aria-label="Kembali ke daftar produk" className="grid size-7 shrink-0 place-items-center rounded-md border hover:bg-accent"><ArrowLeft className="size-4" /></button>
                <span className="line-clamp-1">{sel.title}</span>
              </DialogTitle>
              <DialogDescription>
                Pilih 1–{MAX_PHOTOS} foto sebagai acuan AI. Foto produk polos (tanpa teks/kolase) biasanya hasilnya paling akurat.
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[56vh] overflow-y-auto">
              {current?.error ? (
                <p className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive"><CircleAlert className="size-4 shrink-0" />{current.error}</p>
              ) : !current ? (
                <div className="grid place-items-center py-14"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
              ) : gallery.length === 0 ? (
                <p className="py-12 text-center text-xs text-muted-foreground">Produk ini belum punya foto. Sinkronkan etalase lagi atau unggah foto sendiri.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {gallery.map((src, i) => {
                    const n = chosen.indexOf(src);
                    const on = n >= 0;
                    const full = !on && chosen.length >= MAX_PHOTOS;
                    return (
                      <div key={src} className="group relative">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          aria-label={`Foto ${i + 1}`}
                          onClick={() => toggle(src)}
                          disabled={full}
                          className={`relative block aspect-square w-full overflow-hidden rounded-lg border-2 bg-muted transition-all ${on ? "border-primary" : "border-transparent"} ${full ? "cursor-not-allowed opacity-45" : "hover:border-primary/50"}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- product CDN or local media */}
                          <img src={mediaUrl(src)} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
                          <span className={`absolute top-1.5 left-1.5 grid size-6 place-items-center rounded-full border-2 text-[11px] font-bold ${on ? "border-primary bg-primary text-primary-foreground" : "border-white/80 bg-black/40 text-transparent"}`}>
                            {on ? n + 1 : <Check className="size-3" />}
                          </span>
                          {!/^https?:/.test(src) && <span className="absolute right-1.5 bottom-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">Sampul etalase</span>}
                        </button>
                        <button
                          type="button"
                          aria-label="Perbesar foto"
                          onClick={() => openLightbox(gallery.map((g, j) => ({ src: g, kind: "image" as const, label: `Foto ${j + 1}/${gallery.length}` })), i)}
                          className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-md bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/75"
                        >
                          <Maximize2 className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {chosen.length}/{MAX_PHOTOS} dipilih{current?.gallery ? ` · ${gallery.length} foto tersedia${current.fromKalodata ? "" : " (hanya sampul etalase)"}` : ""}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={back} className="flex h-9 items-center rounded-lg border bg-background px-3.5 text-[13px] font-medium hover:bg-accent">Kembali</button>
                <button
                  type="button"
                  disabled={!chosen.length}
                  onClick={() => {
                    onPick(sel, chosen);
                    close();
                  }}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Check className="size-4" /> Pakai {chosen.length || ""} foto
                </button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
