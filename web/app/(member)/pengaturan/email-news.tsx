"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveEmailNews } from "@/app/(site)/actions";

/** Switch for info & promo emails; the important ones are listed so nobody turns them off by accident. */
export function EmailNews({ on }: { on: boolean }) {
  const [v, setV] = useState(on);
  const [pending, start] = useTransition();
  const flip = () =>
    start(async () => {
      const next = !v;
      setV(next);
      const r = await saveEmailNews(next);
      if (r?.ok) toast.success(r.message);
      else { setV(!next); toast.error(r?.message ?? "Gagal"); }
    });
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[0.8125rem] font-medium">Info fitur & promo</p>
          <p className="text-xs text-muted-foreground">Kabar fitur baru, tips, dan promo. Paling sering beberapa kali sebulan.</p>
        </div>
        <button type="button" role="switch" aria-checked={v} aria-label="Info fitur & promo" disabled={pending} onClick={flip}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${v ? "bg-primary" : "bg-muted"}`}>
          <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${v ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>
      <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        Selalu dikirim: kode verifikasi, struk pembayaran, pengingat sebelum lisensi habis, dan peringatan keamanan akun.
      </p>
    </div>
  );
}
