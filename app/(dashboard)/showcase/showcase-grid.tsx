"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Clapperboard, ExternalLink, Link2, Loader2, Package, Plus, RefreshCw, Search, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mediaUrl } from "@/lib/media-url";
import { usePersistentState } from "@/lib/use-persistent-state";
import { confirmDialog } from "@/components/confirm-dialog";
import { addShowcaseProducts, createProjectFromProduct, removeShowcaseProducts, syncShowcase } from "./actions";
import { ProductDetailDialog } from "./product-detail";

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
  hasDetail: boolean;
  posted: number; // videos with this product link already live on this account (Jadwal)
  scheduled: number; // uploaded, TikTok publishes them later
};
type Concept = { id: string; title: string; bestFor: string };

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

/**
 * An account that was never synced (logged in before auto-sync existed, or its post-login sync failed):
 * fetch its showcase on the first visit instead of waiting for a click. Retry stays one click away.
 */
function FirstSync({ accountId }: { accountId: number }) {
  const router = useRouter();
  const [state, setState] = useState<{ status: "loading" } | { status: "failed"; error: string }>({ status: "loading" });
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; // dev StrictMode mounts twice: one TikTok visit only
    started.current = true;
    syncShowcase(accountId).then(
      (r) => {
        toast.success(`Etalase diambil · ${r.count} produk`);
        router.refresh();
      },
      (e) => setState({ status: "failed", error: e instanceof Error ? e.message : "Gagal mengambil etalase" }),
    );
  }, [accountId, router]);

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-12 text-center">
      {state.status === "loading" ? <Loader2 className="size-7 animate-spin text-muted-foreground" /> : <CircleAlert className="size-7 text-muted-foreground" />}
      <p className="text-sm font-medium">{state.status === "loading" ? "Mengambil etalase dari TikTok Shop..." : "Etalase belum bisa diambil"}</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {state.status === "loading" ? "Sekali saja untuk akun ini, butuh ±15 detik. Setelah itu etalase diperbarui otomatis." : state.error}
      </p>
      {state.status === "failed" && <div className="mt-2"><SyncButton accountId={accountId} /></div>}
    </div>
  );
}

export function ShowcaseGrid({ accountId, products, concepts, neverSynced }: { accountId: number; products: Product[]; concepts: Concept[]; neverSynced: boolean }) {
  const [q, setQ] = usePersistentState("showcase:q", "");
  const [making, setMaking] = useState<Product | null>(null);
  const [viewing, setViewing] = useState<Product | null>(null);
  const k = q.trim().toLowerCase();
  const shown = k ? products.filter((p) => `${p.title} ${p.shopName ?? ""} ${p.productId}`.toLowerCase().includes(k)) : products;

  if (!products.length && neverSynced) return <FirstSync key={accountId} accountId={accountId} />;

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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {shown.map((p) => (
          <article key={p.id} className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-ring/40">
            <button type="button" onClick={() => setViewing(p)} aria-label={`Detail ${p.title}`} className="relative block aspect-square overflow-hidden bg-muted">
              {p.cover ? (
                <img src={mediaUrl(p.cover)} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
              ) : (
                <Package className="absolute inset-0 m-auto size-6 text-muted-foreground" />
              )}
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
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pt-6 pb-1.5 text-left text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                {p.hasDetail ? "Lihat detail" : "Lihat detail lengkap"}
              </span>
              {(p.posted > 0 || p.scheduled > 0) && (
                <span className="absolute right-2 bottom-2 flex flex-col items-end gap-1 group-hover:opacity-0">
                  {p.posted > 0 && <span className="rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-[#4ade80] backdrop-blur" title="Video dengan produk ini yang sudah tayang di akun ini">▶ {p.posted} video terposting</span>}
                  {p.scheduled > 0 && <span className="rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-[#4ade80] backdrop-blur" title="Sudah diunggah, tayang sesuai jadwal di TikTok">🕒 {p.scheduled} terjadwal</span>}
                </span>
              )}
            </button>
            <div className="flex flex-1 flex-col gap-1 p-2.5">
              <button type="button" onClick={() => setViewing(p)} className="line-clamp-2 text-left text-xs leading-snug font-medium hover:underline" title={p.title}>{p.title}</button>
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

      <ProductDetailDialog product={viewing} onClose={() => setViewing(null)} onMakeVideo={() => { setMaking(viewing); setViewing(null); }} />
      <ConceptPicker product={making} concepts={concepts} onClose={() => setMaking(null)} />
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

const STALE_MS = 3 * 60_000; // older than this: re-read the showcase as soon as the page is looked at
const LOOK_EVERY_MS = 5 * 60_000; // while the page stays open
const syncFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/**
 * Keeps the showcase live without a setting: when the page opens, when the window comes back into view and every
 * few minutes while it is open, the showcase is re-read from TikTok Shop if the last sync is older than 3 minutes.
 * Adding/removing products and opening a product refresh it right away too (actions.ts, product-detail.tsx).
 */
export function LiveSync({ accountId, lastSync, count }: { accountId: number; lastSync: number | null; count: number }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const busy = useRef(false);
  const last = useRef(lastSync);
  useEffect(() => {
    last.current = lastSync;
  }, [lastSync]);
  useEffect(() => {
    const look = () => {
      if (busy.current || document.visibilityState !== "visible") return;
      if (last.current && Date.now() - last.current < STALE_MS) return;
      busy.current = true;
      setSyncing(true);
      syncShowcase(accountId)
        .then(() => router.refresh())
        .catch(() => {}) // profile busy or TikTok slow: the next look retries
        .finally(() => {
          busy.current = false;
          setSyncing(false);
        });
    };
    look();
    const id = setInterval(look, LOOK_EVERY_MS);
    document.addEventListener("visibilitychange", look);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", look);
    };
  }, [accountId, router]);
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Etalase disinkronkan otomatis saat halaman dibuka, saat produk ditambah/dihapus, dan saat produk diklik">
      <RefreshCw className={`size-3.5 ${syncing ? "animate-spin text-brand-light" : ""}`} />
      {count} produk di etalase · {syncing ? "menyinkronkan..." : lastSync ? `sinkron otomatis ${syncFmt.format(lastSync)}` : "sinkron otomatis"}
    </span>
  );
}
