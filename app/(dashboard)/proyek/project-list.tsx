"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive, ArchiveRestore, Check, CheckCircle2, CircleAlert, Clock, Copy, FolderOpen, Loader2, MoreHorizontal, Package, PenLine, Search, Sparkles, Square, SquareCheck, Trash2, Wand2, X,
} from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { mediaUrl } from "@/lib/media-url";
import { usePersistentState } from "@/lib/use-persistent-state";
import { archiveProjects, createProject, deleteProject, deleteProjects, duplicateProject, openProjectFolder, renameProject } from "../video/project-actions";

export type ProjectView = {
  id: number;
  name: string;
  product: string;
  preset: string;
  status: "draft" | "running" | "done" | "failed";
  step: number;
  scenes: number;
  cover: string | null;
  final: string | null;
  updated: string;
  progress: string | null;
};

const STATUS = {
  draft: { icon: Clock, label: (s: number) => `Draf · ${s <= 3 ? "Siapkan" : s <= 5 ? "Adegan" : "Hasil"}`, cls: "text-muted-foreground" },
  running: { icon: Loader2, label: () => "Sedang dibuat", cls: "text-status-progress" },
  done: { icon: CheckCircle2, label: () => "Video jadi", cls: "text-status-ok" },
  failed: { icon: CircleAlert, label: () => "Perlu dicek", cls: "text-destructive" },
} as const;

const btn = "flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-[13px] font-medium disabled:opacity-60";

/** Run a server action with a toast on failure and a refresh after. */
function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<unknown>, ok?: string) =>
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
        router.refresh();
      } catch (e) {
        if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
        toast.error(e instanceof Error ? e.message : "Gagal");
      }
    });
  return { act, pending, router };
}

export function ProjectList({ projects, archive = false }: { projects: ProjectView[]; archive?: boolean }) {
  const { act, router, pending } = useAct();
  // multi-select: once something is selected, clicking a card toggles it instead of opening it
  const [sel, setSel] = useState<Set<number>>(() => new Set());
  const picking = sel.size > 0;
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clear = () => setSel(new Set());
  const [q, setQ] = usePersistentState("proyek:q", "");
  const [renaming, setRenaming] = useState<ProjectView | null>(null);
  const running = projects.some((p) => p.status === "running");

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [running, router]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? projects.filter((p) => `${p.name} ${p.product} ${p.preset}`.toLowerCase().includes(k)) : projects;
  }, [projects, q]);
  const allShown = shown.length > 0 && shown.every((p) => sel.has(p.id));
  const ids = [...sel].filter((id) => projects.some((p) => p.id === id));
  const runningSel = projects.filter((p) => sel.has(p.id) && p.status === "running").length;

  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && clear();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking]);

  const removeMany = async () => {
    const n = ids.length - runningSel;
    if (!n) return void toast.error("Proyek yang sedang dibuat tidak bisa dihapus.");
    const ok = await confirmDialog({
      title: `Hapus ${n} proyek?`,
      description: `Folder gambar dan video ${n} proyek ini di perangkat ikut dihapus. Tidak bisa dibatalkan.${runningSel ? ` ${runningSel} proyek yang sedang dibuat dilewati.` : ""} Mau aman? Pakai Arsipkan.`,
      confirmLabel: `Hapus ${n}`,
      danger: true,
    });
    if (ok) act(async () => { const r = await deleteProjects(ids); clear(); toast.success(`${r.deleted} proyek dihapus`); });
  };
  const archiveMany = () => act(async () => { await archiveProjects(ids, !archive); clear(); }, archive ? `${ids.length} proyek dikeluarkan dari arsip` : `${ids.length} proyek diarsipkan`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border bg-card px-3 text-[13px] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
          <Search className="size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama proyek, produk, atau konsep..." className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <button type="button" onClick={() => (allShown ? clear() : setSel(new Set(shown.map((p) => p.id))))} className="flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
          {allShown ? <SquareCheck className="size-4 text-brand-light" /> : <Square className="size-4" />} {allShown ? "Batal pilih semua" : "Pilih semua"}
        </button>
      </div>

      {picking && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-popover/95 px-3 py-2 shadow-lg backdrop-blur" role="toolbar" aria-label="Aksi untuk proyek terpilih">
          <span className="text-[13px] font-semibold">{ids.length} dipilih</span>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">klik kartu untuk tambah/kurangi · Esc batal</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" disabled={pending} onClick={archiveMany} className="flex h-8 items-center gap-1.5 rounded-lg border bg-background px-3 text-xs font-medium hover:bg-accent disabled:opacity-60">
              {archive ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />} {archive ? "Keluarkan dari arsip" : "Arsipkan"}
            </button>
            <button type="button" disabled={pending} onClick={() => void removeMany()} className="flex h-8 items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:opacity-60">
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Hapus
            </button>
            <button type="button" onClick={clear} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Batal pilih"><X className="size-4" /></button>
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">Tidak ada proyek yang cocok.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {shown.map((p) => {
            const s = STATUS[p.status];
            const busy = p.status === "running";
            const on = sel.has(p.id);
            // in selection mode a click toggles the card instead of opening the Studio
            const onCard = (e: React.MouseEvent) => {
              if (!picking && !e.ctrlKey && !e.metaKey && !e.shiftKey) return;
              e.preventDefault();
              toggle(p.id);
            };
            return (
              <article key={p.id} className={`group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-ring/40 ${on ? "border-primary ring-2 ring-primary/40" : ""}`}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={`Pilih ${p.name}`}
                  onClick={() => toggle(p.id)}
                  className={`absolute top-1.5 left-1.5 z-10 grid size-7 place-items-center rounded-md transition-opacity ${on ? "bg-primary text-primary-foreground" : "bg-black/60 text-white"} ${picking || on ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
                >
                  {on ? <Check className="size-4" /> : <Square className="size-4" />}
                </button>
                <Link href={`/video/${p.id}`} onClick={onCard} className="relative grid aspect-[9/14] place-items-center overflow-hidden bg-muted" aria-label={`Buka ${p.name} di Studio`}>
                  {p.final ? (
                    <video src={`${mediaUrl(p.final)}#t=0.5`} muted preload="metadata" className="size-full object-cover" />
                  ) : p.cover ? (
                    <img src={mediaUrl(p.cover)} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <Package className="size-6 text-muted-foreground" />
                  )}
                  <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                    <s.icon className={`size-3 ${busy ? "animate-spin" : ""}`} />
                    {s.label(p.step)}
                  </span>
                </Link>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label="Menu proyek"
                    className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-md bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100"
                  >
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem render={<Link href={`/video/${p.id}`} />}><Wand2 className="size-4" /> Buka di Studio</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRenaming(p)}><PenLine className="size-4" /> Ganti nama</DropdownMenuItem>
                    <DropdownMenuItem disabled={busy} onClick={() => act(() => duplicateProject(p.id), "Proyek diduplikat")}><Copy className="size-4" /> Duplikat</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => act(() => openProjectFolder(p.id))}><FolderOpen className="size-4" /> Buka folder</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={busy}
                      onClick={async () =>
                        (await confirmDialog({ title: `Hapus "${p.name}"?`, description: "Folder gambar dan video proyek ini di perangkat ikut dihapus. Tidak bisa dibatalkan.", danger: true })) &&
                        act(() => deleteProject(p.id, true), "Proyek dihapus")
                      }
                    >
                      <Trash2 className="size-4" /> Hapus
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Link href={`/video/${p.id}`} onClick={onCard} className="space-y-0.5 p-2.5">
                  <p className="truncate text-xs font-medium">{p.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{p.preset} · {p.scenes} adegan</p>
                  <p className={`truncate text-[11px] ${s.cls}`}>{p.progress ?? p.updated}</p>
                </Link>
              </article>
            );
          })}
        </div>
      )}

      <RenameDialog project={renaming} onClose={() => setRenaming(null)} />
    </div>
  );
}

function RenameDialog({ project, onClose }: { project: ProjectView | null; onClose: () => void }) {
  const { act, pending } = useAct();
  const [name, setName] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setName(project?.name ?? ""), 0);
    return () => clearTimeout(t);
  }, [project]);
  const save = () => project && act(async () => { await renameProject(project.id, name); onClose(); }, "Nama disimpan");
  return (
    <Dialog open={!!project} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ganti nama proyek</DialogTitle>
          <DialogDescription>Nama ini hanya untuk merapikan daftar proyek. Nama produk di video tidak berubah.</DialogDescription>
        </DialogHeader>
        <input
          autoFocus
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          className="h-9 w-full rounded-lg border bg-background px-3 text-[13px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
        <DialogFooter>
          <button type="button" onClick={onClose} className={`${btn} border bg-background hover:bg-accent`}>Batal</button>
          <button type="button" onClick={save} disabled={pending || !name.trim()} className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}>
            {pending && <Loader2 className="size-4 animate-spin" />} Simpan
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Proyek baru": start from a ready-made concept, or a blank custom mix. */
export function NewProjectButton({ label = "Proyek baru" }: { label?: string }) {
  const { act, pending } = useAct();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}>
        <Sparkles className="size-4" /> {label}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mulai proyek baru</DialogTitle>
            <DialogDescription>Pilih cara yang paling enak buatmu. Semua bisa diubah di Studio nanti.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            <Link href="/video" onClick={() => setOpen(false)} className="flex flex-col gap-1.5 rounded-xl border bg-background p-4 transition-colors hover:border-ring/40 hover:bg-accent">
              <span className="grid size-9 place-items-center rounded-lg bg-[#f2994a1a] text-[#f2994a]"><Sparkles className="size-4.5" /></span>
              <span className="text-[13px] font-semibold">Pakai konsep jadi</span>
              <span className="text-xs text-muted-foreground">Pilih gaya video yang sudah teruji, tinggal masukkan produk.</span>
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={() => act(() => createProject("custom"))}
              className="flex flex-col gap-1.5 rounded-xl border bg-background p-4 text-left transition-colors hover:border-ring/40 hover:bg-accent disabled:opacity-60"
            >
              <span className="grid size-9 place-items-center rounded-lg bg-[#8b7cf61a] text-[#a99bff]">{pending ? <Loader2 className="size-4.5 animate-spin" /> : <PenLine className="size-4.5" />}</span>
              <span className="text-[13px] font-semibold">Racikan sendiri</span>
              <span className="text-xs text-muted-foreground">Tulis prompt sendiri, pakai gambarmu sendiri, atur adegan bebas.</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
