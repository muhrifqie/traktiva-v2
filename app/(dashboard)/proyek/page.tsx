import Link from "next/link";
import { desc } from "drizzle-orm";
import { FolderKanban, Plane } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { videoProjects } from "@/lib/db/schema";
import { presetById, projectName } from "@/lib/presets";
import { isUnsaved } from "@/lib/unsaved";
import { NewProjectButton, ProjectList } from "./project-list";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const FILTERS = [
  { id: "semua", label: "Semua" },
  { id: "draft", label: "Draf" },
  { id: "running", label: "Sedang dibuat" },
  { id: "done", label: "Video jadi" },
  { id: "failed", label: "Perlu dicek" },
  { id: "arsip", label: "Arsip" },
] as const;

export default async function ProyekPage({ searchParams }: PageProps<"/proyek">) {
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f.id === sp.status)?.id ?? "semua";
  // projects opened but never saved (no "Simpan draft", no video started) are not drafts yet
  const rows = (await db.select().from(videoProjects).orderBy(desc(videoProjects.updatedAt))).filter((p) => !isUnsaved(p.options));
  type Row = (typeof rows)[number];
  // "Jumlah video" > 1: versions B–E fold into their main project's card (Galeri Video still lists every video)
  const byId = new Map(rows.map((p) => [p.id, p]));
  const isVersion = (p: Row) => !!p.options.versionOf && byId.has(Number(p.options.versionOf));
  const versionsOf = (id: number) =>
    (byId.get(id)?.options.versions ?? "").split(",").map(Number).map((v) => byId.get(v)).filter((v): v is Row => !!v && Number(v.options.versionOf) === id);
  // a group is "running" while any of its videos runs, "done" only when all are
  const groupStatus = (p: Row) => {
    const g = [p, ...versionsOf(p.id)];
    return g.some((x) => x.status === "running") ? "running" : g.some((x) => x.status === "failed") ? "failed" : g.every((x) => x.status === "done") ? "done" : "draft";
  };
  const every = rows.filter((p) => !isVersion(p));
  // archived projects only show in their own tab
  const all = every.filter((p) => !p.archived);
  const archived = every.filter((p) => p.archived);
  const count = (id: string) => (id === "arsip" ? archived.length : id === "semua" ? all.length : all.filter((p) => groupStatus(p) === id).length);
  const shown = filter === "arsip" ? archived : filter === "semua" ? all : all.filter((p) => groupStatus(p) === filter);

  return (
    <>
      <PageHeader slug="proyek">
        <Link href="/proyek/autopilot" className="flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3.5 text-[13px] font-medium hover:bg-accent" title="Pilih produk laris, AI membuatkan videonya otomatis">
          <Plane className="size-4 text-black dark:text-white" /> Autopilot
        </Link>
        <NewProjectButton />
      </PageHeader>

      {every.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center">
          <FolderKanban className="size-7 text-muted-foreground" />
          <p className="text-sm font-medium">Belum ada proyek</p>
          <p className="max-w-sm text-xs text-muted-foreground">Pakai konsep jadi atau racik sendiri: masukkan produk, lalu AI membuatkan gambar dan videonya.</p>
          <div className="mt-2"><NewProjectButton label="Buat proyek pertama" /></div>
        </div>
      ) : (
        <div className="flex-1 space-y-4">
          <nav className="flex flex-wrap gap-1.5" aria-label="Filter status">
            {FILTERS.map((f) => (
              <Link
                key={f.id}
                href={f.id === "semua" ? "/proyek" : `/proyek?status=${f.id}`}
                className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${filter === f.id ? "border-primary/50 bg-primary/10 text-brand-light" : "bg-card text-muted-foreground hover:text-foreground"}`}
              >
                {f.label}
                <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{count(f.id)}</span>
              </Link>
            ))}
          </nav>
          {shown.length ? (
            <ProjectList
              archive={filter === "arsip"}
              projects={shown.map((p) => ({
                id: p.id,
                name: projectName(p),
                product: p.product.name,
                scenes: p.scenes.length,
                preset: presetById(p.presetId)?.title ?? p.title,
                status: groupStatus(p),
                step: p.step,
                cover: p.scenes.find((x) => x.image)?.image ?? p.product.photos[0] ?? null,
                final: p.status === "done" ? p.finalPath : null,
                updated: fmt.format(p.updatedAt),
                progress: groupStatus(p) === "running" ? [p, ...versionsOf(p.id)].find((x) => x.status === "running")?.progress ?? null : null,
                versions: versionsOf(p.id).map((v) => ({
                  id: v.id,
                  status: v.status,
                  cover: v.scenes.find((x) => x.image)?.image ?? v.product.photos[0] ?? null,
                  final: v.status === "done" ? v.finalPath : null,
                })),
              }))}
            />
          ) : (
            <p className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">{filter === "arsip" ? "Arsip kosong. Pilih beberapa proyek lalu Arsipkan supaya daftar tetap rapi." : "Tidak ada proyek dengan status ini."}</p>
          )}
        </div>
      )}
    </>
  );
}
