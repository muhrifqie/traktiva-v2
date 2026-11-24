"use client";

import { useState, useTransition } from "react";
import { Loader2, Save, Settings2 } from "lucide-react";
import { toast } from "sonner";
import type { YouTubeUploadDefaults } from "@/lib/settings";
import { saveYouTubeUploadDefaults } from "./actions";

const field = "w-full rounded-lg border bg-background px-2.5 text-[13px] outline-none focus:border-ring";
const label = "mb-1 flex items-center gap-2 text-xs font-medium";

/** Defaults for every YouTube upload, filled into the Kalender form; saved on the server (not per browser). */
export function UploadSettings({ initial }: { initial: YouTubeUploadDefaults }) {
  const [v, setV] = useState(initial);
  const [saving, start] = useTransition();
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const set = <K extends keyof YouTubeUploadDefaults>(k: K, x: YouTubeUploadDefaults[K]) => setV((o) => ({ ...o, [k]: x }));
  const save = () =>
    start(async () => {
      try {
        await saveYouTubeUploadDefaults(v);
        toast.success("Pengaturan upload YouTube disimpan");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
      }
    });

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <header className="flex items-center gap-2">
        <Settings2 className="size-4 text-muted-foreground" />
        <h3 className="text-[13px] font-semibold">Pengaturan upload</h3>
        <span className="text-xs text-muted-foreground">dipakai otomatis di Kalender Upload · {"{judul}"} = nama video, {"{produk}"} = nama produk</span>
      </header>
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="block">
          <span className={label}>Judul <span className="ml-auto font-normal text-muted-foreground">{v.title.length}/100</span></span>
          <input className={`${field} h-9`} maxLength={100} value={v.title} onChange={(e) => set("title", e.target.value)} />
        </label>
        <label className="block">
          <span className={label}>Tag <span className="ml-auto font-normal text-muted-foreground">pisahkan dengan koma</span></span>
          <input className={`${field} h-9`} maxLength={500} value={v.tags} onChange={(e) => set("tags", e.target.value)} placeholder="shorts, review" />
        </label>
        <label className="block lg:row-span-2">
          <span className={label}>Deskripsi</span>
          <textarea className={`${field} min-h-[96px] resize-y py-2 leading-relaxed`} maxLength={5000} value={v.description} onChange={(e) => set("description", e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={label}>Visibilitas</span>
            <select className={`${field} h-9`} value={v.visibility} onChange={(e) => set("visibility", e.target.value as YouTubeUploadDefaults["visibility"])}>
              <option value="public">Publik</option>
              <option value="unlisted">Tidak publik</option>
              <option value="private">Pribadi</option>
            </select>
          </label>
          <div className="space-y-2 pt-6 text-[13px]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={v.aiContent} onChange={(e) => set("aiContent", e.target.checked)} className="accent-primary" /> Konten AI (label sintetis)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={v.madeForKids} onChange={(e) => set("madeForKids", e.target.checked)} className="accent-primary" /> Dibuat untuk anak</label>
          </div>
        </div>
        <div className="flex items-end justify-end">
          <button type="button" onClick={save} disabled={saving || !dirty} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {dirty ? "Simpan" : "Tersimpan"}
          </button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Video AI yang realistis wajib diberi label konten sintetis menurut aturan YouTube; matikan hanya untuk video yang bukan buatan AI.</p>
    </section>
  );
}
