"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, ChevronDown, Search, ShoppingCart, CircleAlert, Clock, ExternalLink, Eye, FlaskConical, Loader2, Play, RotateCcw, Send, Shuffle, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { openLightbox } from "@/components/media-lightbox";
import type { UploadJob } from "@/lib/db/schema";
import { mediaUrl } from "@/lib/media-url";
import type { AccountTips } from "@/lib/schedule-tips";
import { cancelUpload, createUploadJobs, deleteUploads, retryUpload, runUploadNow, type Uploadable } from "./actions";

type EtalaseItem = { accountId: number; productId: string; title: string; price: string; stock: number | null; inStock: boolean; hidden: boolean; cover: string | null };
/** A showcase product can be linked only when TikTok shows it as available (in stock, not hidden). */
const usable = (e: EtalaseItem) => e.inStock && !e.hidden && e.stock !== 0;

type Job = Omit<UploadJob, "scheduledAt" | "postedAt" | "createdAt"> & { scheduledAt: number; postedAt: number | null; createdAt: number; username: string; title: string | null; views: number | null };

const card = "rounded-xl border bg-card p-4";
const field = "h-8 w-full rounded-md border bg-background px-2.5 text-[13px] outline-none focus:border-ring";
const fieldLabel = "mb-1 flex h-5 min-w-0 items-center gap-2 whitespace-nowrap text-xs font-medium";
const btn = "flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium disabled:opacity-50";
const when = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Gagal");

const MAX_TAGS = 5;
const FALLBACK_TAGS = ["#racuntiktok", "#tiktokshop", "#fyp"]; // when the account has too little history
const hashtagsOf = (text: string) => text.match(/#[\p{L}\p{N}_シ]+/gu) ?? [];
const tagOf = (word: string | undefined) => {
  const w = (word ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  return w.length >= 3 && /\p{L}/u.test(w) ? `#${w}` : null;
};

/**
 * Upload caption = one short line + at most 5 hashtags: the product's brand and kind (first two words of its name,
 * so TikTok knows who it's for), then general selling/FYP hashtags that brought this account the most views
 * (lib/hashtags.ts), else common ones.
 */
function shortCaption(product: string, proven: string[]) {
  const name = product.replace(/\s+/g, " ").trim();
  const words = name.split(" ");
  const tags = [...new Set([tagOf(words[0]), tagOf(words[1]), ...proven, ...FALLBACK_TAGS].filter((t): t is string => !!t))].slice(0, MAX_TAGS);
  return `${name || "Produk ini"} lagi rame! Cek keranjang di bawah ya 🛒\n\n${tags.join(" ")}`;
}

const TITLE_MAX = 30; // TikTok's limit for the product link title on a video

/**
 * Titles for the product link on the video that make viewers curious enough to tap (≤ 30 chars). Built from the
 * product's kind (second word of its name, e.g. "Sepatu"); no absolute claims ("dijamin", "100%", "pasti", "paling")
 * per the writing rules. The first one is the default, "Ide lain" cycles through the rest.
 */
function curiousTitles(product: string) {
  const words = product.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().split(" ");
  const raw = (words[1] && /\p{L}{3,}/u.test(words[1]) ? words[1] : words[0]) ?? "";
  const kind = raw ? raw[0].toUpperCase() + raw.slice(1).toLowerCase() : "Barang";
  return [
    `${kind} ini bikin kaget 😱`,
    "Murah tapi kayak mahal",
    `${kind} yang lagi dicari`,
    "Cek harganya dulu 👀",
    `${kind} viral, worth it?`,
    `Rahasia ${kind.toLowerCase()} nyaman`,
    "Jangan beli sebelum lihat ini",
    "Kok bisa semurah ini?",
  ].filter((t) => t.length <= TITLE_MAX);
}

/** Product name for the caption: the short one saved with the video, else the title cut at a word (≤ 30 chars). */
const shortName = (v: { productTitle: string; title: string } | undefined) => {
  const name = (v?.productTitle?.trim() || v?.title || "").replace(/\s+/g, " ").trim();
  // saved names are cut at 30 chars, often mid-word ("Tiger-6"): drop the last partial word
  return name.length < 28 ? name : name.slice(0, 31).replace(/\s+\S*$/, "");
};

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
const pad2 = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, i) => pad2(i));
const MINUTES = Array.from({ length: 12 }, (_, i) => pad2(i * 5)); // TikTok schedules in 5-minute steps

/** Date + 24-hour time (00.00–23.59), whatever the computer's locale; value = "YYYY-MM-DDTHH:MM" like datetime-local. */
function DateTime24({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [date = "", time = ""] = value.split("T");
  const [h, m] = time ? time.split(":") : ["19", "00"]; // the form fills in a slot right after it mounts
  const set = (d: string, hh: string, mm: string) => d && onChange(`${d}T${hh}:${mm}`);
  const sel = "h-8 rounded-md border bg-background px-1.5 text-[13px] tabular-nums outline-none focus:border-ring";
  return (
    <div className="flex items-center gap-1.5">
      <input type="date" aria-label="Tanggal" className={`${field} min-w-0 flex-1`} value={date} onChange={(e) => set(e.target.value, h, m)} />
      <select aria-label="Jam" className={sel} value={h} onChange={(e) => set(date, e.target.value, m)}>
        {HOURS.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <span className="text-[13px] font-medium">.</span>
      <select aria-label="Menit" className={sel} value={m} onChange={(e) => set(date, h, e.target.value)}>
        {(MINUTES.includes(m) ? MINUTES : [...MINUTES, m].sort()).map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </div>
  );
}

const toLocal = (t: Date) => new Date(t.getTime() - t.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

const VOL_MIN = -60; // TikTok editor's volume range (dB)
const VOL_MAX = 20;
/** Track of the volume slider: plain, with the part between 0 dB and the value filled (TikTok style). */
function volumeTrack(v: number) {
  const pct = (x: number) => ((x - VOL_MIN) / (VOL_MAX - VOL_MIN)) * 100;
  const [a, b] = [Math.min(pct(0), pct(v)), Math.max(pct(0), pct(v))];
  return `linear-gradient(to right, var(--track) ${a}%, var(--primary) ${a}%, var(--primary) ${b}%, var(--track) ${b}%)`;
}
const LEAD_MIN = 20; // = SCHEDULE_LEAD_MIN in lib/uploads.ts: closer than this posts right away
const MAX_AHEAD_DAYS = 9; // = SCHEDULE_MAX_DAYS in lib/uploads.ts (TikTok Studio schedules ~10 days ahead)
const SCHEDULED = { label: "Terjadwal di TikTok", cls: "bg-status-ok/12 text-status-ok" };
const STATUS: Record<Job["status"], { label: string; cls: string }> = {
  queued: { label: "Antre", cls: "bg-[#5e6ad2]/12 text-[#7b86f0]" },
  uploading: { label: "Mengunggah", cls: "bg-amber-500/12 text-amber-600 dark:text-amber-400" },
  done: { label: "Terposting", cls: "bg-status-ok/12 text-status-ok" },
  failed: { label: "Gagal", cls: "bg-destructive/12 text-destructive" },
  cancelled: { label: "Dibatalkan", cls: "bg-muted text-muted-foreground" },
};

export function JadwalBoard({
  jobs, accounts, videos, etalase, minGap, initialProject, tips, banned, maxPerDay, selectedAccountId, provenTags,
}: {
  tips: Record<number, AccountTips>; banned: { from: string; to: string }[]; maxPerDay: number;
  selectedAccountId: number | null; // social account picked in the sidebar card
  provenTags: Record<number, string[]>; // general hashtags that did best on each account (lib/hashtags.ts)
  etalase: EtalaseItem[];
  jobs: Job[]; accounts: { id: number; username: string; status: string }[]; videos: Uploadable[]; minGap: number; initialProject: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);
  const active = accounts.filter((a) => a.status === "active");
  const projects = useMemo(() => [...new Map(videos.map((v) => [v.projectId, v.title])).entries()], [videos]);
  const [projectId, setProjectId] = useState<number | null>(initialProject ?? projects[0]?.[0] ?? null);
  const own = videos.filter((v) => v.projectId === projectId);
  const [picked, setPicked] = useState<string[]>([]);
  // no account picker here: videos go to the account chosen in the sidebar (or the first logged-in one)
  const accountId = active.find((a) => a.id === selectedAccountId)?.id ?? active[0]?.id ?? null;
  const target = active.find((a) => a.id === accountId);
  const [caption, setCaption] = useState("");
  const [productId, setProductId] = useState("");
  const [productTitle, setProductTitle] = useState("");
  const [music, setMusic] = useState(false);
  const [musicVolume, setMusicVolume] = useState(-20); // under the voice-over; 0 dB = as loud as the video's own audio
  const [volDraft, setVolDraft] = useState<string | null>(null); // what is being typed in the dB box ("-", "-1" …)
  const [titleIdea, setTitleIdea] = useState(0); // which curiousTitles() idea is shown
  const [at, setAt] = useState("");
  const gap = 180; // spacing between a project's videos (main + A/B variants), 3 h

  // project changed: default to all of its videos, its caption and its product
  useEffect(() => {
    const t = setTimeout(() => {
      setPicked(own.map((v) => v.video));
      setCaption(own[0] ? shortCaption(shortName(own[0]), (accountId && provenTags[accountId]) || []) : "");
      // the project's own product, only when it can really be linked from this account's showcase
      const mine = etalase.find((e) => e.accountId === accountId && e.productId === own[0]?.productId && usable(e));
      setProductId(mine?.productId ?? "");
      setTitleIdea(0);
      setProductTitle(mine ? (curiousTitles(mine.title)[0] ?? "") : "");
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
        const startAt = new Date(at || nextSlot()).getTime();
        await createUploadJobs({ accountId, items, caption, productId: productId.trim() || null, productTitle: productTitle.trim() || null, music, musicVolume, startAt, gapMinutes: gap });
        toast.success(`${items.length} video dijadwalkan: sedang diunggah ke TikTok Studio`);
        // move the form past what was just scheduled, so it doesn't warn about its own new job
        setAt(toLocal(new Date(Math.max(startAt, Date.now()) + items.length * gap * 60_000)));
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

  // "now" ticks, so a post TikTok publishes on schedule moves from Antrian to Terposting without a reload
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  // ---- smart bits -------------------------------------------------------------------------------------------
  const tip = accountId ? tips[accountId] : undefined;
  const live = jobs.filter((j) => j.status === "queued" || j.status === "uploading");
  // exported videos that have never been scheduled or posted (same project + label)
  const ready = videos.filter((v) => !jobs.some((j) => j.projectId === v.projectId && (j.label ?? "Video utama") === v.label && j.status !== "cancelled" && j.status !== "failed"));
  const startMs = at ? new Date(at).getTime() : NaN;
  const dayKey = (t: number) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
  const sameDay = Number.isFinite(startMs) && accountId ? jobs.filter((j) => j.accountId === accountId && j.status !== "cancelled" && j.status !== "failed" && dayKey(j.postedAt ?? j.scheduledAt) === dayKey(startMs)).length : 0;
  // other posts of this account around that time: waiting/uploading ones and ones TikTok will publish later
  const clash = Number.isFinite(startMs) && accountId
    ? jobs.find((j) => j.accountId === accountId && (j.status === "queued" || j.status === "uploading" || (j.status === "done" && !!j.postedAt && j.postedAt > now)) && Math.abs(j.scheduledAt - startMs) < minGap * 60_000)
    : undefined;
  const bannedHit = banned.filter((b) => b.from && caption.toLowerCase().includes(b.from.toLowerCase()));
  const warnings: { text: string; fix?: { label: string; run: () => void } }[] = [
    ...bannedHit.map((b) => ({
      text: `Caption memakai “${b.from}” (dilarang di Aturan naskah).`,
      fix: { label: `Ganti jadi “${b.to}”`, run: () => setCaption((c) => c.replace(new RegExp(b.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), b.to)) },
    })),
    ...(!caption.trim() ? [{ text: "Caption masih kosong." }] : !/#\S/.test(caption) ? [{ text: "Belum ada hashtag; 3–5 hashtag produk membantu video ditemukan." }] : []),
    ...(!productId && etalase.some((e) => e.accountId === accountId && usable(e)) ? [{ text: "Tanpa produk keranjang: penonton tidak bisa langsung beli dari video ini." }] : []),
    ...(Number.isFinite(startMs) && startMs < now + LEAD_MIN * 60_000 ? [{ text: `Kurang dari ${LEAD_MIN} menit lagi: video langsung diposting sekarang (TikTok butuh jeda untuk menjadwalkan).` }] : []),
    ...(Number.isFinite(startMs) && startMs + (picked.length - 1) * gap * 60_000 > now + MAX_AHEAD_DAYS * 86_400_000 ? [{ text: `TikTok hanya menerima jadwal ±${MAX_AHEAD_DAYS} hari ke depan: video yang lebih jauh menunggu di antrean dan diunggah otomatis begitu masuk jangkauan (app harus terbuka saat itu).` }] : []),
    ...(sameDay + picked.length > maxPerDay ? [{ text: `Hari itu akun ini sudah punya ${sameDay} posting; lebih dari ${maxPerDay} sehari terlihat seperti spam.` }] : []),
    ...(clash ? [{ text: `Sudah ada jadwal “${clash.title || clash.productTitle || clash.label || "Video"}” di akun ini jam ${when.format(clash.scheduledAt)} (lihat daftar di bawah); beri jarak minimal ${minGap} menit.`, fix: tip?.slots[0] ? { label: "Pakai slot kosong", run: () => setAt(toLocal(new Date(tip.slots[0]))) } : undefined }] : []),
  ];
  const atTikTok = (j: Job) => j.status === "done" && !!j.postedAt && j.postedAt > now; // uploaded, TikTok publishes it later
  const posted7 = jobs.filter((j) => j.status === "done" && j.postedAt && j.postedAt <= now && j.postedAt > now - 7 * 86_400_000).length;
  const postedAll = jobs.filter((j) => j.status === "done" && j.postedAt && j.postedAt <= now).length;
  // waiting = not uploaded yet + uploaded and waiting for TikTok to publish
  const waiting = [...live, ...jobs.filter(atTikTok)].sort((a, b) => a.scheduledAt - b.scheduledAt);
  const failedCount = jobs.filter((j) => j.status === "failed").length;

  const groups: [string, Job[]][] = [
    ["Antre & berjalan", jobs.filter((j) => j.status === "queued" || j.status === "uploading").sort((a, b) => a.scheduledAt - b.scheduledAt)],
    ["Perlu dicek", jobs.filter((j) => j.status === "failed")],
    // done = scheduled at TikTok (goes live later) or already live; shown as video cards
    ["Riwayat", jobs.filter((j) => j.status === "done" || j.status === "cancelled").sort((a, b) => b.scheduledAt - a.scheduledAt)],
  ];

  return (
    <div className="flex-1 space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="Terposting" value={String(postedAll)} sub={`${posted7} dalam 7 hari terakhir${failedCount ? ` · ${failedCount} gagal perlu dicek` : ""}`} />
      <Kpi label="Antrian jadwal" value={String(waiting.length)} sub={waiting[0] ? `berikutnya tayang ${when.format(waiting[0].scheduledAt)}` : "kosong"} />
      <Kpi label="Siap diposting" value={String(ready.length)} sub="video belum dijadwalkan" accent={ready.length > 0} />
      <Kpi label="Jam terbaik" value={tip?.hours[0] ? `${String(tip.hours[0].hour).padStart(2, "0")}.00` : "19.00"} sub={tip?.fromHistory ? "dari postingan akunmu" : "jam ramai umum TikTok"} />
    </div>
    <div className="space-y-4">
      {/* new schedule: one wide card, fields side by side; the schedule list runs full width below */}
      <section className={`${card} space-y-3`}>
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-muted text-black dark:text-white"><CalendarClock className="size-4" /></span>
          <h2 className="text-[13px] font-semibold">Jadwalkan video</h2>
        </div>
        {!videos.length ? (
          <p className="text-xs text-muted-foreground">Belum ada video jadi. Export video dulu di editor proyek.</p>
        ) : (
          <>
            {/* three aligned rows: project | start · caption (spans 2 rows) | product · caption | title on the video */}
            <div className="grid gap-x-4 gap-y-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:grid-rows-[auto_auto_auto_auto]">
              <label className="block">
                <span className={fieldLabel}>Proyek</span>
                <select className={field} value={projectId ?? ""} onChange={(e) => setProjectId(Number(e.target.value))}>
                  {projects.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
                </select>
              </label>
              <div>
                <span className={fieldLabel}>Mulai</span>
                <DateTime24 value={at} onChange={setAt} />
              </div>

              <label className="flex flex-col lg:row-span-3">
                <span className={fieldLabel}>
                  Caption & hashtag
                  <span className={`ml-auto truncate font-normal ${hashtagsOf(caption).length > MAX_TAGS ? "text-status-progress" : "text-muted-foreground"}`}>
                    {hashtagsOf(caption).length}/{MAX_TAGS} hashtag · terbukti ramai di akunmu
                  </span>
                </span>
                <textarea className={`${field} h-auto min-h-[84px] flex-1 resize-none py-2 leading-relaxed`} rows={3} maxLength={2200} value={caption} onChange={(e) => setCaption(e.target.value)} />
              </label>
              <ProductPicker
                items={etalase.filter((e) => e.accountId === accountId)}
                value={productId}
                projectProduct={own[0]?.productId ?? null}
                onPick={(e) => {
                  setProductId(e?.productId ?? "");
                  setTitleIdea(0);
                  setProductTitle(e ? (curiousTitles(e.title)[0] ?? "") : "");
                }}
              />
              {/* title of the product link on the video: auto (curious), editable */}
              <div>
                <span className={fieldLabel}>
                  Judul di keranjang
                  <span className="ml-auto truncate font-normal text-muted-foreground">{productId ? `${productTitle.length}/${TITLE_MAX} · bikin penasaran` : "pilih produk dulu"}</span>
                </span>
                <div className="flex gap-1.5">
                  <input
                    className={`${field} disabled:opacity-50`}
                    maxLength={TITLE_MAX}
                    disabled={!productId}
                    value={productTitle}
                    placeholder="Judul yang muncul di keranjang video"
                    onChange={(e) => setProductTitle(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={!productId}
                    title="Ganti dengan ide judul lain"
                    onClick={() => {
                      const ideas = curiousTitles(etalase.find((e) => e.productId === productId)?.title ?? shortName(own[0]));
                      const next = (titleIdea + 1) % ideas.length;
                      setTitleIdea(next);
                      setProductTitle(ideas[next] ?? "");
                    }}
                    className="flex h-8 shrink-0 items-center gap-1 rounded-md border px-2.5 text-[11px] font-medium hover:bg-accent disabled:opacity-50"
                  >
                    <Shuffle className="size-3.5" /> Ide lain
                  </button>
                </div>
              </div>
              {/* background music: TikTok's editor adds a random "JJ" sound at this volume (lib/platforms/tiktok-upload.ts) */}
              <div>
                <span className={fieldLabel}>
                  Musik latar
                  <span className="ml-auto truncate font-normal text-muted-foreground">{music ? "lagu JJ acak dari TikTok" : "suara asli video saja"}</span>
                </span>
                <div className="flex h-8 items-center gap-2.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={music}
                    aria-label="Gunakan musik"
                    onClick={() => setMusic(!music)}
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${music ? "bg-primary" : "bg-muted-foreground/30"}`}
                  >
                    <span className={`absolute top-0.5 size-4 rounded-full bg-background shadow transition-all ${music ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                  {music ? (
                    <>
                      {/* like TikTok's volume slider: plain track, filled only between 0 dB and the thumb */}
                      <input
                        type="range"
                        min={VOL_MIN}
                        max={VOL_MAX}
                        step={1}
                        value={musicVolume}
                        aria-label="Volume musik"
                        onChange={(e) => {
                          setMusicVolume(Number(e.target.value));
                          setVolDraft(null);
                        }}
                        style={{ background: volumeTrack(musicVolume) }}
                        className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full [--track:#e5e5e5] dark:[--track:#f5f5f5] [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[4px] [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgba(0,0,0,.15)]"
                      />
                      {/* typed value, like TikTok's box: -60…20 dB, applied as soon as it is a valid number */}
                      <label className="flex h-8 w-[72px] shrink-0 items-center gap-1 rounded-md border bg-background px-2 focus-within:border-ring">
                        <input
                          inputMode="numeric"
                          aria-label="Volume musik (dB)"
                          maxLength={3}
                          value={volDraft ?? String(musicVolume)}
                          onChange={(e) => {
                            const t = e.target.value.replace(/[^\d-]/g, "").replace(/(?!^)-/g, "");
                            setVolDraft(t);
                            const n = Number(t);
                            if (/^-?\d+$/.test(t) && n >= VOL_MIN && n <= VOL_MAX) setMusicVolume(n);
                          }}
                          onBlur={() => setVolDraft(null)}
                          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                          className="w-full min-w-0 bg-transparent text-right text-[12px] tabular-nums outline-none"
                        />
                        <span className="text-[11px] text-muted-foreground">dB</span>
                      </label>
                    </>
                  ) : (
                    <span className="text-[12px] text-muted-foreground">Gunakan musik</span>
                  )}
                </div>
              </div>
            </div>

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
            <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 space-y-0.5 text-[11px] text-muted-foreground">
                {target ? (
                  <p>
                    Diunggah ke <b className="font-medium text-foreground">@{target.username}</b> (akun di sidebar)
                    {own.length > 1 ? ` · ${own.length} video, jarak ${gap / 60} jam` : ""}
                  </p>
                ) : (
                  <p className="text-destructive">Belum ada akun TikTok aktif. Login di Akun Sosial.</p>
                )}
                <p>Video langsung diunggah ke TikTok Studio dan dijadwalkan di sana, jadi tetap tayang tepat waktu walau aplikasi ditutup. Jangan terlalu sering supaya akun tidak dibatasi TikTok.</p>
              </div>
              <button type="button" className={`${btn} shrink-0 bg-primary px-5 text-primary-foreground hover:bg-primary/90`} disabled={pending || !active.length} onClick={schedule}>
                {pending && busyId === null ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />} Jadwalkan {picked.length > 1 ? `${picked.length} video` : ""}
              </button>
            </div>
          </>
        )}
      </section>

      <div className="min-w-0 space-y-4">
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
              {title === "Riwayat" ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {list.map((j) => (
                    <HistoryCard key={j.id} j={j} scheduled={atTikTok(j)} busy={busyId === j.id} disabled={pending} onDelete={() => run(j.id, () => deleteUploads([j.id]))} />
                  ))}
                </div>
              ) : (
              <ul className="divide-y">
                {list.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${(atTikTok(j) ? SCHEDULED : STATUS[j.status]).cls}`}>{(atTikTok(j) ? SCHEDULED : STATUS[j.status]).label}</span>
                    {/* the video itself: click to play */}
                    <button
                      type="button"
                      onClick={() => openLightbox([{ src: j.video, kind: "video", label: `${j.title || j.productTitle || "Video"} · ${j.label ?? ""}` }])}
                      className="group relative h-14 w-8 shrink-0 overflow-hidden rounded-md bg-black"
                      aria-label="Putar video"
                      title="Putar video"
                    >
                      <video src={`${mediaUrl(j.video)}#t=0.5`} muted preload="metadata" className="size-full object-cover" />
                      <Play className="absolute inset-0 m-auto size-3.5 fill-white text-white opacity-80 group-hover:opacity-100" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{j.title || j.productTitle || "Video"} <span className="font-normal text-muted-foreground">· {j.label} · @{j.username}</span></p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        <Clock className="mr-1 inline size-3" />
                        {atTikTok(j) ? `Tayang ${when.format(j.postedAt!)}` : j.status === "done" && j.postedAt ? `Terposting ${when.format(j.postedAt)}` : when.format(j.scheduledAt)}
                        {j.productId ? ` · 🛒 ${j.productTitle || "produk tertaut"}` : ""}
                        {j.music ? ` · 🎵 musik ${j.musicVolume} dB` : ""}
                        {j.hook ? ` · “${j.hook}”` : ""}
                      </p>
                      {atTikTok(j) && <p className="truncate text-[11px] text-muted-foreground">Sudah di TikTok Studio. Untuk membatalkan/mengubah, buka TikTok Studio → Postingan.</p>}
                      {j.status === "done" && !atTikTok(j) && (
                        j.postId ? (
                          <a href={`https://www.tiktok.com/@${j.username}/video/${j.postId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-light hover:underline">
                            <ExternalLink className="size-3" /> Lihat postingan di TikTok
                            {j.views != null && <span className="inline-flex items-center gap-0.5 font-normal text-muted-foreground"><Eye className="size-3" /> {j.views.toLocaleString("id-ID")} penonton</span>}
                          </a>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">Sudah tayang · link postingan muncul setelah profil tersinkron</p>
                        )
                      )}
                      {!atTikTok(j) && j.status !== "done" && (j.progress || j.error) && <p className={`truncate text-[11px] ${j.error ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>{j.error ?? j.progress}</p>}
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
              )}
            </section>
          ) : null,
        )}
        {!jobs.length && (
          <section className={`${card} flex flex-col items-center gap-2 py-10 text-center`}>
            <CalendarClock className="size-7 text-muted-foreground" />
            <p className="text-[13px] font-medium">Belum ada jadwal</p>
            <p className="max-w-sm text-xs text-muted-foreground">Pilih video di form atas, tentukan jamnya, lalu bot mengunggahnya ke TikTok sendiri. Coba dulu dengan tombol uji coba (ikon tabung) sebelum jadwal pertama.</p>
          </section>
        )}
      </div>
    </div>
    </div>
  );
}

/** One finished job in Riwayat: the video as a square card, its result in the middle. */
function HistoryCard({ j, scheduled, busy, disabled, onDelete }: { j: Job; scheduled: boolean; busy: boolean; disabled: boolean; onDelete: () => void }) {
  const name = j.title || j.productTitle || "Video";
  const badge = scheduled
    ? { text: "Berhasil terjadwal", cls: "bg-[#16a34a]/90 text-white", icon: <CalendarClock className="size-3.5" /> }
    : j.status === "done"
      ? { text: "Terposting", cls: "bg-[#16a34a]/90 text-white", icon: <Check className="size-3.5" /> }
      : { text: "Dibatalkan", cls: "bg-black/70 text-white", icon: <X className="size-3.5" /> };
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border bg-card">
      <button type="button" onClick={() => openLightbox([{ src: j.video, kind: "video", label: `${name} · ${j.label ?? ""}` }])} className="relative block aspect-square overflow-hidden bg-black" aria-label={`Putar ${name}`}>
        <video src={`${mediaUrl(j.video)}#t=0.5`} muted preload="metadata" className={`size-full object-cover ${j.status === "cancelled" ? "opacity-50" : ""}`} />
        <span className={`absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold shadow backdrop-blur ${badge.cls}`}>
          {badge.icon} {badge.text}
        </span>
        <Play className="absolute right-2 bottom-2 size-4 fill-white text-white opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
      <div className="flex flex-1 flex-col gap-0.5 p-2.5">
        <p className="line-clamp-2 text-xs leading-snug font-medium" title={name}>{name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{j.label} · @{j.username}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          <Clock className="mr-1 inline size-3" />
          {scheduled ? `Tayang ${when.format(j.postedAt!)}` : j.status === "done" && j.postedAt ? `Terposting ${when.format(j.postedAt)}` : when.format(j.scheduledAt)}
        </p>
        {(j.productId || j.music) && (
          <p className="truncate text-[11px] text-muted-foreground">
            {j.productId ? `🛒 ${j.productTitle || "produk tertaut"}` : ""}
            {j.productId && j.music ? " · " : ""}
            {j.music ? `🎵 ${j.musicVolume} dB` : ""}
          </p>
        )}
        <div className="mt-auto flex items-center gap-1 pt-1.5">
          {scheduled ? (
            <span className="text-[10px] leading-tight text-muted-foreground">Ubah/batal di TikTok Studio → Postingan</span>
          ) : j.status === "done" && j.postId ? (
            <a href={`https://www.tiktok.com/@${j.username}/video/${j.postId}`} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 text-[11px] font-medium text-brand-light hover:underline">
              <ExternalLink className="size-3 shrink-0" /> Lihat di TikTok
              {j.views != null && <span className="inline-flex items-center gap-0.5 font-normal text-muted-foreground"><Eye className="size-3" />{j.views.toLocaleString("id-ID")}</span>}
            </a>
          ) : j.status === "done" ? (
            <span className="text-[10px] leading-tight text-muted-foreground">Link muncul setelah profil tersinkron</span>
          ) : null}
          <span className="ml-auto flex items-center">
            {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            <IconBtn title="Hapus dari riwayat" onClick={onDelete} disabled={disabled}><Trash2 className="size-4" /></IconBtn>
          </span>
        </div>
      </div>
    </article>
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
    <div className="relative">
      <span className={fieldLabel}>Produk keranjang</span>
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
