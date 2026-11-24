"use client";

import { useState, useTransition } from "react";
import { Ban, CalendarPlus, Infinity as InfinityIcon, Loader2, Pause, Play, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { License } from "@/lib/license-api";
import { resetDevice, updateLicense, type Result } from "../../../actions";

type Ask = { title: string; body: string; label: string; danger?: boolean; run: () => Promise<Result> };

/** One confirm dialog per caller: ask(...) opens it, the action runs on "yes". */
function useConfirm() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      const r = await ask!.run();
      if (!r.ok) return void toast.error(r.message);
      toast.success("Tersimpan");
      setAsk(null);
    });
  const dialog = (
    <Dialog open={!!ask} onOpenChange={(o) => !o && !pending && setAsk(null)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{ask?.title}</DialogTitle>
          <DialogDescription>{ask?.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAsk(null)} disabled={pending}>Batal</Button>
          <Button variant={ask?.danger ? "destructive" : "default"} onClick={go} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} {ask?.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return { open: setAsk, dialog, pending };
}

export function DeviceReset({ id, name }: { id: string; name: string }) {
  const c = useConfirm();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => c.open({
        title: "Reset perangkat?",
        body: `${name} akan keluar dalam ≤ 15 menit dan slot perangkatnya kosong lagi. Pakai juga saat pembeli ganti RAM/disk/motherboard: aktivasi ulang mengunci ke hardware barunya.`,
        label: "Reset",
        danger: true,
        run: () => resetDevice(id),
      })}>
        <RotateCcw /> Reset
      </Button>
      {c.dialog}
    </>
  );
}

export function LicenseActions({ license: l }: { license: License }) {
  const c = useConfirm();
  const [days, setDays] = useState("30");
  const [note, setNote] = useState(l.note ?? "");
  const [devices, setDevices] = useState(String(l.max_devices));
  const [saving, start] = useTransition();
  const revoked = l.status === "revoked";
  const save = () =>
    start(async () => {
      const r = await updateLicense(l.id, { action: "edit", note, devices: Number(devices) });
      if (r.ok) toast.success("Tersimpan");
      else toast.error(r.message);
    });

  if (revoked) return <p className="rounded-xl border bg-card p-4 text-xs text-muted-foreground">Lisensi ini sudah dicabut permanen. Buat key baru kalau pembeli perlu akses lagi.</p>;

  return (
    <>
      <section className="grid gap-3 rounded-xl border bg-card p-4">
        <p className="text-sm font-semibold">Masa aktif</p>
        <div className="flex gap-2">
          <Input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} aria-label="Tambah hari" className="w-20" />
          <Button variant="outline" className="flex-1" onClick={() => c.open({
            title: `Tambah ${days} hari?`,
            body: "Dihitung dari tanggal habis sekarang (atau dari hari ini kalau sudah lewat).",
            label: "Perpanjang",
            run: () => updateLicense(l.id, { action: "extend", days: Number(days) }),
          })}>
            <CalendarPlus /> Perpanjang
          </Button>
        </div>
        {l.expires_at != null && (
          <Button variant="outline" onClick={() => c.open({ title: "Jadikan lifetime?", body: "Key ini tidak akan pernah kedaluwarsa.", label: "Jadikan lifetime", run: () => updateLicense(l.id, { action: "lifetime" }) })}>
            <InfinityIcon /> Jadikan lifetime
          </Button>
        )}
      </section>
      <section className="grid gap-3 rounded-xl border bg-card p-4">
        <p className="text-sm font-semibold">Ubah</p>
        <label className="grid gap-1.5 text-xs font-medium">Catatan pembeli<Input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <label className="grid gap-1.5 text-xs font-medium">Batas perangkat<Input type="number" min={1} max={20} value={devices} onChange={(e) => setDevices(e.target.value)} /></label>
        <Button variant="outline" onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />} Simpan</Button>
      </section>
      <section className="grid gap-2 rounded-xl border bg-card p-4">
        <p className="text-sm font-semibold">Akun pemilik</p>
        <p className="text-xs text-muted-foreground">{l.owner ? <>Diklaim oleh <b className="text-foreground">{l.owner}</b>. Lepas kalau pembeli salah akun atau key berpindah tangan.</> : "Belum diklaim ke akun member mana pun."}</p>
        {l.owner && (
          <Button variant="outline" onClick={() => c.open({ title: "Lepas dari akun?", body: `Key tidak lagi muncul di akun ${l.owner}. Pemilik baru bisa mengklaimnya lagi pakai key yang sama.`, label: "Lepas dari akun", danger: true, run: () => updateLicense(l.id, { action: "unclaim" }) })}>
            Lepas dari akun
          </Button>
        )}
      </section>
      <section className="grid gap-2 rounded-xl border bg-card p-4">
        <p className="text-sm font-semibold">Peran</p>
        <p className="text-xs text-muted-foreground">{l.role === "admin" ? "Admin: label Admin + pintasan Panel admin di app." : "Member: pembeli biasa."}</p>
        <Button variant="outline" onClick={() => c.open({
          title: l.role === "admin" ? "Jadikan member?" : "Jadikan admin?",
          body: l.role === "admin" ? "Label Admin dan pintasan panel hilang dari app pemakai key ini." : "Hanya untuk tim sendiri. Pemakai key ini melihat pintasan Panel admin (tetap butuh login panel).",
          label: l.role === "admin" ? "Jadikan member" : "Jadikan admin",
          run: () => updateLicense(l.id, { action: "role", role: l.role === "admin" ? "member" : "admin" }),
        })}>
          <ShieldCheck /> {l.role === "admin" ? "Jadikan member" : "Jadikan admin"}
        </Button>
      </section>
      <section className="grid gap-2 rounded-xl border bg-card p-4">
        <p className="text-sm font-semibold">Status</p>
        {l.status === "active" ? (
          <Button variant="outline" onClick={() => c.open({ title: "Tangguhkan lisensi?", body: "Semua perangkat terkunci dalam ≤ 15 menit. Bisa diaktifkan lagi kapan saja.", label: "Tangguhkan", run: () => updateLicense(l.id, { action: "status", status: "suspended" }) })}>
            <Pause /> Tangguhkan
          </Button>
        ) : (
          <Button variant="outline" onClick={() => c.open({ title: "Aktifkan lagi?", body: "Perangkat yang terdaftar bisa memakai aplikasi lagi.", label: "Aktifkan", run: () => updateLicense(l.id, { action: "status", status: "active" }) })}>
            <Play /> Aktifkan lagi
          </Button>
        )}
        <Button variant="destructive" onClick={() => c.open({ title: "Cabut lisensi permanen?", body: "Tidak bisa dibatalkan. Semua perangkat terkunci dan key tidak bisa dipakai lagi.", label: "Cabut permanen", danger: true, run: () => updateLicense(l.id, { action: "status", status: "revoked" }) })}>
          <Ban /> Cabut permanen
        </Button>
      </section>
      {c.dialog}
    </>
  );
}
