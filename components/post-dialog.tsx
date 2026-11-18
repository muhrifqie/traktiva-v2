"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, Check, Loader2, Package, Search, Send, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { createPosts, postingOptions } from "@/app/(dashboard)/jadwal/actions";
import { PlatformIcon } from "@/components/platform-icon";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mediaUrl } from "@/lib/media-url";

// Posting dialog: 1+ finished videos → 1+ TikTok accounts, with caption, the yellow-basket product and
// "now" or a schedule. The queue (Jadwal Upload) does the actual posting in each account's browser.

export type PostVideo = { video: string; label: string | null; projectId: number | null; caption?: string; productId?: string | null };
type Options = Awaited<ReturnType<typeof postingOptions>>;

const SPACING = [0, 30, 60, 120, 240];
/** A schedule needs at least a minute of lead time. */
const isPast = (ms: number) => ms < Date.now() + 60_000;
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const cleanTitle = (src: string) => {
  const t = src.replace(/#\S+/g, " ").replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 30).trim();
  return t.length >= 5 ? t : "PROMO SPESIAL CEK SEKARANG";
};

export function PostDialog({ videos, onClose }: { videos: PostVideo[] | null; onClose: () => void }) {
  const open = !!videos?.length;
  const [opts, setOpts] = useState<Options | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [caption, setCaption] = useState("");
  const [productId, setProductId] = useState<string | null>(null);
  const [linkTitle, setLinkTitle] = useState("");
  const [q, setQ] = useState("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60_000)));
  const [spacing, setSpacing] = useState(60);
  const [busy, setBusy] = useState(false);

  // fresh form for every opening, prefilled from the (first) video's project
  useEffect(() => {
    if (!open) return;
    let alive = true;
    postingOptions().then((o) => {
      if (!alive) return;
      setOpts(o);
      const ready = o.accounts.filter((a) => a.ready);
      setPicked(ready.length === 1 ? [ready[0].id] : []);
      const first = videos![0];
      setCaption(first.caption ?? "");
      const pid = first.productId && o.products.some((p) => p.productId === first.productId) ? first.productId : null;
      setProductId(pid);
      setLinkTitle(pid ? o.products.find((p) => p.productId === pid)!.linkTitle : "");
      setQ("");
      setWhen("now");
      setAt(toLocalInput(new Date(Date.now() + 60 * 60_000)));
    });
    return () => {
      alive = false;
    };
  }, [open, videos]);

  // products from the showcases of the chosen accounts (the basket only accepts the account's own showcase)
  const products = useMemo(() => {
    if (!opts) return [];
    const ids = picked.length ? picked : opts.accounts.map((a) => a.id);
    const seen = new Set<string>();
    return opts.products.filter((p) => ids.includes(p.accountId) && !seen.has(p.productId) && seen.add(p.productId));
  }, [opts, picked]);
  const shown = q.trim() ? products.filter((p) => `${p.title} ${p.productId}`.toLowerCase().includes(q.trim().toLowerCase())) : products;
  const product = products.find((p) => p.productId === productId) ?? null;

  const n = videos?.length ?? 0;
  const total = n * picked.length;
  const startMs = when === "now" ? null : new Date(at).getTime();
  const badTime = when === "later" && !startMs;

  const submit = async () => {
    if (!videos) return;
    if (startMs && isPast(startMs)) {
      toast.error("Waktu jadwal sudah lewat. Pilih waktu yang akan datang, atau Sekarang.");
      return;
    }
    setBusy(true);
    try {
      const r = await createPosts({
        videos: videos.map(({ video, label, projectId }) => ({ video, label, projectId })),
        accountIds: picked,
        caption,
        productId,
        productTitle: productId ? cleanTitle(linkTitle || product?.title || caption) : null,
        startAt: startMs,
        spacingMin: n > 1 ? spacing : 0,
      });
      toast.success(`${r.count} postingan masuk antrean`, { action: { label: "Lihat jadwal", onClick: () => window.location.assign("/jadwal") } });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="max-h-[78vh] space-y-5 overflow-y-auto p-5">
          <DialogHeader className="gap-1 text-left">
            <DialogTitle className="flex items-center gap-2 text-[15px]">
              <span className="grid size-8 place-items-center rounded-full bg-primary/12 text-brand-light"><Send className="size-4" /></span>
              Posting {n} video ke TikTok
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              Diunggah lewat TikTok Studio di browser akunnya sendiri. Pantau di <Link href="/jadwal" className="underline">Jadwal Upload</Link>.
            </DialogDescription>
          </DialogHeader>

          {videos && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {videos.map((v) => (
                <div key={v.video} className="w-16 shrink-0 space-y-1">
                  <video src={`${mediaUrl(v.video)}#t=0.5`} muted preload="metadata" className="aspect-[9/16] w-16 rounded-md bg-black object-cover" />
                  <p className="truncate text-[10px] text-muted-foreground" title={v.label ?? ""}>{v.label ?? "Video"}</p>
                </div>
              ))}
            </div>
          )}

          {!opts ? (
            <div className="grid place-items-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-xs font-medium">Akun TikTok</p>
                {!opts.accounts.length ? (
                  <p className="text-xs text-muted-foreground">Belum ada akun TikTok. Tambahkan di <Link href="/akun" className="underline">Akun Sosial</Link>.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {opts.accounts.map((a) => {
                      const on = picked.includes(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          disabled={!a.ready}
                          title={a.ready ? undefined : "Sesi habis: login ulang di Akun Sosial"}
                          onClick={() => setPicked((p) => (on ? p.filter((x) => x !== a.id) : [...p, a.id]))}
                          className={`flex h-9 items-center gap-2 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:opacity-45 ${on ? "border-primary/50 bg-primary/10" : "bg-background hover:bg-accent"}`}
                        >
                          {on ? <Check className="size-3.5 text-brand-light" /> : <PlatformIcon platform="tiktok" className="size-3.5" />}@{a.username}
                          {!a.ready && <span className="text-[10px] text-destructive">perlu login</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium">Caption <span className="font-normal text-muted-foreground">({caption.length}/2200)</span></span>
                <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} maxLength={2200} placeholder="Tulis caption + #hashtag..." className="w-full rounded-lg border bg-background px-3 py-2 text-[13px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" />
              </label>

              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-medium"><ShoppingCart className="size-3.5" /> Keranjang kuning</p>
                {product ? (
                  <div className="flex items-center gap-2.5 rounded-lg border bg-background p-2">
                    {product.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element -- local media
                      <img src={mediaUrl(product.cover)} alt="" className="size-11 rounded-md object-cover" />
                    ) : (
                      <Package className="size-5 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{product.title}</p>
                      <p className="text-[11px] text-muted-foreground">{product.price} · PID {product.productId}</p>
                    </div>
                    <button type="button" onClick={() => setProductId(null)} aria-label="Lepas produk" className="grid size-7 place-items-center rounded-md hover:bg-accent"><X className="size-3.5" /></button>
                  </div>
                ) : (
                  <div className="space-y-1.5 rounded-lg border bg-background p-2">
                    <label className="flex h-8 items-center gap-2 rounded-md border px-2 text-xs">
                      <Search className="size-3.5 text-muted-foreground" />
                      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari produk etalase (opsional)..." className="min-w-0 flex-1 bg-transparent outline-none" />
                    </label>
                    <div className="max-h-36 space-y-0.5 overflow-y-auto">
                      {shown.slice(0, 40).map((p) => (
                        <button key={`${p.accountId}-${p.productId}`} type="button" onClick={() => { setProductId(p.productId); setLinkTitle(p.linkTitle); }} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent">
                          {p.cover ? (
                            // eslint-disable-next-line @next/next/no-img-element -- local media
                            <img src={mediaUrl(p.cover)} alt="" className="size-7 rounded object-cover" />
                          ) : (
                            <Package className="size-4 text-muted-foreground" />
                          )}
                          <span className="min-w-0 flex-1 truncate">{p.title}</span>
                          <span className="shrink-0 text-muted-foreground">{p.price}</span>
                        </button>
                      ))}
                      {!shown.length && <p className="px-1.5 py-2 text-[11px] text-muted-foreground">Tidak ada produk etalase{q ? " yang cocok" : ""}. Tanpa produk juga bisa.</p>}
                    </div>
                  </div>
                )}
                {product && (
                  <label className="block space-y-1">
                    <span className="text-[11px] text-muted-foreground">Judul tautan produk (maks 30 huruf/angka)</span>
                    <input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value.slice(0, 30))} maxLength={30} className="h-8 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:border-ring" />
                  </label>
                )}
              </div>

              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-medium"><CalendarClock className="size-3.5" /> Waktu</p>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Waktu posting">
                    {(["now", "later"] as const).map((w) => (
                      <button key={w} type="button" role="radio" aria-checked={when === w} onClick={() => setWhen(w)} className={`h-8 rounded-md px-3 text-xs font-medium ${when === w ? "bg-background shadow-xs ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}>
                        {w === "now" ? "Sekarang" : "Jadwalkan"}
                      </button>
                    ))}
                  </div>
                  {when === "later" && (
                    <input type="datetime-local" value={at} min={toLocalInput(new Date())} onChange={(e) => setAt(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring" />
                  )}
                </div>
                {n > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Jarak antar video per akun:</span>
                    {SPACING.map((m) => (
                      <button key={m} type="button" onClick={() => setSpacing(m)} className={`h-7 rounded-md border px-2 ${spacing === m ? "border-primary/50 bg-primary/10" : "bg-background text-muted-foreground hover:bg-accent"}`}>
                        {m === 0 ? "langsung" : m < 60 ? `${m} mnt` : `${m / 60} jam`}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {when === "now" ? "Mulai diunggah sekarang." : "≥ 20 menit lagi: diserahkan ke jadwal TikTok sendiri, jadi tetap terposting walau PC mati."}
                  {n > 1 && spacing === 0 ? " Memposting banyak video sekaligus di 1 akun bisa dianggap spam." : ""}
                </p>
              </div>
            </>
          )}
        </div>
        <DialogFooter className="m-0 flex-row items-center justify-between gap-2 border-t bg-muted/40 px-5 py-3 sm:justify-between">
          <p className="text-xs text-muted-foreground">{total ? `${total} postingan` : "Pilih akun"}</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={onClose} className="flex h-9 items-center rounded-lg border bg-background px-3.5 text-[13px] font-medium hover:bg-accent disabled:opacity-60">Batal</button>
            <button type="button" disabled={busy || !picked.length || badTime} onClick={submit} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {when === "now" ? "Posting sekarang" : "Jadwalkan"}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
