"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Lightbulb, Sparkles, CalendarClock, Check, CheckCircle2, ChevronDown, Search, ShoppingCart, CircleAlert, Clock, FlaskConical, Loader2, Play, RotateCcw, Send, Trash2, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import type { UploadJob } from "@/lib/db/schema";
import { mediaUrl } from "@/lib/media-url";
import type { HookInsights } from "@/lib/insights";
import type { AccountTips } from "@/lib/schedule-tips";
import { cancelUpload, createUploadJobs, deleteUploads, retryUpload, runUploadNow, type Uploadable } from "./actions";

type EtalaseItem = { accountId: number; productId: string; title: string; price: string; stock: number | null; inStock: boolean; hidden: boolean; cover: string | null };
/** A showcase product can be linked only when TikTok shows it as available (in stock, not hidden). */
const usable = (e: EtalaseItem) => e.inStock && !e.hidden && e.stock !== 0;

type Job = Omit<UploadJob, "scheduledAt" | "postedAt" | "createdAt"> & { scheduledAt: number; postedAt: number | null; createdAt: number; username: string; title: string | null };

const card = "rounded-xl border bg-card p-4";
const field = "h-8 w-full rounded-md border bg-background px-2.5 text-[13px] outline-none focus:border-ring";
const btn = "flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium disabled:opacity-50";
const when = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Gagal");

/** Next prime posting slot (12:00, 19:00, 21:00 WIB) at least 10 minutes from now, as a datetime-local value. */
function nextSlot() {
  const now = new Date();
  for (let d = 0; d < 3; d++)
    for (const h of [12, 19, 21]) {
      const t = new Date(now);
      t.setDate(now.getDate() + d);
      t.setHours(h, 0, 0, 0);
      if (t.getTime() > now.getTime() + 10 * 60_000) return toLocal(t);
    }
  return toLocal(new Date(now.getTime() + 3600_000));
}
const toLocal = (t: Date) => new Date(t.getTime() - t.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

const STATUS: Record<Job["status"], { label: string; cls: string }> = {
  queued: { label: "Antre", cls: "bg-[#5e6ad2]/12 text-[#7b86f0]" },
  uploading: { label: "Mengunggah", cls: "bg-amber-500/12 text-amber-600 dark:text-amber-400" },
  done: { label: "Terposting", cls: "bg-status-ok/12 text-status-ok" },
  failed: { label: "Gagal", cls: "bg-destructive/12 text-destructive" },
  cancelled: { label: "Dibatalkan", cls: "bg-muted text-muted-foreground" },
};

export function JadwalBoard({
  jobs, accounts, videos, insights, etalase, minGap, initialProject, tips, banned, maxPerDay,
}: {
  tips: Record<number, AccountTips>; banned: { from: string; to: string }[]; maxPerDay: number;
  etalase: EtalaseItem[];
  jobs: Job[]; accounts: { id: number; username: string; status: string }[]; videos: Uploadable[]; insights: HookInsights; minGap: number; initialProject: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);
  const active = accounts.filter((a) => a.status === "active");
  const projects = useMemo(() => [...new Map(videos.map((v) => [v.projectId, v.title])).entries()], [videos]);
  const [projectId, setProjectId] = useState<number | null>(initialProject ?? projects[0]?.[0] ?? null);
  const own = videos.filter((v) => v.projectId === projectId);
  const [picked, setPicked] = useState<string[]>([]);
  const [accountId, setAccountId] = useState<number | null>(active[0]?.id ?? null);
  const [caption, setCaption] = useState("");
  const [productId, setProductId] = useState("");
  const [productTitle, setProductTitle] = useState("");
  const [at, setAt] = useState("");
  const [gap, setGap] = useState(180);

  // project changed: default to all of its videos, its caption and its product
  useEffect(() => {
    const t = setTimeout(() => {
      setPicked(own.map((v) => v.video));
      setCaption(own[0]?.caption ?? "");
      // the project's own product, only when it can really be linked from this account's showcase
      const mine = etalase.find((e) => e.accountId === accountId && e.productId === own[0]?.productId && usable(e));
      setProductId(mine?.productId ?? "");
      setProductTitle(mine ? (own[0]?.productTitle ?? "") : "");
      setAt((x) => x || (accountId && tips[accountId]?.slots[0] ? toLocal(new Date(tips[accountId].slots[0])) : nextSlot()));
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the project changes
  }, [projectId]);

  // live progress while something uploads
  const running = jobs.some((j) => j.status === "uploading");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [running, router]);

  const schedule = () =>
    start(async () => {
      try {
        if (!accountId) throw new Error("Pilih akun TikTok dulu.");
        const items = own.filter((v) => picked.includes(v.video)).map((v) => ({ projectId: v.projectId, video: v.video, label: v.label, hook: v.hook }));
        if (!items.length) throw new Error("Pilih minimal satu video.");
        await createUploadJobs({ accountId, items, caption, productId: productId.trim() || null, productTitle: productTitle.trim() || null, startAt: new Date(at || nextSlot()).getTime(), gapMinutes: gap });
        toast.success(`${items.length} video dijadwalkan`);
        router.refresh();
      } catch (e) {
        toast.error(errMsg(e));
      }
    });

  const run = (id: number, fn: () => Promise<unknown>, ok?: string) => {
    setBusyId(id);
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error(errMsg(e));
      } finally {
        setBusyId(null);
      }
    });
  };

  const [now] = useState(() => Date.now()); // render-stable "now" (refreshes with the page)
  // ---- smart bits -------------------------------------------------------------------------------------------
  const tip = accountId ? tips[accountId] : undefined;
  const live = jobs.filter((j) => j.status === "queued" || j.status === "uploading");
  // exported videos that have never been scheduled or posted (same project + label)
  const ready = videos.filter((v) => !jobs.some((j) => j.projectId === v.projectId && (j.label ?? "Video utama") === v.label && j.status !== "cancelled" && j.status !== "failed"));
  const startMs = at ? new Date(at).getTime() : NaN;
  const dayKey = (t: number) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
  const sameDay = Number.isFinite(startMs) && accountId ? jobs.filter((j) => j.accountId === accountId && j.status !== "cancelled" && j.status !== "failed" && dayKey(j.postedAt ?? j.scheduledAt) === dayKey(startMs)).length : 0;
  const clash = Number.isFinite(startMs) && accountId ? live.find((j) => j.accountId === accountId && Math.abs(j.scheduledAt - startMs) < minGap * 60_000) : undefined;
  const bannedHit = banned.filter((b) => b.from && caption.toLowerCase().includes(b.from.toLowerCase()));
  const warnings: { text: string; fix?: { label: string; run: () => void } }[] = [
    ...bannedHit.map((b) => ({
      text: `Caption memakai “${b.from}” (dilarang di Aturan naskah).`,
      fix: { label: `Ganti jadi “${b.to}”`, run: () => setCaption((c) => c.replace(new RegExp(b.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), b.to)) },
    })),
    ...(!caption.trim() ? [{ text: "Caption masih kosong." }] : !/#\S/.test(caption) ? [{ text: "Belum ada hashtag; 3–5 hashtag produk membantu video ditemukan." }] : []),
    ...(!productId && etalase.some((e) => e.accountId === accountId && usable(e)) ? [{ text: "Tanpa produk keranjang: penonton tidak bisa langsung beli dari video ini." }] : []),
    ...(Number.isFinite(startMs) && startMs < now + 5 * 60_000 ? [{ text: "Jam mulai sudah lewat: video akan langsung diunggah." }] : []),
    ...(sameDay + picked.length > maxPerDay ? [{ text: `Hari itu akun ini sudah punya ${sameDay} posting; lebih dari ${maxPerDay} sehari terlihat seperti spam.` }] : []),
    ...(clash ? [{ text: `Terlalu dekat dengan jadwal lain (${when.format(clash.scheduledAt)}); jarak minimal ${minGap} menit.`, fix: tip?.slots[0] ? { label: "Pakai slot kosong", run: () => setAt(toLocal(new Date(tip.slots[0]))) } : undefined }] : []),
  ];
  const pickReady = (v: Uploadable) => {
    setProjectId(v.projectId);
    setTimeout(() => setPicked([v.video]), 10);
  };
  // next 7 days (WIB) with the queued and posted uploads on each
  const week = Array.from({ length: 7 }, (_, d) => {
    const t = now + d * 86_400_000;
    const key = dayKey(t);
    return { key, label: d === 0 ? "Hari ini" : d === 1 ? "Besok" : new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", timeZone: "Asia/Jakarta" }).format(t), items: jobs.filter((j) => j.status !== "cancelled" && dayKey(j.postedAt ?? j.scheduledAt) === key).sort((a, b) => a.scheduledAt - b.scheduledAt) };
  });
  const posted7 = jobs.filter((j) => j.status === "done" && j.postedAt && j.postedAt > now - 7 * 86_400_000).length;
  const nextUp = [...live].sort((a, b) => a.scheduledAt - b.scheduledAt)[0];

  const groups: [string, Job[]][] = [
    ["Antre & berjalan", jobs.filter((j) => j.status === "queued" || j.status === "uploading").sort((a, b) => a.scheduledAt - b.scheduledAt)],
    ["Perlu dicek", jobs.filter((j) => j.status === "failed")],
    ["Riwayat", jobs.filter((j) => j.status === "done" || j.status === "cancelled")],
  ];

  return (
    <div className="flex-1 space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="Antre" value={String(live.length)} sub={nextUp ? `berikutnya ${when.format(nextUp.scheduledAt)}` : "tidak ada"} />
      <Kpi label="Terposting 7 hari" value={String(posted7)} sub={`${jobs.filter((j) => j.status === "failed").length} gagal perlu dicek`} />
      <Kpi label="Siap diposting" value={String(ready.length)} sub="video belum dijadwalkan" accent={ready.length > 0} />
      <Kpi label="Jam terbaik" value={tip?.hours[0] ? `${String(tip.hours[0].hour).padStart(2, "0")}.00` : "19.00"} sub={tip?.fromHistory ? "dari postingan akunmu" : "jam ramai umum TikTok"} />
    </div>
    <div className="grid content-start gap-4 xl:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
      {/* new schedule */}
      <section className={`${card} space-y-3 self-start`}>
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-muted text-black dark:text-white"><CalendarClock className="size-4" /></span>
          <h2 className="text-[13px] font-semibold">Jadwalkan video</h2>
        </div>
        {!videos.length ? (
          <p className="text-xs text-muted-foreground">Belum ada video jadi. Export video dulu di editor proyek.</p>
        ) : (
          <>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Proyek</span>
              <select className={field} value={projectId ?? ""} onChange={(e) => setProjectId(Number(e.target.value))}>
                {projects.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
              </select>
            </label>
            <div className="space-y-1">
              <span className="text-xs font-medium">Video</span>
              {own.map((v) => (
                <label key={v.video} className="flex items-start gap-2 rounded-lg border bg-background p-2 text-xs">
                  <input type="checkbox" className="mt-0.5 accent-primary" checked={picked.includes(v.video)} onChange={(e) => setPicked((x) => (e.target.checked ? [...x, v.video] : x.filter((y) => y !== v.video)))} />
                  <span className="min-w-0">
                    <b>{v.label}</b>
                    {v.hook && <span className="block truncate text-muted-foreground">“{v.hook}”</span>}
                  </span>
                </label>
              ))}
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Akun TikTok</span>
              {active.length ? (
                <select className={field} value={accountId ?? ""} onChange={(e) => setAccountId(Number(e.target.value))}>
                  {active.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}
                </select>
              ) : (
                <p className="text-xs text-destructive">Belum ada akun TikTok aktif. Login di Akun Sosial.</p>
              )}
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Caption & hashtag</span>
              <textarea className={`${field} h-auto resize-none py-2`} rows={4} maxLength={2200} value={caption} onChange={(e) => setCaption(e.target.value)} />
            </label>
            <ProductPicker
              items={etalase.filter((e) => e.accountId === accountId)}
              value={productId}
              projectProduct={own[0]?.productId ?? null}
              onPick={(e) => {
                setProductId(e?.productId ?? "");
                setProductTitle(e ? e.title.replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim().slice(0, 30) : "");
              }}
            />
            {productId && (
              <label className="block space-y-1">
                <span className="text-xs font-medium">Nama produk di video <span className="font-normal text-muted-foreground">(maks 30 huruf)</span></span>
                <input className={field} maxLength={30} value={productTitle} onChange={(e) => setProductTitle(e.target.value)} />
              </label>
            )}
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <label className="block space-y-1">
                <span className="text-xs font-medium">Mulai</span>
                <input type="datetime-local" className={field} value={at} onChange={(e) => setAt(e.target.value)} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium">Jarak antar video</span>
                <select className={field} value={gap} onChange={(e) => setGap(Number(e.target.value))}>
                  {[60, 120, 180, 360, 1440].map((m) => <option key={m} value={m}>{m < 1440 ? `${m / 60} jam` : "1 hari"}</option>)}
                </select>
              </label>
            </div>
            {tip && tip.slots.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tip.slots.slice(0, 3).map((t) => (
                  <button key={t} type="button" onClick={() => setAt(toLocal(new Date(t)))} className={`h-6 rounded-full border px-2 text-[10px] ${Math.abs(startMs - t) < 60_000 ? "border-primary bg-primary/12 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                    ✨ {when.format(t)}
                  </button>
                ))}
              </div>
            )}
            {warnings.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2">
                {warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                    <CircleAlert className="mt-px size-3.5 shrink-0" />
                    <span className="flex-1">{w.text}</span>
                    {w.fix && <button type="button" onClick={w.fix.run} className="shrink-0 font-medium underline underline-offset-2">{w.fix.label}</button>}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-muted-foreground">
              Varian A/B dipisah jaraknya supaya bisa dibandingkan. Diunggah lewat TikTok Studio web selama aplikasi terbuka. Otomasi upload bisa membuat akun dibatasi TikTok, jadi jangan terlalu sering.
            </p>
            <button type="button" className={`${btn} w-full bg-primary text-primary-foreground hover:bg-primary/90`} disabled={pending || !active.length} onClick={schedule}>
              {pending && busyId === null ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />} Jadwalkan {picked.length > 1 ? `${picked.length} video` : ""}
            </button>
          </>
        )}
      </section>

      <div className="min-w-0 space-y-4">
        {/* recommendations */}
        <section className={`${card} space-y-3`}>
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-muted text-black dark:text-white"><Lightbulb className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[13px] font-semibold">Rekomendasi</h2>
              <p className="text-[11px] text-muted-foreground">{tip?.fromHistory ? "Dihitung dari jam posting & views akunmu sendiri." : "Akun ini belum punya cukup riwayat; pakai jam ramai TikTok Indonesia dulu."}</p>
            </div>
          </div>
          {tip && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground uppercase">Slot kosong terbaik · klik untuk dipakai</p>
              <div className="flex flex-wrap gap-1.5">
                {tip.slots.map((t) => (
                  <button key={t} type="button" onClick={() => setAt(toLocal(new Date(t)))} className={`h-7 rounded-md border px-2.5 text-[11px] font-medium transition-colors ${Math.abs(startMs - t) < 60_000 ? "border-primary bg-primary/12 text-primary" : "bg-background hover:border-ring/50"}`}>
                    {when.format(t)}
                  </button>
                ))}
                {!tip.slots.length && <span className="text-[11px] text-muted-foreground">Semua slot 5 hari ke depan penuh.</span>}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Jam terbaik: {tip.hours.map((h) => `${String(h.hour).padStart(2, "0")}.00${h.avgViews != null ? ` (±${compact.format(h.avgViews)} views)` : ""}`).join(" · ")} · maks {maxPerDay} posting/hari, jarak {minGap} menit.
              </p>
            </div>
          )}
          {ready.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground uppercase">Siap diposting · belum dijadwalkan</p>
              <ul className="space-y-1">
                {ready.slice(0, 5).map((v) => (
                  <li key={v.video} className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5">
                    <Sparkles className="size-3.5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate text-xs"><b className="font-medium">{v.title}</b> <span className="text-muted-foreground">· {v.label}</span></span>
                    <button type="button" onClick={() => pickReady(v)} className="h-6 shrink-0 rounded px-2 text-[11px] font-medium text-primary hover:bg-primary/10">Pakai</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* next 7 days */}
        <section className={`${card} space-y-2.5`}>
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" />
            <h2 className="text-[13px] font-semibold">7 hari ke depan</h2>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {week.map((d) => (
              <div key={d.key} className={`min-h-20 rounded-lg border p-1.5 ${d.items.length > maxPerDay ? "border-amber-500/50" : "bg-background/50"}`}>
                <p className="truncate text-[10px] font-medium text-muted-foreground">{d.label}</p>
                <div className="mt-1 space-y-1">
                  {d.items.map((j) => (
                    <p key={j.id} title={`${j.title ?? "Video"} · ${j.label} · @${j.username}`} className={`truncate rounded px-1 py-0.5 text-[10px] ${STATUS[j.status].cls}`}>
                      {new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(j.postedAt ?? j.scheduledAt)} {j.label?.replace("Video utama", "") || ""}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <Insights data={insights} />
        {groups.map(([title, list]) =>
          list.length ? (
            <section key={title} className={`${card} space-y-2`}>
              <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-semibold">{title}</h2>
                <span className="text-xs text-muted-foreground">{list.length}</span>
                {title === "Riwayat" && (
                  <button type="button" className="ml-auto text-[11px] text-muted-foreground hover:text-destructive" onClick={() => run(-1, () => deleteUploads(list.filter((j) => j.status === "cancelled").map((j) => j.id)), "Riwayat batal dibersihkan")}>
                    Bersihkan yang batal
                  </button>
                )}
              </div>
              <ul className="divide-y">
                {list.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS[j.status].cls}`}>{STATUS[j.status].label}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{j.title || "Video"} <span className="font-normal text-muted-foreground">· {j.label} · @{j.username}</span></p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        <Clock className="mr-1 inline size-3" />
                        {j.status === "done" && j.postedAt ? `Terposting ${when.format(j.postedAt)}` : when.format(j.scheduledAt)}
                        {j.productId ? " · 🛒 produk tertaut" : ""}
                        {j.hook ? ` · “${j.hook}”` : ""}
                      </p>
                      {(j.progress || j.error) && <p className={`truncate text-[11px] ${j.error ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>{j.error ?? j.progress}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      {busyId === j.id && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                      {j.status === "queued" && (
                        <>
                          <IconBtn title="Uji coba: buka TikTok Studio, isi semua, TANPA menekan Post" onClick={() => run(j.id, () => runUploadNow(j.id, true), "Uji coba selesai, tidak diposting")} disabled={pending}><FlaskConical className="size-4" /></IconBtn>
                          <IconBtn title="Posting sekarang" onClick={async () => (await confirmDialog({ title: "Posting sekarang?", description: `Video “${j.title || "Video"}” (${j.label}) langsung diunggah ke TikTok @${j.username}${j.productId ? " dengan produk keranjang" : ""}. Postingan tidak bisa dibatalkan dari sini.`, confirmLabel: "Posting sekarang" })) && run(j.id, () => runUploadNow(j.id, false), "Video terposting")} disabled={pending}><Send className="size-4" /></IconBtn>
                          <IconBtn title="Batalkan" onClick={() => run(j.id, () => cancelUpload(j.id))} disabled={pending}><X className="size-4" /></IconBtn>
                        </>
                      )}
                      {j.status === "failed" && (
                        <IconBtn title="Ulangi (masuk antrean sekarang). Cek TikTok Studio dulu kalau upload sempat terputus." onClick={() => run(j.id, () => retryUpload(j.id), "Masuk antrean lagi")} disabled={pending}><RotateCcw className="size-4" /></IconBtn>
                      )}
                      {(j.status === "failed" || j.status === "cancelled" || j.status === "done") && (
                        <IconBtn title="Hapus dari daftar" onClick={() => run(j.id, () => deleteUploads([j.id]))} disabled={pending}><Trash2 className="size-4" /></IconBtn>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null,
        )}
        {!jobs.length && (
          <section className={`${card} flex flex-col items-center gap-2 py-10 text-center`}>
            <CalendarClock className="size-7 text-muted-foreground" />
            <p className="text-[13px] font-medium">Belum ada jadwal</p>
            <p className="max-w-sm text-xs text-muted-foreground">Pilih video di kiri, tentukan jamnya, lalu bot mengunggahnya ke TikTok sendiri. Coba dulu dengan tombol uji coba (ikon tabung) sebelum jadwal pertama.</p>
          </section>
        )}
      </div>
    </div>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border bg-card p-3 ${accent ? "border-primary/40" : ""}`}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${accent ? "text-primary" : ""}`}>{value}</p>
      <p className="truncate text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function IconBtn({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40">
      {children}
    </button>
  );
}

/** What the posted videos say: which openings (hooks) get the most views on these accounts. */
function Insights({ data }: { data: HookInsights }) {
  if (!data.matched.length && !data.topPosts.length) return null;
  return (
    <section className={`${card} space-y-3`}>
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-muted text-black dark:text-white"><TrendingUp className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold">Yang paling laku di akunmu</h2>
          <p className="text-[11px] text-muted-foreground">Dari statistik postingan (sinkron di Profil & Postingan). AI penulis memakai ini sebagai contoh hook yang terbukti.</p>
        </div>
      </div>
      {data.matched.length > 0 && (
        <ol className="space-y-1.5">
          {data.matched.slice(0, 5).map((m, i) => (
            <li key={m.postId} className="flex items-center gap-2 text-xs">
              <span className="w-4 text-center font-semibold text-muted-foreground">{i + 1}</span>
              {i === 0 ? <CheckCircle2 className="size-3.5 shrink-0 text-status-ok" /> : <Play className="size-3.5 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate">“{m.hook}”</span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums">{compact.format(m.views)} views</span>
              {m.label && <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">{m.label}</span>}
            </li>
          ))}
        </ol>
      )}
      {!data.matched.length && (
        <>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><CircleAlert className="size-3.5" /> Belum ada video dari jadwal yang tercocokkan; sementara ini pakai postingan terbaik akunmu:</p>
          <ol className="space-y-1">
            {data.topPosts.slice(0, 5).map((p) => (
              <li key={p.postId} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate">“{p.caption}”</span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums">{compact.format(p.views)} views</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/** Searchable list of the account's showcase (etalase): photo, price, stock; unavailable products can't be picked. */
function ProductPicker({ items, value, projectProduct, onPick }: { items: EtalaseItem[]; value: string; projectProduct: string | null; onPick: (e: EtalaseItem | null) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const picked = items.find((e) => e.productId === value);
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    const hits = k ? items.filter((e) => e.title.toLowerCase().includes(k) || e.productId.includes(k)) : items;
    return [...hits].sort((a, b) => Number(usable(b)) - Number(usable(a))).slice(0, 60);
  }, [items, q]);
  const projectMissing = !!projectProduct && !items.some((e) => e.productId === projectProduct);

  return (
    <div className="relative space-y-1">
      <span className="text-xs font-medium">Produk keranjang</span>
      <button type="button" onClick={() => setOpen((v) => !v)} className={`${field} flex items-center gap-2 text-left`} aria-expanded={open}>
        {picked ? (
          <>
            {picked.cover ? <img src={mediaUrl(picked.cover)} alt="" className="size-5 shrink-0 rounded object-cover" /> : <ShoppingCart className="size-4 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 flex-1 truncate">{picked.title}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{picked.price}</span>
          </>
        ) : value ? (
          <span className="flex-1 truncate">ID {value} <span className="text-destructive">(tidak ada di etalase akun ini)</span></span>
        ) : (
          <span className="flex-1 text-muted-foreground">Tanpa produk</span>
        )}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {projectMissing && !value && <p className="text-[11px] text-amber-600 dark:text-amber-400">Produk proyek ini belum ada di etalase akun ini. Tambahkan dulu di TikTok Shop, lalu sinkron di menu TikTok Shop.</p>}
      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border bg-popover shadow-lg">
          <div className="flex items-center gap-2 border-b px-2.5">
            <Search className="size-4 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Cari di ${items.length} produk etalase...`} className="h-9 flex-1 bg-transparent text-[13px] outline-none" />
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            <li>
              <button type="button" onClick={() => (onPick(null), setOpen(false))} className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] hover:bg-accent ${!value ? "text-primary" : ""}`}>
                <X className="size-4 text-muted-foreground" /> Tanpa produk
              </button>
            </li>
            {list.map((e) => {
              const ok = usable(e);
              return (
                <li key={e.productId}>
                  <button
                    type="button"
                    disabled={!ok}
                    title={ok ? e.productId : "Tidak tersedia di TikTok (stok habis atau disembunyikan): tidak bisa ditautkan"}
                    onClick={() => (onPick(e), setOpen(false), setQ(""))}
                    className={`flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent ${e.productId === value ? "bg-primary/10" : ""}`}
                  >
                    {e.cover ? <img src={mediaUrl(e.cover)} alt="" loading="lazy" className="size-9 shrink-0 rounded-md bg-muted object-cover" /> : <span className="size-9 shrink-0 rounded-md bg-muted" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{e.title}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {e.price} · {ok ? `stok ${e.stock ?? "?"}` : <span className="text-destructive">tidak tersedia</span>}
                        {e.productId === projectProduct ? <span className="text-primary"> · produk proyek ini</span> : null}
                      </span>
                    </span>
                    {e.productId === value && <Check className="size-4 shrink-0 text-primary" />}
                  </button>
                </li>
              );
            })}
            {!list.length && <li className="px-2.5 py-3 text-center text-xs text-muted-foreground">{items.length ? "Tidak ketemu." : "Etalase akun ini kosong atau belum disinkron (menu TikTok Shop)."}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
