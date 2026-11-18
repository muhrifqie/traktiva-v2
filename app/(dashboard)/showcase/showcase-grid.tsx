"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, CircleCheck, Clapperboard, ExternalLink, Link2, Loader2, Package, Plus, RefreshCw, Search, Store, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mediaUrl } from "@/lib/media-url";
import { usePersistentState } from "@/lib/use-persistent-state";
import { confirmDialog } from "@/components/confirm-dialog";
import { addShowcaseProducts, createProjectFromProduct, removeShowcaseProducts, setShowcaseAutoSync, syncShowcase } from "./actions";
import { ShowcaseDetail } from "./product-detail";
import { BatchDialog, type BatchDefaults } from "./batch-dialog";

type Product = {
  id: number;
  productId: string;
  title: string;
  price: string;
  originalPrice: string | null;
  commission: string | null;
  stock: number | null;
  inStock: boolean;
  hidden: boolean;
  shopName: string | null;
  cover: string | null;
  labels: string[];
};
type Concept = { id: string; title: string; bestFor: string; auto: boolean };

const productUrl = (pid: string) => `https://www.tiktok.com/view/product/${pid}`;
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

export function SyncButton({ accountId }: { accountId: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const r = await syncShowcase(accountId);
            toast.success(`Etalase disinkronkan · ${r.count} produk`);
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal sinkron");
          }
        })
      }
      className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
    >
      <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} /> {pending ? "Menyinkronkan..." : "Sinkronkan etalase"}
    </button>
  );
}

export function ShowcaseGrid({
  accountId, products, concepts, neverSynced, batch,
}: { accountId: number; products: Product[]; concepts: Concept[]; neverSynced: boolean; batch: BatchDefaults }) {
  const [q, setQ] = usePersistentState("showcase:q", "");
  const [making, setMaking] = useState<Product | null>(null);
  const [detail, setDetail] = useState<Product | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const k = q.trim().toLowerCase();
  const shown = k ? products.filter((p) => `${p.title} ${p.shopName ?? ""} ${p.productId}`.toLowerCase().includes(k)) : products;

  if (!products.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-12 text-center">
        <Store className="size-7 text-muted-foreground" />
        <p className="text-sm font-medium">{neverSynced ? "Etalase belum disinkronkan" : "Etalase kosong"}</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {neverSynced ? "Klik Sinkronkan etalase untuk mengambil produk dari TikTok Shop akun ini (butuh ±15 detik)." : "Tambahkan produk ke etalase di TikTok Shop, lalu sinkronkan lagi."}
        </p>
        <div className="mt-2"><SyncButton accountId={accountId} /></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {products.length > 6 && (
        <label className="flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border bg-card px-3 text-[13px] focus-within:border-ring">
          <Search className="size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari produk, toko, atau PID..." className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
      )}

      <div className={`sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs backdrop-blur ${selected.length ? "border-primary/40 bg-primary/10" : "bg-card/80"}`}>
        {selected.length ? (
          <>
            <span className="font-medium">{selected.length} produk dipilih</span>
            <button type="button" onClick={() => setSelected([...new Set([...selected, ...shown.map((p) => p.id)])])} className="rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground">Pilih semua yang tampil</button>
            <button type="button" onClick={() => setSelected([])} className="flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-3" /> Batal pilih</button>
            <button type="button" onClick={() => setBatchOpen(true)} className="ml-auto flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              <Clapperboard className="size-3.5" /> Buat {selected.length} video otomatis
            </button>
          </>
        ) : (
          <>
            <span className="text-muted-foreground">Centang beberapa produk untuk dibuatkan video sekaligus (1 pekerja = 1 video jadi).</span>
            <button type="button" onClick={() => setSelected(shown.map((p) => p.id))} className="ml-auto rounded-md px-2 py-1 font-medium hover:bg-accent">Pilih semua</button>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {shown.map((p) => (
          <article key={p.id} className={`group flex flex-col overflow-hidden rounded-xl border bg-card transition-colors ${selected.includes(p.id) ? "border-primary ring-1 ring-primary" : "hover:border-ring/40"}`}>
            <div
              role="button"
              tabIndex={0}
              aria-label={`Lihat detail ${p.title}`}
              onClick={() => setDetail(p)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setDetail(p))}
              className="relative aspect-square cursor-pointer overflow-hidden bg-muted"
            >
              {p.cover ? (
                <img src={mediaUrl(p.cover)} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
              ) : (
                <Package className="absolute inset-0 m-auto size-6 text-muted-foreground" />
              )}
              <button
                type="button"
                role="checkbox"
                aria-checked={selected.includes(p.id)}
                aria-label={`Pilih ${p.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(p.id);
                }}
                onKeyDown={(e) => e.stopPropagation()}
                className={`absolute bottom-2 left-2 grid size-6 place-items-center rounded-md border-2 transition-colors ${selected.includes(p.id) ? "border-primary bg-primary text-primary-foreground" : "border-white/80 bg-black/45 text-transparent opacity-80 hover:opacity-100"}`}
              >
                <Check className="size-3.5" />
              </button>
              {p.commission && (
                <span className="absolute top-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-[#4ade80] backdrop-blur">Komisi {p.commission}</span>
              )}
              <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
                {p.labels.slice(0, 2).map((l) => (
                  <span key={l} className="rounded bg-destructive/90 px-1.5 py-px text-[10px] font-medium text-white">{l}</span>
                ))}
                {p.hidden && <span className="rounded bg-black/70 px-1.5 py-px text-[10px] text-white">Disembunyikan</span>}
                {!p.inStock && <span className="rounded bg-black/70 px-1.5 py-px text-[10px] text-white">Stok habis</span>}
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-1 p-2.5">
              <button type="button" onClick={() => setDetail(p)} className="line-clamp-2 text-left text-xs leading-snug font-medium hover:underline" title={p.title}>{p.title}</button>
              <p className="truncate text-[11px] text-muted-foreground">{p.shopName ?? "—"}</p>
              <p className="flex items-baseline gap-1.5">
                <span className="text-[13px] font-semibold">{p.price}</span>
                {p.originalPrice && <span className="text-[11px] text-muted-foreground line-through">{p.originalPrice}</span>}
              </p>
              <p className="text-[11px] text-muted-foreground">Stok {p.stock != null ? compact.format(p.stock) : "—"} · PID {p.productId.slice(-6)}</p>
              <div className="mt-auto flex gap-1.5 pt-1.5">
                <button
                  type="button"
                  onClick={() => setMaking(p)}
                  className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-primary text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Clapperboard className="size-3.5" /> Buat video
                </button>
                <button
                  type="button"
                  aria-label="Salin link produk"
                  title="Salin link produk"
                  onClick={() => {
                    void navigator.clipboard.writeText(productUrl(p.productId));
                    toast.success("Link produk disalin");
                  }}
                  className="grid size-7 place-items-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Link2 className="size-3.5" />
                </button>
                <a
                  href={productUrl(p.productId)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Buka di TikTok"
                  title="Buka di TikTok"
                  className="grid size-7 place-items-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ExternalLink className="size-3.5" />
                </a>
                <RemoveButton accountId={accountId} product={p} />
              </div>
            </div>
          </article>
        ))}
      </div>

      <ShowcaseDetail
        product={detail}
        onClose={() => setDetail(null)}
        onMakeVideo={(p) => {
          setDetail(null);
          setMaking(p);
        }}
      />
      <ConceptPicker product={making} concepts={concepts} onClose={() => setMaking(null)} />
      <BatchDialog open={batchOpen} productIds={selected} concepts={concepts} defaults={batch} onClose={() => setBatchOpen(false)} onStarted={() => setSelected([])} />
    </div>
  );
}

/** Pick a video concept for a showcase product; the new project opens in the Studio with the product filled in. */
function ConceptPicker({ product, concepts, onClose }: { product: Product | null; concepts: Concept[]; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<string | null>(null);
  const go = (presetId: string) => {
    if (!product) return;
    setPicked(presetId);
    start(async () => {
      try {
        await createProjectFromProduct(product.id, presetId);
      } catch (e) {
        if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
        toast.error(e instanceof Error ? e.message : "Gagal");
      }
    });
  };
  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Buat video untuk produk ini</DialogTitle>
          <DialogDescription className="line-clamp-2">{product?.title}</DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">Nama, harga, dan foto produk langsung terisi. Pilih konsep videonya:</p>
        <div className="grid max-h-[50vh] gap-1.5 overflow-y-auto">
          {concepts.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={pending}
              onClick={() => go(c.id)}
              className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-left transition-colors hover:border-ring/40 hover:bg-accent disabled:opacity-60"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{c.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{c.bestFor}</span>
              </span>
              {pending && picked === c.id && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Delete one product from the TikTok showcase (asks first; the list refreshes from TikTok after). */
function RemoveButton({ accountId, product }: { accountId: number; product: Product }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = async () => {
    const ok = await confirmDialog({
      title: "Hapus dari etalase TikTok?",
      description: `"${product.title.slice(0, 80)}" akan dilepas dari etalase akun ini di TikTok Shop. Kamu bisa menambahkannya lagi nanti.`,
      danger: true,
    });
    if (!ok) return;
    start(async () => {
      try {
        await removeShowcaseProducts(accountId, [product.productId]);
        toast.success("Produk dihapus dari etalase");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal menghapus");
      }
    });
  };
  return (
    <button
      type="button"
      aria-label="Hapus dari etalase"
      title="Hapus dari etalase"
      disabled={pending}
      onClick={remove}
      className="grid size-7 place-items-center rounded-md border text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
    </button>
  );
}

type AddResult = { input: string; productId: string | null; title: string | null; ok: boolean; message: string };

/** Paste links / product IDs → TikTok checks each → valid ones are added; shows the answer per item. */
export function AddProductsButton({ accountId }: { accountId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [results, setResults] = useState<AddResult[] | null>(null);
  const [pending, start] = useTransition();
  const lines = text.split(/[\s,]+/).filter(Boolean).length;

  const submit = () =>
    start(async () => {
      try {
        const r = await addShowcaseProducts(accountId, text);
        setResults(r);
        const added = r.filter((x) => x.ok).length;
        if (added) toast.success(`${added} produk masuk etalase`);
        else toast.error("Tidak ada produk yang berhasil ditambahkan");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal menambahkan");
      }
    });

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setResults(null); }} className="flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3.5 text-[13px] font-medium hover:bg-accent">
        <Plus className="size-4" /> Tambah produk
      </button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tambah produk ke etalase</DialogTitle>
            <DialogDescription>Tempel link produk TikTok Shop atau ID produk, satu per baris (maks. 20). TikTok akan mengecek apakah produk boleh kamu promosikan.</DialogDescription>
          </DialogHeader>
          {results ? (
            <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto">
              {results.map((r) => (
                <li key={r.input} className="flex items-start gap-2 rounded-lg border bg-background p-2.5">
                  {r.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{r.title ?? r.input}</span>
                    <span className={`block text-[11px] ${r.ok ? "text-status-ok" : "text-muted-foreground"}`}>{r.message}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder={"https://www.tiktok.com/view/product/1731035606239773730\n1729382420060341472"}
              className="w-full resize-y rounded-lg border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          )}
          <div className="flex items-center justify-end gap-2">
            {results ? (
              <>
                <button type="button" onClick={() => { setResults(null); setText(""); }} className="flex h-9 items-center rounded-lg border bg-background px-3.5 text-[13px] font-medium hover:bg-accent">Tambah lagi</button>
                <button type="button" onClick={() => setOpen(false)} className="flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">Selesai</button>
              </>
            ) : (
              <>
                <span className="mr-auto text-[11px] text-muted-foreground">{lines ? `${lines} item` : ""}</span>
                <button type="button" disabled={pending} onClick={() => setOpen(false)} className="flex h-9 items-center rounded-lg border bg-background px-3.5 text-[13px] font-medium hover:bg-accent">Batal</button>
                <button type="button" disabled={pending || !lines} onClick={submit} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                  {pending ? <><Loader2 className="size-4 animate-spin" /> Menambahkan...</> : "Tambahkan"}
                </button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const SYNC_LABEL: Record<number, string> = { 0: "Mati", 15: "Tiap 15 menit", 30: "Tiap 30 menit", 60: "Tiap 1 jam", 180: "Tiap 3 jam", 360: "Tiap 6 jam" };

/** Auto-sync interval picker (applies to every TikTok account). */
export function AutoSyncSelect({ value, choices }: { value: number; choices: number[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="flex h-8 items-center gap-1.5 rounded-lg border bg-card px-2.5 text-xs text-muted-foreground" title="Etalase semua akun TikTok disinkronkan otomatis di latar belakang selama aplikasi terbuka">
      <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} /> Sinkron otomatis
      <select
        value={value}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            try {
              await setShowcaseAutoSync(Number(e.target.value));
              toast.success(Number(e.target.value) ? `Sinkron otomatis ${SYNC_LABEL[Number(e.target.value)].toLowerCase()}` : "Sinkron otomatis dimatikan");
              router.refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Gagal");
            }
          })
        }
        className="bg-transparent font-medium text-foreground outline-none"
      >
        {choices.map((m) => <option key={m} value={m}>{SYNC_LABEL[m] ?? `${m} menit`}</option>)}
      </select>
    </label>
  );
}
