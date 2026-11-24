"use client";

import { useState } from "react";
import { Loader2, Store } from "lucide-react";
import { toast } from "sonner";
import { kaloToShowcase } from "./actions";

/**
 * "Tambah ke Etalase" for one product row (Top produk, Hasil cari). Plain async, not a transition: the spinner stops
 * as soon as TikTok answered, without waiting for a page refresh.
 */
export function ShowcaseButton({ productId }: { productId: string }) {
  const [adding, setAdding] = useState(false);
  const add = async () => {
    setAdding(true);
    try {
      const r = await kaloToShowcase(productId);
      if (r.ok) toast.success(`Masuk etalase @${r.account}`);
      else toast.error(r.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal");
    } finally {
      setAdding(false);
    }
  };
  return (
    <button type="button" disabled={adding} onClick={add} title="Tambah ke etalase TikTok" className="flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
      {adding ? <Loader2 className="size-3.5 animate-spin" /> : <Store className="size-3.5" />} Tambah ke Etalase
    </button>
  );
}
