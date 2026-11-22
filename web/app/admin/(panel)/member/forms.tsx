"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Link2, Loader2, UserCog, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createMember, memberAction } from "../../actions";

/** One-time "atur password" link, shown once (only its hash is stored). */
function LinkBox({ link, email }: { link: string; email: string }) {
  return (
    <div className="grid gap-2">
      <p className="rounded-lg border border-amber-300/30 bg-amber-300/8 px-3 py-2 text-xs text-amber-200">
        Kirim link ini ke {email} lewat chat pribadi. Berlaku 30 menit, sekali pakai, dan tidak bisa dilihat lagi setelah ditutup.
      </p>
      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs select-all">{link}</span>
        <Button size="sm" variant="outline" onClick={async () => (await navigator.clipboard.writeText(link), toast.success("Link disalin"))}><Copy /> Salin</Button>
      </div>
    </div>
  );
}

export function CreateMember() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [admin, setAdmin] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const close = (o: boolean) => {
    setOpen(o);
    if (!o) {
      if (link) router.refresh();
      setLink(null); setEmail(""); setName(""); setAdmin(false);
    }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await createMember({ email, name, admin });
      if (!r.ok) return void toast.error(r.message);
      setLink(r.link ?? null);
    });
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <Button onClick={() => setOpen(true)} className="h-9"><UserPlus /> Buat akun</Button>
      <DialogContent className="sm:max-w-lg">
        {link ? (
          <>
            <DialogHeader>
              <DialogTitle>Akun dibuat</DialogTitle>
              <DialogDescription>{email}{admin ? " · Admin" : ""}. Pemilik akun mengatur password sendiri lewat link ini.</DialogDescription>
            </DialogHeader>
            <LinkBox link={link} email={email} />
            <DialogFooter><Button onClick={() => close(false)}>Selesai</Button></DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Buat akun member</DialogTitle>
              <DialogDescription>Tanpa password: kamu dapat link sekali pakai untuk dikirim ke pemilik akun. Bisa juga langsung masuk dengan Google memakai email yang sama.</DialogDescription>
            </DialogHeader>
            <label className="grid gap-1.5 text-xs font-medium">Email<Input type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="grid gap-1.5 text-xs font-medium">Nama<Input maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="flex items-start gap-2.5 rounded-lg border p-3 text-xs">
              <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} className="mt-0.5 accent-[var(--primary)]" />
              <span><b className="font-semibold">Admin</b><br /><span className="text-muted-foreground">Bisa membuka panel ini. Hanya untuk tim sendiri.</span></span>
            </label>
            <DialogFooter><Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <UserPlus />} Buat & ambil link</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

type Ask = { title: string; body: string; label: string; danger?: boolean; input: Parameters<typeof memberAction>[1]; done: string };

export function MemberRowActions({ id, email, admin, self }: { id: number; email: string; admin: boolean; self: boolean }) {
  const [link, setLink] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [pending, start] = useTransition();
  const run = (input: Ask["input"], done: string) =>
    start(async () => {
      const r = await memberAction(id, input);
      setAsk(null);
      if (!r.ok) return void toast.error(r.message);
      if (r.link) setLink(r.link);
      else toast.success(done);
    });
  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run({ action: "link" }, "")} title="Link atur/reset password"><Link2 /> Link password</Button>
      {!self && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setAsk(admin
          ? { title: `Cabut admin dari ${email}?`, body: "Akun ini langsung keluar dari semua perangkat.", label: "Cabut admin", danger: true, input: { action: "role", admin: false }, done: "Peran admin dicabut" }
          : { title: `Jadikan ${email} admin?`, body: "Akun ini bisa mengelola semua lisensi dan member.", label: "Jadikan admin", input: { action: "role", admin: true }, done: "Sekarang admin" })}>
          <UserCog /> {admin ? "Cabut admin" : "Jadikan admin"}
        </Button>
      )}
      <Dialog open={!!ask} onOpenChange={(o) => !o && !pending && setAsk(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{ask?.title}</DialogTitle>
            <DialogDescription>{ask?.body}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsk(null)} disabled={pending}>Batal</Button>
            <Button variant={ask?.danger ? "destructive" : "default"} onClick={() => ask && run(ask.input, ask.done)} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} {ask?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!link} onOpenChange={(o) => !o && setLink(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Link atur password</DialogTitle>
            <DialogDescription>{email}</DialogDescription>
          </DialogHeader>
          {link && <LinkBox link={link} email={email} />}
          <DialogFooter><Button onClick={() => setLink(null)}>Selesai</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
