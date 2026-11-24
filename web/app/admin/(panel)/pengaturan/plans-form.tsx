"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Plan } from "@/lib/license-api";
import { savePlans } from "../../actions";

/** Edit the default days / devices / price per plan. Plan ids stay fixed (licenses reference them). */
export function PlansForm({ plans }: { plans: Plan[] }) {
  const [rows, setRows] = useState(plans);
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<Plan>) => setRows((r) => r.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const save = () =>
    start(async () => {
      const r = await savePlans(rows);
      if (r.ok) toast.success("Paket disimpan");
      else toast.error(r.message);
    });

  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center border-b px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Paket</p>
          <p className="text-xs text-muted-foreground">Nilai bawaan saat membuat key. Key yang sudah ada tidak berubah.</p>
        </div>
        <Button className="ml-auto" onClick={save} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />} Simpan</Button>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-[0.8125rem]">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium"><th>Nama</th><th>Masa aktif (hari)</th><th>Perangkat</th><th>Harga (Rp)</th></tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.id} className="[&>td]:px-4 [&>td]:py-1.5">
                <td><Input value={p.label} maxLength={30} onChange={(e) => set(i, { label: e.target.value })} aria-label={`Nama ${p.id}`} /></td>
                <td>
                  <Input type="number" min={1} max={3650} value={p.days ?? ""} placeholder="Selamanya" disabled={p.days == null}
                    onChange={(e) => set(i, { days: Number(e.target.value) })} aria-label={`Hari ${p.id}`} />
                </td>
                <td><Input type="number" min={1} max={20} value={p.devices} onChange={(e) => set(i, { devices: Number(e.target.value) })} aria-label={`Perangkat ${p.id}`} /></td>
                <td><Input type="number" min={0} step={1000} value={p.price} onChange={(e) => set(i, { price: Number(e.target.value) })} aria-label={`Harga ${p.id}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
