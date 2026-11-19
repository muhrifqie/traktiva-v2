"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Announcement } from "@/lib/license-api";
import { announcementAction, createAnnouncement } from "../../actions";

const LEVELS = [
  { id: "info", label: "Info", cls: "bg-[#4ea7fc]/12 text-[#9ccbff]" },
  { id: "warn", label: "Penting", cls: "bg-amber-300/12 text-amber-200" },
  { id: "critical", label: "Darurat", cls: "bg-destructive/15 text-red-200" },
] as const;
const levelOf = (id: string) => LEVELS.find((l) => l.id === id) ?? LEVELS[0];

export function NewAnnouncement() {
  const [level, setLevel] = useState<(typeof LEVELS)[number]["id"]>("info");
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    start(async () => {
      const r = await createAnnouncement({ title: String(f.get("title")), body: String(f.get("body")), level, days: Number(f.get("days") || 0) });
      if (!r.ok) return void toast.error(r.message);
      toast.success("Pengumuman tayang. Sampai ke app paling lambat 5 menit.");
      form.reset();
      setLevel("info");
    });
  };
  return (
    <form onSubmit={submit} className="grid content-start gap-3 rounded-xl border bg-card p-4">
      <p className="text-sm font-semibold">Pengumuman baru</p>
      <label className="grid gap-1.5 text-xs font-medium">Judul<Input name="title" required maxLength={120} placeholder="contoh: Maintenance server Flow jam 22.00" /></label>
      <label className="grid gap-1.5 text-xs font-medium">Isi <span className="sr-only">(opsional)</span><Textarea name="body" maxLength={2000} rows={4} placeholder="Opsional. Detail singkat untuk pengguna." /></label>
      <div className="grid gap-1.5">
        <span className="text-xs font-medium">Tingkat</span>
        <div className="inline-flex w-fit rounded-lg border bg-muted p-0.5" role="radiogroup" aria-label="Tingkat">
          {LEVELS.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={level === l.id} onClick={() => setLevel(l.id)}
              className={`h-7 rounded-md px-3 text-xs font-medium ${level === l.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {l.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">{level === "critical" ? "Darurat tidak bisa ditutup pengguna sampai kamu matikan." : "Pengguna bisa menutupnya."}</p>
      </div>
      <label className="grid gap-1.5 text-xs font-medium">
        Tayang selama (hari)
        <Input name="days" type="number" min={0} max={365} placeholder="Kosong = sampai dimatikan" />
      </label>
      <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Send />} Tayangkan</Button>
    </form>
  );
}

export function AnnouncementRow({ a, meta }: { a: Announcement; meta: string }) {
  const [pending, start] = useTransition();
  const run = (action: "on" | "off" | "delete") =>
    start(async () => {
      const r = await announcementAction(a.id, action);
      if (!r.ok) toast.error(r.message);
    });
  const lv = levelOf(a.level);
  return (
    <li className={`flex flex-wrap items-start gap-3 px-4 py-3 text-[13px] ${a.active ? "" : "opacity-55"}`}>
      <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${lv.cls}`}>{lv.label}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{a.title}{!a.active && <span className="ml-2 text-[11px] font-normal text-muted-foreground">(tidak tayang)</span>}</p>
        {a.body && <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-muted-foreground">{a.body}</p>}
        <p className="mt-1 text-[11px] text-muted-foreground">{meta}</p>
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(a.active ? "off" : "on")}>
          {a.active ? <EyeOff /> : <Eye />} {a.active ? "Matikan" : "Tayangkan"}
        </Button>
        <Button size="icon-sm" variant="ghost" disabled={pending} onClick={() => run("delete")} aria-label="Hapus pengumuman" title="Hapus">
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}
