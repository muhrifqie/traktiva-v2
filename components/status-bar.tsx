"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpCircle, Check, ChevronUp, CircleAlert, Clock, Coins, Cpu, Download, Film, KeyRound, Loader2, RefreshCw, Upload, Users, Volume2, VolumeX, X,
} from "lucide-react";
import { toast } from "sonner";
import type { AppStatus, Task, UploadRow } from "@/app/api/status/route";
import { GoogleIcon } from "@/components/brand-icons";
import { chime, setSoundOn, soundOn } from "@/lib/chime";
import { confirmDialog } from "@/components/confirm-dialog";
import { cancelProject } from "@/app/(dashboard)/video/project-actions";

// VS Code-style status bar: one item per background area (engine, Google, accounts, video work, uploads, sync, app).
// Each item shows a colored dot + short numbers; clicking it opens a panel with the details and a link to its page.

const mmss = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(t / 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}` : `${m}:${String(t % 60).padStart(2, "0")}`;
};
const ago = (ms: number) => {
  const m = Math.floor(ms / 60_000);
  return m < 1 ? "baru saja" : m < 60 ? `${m} mnt lalu` : m < 1440 ? `${Math.floor(m / 60)} jam lalu` : `${Math.floor(m / 1440)} hari lalu`;
};
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const when = new Intl.DateTimeFormat("id-ID", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const PLATFORM: Record<string, string> = { tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", shopee: "Shopee" };

type Tone = "ok" | "warn" | "bad" | "idle" | "busy";
const DOT: Record<Tone, string> = { ok: "bg-status-ok", warn: "bg-status-progress", bad: "bg-destructive", idle: "bg-muted-foreground", busy: "bg-status-progress animate-pulse" };
const Dot = ({ tone }: { tone: Tone }) => <span className={`size-2 shrink-0 rounded-full ${DOT[tone]}`} />;

const ENGINE = {
  online: { label: "Mesin video siap", short: "Mesin siap", tone: "ok" },
  offline: { label: "Mesin video tidur (menyala otomatis saat dipakai)", short: "Mesin standby", tone: "idle" },
  missing: { label: "Mesin video belum terpasang", short: "Mesin belum terpasang", tone: "bad" },
} as const;

type PanelKey = "engine" | "google" | "accounts" | "tasks" | "uploads" | "sync" | "app";
type Open = { key: PanelKey; left: number; width: number } | null;

function Item({ children, title, onClick, active, className = "" }: { children: React.ReactNode; title: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; active?: boolean; className?: string }) {
  return (
    <button type="button" title={title} onClick={onClick} className={`flex h-full shrink-0 items-center gap-1.5 px-2 transition-colors hover:bg-foreground/10 ${active ? "bg-foreground/10 text-foreground" : ""} ${className}`}>
      {children}
    </button>
  );
}

export function StatusBar() {
  const router = useRouter();
  const [s, setS] = useState<(AppStatus & { skew: number }) | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [now, setNow] = useState(() => Date.now());
  const running = useRef<Set<string> | null>(null); // task keys (p<id>) running at the previous poll
  const retry = useRef(0);
  const [sound, setSound] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setSound(soundOn()), 0); // localStorage is browser-only (avoids a hydration mismatch)
    return () => clearTimeout(t);
  }, []);
  const toggleSound = () => {
    const on = !sound;
    setSound(on);
    setSoundOn(on);
    if (on) chime("done"); // preview + unlocks audio after a user gesture
  };
  const [kick, setKick] = useState(0); // bump to re-run the polling effect right away

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/status", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const next: AppStatus = await r.json();
      // toast once per run: only projects that were running at the previous poll and have now finished.
      // (Saving a finished project bumps its updatedAt, so comparing finished keys alone re-toasted on every edit.)
      const wasRunning = running.current;
      if (wasRunning) {
        const fresh = next.finished.filter((f) => wasRunning.has(f.key.split(":")[0]) && !next.tasks.some((t) => t.key === f.key.split(":")[0]));
        if (fresh.length) chime(fresh.some((f) => !f.ok) ? "failed" : "done");
        for (const f of fresh) {
          const go = { label: "Lihat", onClick: () => router.push(f.href) };
          if (f.ok) toast.success(`Selesai: ${f.title}`, { action: go });
          else toast.error(`Perlu dicek: ${f.title}`, { action: go });
        }
      }
      running.current = new Set(next.tasks.map((t) => t.key));
      retry.current = 0;
      setNow(Date.now()); // keeps "x mnt lalu" fresh while idle (the 1 s ticker only runs while something works)
      setS({ ...next, skew: next.now - Date.now() }); // skew: server clock − browser clock, so timers match server timestamps
    } catch {
      // first load can fail while the dev server compiles; retry soon instead of waiting a full poll
      if (retry.current++ < 5) setTimeout(() => setKick((k) => k + 1), 2000);
    }
  }, [router]);

  const busy = (s?.tasks.length ?? 0) > 0;
  const live = busy || !!s?.exports.length || !!s?.uploads.running || !!s?.sync.now;

  // Poll fast while a video is being made, slowly otherwise; pause when the window is hidden.
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(() => document.visibilityState === "visible" && void load(), busy ? 2500 : 15000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [busy, load, kick]);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const toggle = (key: PanelKey) => (e: React.MouseEvent<HTMLButtonElement>) => {
    if (open?.key === key) return setOpen(null);
    const r = e.currentTarget.getBoundingClientRect();
    const width = Math.min(key === "tasks" ? 440 : 380, window.innerWidth - 16);
    setOpen({ key, width, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
  };
  const close = () => setOpen(null);

  const t = now + (s?.skew ?? 0);
  const engine = ENGINE[s?.engine ?? "offline"];
  const tasks = s?.tasks ?? [];
  const exports = s?.exports ?? [];
  const items = tasks.flatMap((x) => x.items);
  const working = items.filter((i) => i.state === "working").length;
  const queued = items.filter((i) => i.state === "queued").length;
  const done = tasks.reduce((n, x) => n + x.done, 0);
  const total = tasks.reduce((n, x) => n + x.total, 0);
  const oldest = Math.min(...tasks.map((x) => x.startedAt ?? Infinity), ...exports.map((x) => x.startedAt));

  const g = s?.google;
  const gTone: Tone = !g || !g.total ? "idle" : g.active === 0 ? "bad" : g.active < g.total || g.credits < 100 ? "warn" : "ok";
  const acc = s?.accounts;
  const accTone: Tone = !acc || !acc.total ? "idle" : acc.needLogin.length ? "warn" : "ok";
  const up = s?.uploads;
  const upTone: Tone = !up ? "idle" : up.running ? "busy" : up.failed.length ? "bad" : up.queued ? "ok" : "idle";
  const sync = s?.sync;
  const app = s?.app;
  const appTone: Tone = !app ? "idle" : app.update?.mandatory || app.daysLeft === 0 ? "bad" : app.update || (app.daysLeft != null && app.daysLeft <= 7) ? "warn" : "ok";

  return (
    <>
      {open && <div className="fixed inset-0 z-40" onClick={close} aria-hidden="true" />}
      {open && s && (
        <Panel open={open} onClose={close}>
          {open.key === "tasks" && (
            <TaskPanel tasks={tasks} exports={exports} now={t} onClose={close} onCancel={async (task) => {
              if (!(await confirmDialog({ title: `Batalkan "${task.title}"?`, description: "Yang sudah jadi tetap disimpan. Yang sedang dibuat di Flow dihentikan (kreditnya mungkin tetap terpakai).", confirmLabel: "Batalkan proses", danger: true }))) return;
              try {
                await cancelProject(Number(task.key.slice(1)));
                toast.success("Proses dibatalkan");
                setKick((k) => k + 1);
                router.refresh();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Gagal membatalkan");
              }
            }} />
          )}
          {open.key === "engine" && <EnginePanel s={s} onClose={close} />}
          {open.key === "google" && <GooglePanel s={s} now={t} onClose={close} />}
          {open.key === "accounts" && <AccountsPanel s={s} onClose={close} />}
          {open.key === "uploads" && <UploadsPanel s={s} now={t} onClose={close} />}
          {open.key === "sync" && <SyncPanel s={s} now={t} onClose={close} />}
          {open.key === "app" && <AppPanel s={s} onClose={close} />}
        </Panel>
      )}

      <footer
        className="relative z-50 flex h-(--statusbar-height) shrink-0 items-stretch overflow-hidden border-t bg-sidebar text-[11px] text-muted-foreground"
        aria-label="Status aplikasi"
      >
        <Item title={`${engine.label}. Klik untuk detail.`} onClick={toggle("engine")} active={open?.key === "engine"}>
          <Dot tone={engine.tone} />
          <Cpu className="size-3" />
          <span className="hidden sm:inline">{engine.short}</span>
          {s && <span className="hidden tabular-nums lg:inline">· {s.slots.active}/{s.slots.max}{s.slots.waiting ? ` +${s.slots.waiting}` : ""}</span>}
        </Item>
        <Item title="Akun Google aktif dan total kredit Flow. Klik untuk detail." onClick={toggle("google")} active={open?.key === "google"}>
          <Dot tone={gTone} />
          <GoogleIcon className="size-3" />
          <span className="tabular-nums">{g ? `${g.active}/${g.total}` : "–"}</span>
          <Coins className="ml-1 size-3" />
          <span className="tabular-nums">{g ? compact.format(g.credits) : "–"}</span>
        </Item>
        <Item title="Sesi akun sosial. Klik untuk detail." onClick={toggle("accounts")} active={open?.key === "accounts"}>
          <Dot tone={accTone} />
          <Users className="size-3" />
          <span className="tabular-nums">{acc ? `${acc.active}/${acc.total}` : "–"}</span>
          {!!acc?.needLogin.length && <span className="hidden text-status-progress md:inline">· {acc.needLogin.length} perlu login</span>}
        </Item>

        <Item onClick={toggle("tasks")} active={open?.key === "tasks"} title="Lihat semua proses video" className="min-w-0 flex-1 justify-start">
          {busy || exports.length ? (
            <>
              <Loader2 className="size-3 shrink-0 animate-spin text-status-progress" />
              <span className="truncate text-foreground">
                {[
                  busy && `${working} sedang dibuat`,
                  queued && `${queued} antre`,
                  total && `${done}/${total} selesai`,
                  exports.length && `${exports.length} export`,
                ].filter(Boolean).join(" · ")}
              </span>
              {Number.isFinite(oldest) && <span className="font-mono tabular-nums opacity-80">{mmss(t - oldest)}</span>}
              {total > 0 && (
                <span className="hidden h-1 w-24 overflow-hidden rounded-full bg-muted md:block">
                  <span className="block h-full bg-status-progress transition-[width] duration-700" style={{ width: `${Math.round(tasks.reduce((n, x) => n + x.pct * x.total, 0) / total)}%` }} />
                </span>
              )}
            </>
          ) : (
            <>
              <Check className="size-3 shrink-0" />
              <span className="truncate">Tidak ada video diproses</span>
            </>
          )}
          <ChevronUp className={`size-3 shrink-0 transition-transform ${open?.key === "tasks" ? "rotate-180" : ""}`} />
        </Item>

        <Item title="Antrean upload. Klik untuk detail." onClick={toggle("uploads")} active={open?.key === "uploads"} className="max-w-[45%]">
          <Dot tone={upTone} />
          {up?.running ? <Loader2 className="size-3 shrink-0 animate-spin text-status-progress" /> : <Upload className="size-3 shrink-0" />}
          <span className="truncate">
            {!up
              ? "–"
              : up.running
                ? <span className="text-foreground">Mengunggah @{up.running.account}<span className="hidden xl:inline">{up.running.progress ? ` · ${up.running.progress}` : ""}</span></span>
                : up.queued
                  ? <>{up.queued} antre<span className="hidden lg:inline"> · berikutnya {when.format(up.next[0].at)}</span></>
                  : "Tidak ada upload"}
          </span>
          {!!up?.failed.length && <span className="shrink-0 rounded bg-destructive/15 px-1 font-medium text-destructive">{up.failed.length} gagal</span>}
        </Item>
        <Item title="Sinkron statistik akun otomatis. Klik untuk detail." onClick={toggle("sync")} active={open?.key === "sync"} className="hidden md:flex">
          <RefreshCw className={`size-3 ${sync?.now ? "animate-spin text-status-progress" : ""}`} />
          <span>{sync?.now ? <span className="text-foreground">Sinkron @{sync.now.username}</span> : sync?.lastAt ? `Sinkron ${ago(t - sync.lastAt)}` : "Belum sinkron"}</span>
        </Item>
        <Item title="Versi app dan lisensi. Klik untuk detail." onClick={toggle("app")} active={open?.key === "app"}>
          <Dot tone={appTone} />
          {app?.update ? <ArrowUpCircle className="size-3 text-status-progress" /> : <KeyRound className="size-3" />}
          <span className="tabular-nums">
            {!app ? "–" : app.update ? `Update ${app.update.version}` : app.daysLeft != null && app.daysLeft <= 7 ? `Lisensi ${app.daysLeft} hari` : `v${app.version}`}
          </span>
        </Item>
        <button
          type="button"
          title={sound ? "Suara notifikasi aktif (klik untuk bisukan)" : "Suara notifikasi mati (klik untuk aktifkan)"}
          onClick={toggleSound}
          className="flex h-full shrink-0 items-center px-2 transition-colors hover:bg-foreground/10"
        >
          {sound ? <Volume2 className="size-3" /> : <VolumeX className="size-3" />}
        </button>
      </footer>
    </>
  );
}

// ---------------------------------------------------------------- panels

function Panel({ open, onClose, children }: { open: NonNullable<Open>; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed bottom-(--statusbar-height) z-50 mb-1 flex max-h-[60vh] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl"
      style={{ left: open.left, width: open.width }}
      role="dialog"
    >
      <button type="button" onClick={onClose} aria-label="Tutup" className="absolute top-1.5 right-1.5 z-10 grid size-6 place-items-center rounded-md hover:bg-accent"><X className="size-3.5" /></button>
      {children}
    </div>
  );
}

function Head({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-baseline gap-2 border-b py-2 pr-9 pl-3">
      <p className="text-[13px] font-semibold">{title}</p>
      {note && <span className="min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground">{note}</span>}
    </div>
  );
}

function Foot({ href, label, onClose }: { href: string; label: string; onClose: () => void }) {
  return (
    <Link href={href} onClick={onClose} className="block border-t px-3 py-2 text-[12px] font-medium text-primary hover:bg-accent">
      {label} →
    </Link>
  );
}

function Row({ tone, children, right }: { tone: Tone; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 px-3 py-1.5 text-[12px]">
      <span className="mt-1.5"><Dot tone={tone} /></span>
      <div className="min-w-0 flex-1">{children}</div>
      {right && <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{right}</span>}
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-4 text-center text-xs text-muted-foreground">{children}</p>;
}

function EnginePanel({ s, onClose }: { s: AppStatus; onClose: () => void }) {
  const e = ENGINE[s.engine];
  return (
    <>
      <Head title="Mesin video (Flow)" />
      <ul className="py-1">
        <Row tone={e.tone}>{e.label}</Row>
        {s.tokens != null && <Row tone={s.tokens ? "ok" : "warn"}>{s.tokens} sesi Flow terdaftar di mesin</Row>}
        <Row tone={s.slots.waiting ? "warn" : "ok"} right={`${s.slots.active}/${s.slots.max}`}>
          Jalur proses bersamaan{s.slots.waiting ? `, ${s.slots.waiting} menunggu jalur kosong` : ""}
          <p className="text-[11px] text-muted-foreground">Batas otomatis sesuai spek PC dan jumlah akun Google.</p>
        </Row>
      </ul>
      <Foot href="/pengaturan" label="Buka Pengaturan" onClose={onClose} />
    </>
  );
}

function GooglePanel({ s, now, onClose }: { s: AppStatus; now: number; onClose: () => void }) {
  const g = s.google;
  return (
    <>
      <Head title="Akun Google & kredit Flow" note={`${g.active}/${g.total} aktif · ${compact.format(g.credits)} kredit`} />
      <div className="flex-1 overflow-y-auto">
        {g.list.length === 0 ? (
          <Empty>Belum ada akun Google. Tambahkan di Pengaturan untuk membuat video.</Empty>
        ) : (
          <ul className="py-1">
            {g.list.map((a) => (
              <Row key={a.email} tone={a.status !== "active" ? (a.status === "error" ? "bad" : "warn") : (a.credits ?? 0) < 20 ? "warn" : "ok"} right={a.credits != null ? `${compact.format(a.credits)} kredit` : "–"}>
                <p className="truncate">{a.email}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {a.status === "need_login" ? "Perlu login ulang" : a.status === "error" ? (a.error ?? "Error") : a.syncedAt ? `Dicek ${ago(now - a.syncedAt)}` : "Aktif"}
                </p>
              </Row>
            ))}
          </ul>
        )}
      </div>
      <Foot href="/pengaturan" label="Kelola akun Google" onClose={onClose} />
    </>
  );
}

function AccountsPanel({ s, onClose }: { s: AppStatus; onClose: () => void }) {
  const a = s.accounts;
  return (
    <>
      <Head title="Sesi akun sosial" note={`${a.active} dari ${a.total} aktif`} />
      <div className="flex-1 overflow-y-auto">
        {a.needLogin.length === 0 ? (
          <Empty>{a.total ? "Semua sesi akun aktif." : "Belum ada akun sosial."}</Empty>
        ) : (
          <ul className="py-1">
            {a.needLogin.map((x) => (
              <Row key={`${x.platform}:${x.username}`} tone="warn" right={PLATFORM[x.platform] ?? x.platform}>
                <p className="truncate">@{x.username}</p>
                <p className="text-[11px] text-muted-foreground">Perlu login ulang: upload & sinkron dilewati</p>
              </Row>
            ))}
          </ul>
        )}
      </div>
      <Foot href="/akun" label="Kelola akun sosial" onClose={onClose} />
    </>
  );
}

function UploadLine({ u, children }: { u: UploadRow; children?: React.ReactNode }) {
  return (
    <>
      <p className="truncate"><span className="text-muted-foreground">{PLATFORM[u.platform] ?? u.platform} @{u.account}</span> · {u.title}</p>
      {children}
    </>
  );
}

function UploadsPanel({ s, now, onClose }: { s: AppStatus; now: number; onClose: () => void }) {
  const u = s.uploads;
  return (
    <>
      <Head title="Upload" note={`${u.queued} antre${u.failed.length ? ` · ${u.failed.length} gagal (24 jam)` : ""}`} />
      <div className="flex-1 overflow-y-auto">
        {!u.running && !u.queued && !u.failed.length && <Empty>Tidak ada upload yang menunggu.</Empty>}
        {u.running && (
          <ul className="border-b py-1">
            <Row tone="busy">
              <UploadLine u={u.running}>
                <p className="flex items-center gap-1 text-[11px] text-status-progress"><Loader2 className="size-3 animate-spin" />{u.running.progress ?? "Mengunggah..."}</p>
              </UploadLine>
            </Row>
          </ul>
        )}
        {u.next.length > 0 && (
          <>
            <p className="px-3 pt-2 text-[11px] font-medium text-muted-foreground">Berikutnya{u.queued > u.next.length ? ` (${u.next.length} dari ${u.queued})` : ""}</p>
            <ul className="py-1">
              {u.next.map((x) => (
                <Row key={x.id} tone={x.at < now ? "warn" : "idle"} right={when.format(x.at)}>
                  <UploadLine u={x}>
                    {(x.progress || x.at < now) && <p className="truncate text-[11px] text-muted-foreground">{x.progress ?? "Lewat jadwal, menunggu jeda antar-post"}</p>}
                  </UploadLine>
                </Row>
              ))}
            </ul>
          </>
        )}
        {u.failed.length > 0 && (
          <>
            <p className="px-3 pt-2 text-[11px] font-medium text-destructive">Gagal 24 jam terakhir</p>
            <ul className="py-1">
              {u.failed.map((x) => (
                <Row key={x.id} tone="bad" right={when.format(x.at)}>
                  <UploadLine u={x}><p className="line-clamp-2 text-[11px] text-destructive">{x.error ?? "Gagal"}</p></UploadLine>
                </Row>
              ))}
            </ul>
          </>
        )}
      </div>
      <Foot href="/jadwal" label="Buka Kalender Upload" onClose={onClose} />
    </>
  );
}

function SyncPanel({ s, now, onClose }: { s: AppStatus; now: number; onClose: () => void }) {
  const y = s.sync;
  return (
    <>
      <Head title="Sinkron otomatis" />
      <ul className="py-1">
        {y.now ? (
          <Row tone="busy" right={mmss(now - y.now.startedAt)}>Membaca profil {PLATFORM[y.now.platform]} @{y.now.username}</Row>
        ) : (
          <Row tone="idle">Tidak ada sinkron berjalan</Row>
        )}
        <Row tone={y.lastAt && now - y.lastAt < 2 * y.everyMin * 60_000 ? "ok" : "warn"} right={y.lastAt ? ago(now - y.lastAt) : "belum"}>
          Statistik profil & postingan
          <p className="text-[11px] text-muted-foreground">Otomatis tiap {y.everyMin} menit dan beberapa menit setelah video tayang (dilewati saat upload jalan).</p>
        </Row>
        <Row tone={!y.showcase ? "idle" : y.showcase.failed ? "warn" : "ok"} right={y.showcase ? ago(now - y.showcase.at) : "belum"}>
          Etalase TikTok Shop
          {y.showcase && <p className="text-[11px] text-muted-foreground">{y.showcase.ok} akun berhasil{y.showcase.failed ? `, ${y.showcase.failed} gagal (dicoba lagi nanti)` : ""}</p>}
        </Row>
      </ul>
      <Foot href="/profil" label="Buka Profil & Postingan" onClose={onClose} />
    </>
  );
}

function AppPanel({ s, onClose }: { s: AppStatus; onClose: () => void }) {
  const a = s.app;
  return (
    <>
      <Head title="Traktiva" note={`versi ${a.version}`} />
      <ul className="py-1">
        {a.update ? (
          <Row tone={a.update.mandatory ? "bad" : "warn"}>
            Versi {a.update.version} tersedia{a.update.mandatory ? " (wajib)" : ""}
            <p className="text-[11px] text-muted-foreground">Pasang lewat banner pembaruan di atas halaman.</p>
          </Row>
        ) : (
          <Row tone="ok">Versi terbaru terpasang</Row>
        )}
        <Row tone={a.daysLeft === 0 ? "bad" : a.daysLeft != null && a.daysLeft <= 7 ? "warn" : a.plan ? "ok" : "idle"} right={a.expiresAt ?? undefined}>
          {a.plan ? `Lisensi ${a.plan}` : "Mode pengembangan (tanpa lisensi)"}
          {a.daysLeft != null && <p className="text-[11px] text-muted-foreground">{a.daysLeft ? `Sisa ${a.daysLeft} hari` : "Habis hari ini"}</p>}
        </Row>
      </ul>
      <Foot href="/pengaturan" label="Lisensi di Pengaturan" onClose={onClose} />
    </>
  );
}

const STATE = {
  working: { icon: Loader2, cls: "animate-spin text-status-progress" },
  queued: { icon: Clock, cls: "text-muted-foreground" },
  done: { icon: Check, cls: "text-status-ok" },
  failed: { icon: CircleAlert, cls: "text-destructive" },
} as const;

function TaskPanel({ tasks, exports, now, onClose, onCancel }: { tasks: Task[]; exports: AppStatus["exports"]; now: number; onClose: () => void; onCancel: (t: Task) => void }) {
  return (
    <>
      <Head title="Proses video" note={tasks.length || exports.length ? `${tasks.length} proyek · ${exports.length} export` : undefined} />
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 && exports.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
            <Check className="size-5 text-status-ok" />
            <p className="text-[13px] font-medium">Semua beres</p>
            <p className="text-xs text-muted-foreground">Gambar, video, dan export yang sedang dibuat akan muncul di sini.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {exports.map((x) => (
              <li key={`${x.projectId}:${x.file}`} className="flex items-center gap-2 px-3 py-2.5 text-[12px]">
                <Download className="size-3.5 shrink-0 text-status-progress" />
                <Link href={`/video/${x.projectId}`} onClick={onClose} className="min-w-0 flex-1 truncate hover:underline">
                  Export {x.file} · <span className="font-medium">{x.title}</span>
                </Link>
                <Loader2 className="size-3 shrink-0 animate-spin text-status-progress" />
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{mmss(now - x.startedAt)}</span>
              </li>
            ))}
            {tasks.map((task) => (
              <li key={task.key} className="space-y-2 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Film className="size-3.5 shrink-0 text-status-progress" />
                  <Link href={task.href} onClick={onClose} className="flex min-w-0 flex-1 items-baseline gap-2 hover:underline">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{task.title}</span>
                    {task.total > 0 && <span className="font-mono text-[11px] tabular-nums text-status-progress">{task.pct}%</span>}
                    {task.startedAt && <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{mmss(now - task.startedAt)}</span>}
                  </Link>
                  <button type="button" onClick={() => onCancel(task)} className="shrink-0 rounded-md border border-destructive/40 px-2 py-0.5 text-[11px] font-medium text-destructive hover:bg-destructive/10">Batalkan</button>
                </div>
                <p className="truncate text-[11px] text-muted-foreground">{task.subtitle} · {task.progress ?? "Memproses..."}{task.total ? ` · ${task.done}/${task.total} adegan` : ""}</p>
                {task.total > 1 && (
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-status-progress transition-[width] duration-700" style={{ width: `${task.pct}%` }} />
                  </div>
                )}
                {task.items.length > 0 && (
                  <ul className="space-y-1">
                    {task.items.map((it, i) => {
                      const st = STATE[it.state as keyof typeof STATE] ?? STATE.queued;
                      return (
                        <li key={i} className="flex items-center gap-2 text-[11px]">
                          <st.icon className={`size-3 shrink-0 ${st.cls}`} />
                          <span className="w-24 shrink-0 truncate">{it.label}</span>
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">
                            {it.state === "queued" ? "Menunggu jalur kosong" : it.state === "done" ? "Selesai" : it.state === "failed" ? "Gagal" : it.stage ?? "Sedang dibuat..."}
                          </span>
                          {it.state === "working" && it.pct != null && <span className="w-8 text-right font-mono tabular-nums text-status-progress">{it.pct}%</span>}
                          {it.state === "working" && it.startedAt && <span className="font-mono tabular-nums text-muted-foreground">{mmss(now - it.startedAt)}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
