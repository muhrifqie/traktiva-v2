"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Info, Loader2, ShoppingCart, TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { openLightbox } from "@/components/media-lightbox";
import { PlatformIcon } from "@/components/platform-icon";

// Detail of one post: live status + the step-by-step log of every attempt with proof screenshots,
// so it is clear how far TikTok posting got and what exactly went wrong.

type Entry = { t: number; msg: string; level: "info" | "ok" | "warn" | "error"; attempt?: number; shot?: string };
type Detail = {
  id: number;
  username: string;
  status: string;
  progress: string | null;
  error: string | null;
  attempts: number;
  label: string | null;
  caption: string;
  productId: string | null;
  productTitle: string | null;
  scheduledAt: number;
  url: string | null;
  log: Entry[];
};

const LEVEL = {
  info: { icon: Info, cls: "text-muted-foreground" },
  ok: { icon: CheckCircle2, cls: "text-status-ok" },
  warn: { icon: TriangleAlert, cls: "text-status-progress" },
  error: { icon: CircleAlert, cls: "text-destructive" },
} as const;
const time = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Jakarta" });
const dateTime = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const shotUrl = (name: string) => `/api/post-shot/${encodeURIComponent(name)}`;

export function PostDetail({ postId, onClose }: { postId: number | null; onClose: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const live = d?.status === "posting" || d?.status === "queued";

  useEffect(() => {
    if (postId == null) return;
    let alive = true;
    const load = () =>
      fetch(`/api/post-log/${postId}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => alive && j && setD(j))
        .catch(() => {});
    void load();
    const t = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [postId]);

  const current = d && d.id === postId ? d : null;
  const shots = (current?.log ?? []).filter((e) => e.shot);
  const viewShot = (name: string) =>
    openLightbox(
      shots.map((e) => ({ src: shotUrl(e.shot!), kind: "image" as const, label: `${time.format(e.t)} · ${e.msg}` })),
      Math.max(0, shots.findIndex((e) => e.shot === name)),
    );

  // group the log by attempt so retries read as separate tries
  const groups: { attempt: number | null; entries: Entry[] }[] = [];
  for (const e of current?.log ?? []) {
    const a = e.attempt ?? null;
    if (!groups.length || groups[groups.length - 1].attempt !== a) groups.push({ attempt: a, entries: [] });
    groups[groups.length - 1].entries.push(e);
  }

  return (
    <Dialog open={postId != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-3 sm:max-w-2xl">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 pr-6 text-[15px]">
            <PlatformIcon platform="tiktok" className="size-4" />
            Detail posting{current ? ` · @${current.username}` : ""}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {current ? `${current.label ?? "Video"} · ${dateTime.format(current.scheduledAt)} · percobaan ${current.attempts}` : "Memuat..."}
          </DialogDescription>
        </DialogHeader>

        {!current ? (
          <div className="grid place-items-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="space-y-1 rounded-lg border bg-background p-2.5 text-xs">
              <p className="flex items-center gap-1.5">
                <b className="font-medium">Status:</b> {current.status}
                {live && <Loader2 className="size-3 animate-spin text-status-progress" />}
                {current.progress && <span className="text-status-progress">· {current.progress}</span>}
              </p>
              {current.caption && <p className="line-clamp-2 text-muted-foreground" title={current.caption}><b className="font-medium text-foreground">Caption:</b> {current.caption}</p>}
              {current.productId && <p className="flex items-center gap-1 text-muted-foreground"><ShoppingCart className="size-3" /> {current.productTitle} · PID {current.productId}</p>}
              {current.url && <a href={current.url} target="_blank" rel="noreferrer" className="text-brand-light underline">Buka TikTok Studio</a>}
            </div>

            <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
              {!groups.length && <p className="py-6 text-center text-xs text-muted-foreground">Belum ada catatan. Log muncul begitu posting mulai berjalan.</p>}
              {groups.map((g, gi) => (
                <div key={gi} className="space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground">{g.attempt ? `Percobaan ${g.attempt}` : "Catatan"}</p>
                  <ol className="space-y-1 border-l pl-3">
                    {g.entries.map((e, i) => {
                      const L = LEVEL[e.level] ?? LEVEL.info;
                      return (
                        <li key={i} className="relative text-xs">
                          <span className="absolute top-1.5 -left-[15.5px] size-1.5 rounded-full bg-border" />
                          <div className="flex items-start gap-1.5">
                            <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">{time.format(e.t)}</span>
                            <L.icon className={`mt-px size-3.5 shrink-0 ${L.cls}`} />
                            <span className={`min-w-0 whitespace-pre-wrap break-words ${e.level === "error" ? "text-destructive" : ""}`}>{e.msg}</span>
                          </div>
                          {e.shot && (
                            <button type="button" onClick={() => viewShot(e.shot!)} className="mt-1 ml-[62px] block overflow-hidden rounded-md border hover:ring-2 hover:ring-primary" aria-label="Lihat screenshot">
                              {/* eslint-disable-next-line @next/next/no-img-element -- local screenshot */}
                              <img src={shotUrl(e.shot)} alt={e.msg} loading="lazy" className="h-24 w-auto" />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
