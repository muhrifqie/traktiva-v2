"use client";

import { useState, useTransition } from "react";
import { Loader2, Rocket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createRelease, deleteRelease } from "../../actions";

export function NewRelease() {
  const [mandatory, setMandatory] = useState(false);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    start(async () => {
      const r = await createRelease({ version: String(f.get("version")), url: String(f.get("url")), notes: String(f.get("notes")), mandatory });
      if (!r.ok) return void toast.error(r.message);
      toast.success("Rilis diumumkan ke semua app.");
      form.reset();
      setMandatory(false);
    });
  };
  return (
    <form onSubmit={submit} className="grid content-start gap-3 rounded-xl border bg-card p-4">
      <p className="text-sm font-semibold">Umumkan versi baru</p>
      <label className="grid gap-1.5 text-xs font-medium">Versi<Input name="version" required placeholder="0.2.0" pattern="v?\d+\.\d+\.\d+" className="font-mono" /></label>
      <label className="grid gap-1.5 text-xs font-medium">Link download installer<Input name="url" type="url" required placeholder="https://…/Traktiva-Setup-0.2.0.exe" /></label>
      <label className="grid gap-1.5 text-xs font-medium">Catatan rilis<Textarea name="notes" rows={4} maxLength={4000} placeholder="Baris pertama tampil di banner app." /></label>
      <label className="flex items-start gap-2.5 rounded-lg border p-3 text-xs">
        <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} className="mt-0.5 accent-[var(--primary)]" />
        <span><b className="font-semibold">Update wajib</b><br /><span className="text-muted-foreground">Banner merah di app versi lama. Pakai untuk perbaikan penting.</span></span>
      </label>
      <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Rocket />} Umumkan</Button>
    </form>
  );
}

export function DeleteRelease({ id, version }: { id: number; version: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      const r = await deleteRelease(id);
      if (!r.ok) return void toast.error(r.message);
      setOpen(false);
    });
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={() => setOpen(true)} aria-label={`Hapus v${version}`} title="Hapus">
        <Trash2 />
      </Button>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Hapus v{version}?</DialogTitle>
          <DialogDescription>App berhenti menawarkan versi ini. Installer di link-nya tidak ikut terhapus.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Batal</Button>
          <Button variant="destructive" onClick={go} disabled={pending}>{pending && <Loader2 className="animate-spin" />} Hapus</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
