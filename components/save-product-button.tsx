"use client";

import { useState, useTransition } from "react";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveProduct, unsaveProduct } from "@/app/(dashboard)/riset/actions";

export type SaveableProduct = {
  productId: string;
  country: string;
  source: "tiktok" | "kalodata" | "shopee";
  title: string;
  image?: string | null;
  price?: string | null;
  shopName?: string | null;
  metrics?: Record<string, string | number | null>;
};

/** Bookmark toggle for research results → "Produk tersimpan" (stored in the DB). */
export function SaveProductButton({ product, saved: initial, compact = false }: { product: SaveableProduct; saved: boolean; compact?: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const toggle = () =>
    start(async () => {
      try {
        if (saved) {
          await unsaveProduct(product.productId, product.country);
          setSaved(false);
          toast.success("Dihapus dari Produk Tersimpan");
        } else {
          await saveProduct({ ...product, metrics: product.metrics ?? {} });
          setSaved(true);
          toast.success("Disimpan ke Produk Tersimpan");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal");
      }
    });
  const Icon = pending ? Loader2 : saved ? BookmarkCheck : Bookmark;
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={saved ? "Hapus dari Produk Tersimpan" : "Simpan produk"}
      aria-pressed={saved}
      className={`flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border text-[11px] font-medium transition-colors disabled:opacity-60 ${compact ? "w-7" : "px-2"} ${saved ? "border-[#f2c94c]/50 bg-[#f2c94c]/10 text-[#f2c94c]" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
    >
      <Icon className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
      {!compact && (saved ? "Tersimpan" : "Simpan")}
    </button>
  );
}
