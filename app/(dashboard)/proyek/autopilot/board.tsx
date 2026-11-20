"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, CircleAlert, Download, Loader2, Pause, Plane, Rocket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AutoState } from "@/lib/autopilot";
import { renderOverlays } from "@/lib/render-overlays";
import { exportTimeline } from "@/app/(dashboard)/video/project-actions";
import { createUploadJobs, listUploadable } from "@/app/(dashboard)/jadwal/actions";
import { clearFinished, getAutopilot, getProjectEdit, haltAutopilot, markProjectExported, runAutopilot } from "./actions";

type Product = { productId: string; title: string; revenue: string; sale: number; price: string; commission: string };
const img = (id: string) => `https://img.kalocdn.com/tiktok.product/${id}/cover.png`;
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const card = "rounded-xl border bg-card p-4";
const btn = "flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium disabled:opacity-50";
const field = "h-8 rounded-md border bg-background px-2.5 text-[13px] outline-none focus:border-ring";
const MAX = 10;

const BADGE: Record<AutoState["items"][number]["status"], string> = {
  antre: "bg-muted text-muted-foreground",
  jalan: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  siap: "bg-[#4ea7fc]/12 text-[#4ea7fc]",
  gagal: "bg-destructive/12 text-destructive",
  diekspor: "bg-status-ok/12 text-status-ok",
};

export function AutopilotBoard({ initial, products, accounts, hasVoice }: { initial: AutoState; products: Product[]; accounts: { id: number; username: string }[]; hasVoice: boolean }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [exporting, setExporting] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<number | null>(accounts[0]?.id ?? null);
  const [schedule, setSchedule] = useState(false);

  // live progress while a run goes on
  useEffect(() => {
    if (!state.running) return;
    const t = setInterval(() => void getAutopilot().then(setState).catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [state.running]);

  const busyIds = new Set(state.items.filter((i) => i.status === "antre" || i.status === "jalan").map((i) => i.productId));
  const ready = state.items.filter((i) => i.status === "siap" && i.projectId);

  const run = () =>
    start(async () => {
      try {
        await runAutopilot(products.filter((p) => picked.includes(p.productId)).map((p) => ({ productId: p.productId, title: p.title })));
        setPicked([]);
        setState(await getAutopilot());
        toast.success("Autopilot jalan. Boleh ditinggal; aplikasi harus tetap terbuka.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal");
      }
    });

  /** Export every ready project at 1080p (captions drawn here), then optionally schedule them 3 h apart. */
  const exportAll = async () => {
    const done: number[] = [];
    try {
      for (const [k, it] of ready.entries()) {
        setExporting(`Mengekspor ${k + 1}/${ready.length}: ${it.title.slice(0, 40)}...`);
        const edit = await getProjectEdit(it.projectId!);
        await exportTimeline(it.projectId!, edit, await renderOverlays(edit));
        await markProjectExported(it.projectId!);
        done.push(it.projectId!);
      }
      if (schedule && accountId && done.length) {
        setExporting("Menjadwalkan upload...");
        const videos = (await listUploadable()).filter((v) => done.includes(v.projectId) && v.label === "Video utama");
        const first = nextEvening();
        for (const [k, v] of videos.entries())
          await createUploadJobs({ accountId, items: [{ projectId: v.projectId, video: v.video, label: v.label, hook: v.hook }], caption: v.caption, productId: v.productId, productTitle: v.productTitle, startAt: first + k * 3 * 3600_000, gapMinutes: 180 });
        toast.success(`${done.length} video diekspor & dijadwalkan`, { action: { label: "Lihat jadwal", onClick: () => router.push("/jadwal") } });
      } else toast.success(`${done.length} video diekspor 1080p`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export gagal");
    } finally {
      setExporting(null);
      setState(await getAutopilot());
    }
  };

  return (
    <div className="grid flex-1 content-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
      {/* pick products */}
      <section className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[13px] font-semibold">Produk terlaris TikTok Shop Indonesia</h2>
          <span className="text-xs text-muted-foreground">pilih maks {MAX}</span>
          <button type="button" className={`${btn} ml-auto bg-primary text-primary-foreground hover:bg-primary/90`} disabled={pending || !picked.length || state.running} onClick={run}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} Buatkan {picked.length || ""} video
          </button>
        </div>
        {!hasVoice && <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400"><CircleAlert className="size-3.5" /> Cartesia belum diatur: video jadi tanpa voice-over utuh (pakai suara Flow per adegan).</p>}
        <p className="text-[11px] text-muted-foreground">Tiap video ±10–20 menit dan memakai kredit Flow (5 gambar + 5 klip). Pakai produk yang ada di etalase akunmu supaya keranjangnya bisa ditautkan.</p>
        {!products.length ? (
          <p className="text-xs text-muted-foreground">Ranking belum ada. Buka Riset Produk → TikTok dulu (butuh sesi KaloData).</p>
        ) : (
          <ul className="divide-y">
            {products.map((p, i) => {
              const on = picked.includes(p.productId);
              const busy = busyIds.has(p.productId);
              return (
                <li key={p.productId}>
                  <label className={`flex cursor-pointer items-center gap-3 py-2 ${busy ? "opacity-50" : ""}`}>
                    <input type="checkbox" className="accent-primary" disabled={busy || (!on && picked.length >= MAX)} checked={on} onChange={(e) => setPicked((x) => (e.target.checked ? [...x, p.productId] : x.filter((y) => y !== p.productId)))} />
                    <span className="w-4 text-center text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img(p.productId)} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-10 shrink-0 rounded-lg bg-muted object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{p.title}</span>
                      <span className="block text-[11px] text-muted-foreground tabular-nums">
                        <b className="text-foreground">{p.revenue}</b> · {compact.format(p.sale)} terjual · {p.price}{p.commission && p.commission !== "-" ? ` · komisi ${p.commission}` : ""}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* run board */}
      <section className={`${card} space-y-3 self-start`}>
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-muted text-black dark:text-white"><Plane className="size-4" /></span>
          <h2 className="flex-1 text-[13px] font-semibold">Antrean autopilot</h2>
          {state.running ? (
            <button type="button" className={`${btn} border bg-background hover:bg-accent`} onClick={() => void haltAutopilot().then(() => toast.success("Berhenti setelah video yang sedang dibuat selesai"))}>
              <Pause className="size-3.5" /> Hentikan
            </button>
          ) : (
            state.items.length > 0 && (
              <button type="button" className="text-[11px] text-muted-foreground hover:text-destructive" onClick={() => void clearFinished().then(getAutopilot).then(setState)}>
                <Trash2 className="mr-1 inline size-3" /> Bersihkan
              </button>
            )
          )}
        </div>
        {!state.items.length ? (
          <p className="text-xs text-muted-foreground">Belum ada. Centang produk di kiri lalu “Buatkan video”.</p>
        ) : (
          <ul className="space-y-1.5">
            {state.items.map((it, k) => (
              <li key={`${it.productId}-${k}`} className="rounded-lg border bg-background p-2.5">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${BADGE[it.status]}`}>{it.status}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{it.title}</span>
                  {it.projectId && <Link href={`/video/${it.projectId}`} className="text-[11px] text-primary hover:underline">Buka</Link>}
                </div>
                {(it.stage || it.error) && (
                  <p className={`mt-1 flex items-center gap-1 text-[11px] ${it.error ? "text-destructive" : "text-muted-foreground"}`}>
                    {it.status === "jalan" && <Loader2 className="size-3 animate-spin" />}
                    {it.status === "diekspor" && <CheckCircle2 className="size-3 text-status-ok" />}
                    {it.error ?? it.stage}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {ready.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" className="accent-primary" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} disabled={!accounts.length} />
              <CalendarClock className="size-3.5 text-muted-foreground" /> Sekalian jadwalkan (mulai 19.00, jarak 3 jam) ke
              <select className={field} value={accountId ?? ""} onChange={(e) => setAccountId(Number(e.target.value))} disabled={!schedule}>
                {accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}
              </select>
            </label>
            <button type="button" className={`${btn} w-full bg-primary text-primary-foreground hover:bg-primary/90`} disabled={!!exporting} onClick={() => void exportAll()}>
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} {exporting ?? `Export ${ready.length} video siap (1080p)`}
            </button>
            <p className="text-[11px] text-muted-foreground">Sebaiknya tonton dulu tiap video (tombol Buka) sebelum export & posting.</p>
          </div>
        )}
      </section>
    </div>
  );
}

/** Today 19:00 local time, or tomorrow 19:00 when that has passed. */
function nextEvening() {
  const t = new Date();
  t.setHours(19, 0, 0, 0);
  if (t.getTime() < Date.now() + 10 * 60_000) t.setDate(t.getDate() + 1);
  return t.getTime();
}
