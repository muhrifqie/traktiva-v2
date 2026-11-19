"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, NotebookPen, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_WRITING, type WritingRules } from "@/lib/writing";
import { saveWritingRules } from "./actions";

const field = "h-8 w-full rounded-md border bg-background px-2.5 text-[13px] outline-none focus:border-ring";

/** Rules every AI writer follows (script, scene voice lines, captions); banned words are also swapped automatically. */
export function WritingRulesCard({ initial }: { initial: WritingRules }) {
  const router = useRouter();
  const [r, setR] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(r) !== JSON.stringify(initial);
  const setRow = (i: number, patch: Partial<WritingRules["replace"][number]>) => setR((x) => ({ ...x, replace: x.replace.map((row, j) => (j === i ? { ...row, ...patch } : row)) }));
  const save = () =>
    start(async () => {
      try {
        await saveWritingRules({ ...r, replace: r.replace.filter((x) => x.from.trim()) });
        toast.success("Aturan naskah disimpan. Berlaku untuk tulisan & suara AI berikutnya.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
      }
    });

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-[#f2994a1a] text-[#f2994a]"><NotebookPen className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold">Aturan naskah AI</h2>
          <p className="text-xs text-muted-foreground">Berlaku untuk semua yang ditulis & diucapkan AI: naskah voice-over, kalimat tiap adegan, caption, stiker, dan AI Director.</p>
        </div>
        <button type="button" onClick={() => setR(DEFAULT_WRITING)} className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground" title="Kembalikan aturan bawaan">
          <RotateCcw className="size-3.5" /> Bawaan
        </button>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium">Kalimat ajakan (CTA) di akhir video</span>
        <input className={field} value={r.cta} maxLength={80} onChange={(e) => setR({ ...r, cta: e.target.value })} placeholder="cek keranjang di bawah ya" />
      </label>

      <div className="space-y-1.5">
        <p className="text-xs font-medium">Kata yang dilarang → diganti otomatis</p>
        <p className="text-[11px] text-muted-foreground">AI diberi tahu untuk tidak memakainya; kalau tetap muncul, diganti sebelum ditampilkan atau diucapkan.</p>
        <div className="space-y-1.5">
          {r.replace.map((row, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input className={field} value={row.from} maxLength={40} onChange={(e) => setRow(i, { from: e.target.value })} placeholder="kata dilarang" aria-label="Kata dilarang" />
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              <input className={field} value={row.to} maxLength={40} onChange={(e) => setRow(i, { to: e.target.value })} placeholder="penggantinya (boleh kosong)" aria-label="Pengganti" />
              <button type="button" onClick={() => setR({ ...r, replace: r.replace.filter((_, j) => j !== i) })} className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive" aria-label="Hapus aturan">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        {r.replace.length < 12 && (
          <button type="button" onClick={() => setR({ ...r, replace: [...r.replace, { from: "", to: "" }] })} className="flex h-7 items-center gap-1 rounded-md border bg-background px-2.5 text-[11px] hover:bg-accent">
            <Plus className="size-3.5" /> Tambah kata
          </button>
        )}
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium">Aturan tambahan <span className="font-normal text-muted-foreground">(opsional)</span></span>
        <textarea className={`${field} h-auto resize-none py-2`} rows={3} maxLength={500} value={r.notes} onChange={(e) => setR({ ...r, notes: e.target.value })} placeholder={'Contoh: panggil penonton "kak", jangan pakai kata "guys", selalu sebut gratis ongkir kalau ada.'} />
      </label>

      <div className="flex items-center justify-end gap-2">
        {dirty && <span className="text-[11px] text-amber-600 dark:text-amber-400">Belum disimpan</span>}
        <button type="button" disabled={!dirty || pending} onClick={save} className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pending && <Loader2 className="size-4 animate-spin" />} Simpan aturan
        </button>
      </div>
    </section>
  );
}
