"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, CalendarClock, CheckCircle2, CircleAlert, ExternalLink, Film, ListChecks, Loader2, RotateCw, ShieldCheck, ShoppingCart, Trash2 } from "lucide-react";
import { PostDetail } from "./post-detail";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { openLightbox } from "@/components/media-lightbox";
import { PlatformIcon } from "@/components/platform-icon";
import { mediaUrl } from "@/lib/media-url";
import { cancelPostAction, checkStudioAction, deletePostAction, retryPostAction } from "./actions";

type Row = {
  id: number;
  username: string;
  video: string;
  label: string | null;
  projectId: number | null;
  caption: string;
  productId: string | null;
  productTitle: string | null;
  status: "queued" | "posting" | "scheduled" | "posted" | "failed" | "cancelled";
  progress: string | null;
  error: string | null;
  url: string | null;
  when: string;
  at: number;
};

const STATUS: Record<Row["status"], { label: string; cls: string; icon: typeof Loader2 }> = {
  queued: { label: "Antre", cls: "bg-muted text-muted-foreground", icon: CalendarClock },
  posting: { label: "Sedang diposting", cls: "bg-status-progress/15 text-status-progress", icon: Loader2 },
  scheduled: { label: "Terjadwal di TikTok", cls: "bg-[#5e6ad2]/15 text-[#8b93f0]", icon: CalendarClock },
  posted: { label: "Terposting", cls: "bg-status-ok/15 text-status-ok", icon: CheckCircle2 },
  failed: { label: "Gagal", cls: "bg-destructive/15 text-destructive", icon: CircleAlert },
  cancelled: { label: "Dibatalkan", cls: "bg-muted text-muted-foreground", icon: Ban },
};
const GROUPS: { title: string; statuses: Row["status"][] }[] = [
  { title: "Berjalan & antre", statuses: ["posting", "queued"] },
  { title: "Gagal", statuses: ["failed"] },
  { title: "Terjadwal di TikTok", statuses: ["scheduled"] },
  { title: "Terposting", statuses: ["posted"] },
  { title: "Dibatalkan", statuses: ["cancelled"] },
];

export function PostList({ posts, accounts }: { posts: Row[]; accounts: { id: number; username: string; ready: boolean }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [checking, setChecking] = useState<number | null>(null);
  const [detail, setDetail] = useState<number | null>(null);
  const live = posts.some((p) => p.status === "posting" || p.status === "queued");

  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), live ? 3000 : 20_000);
    return () => clearInterval(t);
  }, [live, router]);

  const act = (fn: () => Promise<unknown>, ok?: string) =>
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal");
      }
    });

  const check = async (id: number, username: string) => {
    setChecking(id);
    try {
      const r = await checkStudioAction(id);
      if (r.ok) toast.success(`@${username}: TikTok Studio siap (login OK, form unggah ada)`);
      else toast.error(`@${username}: ${r.error ?? "form unggah tidak ditemukan"}${r.screenshot ? ` · screenshot: ${r.screenshot}` : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal");
    } finally {
      setChecking(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-xs">
        <ShieldCheck className="size-4 text-muted-foreground" />
        <span className="text-muted-foreground">Cek akun tanpa mengunggah apa pun:</span>
        {accounts.length ? (
          accounts.map((a) => (
            <button key={a.id} type="button" disabled={!a.ready || checking !== null} onClick={() => check(a.id, a.username)} className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 font-medium hover:bg-accent disabled:opacity-50">
              {checking === a.id ? <Loader2 className="size-3.5 animate-spin" /> : <PlatformIcon platform="tiktok" className="size-3.5" />}@{a.username}
            </button>
          ))
        ) : (
          <Link href="/akun" className="underline">Tambah akun TikTok</Link>
        )}
      </section>

      {!posts.length ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-12 text-center">
          <CalendarClock className="size-7 text-muted-foreground" />
          <p className="text-sm font-medium">Belum ada jadwal posting</p>
          <p className="max-w-sm text-xs text-muted-foreground">Buka Galeri Video lalu klik Posting di video yang sudah jadi.</p>
          <Link href="/galeri-video" className="mt-2 flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">
            <Film className="size-4" /> Galeri Video
          </Link>
        </div>
      ) : (
        GROUPS.map((g) => {
          const list = posts.filter((p) => g.statuses.includes(p.status));
          if (!list.length) return null;
          return (
            <section key={g.title} className="space-y-2">
              <h2 className="text-xs font-semibold text-muted-foreground">{g.title} · {list.length}</h2>
              <ul className="divide-y rounded-xl border bg-card">
                {list.map((p) => {
                  const s = STATUS[p.status];
                  return (
                    <li key={p.id} className="flex gap-3 p-3">
                      <button type="button" onClick={() => openLightbox([{ src: p.video, kind: "video", label: p.label ?? "Video" }])} className="shrink-0" aria-label="Putar video">
                        <video src={`${mediaUrl(p.video)}#t=0.5`} muted preload="metadata" className="aspect-[9/16] w-14 rounded-md bg-black object-cover" />
                      </button>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>
                            <s.icon className={`size-3 ${p.status === "posting" ? "animate-spin" : ""}`} /> {s.label}
                          </span>
                          <span className="flex items-center gap-1 text-xs font-medium"><PlatformIcon platform="tiktok" className="size-3" />@{p.username}</span>
                          <span className="text-[11px] text-muted-foreground">{p.when}</span>
                        </div>
                        <p className="truncate text-xs" title={p.label ?? ""}>
                          {p.label ?? "Video"}
                          {p.projectId && <Link href={`/video/${p.projectId}`} className="ml-1.5 text-muted-foreground underline">proyek</Link>}
                        </p>
                        {p.caption && <p className="line-clamp-1 text-[11px] text-muted-foreground" title={p.caption}>{p.caption}</p>}
                        {p.productId && <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><ShoppingCart className="size-3" /> {p.productTitle ?? "Produk"} · PID {p.productId}</p>}
                        {p.status === "posting" && p.progress && <p className="text-[11px] text-status-progress">{p.progress}</p>}
                        {p.error && (
                          <button type="button" onClick={() => setDetail(p.id)} title={p.error} className={`line-clamp-2 text-left text-[11px] hover:underline ${p.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
                            {p.error}
                          </button>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <button type="button" onClick={() => setDetail(p.id)} className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium hover:bg-accent">
                          <ListChecks className="size-3.5" /> Detail
                        </button>
                        {p.url && (p.status === "posted" || p.status === "scheduled") && (
                          <a href={p.url} target="_blank" rel="noreferrer" className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium hover:bg-accent"><ExternalLink className="size-3.5" /> TikTok Studio</a>
                        )}
                        {p.status === "failed" && (
                          <button type="button" disabled={pending} onClick={() => act(() => retryPostAction(p.id), "Dicoba lagi")} className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium hover:bg-accent disabled:opacity-50"><RotateCw className="size-3.5" /> Coba lagi</button>
                        )}
                        {p.status === "queued" && (
                          <button type="button" disabled={pending} onClick={() => act(() => cancelPostAction(p.id), "Dibatalkan")} className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium hover:bg-accent disabled:opacity-50"><Ban className="size-3.5" /> Batalkan</button>
                        )}
                        {p.status !== "posting" && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={async () => (await confirmDialog({ title: "Hapus dari daftar?", description: p.status === "scheduled" ? "Ini hanya menghapus catatannya di Traktiva. Postingan terjadwal di TikTok tetap jalan; batalkan di TikTok Studio bila perlu." : "Catatan posting ini dihapus dari Traktiva.", danger: true })) && act(() => deletePostAction(p.id))}
                            aria-label="Hapus"
                            className="grid size-7 place-items-center rounded-md border text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-50"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
      <PostDetail postId={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
