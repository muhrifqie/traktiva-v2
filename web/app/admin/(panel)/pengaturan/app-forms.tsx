"use client";

import { useState, useTransition } from "react";
import { Cpu, Loader2, MessageCircle, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveHwid, saveRemote, saveSite } from "../../actions";

/** Flags the desktop app already reads (lib/server-info.ts → remoteFlag). Anything else is stored for future use. */
const KNOWN: Record<string, string> = {
  maxParallel: "Batas slot Flow paralel di semua app (angka, 0 = ikut setelan pengguna)",
};

export function SiteForm({ whatsapp }: { whatsapp: string }) {
  const [wa, setWa] = useState(whatsapp);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await saveSite({ whatsapp: wa });
      if (r.ok) toast.success("Nomor WA disimpan");
      else toast.error(r.message);
    });
  return (
    <section className="rounded-xl border bg-card">
      <header className="border-b px-4 py-3">
        <p className="text-sm font-semibold">Kontak penjualan</p>
        <p className="text-xs text-muted-foreground">Tombol Beli & Perpanjang di website membuka WhatsApp ke nomor ini.</p>
      </header>
      <div className="flex flex-wrap items-end gap-3 p-4">
        <label className="grid flex-1 gap-1.5 text-xs font-medium">
          Nomor WhatsApp
          <Input value={wa} onChange={(e) => setWa(e.target.value)} inputMode="tel" placeholder="0812xxxxxxx" maxLength={20} />
        </label>
        <Button onClick={save} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <MessageCircle />} Simpan</Button>
      </div>
    </section>
  );
}

type Row = { key: string; type: "text" | "number" | "bool"; value: string };
const toRows = (r: Record<string, string | number | boolean>): Row[] =>
  Object.entries(r).map(([key, v]) => ({ key, type: typeof v === "boolean" ? "bool" : typeof v === "number" ? "number" : "text", value: String(v) }));

export function RemoteForm({ remote }: { remote: Record<string, string | number | boolean> }) {
  const [rows, setRows] = useState<Row[]>(() => toRows(remote));
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const save = () =>
    start(async () => {
      const out: Record<string, string | number | boolean> = {};
      for (const r of rows.filter((x) => x.key.trim())) {
        if (r.type === "number" && !Number.isFinite(Number(r.value))) return void toast.error(`${r.key}: harus angka`);
        out[r.key.trim()] = r.type === "bool" ? r.value === "true" : r.type === "number" ? Number(r.value) : r.value;
      }
      const res = await saveRemote(out);
      if (res.ok) toast.success("Setelan app disimpan. Sampai ke semua app paling lambat 5 menit.");
      else toast.error(res.message);
    });

  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Setelan app jarak jauh</p>
          <p className="text-xs text-muted-foreground">Diterapkan ke semua app Traktiva tanpa update.</p>
        </div>
        <Button className="ml-auto" onClick={save} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />} Simpan</Button>
      </header>
      <div className="grid gap-2 p-4">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_110px_1fr_auto] items-center gap-2">
            <Input value={r.key} onChange={(e) => set(i, { key: e.target.value })} placeholder="nama" className="font-mono" aria-label="Nama setelan" />
            <select value={r.type} onChange={(e) => set(i, { type: e.target.value as Row["type"], value: e.target.value === "bool" ? "false" : r.value })}
              className="h-9 rounded-lg border bg-transparent px-2 text-sm" aria-label="Jenis nilai">
              <option value="text">Teks</option>
              <option value="number">Angka</option>
              <option value="bool">Ya/Tidak</option>
            </select>
            {r.type === "bool" ? (
              <select value={r.value} onChange={(e) => set(i, { value: e.target.value })} className="h-9 rounded-lg border bg-transparent px-2 text-sm" aria-label="Nilai">
                <option value="true">Ya</option>
                <option value="false">Tidak</option>
              </select>
            ) : (
              <Input value={r.value} onChange={(e) => set(i, { value: e.target.value })} inputMode={r.type === "number" ? "decimal" : undefined} aria-label="Nilai" />
            )}
            <Button size="icon-sm" variant="ghost" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label="Hapus setelan"><Trash2 /></Button>
            {KNOWN[r.key] && <p className="col-span-4 -mt-1 text-[11px] text-muted-foreground">{KNOWN[r.key]}</p>}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setRows((x) => [...x, { key: "", type: "text", value: "" }])}><Plus /> Tambah setelan</Button>
          {Object.keys(KNOWN)
            .filter((k) => !rows.some((r) => r.key === k))
            .map((k) => (
              <Button key={k} variant="ghost" size="sm" onClick={() => setRows((x) => [...x, { key: k, type: "number", value: "0" }])}><Plus /> {k}</Button>
            ))}
        </div>
      </div>
    </section>
  );
}

/** HWID lock: how many hardware parts (of motherboard ×2, CPU, RAM, disk, BIOS) may change before a PC is refused. */
export function HwidForm({ tolerance }: { tolerance: number }) {
  const [n, setN] = useState(tolerance);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await saveHwid(n);
      if (r.ok) toast.success("Kunci hardware disimpan. Berlaku di heartbeat berikutnya (≤ 5 menit).");
      else toast.error(r.message);
    });
  const OPTIONS = [
    [0, "Ketat", "Semua komponen harus sama. Ganti RAM/disk = minta reset."],
    [1, "Toleran 1", "Boleh 1 komponen berubah (mis. tambah RAM)."],
    [2, "Toleran 2", "Boleh 2 komponen berubah."],
  ] as const;
  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Cpu className="size-4 text-brand-light" /> Kunci hardware (HWID)</p>
          <p className="text-xs text-muted-foreground">Setiap PC terkunci ke motherboard, CPU, RAM, disk, dan BIOS saat aktivasi (bukan ID Windows, yang sering berubah oleh spoofer/cleaner).</p>
        </div>
        <Button className="ml-auto" onClick={save} disabled={pending || n === tolerance}>{pending ? <Loader2 className="animate-spin" /> : <Save />} Simpan</Button>
      </header>
      <div className="grid gap-2 p-4 sm:grid-cols-3" role="radiogroup" aria-label="Toleransi hardware">
        {OPTIONS.map(([v, label, hint]) => (
          <button key={v} type="button" role="radio" aria-checked={n === v} onClick={() => setN(v)}
            className={`rounded-lg border p-3 text-left text-xs ${n === v ? "border-primary bg-primary/12" : "hover:bg-muted/40"}`}>
            <p className="text-sm font-semibold">{label}</p>
            <p className="mt-1 text-muted-foreground">{hint}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
