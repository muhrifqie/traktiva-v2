"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Plan } from "@/lib/license-api";
import { createKeys, type CreatedKeys } from "../actions";

/** "Buat key": pick a plan, then the new keys are shown ONCE (only their hash is stored on the server). */
export function CreateKeyButton({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState(plans[0]);
  const [days, setDays] = useState(String(plans[0]?.days ?? ""));
  const [devices, setDevices] = useState(String(plans[0]?.devices ?? 1));
  const [count, setCount] = useState("1");
  const [note, setNote] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [made, setMade] = useState<CreatedKeys | null>(null);
  const [pending, start] = useTransition();

  const pick = (p: Plan) => {
    setPlan(p);
    setDays(String(p.days ?? ""));
    setDevices(String(p.devices));
  };
  const reset = () => {
    setMade(null);
    setCount("1");
    setNote("");
    setRole("member");
    pick(plans[0]);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await createKeys({ plan: plan.id, days: plan.days == null ? undefined : Number(days), devices: Number(devices), count: Number(count), note, role });
      if (!r.ok) return void toast.error(r.message);
      setMade(r);
    });
  };
  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(what);
  };
  const csv = () => {
    if (!made) return;
    const rows = made.keys.map((k) => `${k.id},${k.key},${made.plan},${made.days ?? "selamanya"},${made.devices}`).join("\n");
    const url = URL.createObjectURL(new Blob([`id,key,paket,hari,perangkat\n${rows}\n`], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: `traktiva-keys-${new Date().toISOString().slice(0, 10)}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o && made) {
          reset();
          router.refresh();
        }
      }}
    >
      <Button onClick={() => setOpen(true)} className="h-9">
        <Plus /> Buat key
      </Button>
      <DialogContent className="sm:max-w-lg">
        {made ? (
          <>
            <DialogHeader>
              <DialogTitle>{made.keys.length} key dibuat</DialogTitle>
              <DialogDescription>{made.plan} · {made.days ? `${made.days} hari` : "selamanya"} · {made.devices} perangkat{made.role === "admin" ? " · Admin" : ""}</DialogDescription>
            </DialogHeader>
            <p className="rounded-lg border border-amber-300/30 bg-amber-300/8 px-3 py-2 text-xs text-amber-200">
              Simpan sekarang: key tidak bisa dilihat lagi setelah jendela ini ditutup (server hanya menyimpan hash-nya).
            </p>
            <ul className="grid max-h-64 gap-1.5 overflow-auto">
              {made.keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
                  <span className="font-mono text-sm font-semibold select-all">{k.key}</span>
                  <Button size="sm" variant="outline" onClick={() => copy(k.key, "Key disalin")}><Copy /> Salin</Button>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="outline" onClick={csv}><Download /> Unduh CSV</Button>
              <Button variant="outline" onClick={() => copy(made.keys.map((k) => k.key).join("\n"), `${made.keys.length} key disalin`)}><Copy /> Salin semua</Button>
              <Button onClick={() => (setOpen(false), reset(), router.refresh())}>Selesai</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Buat key lisensi</DialogTitle>
              <DialogDescription>Key hanya tampil sekali setelah dibuat. Salin dan kirim ke pembeli.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <span className="text-xs font-medium">Paket</span>
              <div className="inline-flex w-fit rounded-lg border bg-muted p-0.5" role="radiogroup" aria-label="Paket">
                {plans.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={p.id === plan.id}
                    onClick={() => pick(p)}
                    className={`h-7 rounded-md px-3 text-xs font-medium ${p.id === plan.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="grid gap-1.5 text-xs font-medium">
                Masa aktif (hari)
                <Input type="number" min={1} max={3650} value={plan.days == null ? "" : days} placeholder={plan.days == null ? "Selamanya" : ""} disabled={plan.days == null} onChange={(e) => setDays(e.target.value)} />
              </label>
              <label className="grid gap-1.5 text-xs font-medium">
                Perangkat
                <Input type="number" min={1} max={20} value={devices} onChange={(e) => setDevices(e.target.value)} />
              </label>
              <label className="grid gap-1.5 text-xs font-medium">
                Jumlah key
                <Input type="number" min={1} max={200} value={count} onChange={(e) => setCount(e.target.value)} />
              </label>
            </div>
            <label className="grid gap-1.5 text-xs font-medium">
              <span>Catatan pembeli <span className="font-normal text-muted-foreground">— nama, kontak, atau nomor pesanan</span></span>
              <Input maxLength={200} value={note} placeholder="contoh: Budi · WA 0812…" onChange={(e) => setNote(e.target.value)} />
            </label>
            <label className="flex items-start gap-2.5 rounded-lg border p-3 text-xs">
              <input type="checkbox" checked={role === "admin"} onChange={(e) => setRole(e.target.checked ? "admin" : "member")} className="mt-0.5 accent-[var(--primary)]" />
              <span><b className="font-semibold">Lisensi admin</b><br /><span className="text-muted-foreground">Untuk tim sendiri: label Admin + pintasan Panel admin di app. Bukan untuk pembeli.</span></span>
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Buat key</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
