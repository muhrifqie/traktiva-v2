"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Clapperboard, Eye, EyeOff, ImageUp, Loader2, Mic, Palette, Pencil, Plus, Save, Trash2, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fmtTime } from "@/lib/format";
import type { TemplateKind, TemplateRow } from "@/lib/license-api";
import { saveTemplate, templateAction } from "./actions";

const KINDS: { id: TemplateKind; label: string; icon: typeof Clapperboard; hint: string }[] = [
  { id: "konsep", label: "Konsep video", icon: Clapperboard, hint: "Muncul di Buat Video. AI menulis scene dari ide ini + produk pembeli." },
  { id: "gaya", label: "Gaya editor", icon: Palette, hint: "Muncul di Editor → Format video laris: subtitle, efek, teks overlay sekali klik." },
  { id: "naskah", label: "Naskah VO", icon: Mic, hint: "Muncul di Naskah voice-over: gaya jualan + beberapa naskah siap pakai." },
];
const MOODS = [
  { value: "natural", label: "Santai & natural" },
  { value: "energetic", label: "Energik & cepat" },
  { value: "elegant", label: "Mewah & elegan" },
  { value: "funny", label: "Lucu & menghibur" },
];
const VOICES = [
  { value: "female", label: "Suara cewek" },
  { value: "male", label: "Suara cowok" },
  { value: "none", label: "Tanpa suara" },
];
// same shape as the app's EditTemplate (lib/edit.ts); "Salin JSON gaya" in the app's editor gives a ready one
const STYLE_SAMPLE = {
  captionStyle: { preset: "minimal", font: "tiktok", upper: true, size: 0.045, y: 0.66, anim: "none", karaoke: true, accent: "#ffe03d" },
  fx: { transition: "none", kenburns: false },
  overlays: [{ kind: "info", text: "Cakep poll\nNyaman banget dipakai ✨", x: 0.5, y: 0.15, size: 0.042, anim: "fade", from: 0, to: 1 }],
  captions: 2,
  note: "Subtitle 1–2 kata kecil, teks info di atas.",
};

const kindOf = (k: TemplateKind) => KINDS.find((x) => x.id === k)!;
const field = "grid gap-1.5 text-xs font-medium";
const select = "h-9 rounded-lg border bg-background px-2.5 text-[0.8125rem]";

type Draft = {
  id?: number; kind: TemplateKind; title: string; summary: string; category: string; cover: string; preview: string; minApp: string; sort: number;
  data: Record<string, unknown>;
};
const blank = (kind: TemplateKind): Draft => ({
  kind, title: "", summary: "", category: "", cover: "", preview: "", minApp: "", sort: 0,
  data: kind === "konsep" ? { scenes: 3, mood: "natural", voice: "female", background: "auto" } : kind === "gaya" ? STYLE_SAMPLE : { lines: [] },
});
const fromRow = (t: TemplateRow): Draft => ({ id: t.id, kind: t.kind, title: t.title, summary: t.summary, category: t.category, cover: t.cover ?? "", preview: t.preview ?? "", minApp: t.min_app, sort: t.sort, data: t.data });

export function TemplateManager({ templates }: { templates: TemplateRow[] }) {
  const [filter, setFilter] = useState<TemplateKind | "all">("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const shown = filter === "all" ? templates : templates.filter((t) => t.kind === filter);
  const count = (k: TemplateKind) => templates.filter((t) => t.kind === k).length;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
      <section className="min-w-0 rounded-xl border bg-card">
        <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <div className="inline-flex rounded-lg border bg-muted p-0.5" role="tablist">
            {[{ id: "all" as const, label: `Semua ${templates.length}` }, ...KINDS.map((k) => ({ id: k.id, label: `${k.label} ${count(k.id)}` }))].map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={filter === t.id} onClick={() => setFilter(t.id)}
                className={`h-7 rounded-md px-3 text-xs font-medium ${filter === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <Button size="sm" className="ml-auto" onClick={() => setDraft(blank(filter === "all" ? "konsep" : filter))}><Plus /> Template baru</Button>
        </header>
        {shown.length ? (
          <ul className="divide-y">{shown.map((t) => <TemplateItem key={t.id} t={t} editing={draft?.id === t.id} onEdit={() => setDraft(fromRow(t))} />)}</ul>
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">Belum ada template. Klik “Template baru”.</p>
        )}
      </section>
      {draft ? (
        <TemplateForm key={draft.id ?? `new-${draft.kind}`} initial={draft} onDone={() => setDraft(null)} />
      ) : (
        <aside className="grid content-start gap-3 rounded-xl border border-dashed p-5 text-[0.8125rem] text-muted-foreground">
          <p className="font-semibold text-foreground">Cara kerja</p>
          {KINDS.map((k) => (
            <p key={k.id} className="flex gap-2"><k.icon className="mt-0.5 size-4 shrink-0" /> <span><b className="text-foreground">{k.label}</b>: {k.hint}</span></p>
          ))}
          <p>Template tayang langsung terkirim ke semua app lewat sinkron lisensi (tiap 5 menit). Matikan = hilang dari app di sinkron berikutnya; proyek yang sudah dibuat pembeli tidak ikut berubah.</p>
        </aside>
      )}
    </div>
  );
}

function TemplateItem({ t, editing, onEdit }: { t: TemplateRow; editing: boolean; onEdit: () => void }) {
  const [pending, start] = useTransition();
  const run = (action: "on" | "off" | "delete") =>
    start(async () => {
      if (action === "delete" && !window.confirm(`Hapus template “${t.title}”? Tidak bisa dibatalkan.`)) return;
      const r = await templateAction(t.id, action);
      if (!r.ok) toast.error(r.message);
    });
  const K = kindOf(t.kind);
  return (
    <li className={`flex items-center gap-3 px-4 py-3 text-[0.8125rem] ${t.active ? "" : "opacity-55"} ${editing ? "bg-primary/8" : ""}`}>
      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted">
        {t.cover ? <img src={t.cover} alt="" className="size-full object-cover" /> : t.preview ? <video src={`${t.preview}#t=0.5`} muted preload="metadata" className="size-full object-cover" /> : <K.icon className="size-5 text-muted-foreground" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-semibold">
          <span className="truncate">{t.title}</span>
          {!t.active && <span className="text-[0.6875rem] font-normal text-muted-foreground">(tidak tayang)</span>}
        </p>
        <p className="truncate text-muted-foreground">{t.summary || "—"}</p>
        <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
          <K.icon className="mr-1 inline size-3" />{K.label}{t.category && ` · ${t.category}`}{t.min_app && ` · app ≥ ${t.min_app}`} · {t.actor ?? "?"} · {fmtTime(t.updated_at)}
        </p>
      </div>
      <div className="flex gap-1">
        <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label="Edit" title="Edit"><Pencil /></Button>
        <Button size="icon-sm" variant="ghost" disabled={pending} onClick={() => run(t.active ? "off" : "on")} aria-label={t.active ? "Matikan" : "Tayangkan"} title={t.active ? "Matikan" : "Tayangkan"}>
          {t.active ? <EyeOff /> : <Eye />}
        </Button>
        <Button size="icon-sm" variant="ghost" disabled={pending} onClick={() => run("delete")} aria-label="Hapus" title="Hapus"><Trash2 /></Button>
      </div>
    </li>
  );
}

function TemplateForm({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [styleText, setStyleText] = useState(() => JSON.stringify(initial.kind === "gaya" ? initial.data : STYLE_SAMPLE, null, 2));
  const [linesText, setLinesText] = useState(() => (Array.isArray(initial.data.lines) ? (initial.data.lines as string[]).join("\n\n") : ""));
  const [pending, start] = useTransition();
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const setData = (p: Record<string, unknown>) => setD((x) => ({ ...x, data: { ...x.data, ...p } }));
  const str = (k: string) => String(d.data[k] ?? "");
  const K = kindOf(d.kind);
  const styleError = useMemo(() => {
    if (d.kind !== "gaya") return null;
    try {
      JSON.parse(styleText);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "JSON tidak valid";
    }
  }, [d.kind, styleText]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (styleError) return void toast.error(`JSON gaya belum benar: ${styleError}`);
    const data =
      d.kind === "gaya" ? (JSON.parse(styleText) as Record<string, unknown>)
      : d.kind === "naskah" ? { ...d.data, lines: linesText.split(/\n\s*\n/).map((l) => l.trim()).filter(Boolean) }
      : { ...d.data, scenes: Number(d.data.scenes) || 3 };
    start(async () => {
      const r = await saveTemplate({ ...d, data });
      if (!r.ok) return void toast.error(r.message);
      toast.success(d.id ? "Template diperbarui. Sampai ke app paling lambat 5 menit." : "Template tayang. Sampai ke app paling lambat 5 menit.");
      onDone();
    });
  };

  return (
    <form onSubmit={submit} className="grid content-start gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold">{d.id ? "Edit template" : "Template baru"}</p>
        <Button type="button" size="icon-sm" variant="ghost" className="ml-auto" onClick={onDone} aria-label="Tutup"><X /></Button>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-lg border bg-muted p-0.5" role="radiogroup" aria-label="Jenis">
        {KINDS.map((k) => (
          <button key={k.id} type="button" role="radio" aria-checked={d.kind === k.id}
            onClick={() => { if (k.id !== d.kind) setD({ ...blank(k.id), id: d.id, title: d.title, summary: d.summary, category: d.category, cover: d.cover, preview: d.preview, minApp: d.minApp, sort: d.sort }); }}
            className={`flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium ${d.kind === k.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <k.icon className="size-3.5" /> {k.label}
          </button>
        ))}
      </div>
      <p className="text-[0.6875rem] text-muted-foreground">{K.hint}</p>

      <label className={field}>Judul<Input value={d.title} onChange={(e) => set({ title: e.target.value })} required maxLength={80} placeholder="contoh: Unboxing ASMR" /></label>
      <label className={field}>Ringkasan<Textarea value={d.summary} onChange={(e) => set({ summary: e.target.value })} maxLength={300} rows={2} placeholder="Satu-dua kalimat yang tampil di kartu galeri." /></label>
      <div className="grid grid-cols-[1fr_90px_90px] gap-2">
        <label className={field}>Kategori<Input value={d.category} onChange={(e) => set({ category: e.target.value })} maxLength={40} placeholder="Skincare, Fashion…" /></label>
        <label className={field}>Urutan<Input type="number" value={d.sort} onChange={(e) => set({ sort: Number(e.target.value) || 0 })} min={-1000} max={1000} title="Lebih besar = lebih atas" /></label>
        <label className={field}>App ≥<Input value={d.minApp} onChange={(e) => set({ minApp: e.target.value })} maxLength={20} placeholder="1.4.0" title="Kosong = semua versi" /></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MediaField label="Cover" accept="image/webp,image/jpeg,image/png" value={d.cover} onChange={(cover) => set({ cover })} />
        <MediaField label="Video contoh" accept="video/mp4,video/webm" value={d.preview} onChange={(preview) => set({ preview })} video />
      </div>

      {d.kind === "konsep" && (
        <>
          <label className={field}>Ide video (untuk penulis AI)<Textarea value={str("idea")} onChange={(e) => setData({ idea: e.target.value })} required minLength={10} maxLength={1500} rows={4} placeholder="contoh: Unboxing pelan di meja kayu, suara kertas dan tangan saja, lalu produk dipakai dan hasilnya ditunjukkan." /></label>
          <div className="grid grid-cols-[90px_1fr_1fr] gap-2">
            <label className={field}>Scene<Input type="number" min={1} max={12} value={str("scenes")} onChange={(e) => setData({ scenes: e.target.value })} /></label>
            <label className={field}>Suasana
              <select className={select} value={str("mood")} onChange={(e) => setData({ mood: e.target.value })}>{MOODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
            </label>
            <label className={field}>Suara
              <select className={select} value={str("voice")} onChange={(e) => setData({ voice: e.target.value })}>{VOICES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
            </label>
          </div>
          <label className={field}>Siapa yang tampil<Input value={str("cast")} onChange={(e) => setData({ cast: e.target.value })} maxLength={300} placeholder="contoh: tangan saja / cewek hijab setengah badan (kosong = AI pilih)" /></label>
          <label className={field}>Latar<Input value={str("background") === "auto" ? "" : str("background")} onChange={(e) => setData({ background: e.target.value || "auto" })} maxLength={300} placeholder="Kosong = AI pilih latar yang cocok dengan produk" /></label>
          <label className={field}>Hook pembuka<Input value={str("hook")} onChange={(e) => setData({ hook: e.target.value })} maxLength={150} placeholder="Opsional, contoh: Jangan beli ini kalau…" /></label>
          <label className={field}>Cocok untuk<Input value={str("bestFor")} onChange={(e) => setData({ bestFor: e.target.value })} maxLength={150} placeholder="contoh: Skincare, gadget kecil" /></label>
        </>
      )}

      {d.kind === "naskah" && (
        <>
          <label className={field}>Keterangan gaya<Input value={str("hint")} onChange={(e) => setData({ hint: e.target.value })} maxLength={120} placeholder="contoh: Bikin penasaran dulu, jualan di akhir" /></label>
          <label className={field}>Arahan untuk AI (opsional, English)<Input value={str("ai")} onChange={(e) => setData({ ai: e.target.value })} maxLength={200} placeholder="curiosity hook first, soft sell at the end" /></label>
          <label className={field}>
            Naskah (pisahkan tiap naskah dengan 1 baris kosong)
            <Textarea value={linesText} onChange={(e) => setLinesText(e.target.value)} rows={9} placeholder={"Aku nyesel baru tahu {nama} sekarang! Dipakai tiap hari tetap awet[, dan cuma {harga}]. Cek keranjang di bawah ya!\n\nNaskah kedua…"} />
          </label>
          <p className="text-[0.6875rem] text-muted-foreground">
            <code>{"{nama}"}</code> = nama pendek produk, <code>{"{harga}"}</code> = harga. Bagian dalam <code>[ … ]</code> dibuang kalau produk tanpa harga. Minimal 20 karakter per naskah; CTA “cek keranjang di bawah”.
          </p>
        </>
      )}

      {d.kind === "gaya" && (
        <label className={field}>
          Gaya (JSON)
          <Textarea value={styleText} onChange={(e) => setStyleText(e.target.value)} rows={14} spellCheck={false} className="font-mono text-[0.75rem]" />
          <span className={`text-[0.6875rem] font-normal ${styleError ? "text-destructive" : "text-muted-foreground"}`}>
            {styleError ?? "Atur gayanya di Editor app (akun admin) → Format video laris → “Salin JSON gaya”, lalu tempel di sini."}
          </span>
        </label>
      )}

      <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />} {d.id ? "Simpan perubahan" : "Tayangkan"}</Button>
    </form>
  );
}

function MediaField({ label, accept, value, onChange, video }: { label: string; accept: string; value: string; onChange: (url: string) => void; video?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    if (file.size > 12 * 1024 * 1024) return void toast.error("Maksimal 12 MB. Kompres dulu.");
    setBusy(true);
    try {
      const r = await fetch("/admin/template-media", { method: "POST", headers: { "content-type": file.type }, body: file });
      const j = (await r.json().catch(() => ({ ok: false, message: `Upload gagal (${r.status})` }))) as { ok: boolean; url?: string; message?: string };
      if (!j.ok || !j.url) throw new Error(j.message ?? "Upload gagal");
      onChange(j.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload gagal");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-1.5 text-xs font-medium">
      {label}
      <button type="button" onClick={() => input.current?.click()} disabled={busy} aria-label={`Pilih file ${label}`}
        className="relative grid aspect-[9/12] place-items-center overflow-hidden rounded-lg border border-dashed bg-muted text-muted-foreground hover:border-primary/60 hover:text-foreground">
        {value ? (video ? <video src={value} muted loop autoPlay playsInline className="size-full object-cover" /> : <img src={value} alt="" className="size-full object-cover" />)
          : busy ? <Loader2 className="size-5 animate-spin" /> : <span className="grid justify-items-center gap-1 text-[0.6875rem] font-normal">{video ? <Video className="size-5" /> : <ImageUp className="size-5" />}Pilih file</span>}
        {busy && value && <span className="absolute inset-0 grid place-items-center bg-black/50"><Loader2 className="size-5 animate-spin" /></span>}
      </button>
      <input ref={input} type="file" accept={accept} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
      <div className="flex gap-1">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="atau tempel URL https://" className="h-7 text-[0.6875rem]" />
        {value && <Button type="button" size="icon-sm" variant="ghost" onClick={() => onChange("")} aria-label={`Hapus ${label}`}><X /></Button>}
      </div>
    </div>
  );
}
