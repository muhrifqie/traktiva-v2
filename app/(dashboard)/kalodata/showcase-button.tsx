"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, CircleAlert, Loader2, Store, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mediaUrl } from "@/lib/media-url";
import { kaloToShowcase, showcaseTargets } from "./actions";

type Target = Awaited<ReturnType<typeof showcaseTargets>>[number];
type Status = { state: "busy" } | { state: "ok" } | { state: "fail"; message: string };

const PICK_KEY = "trk-etalase-pick"; // the accounts chosen last time (pre-selected next time)
const readPick = (): number[] => {
  try {
    return JSON.parse(localStorage.getItem(PICK_KEY) ?? "[]");
  } catch {
    return [];
  }
};
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Gagal");

const LOOK = {
  solid: "flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90",
  outline: "flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium hover:bg-accent",
  icon: "grid size-7 place-items-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground",
} as const;

/**
 * "Tambah ke Etalase" (Top produk, Hasil cari, detail produk, Produk tersimpan): asks which TikTok account(s) first,
 * then adds to all chosen accounts at once (each its own Chrome profile, in parallel) with a live result per account.
 * With exactly one logged-in account it adds straight away.
 */
export function ShowcaseButton({ productId, name, variant = "solid" }: { productId: string; name?: string; variant?: keyof typeof LOOK }) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [status, setStatus] = useState<Record<number, Status>>({});
  const [loading, setLoading] = useState(false);
  const running = Object.values(status).some((s) => s.state === "busy");

  const addTo = async (list: Target[]) => {
    setStatus((s) => ({ ...s, ...Object.fromEntries(list.map((t) => [t.id, { state: "busy" } as Status])) }));
    const results = await Promise.all(
      list.map(async (t) => {
        let st: Status;
        try {
          const r = await kaloToShowcase(productId, t.id);
          st = r.ok ? { state: "ok" } : { state: "fail", message: r.message };
        } catch (e) {
          st = { state: "fail", message: errMsg(e) };
        }
        setStatus((s) => ({ ...s, [t.id]: st }));
        return { t, st };
      }),
    );
    const ok = results.filter((r) => r.st.state === "ok").map((r) => `@${r.t.username}`);
    const bad = results.filter((r) => r.st.state === "fail");
    if (ok.length) setTargets((l) => l?.map((t) => (ok.includes(`@${t.username}`) ? { ...t, has: true, count: t.count + 1 } : t)) ?? l);
    if (!bad.length) toast.success(`Masuk etalase ${ok.join(", ")}`);
    else toast.error(`${ok.length}/${results.length} akun berhasil`, { description: bad.map((r) => `@${r.t.username}: ${(r.st as { message: string }).message}`).join("\n") });
    return !bad.length;
  };

  const start = async () => {
    setLoading(true);
    try {
      const list = await showcaseTargets(productId);
      if (!list.length) return void toast.error("Belum ada akun TikTok yang login. Tambahkan di Akun Sosial.");
      setTargets(list);
      setStatus({});
      // one account and the product is not there yet: no question needed
      if (list.length === 1 && !list[0].has) return void (await addTo(list));
      const remembered = readPick();
      setPicked(list.filter((t) => !t.has && remembered.includes(t.id)).map((t) => t.id));
      setOpen(true);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  const free = targets?.filter((t) => !t.has) ?? [];
  const allPicked = free.length > 0 && free.every((t) => picked.includes(t.id));
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const submit = async () => {
    const list = free.filter((t) => picked.includes(t.id));
    try {
      localStorage.setItem(PICK_KEY, JSON.stringify(list.map((t) => t.id)));
    } catch {}
    if (await addTo(list)) setTimeout(() => setOpen(false), 900);
    setPicked([]);
  };

  const busyButton = loading || (!open && running);
  return (
    <>
      <button type="button" disabled={busyButton} onClick={() => void start()} title="Tambah ke etalase TikTok" aria-label="Tambah ke etalase TikTok" className={`${LOOK[variant]} disabled:opacity-60`}>
        {busyButton ? <Loader2 className="size-3.5 animate-spin" /> : <Store className="size-3.5" />}
        {variant !== "icon" && "Tambah ke Etalase"}
      </button>
      <Dialog open={open} onOpenChange={(o) => !running && setOpen(o)}>
        <DialogContent className="gap-3 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Masukkan ke etalase mana?</DialogTitle>
            <DialogDescription className="line-clamp-2">{name ? `“${name}”` : `Produk ${productId}`}. Pilih satu atau beberapa akun; semua diproses bersamaan.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{targets?.length ?? 0} akun TikTok login</span>
            {free.length > 1 && (
              <button type="button" disabled={running} onClick={() => setPicked(allPicked ? [] : free.map((t) => t.id))} className="font-medium text-brand-light hover:underline disabled:opacity-50">
                {allPicked ? "Batal pilih semua" : "Pilih semua"}
              </button>
            )}
          </div>
          <ul className="grid max-h-[50vh] gap-1.5 overflow-y-auto">
            {targets?.map((t) => {
              const on = picked.includes(t.id);
              const st = status[t.id];
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={t.has || on}
                    disabled={t.has || running}
                    onClick={() => toggle(t.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${on ? "border-primary bg-primary/8" : "hover:bg-accent"} ${t.has && !st ? "opacity-60" : ""}`}
                  >
                    <span className={`grid size-4 shrink-0 place-items-center rounded border ${t.has || on ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>
                      {(t.has || on) && <Check className="size-3" />}
                    </span>
                    {t.avatar ? <img src={mediaUrl(t.avatar)} alt="" referrerPolicy="no-referrer" className="size-8 rounded-full border bg-muted object-cover" /> : <span className="grid size-8 place-items-center rounded-full border bg-muted text-xs font-semibold">{t.username[0]?.toUpperCase()}</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">@{t.username}</span>
                      <span className="block text-[11px] text-muted-foreground">{t.count} produk di etalase</span>
                    </span>
                    {st?.state === "busy" ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : st?.state === "ok" ? (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-status-ok"><Check className="size-3.5" /> Masuk</span>
                    ) : st?.state === "fail" ? (
                      <span className="flex max-w-40 items-center gap-1 text-[11px] text-destructive" title={st.message}><CircleAlert className="size-3.5 shrink-0" /><span className="truncate">{st.message}</span></span>
                    ) : t.has ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Sudah ada</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-2 pt-1">
            <Link href="/showcase" className="text-xs text-muted-foreground hover:text-foreground hover:underline">Buka Etalase</Link>
            <button type="button" disabled={running} onClick={() => setOpen(false)} className="ml-auto flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium hover:bg-accent disabled:opacity-60">
              <X className="size-4" /> Tutup
            </button>
            <button type="button" disabled={running || !picked.length} onClick={() => void submit()} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {running ? <Loader2 className="size-4 animate-spin" /> : <Store className="size-4" />}
              {running ? "Memasukkan..." : picked.length ? `Tambahkan ke ${picked.length} akun` : "Pilih akun dulu"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
