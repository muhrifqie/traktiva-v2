"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, Loader2, Mic, Music, Pause, Play, Scissors, Sparkles, Trash2, Undo2, Wand2, Zap } from "lucide-react";
import { toast } from "sonner";
import { autoSfx, beatTimes, BUILTIN_SFX, round2, sfxSrc, snapToBeat, uid, type EditSfx, type ProjectEdit } from "@/lib/edit";
import { mediaUrl } from "@/lib/media-url";
import { audioLibrary, deleteLibraryMusic, draftFullScript, fitToVoice, makeFullVoice, pickLibraryMusic, undoFit } from "../project-actions";
import { playMedia } from "@/lib/play-media";

type Lib = Awaited<ReturnType<typeof audioLibrary>>;
const btn = "flex h-7 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium disabled:opacity-50";
const primary = `${btn} bg-primary text-primary-foreground hover:bg-primary/90`;
const secondary = `${btn} border bg-background hover:bg-accent`;
const icon = "grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40";
const card = "space-y-2 rounded-lg border bg-background p-2.5";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Gagal");
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/**
 * Audio tools in the editor's Audio tab: one-take voice-over, fit clips to the voice, music library, sound effects
 * and beat snapping. `apply(e, "reset")` = server already saved a new state (not undoable); "set" = normal edit.
 */
export function AudioTools({
  projectId, edit, patch, now, apply,
}: {
  projectId: number;
  edit: ProjectEdit;
  patch: () => Parameters<typeof makeFullVoice>[1];
  now: () => number;
  apply: (e: ProjectEdit, mode: "set" | "reset") => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [script, setScript] = useState("");
  const [words, setWords] = useState(2);
  const [lib, setLib] = useState<Lib | null>(null);
  const run = async <T,>(key: string, fn: () => Promise<T>) => {
    setBusy(key);
    try {
      return await fn();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };
  useEffect(() => {
    let alive = true;
    audioLibrary().then((l) => alive && setLib(l), () => alive && setLib({ music: [], sfx: [] }));
    return () => void (alive = false);
  }, []);

  const spoken = edit.voices.reduce((a, v) => a + v.dur / v.speed, 0);
  const silence = Math.max(0, edit.duration - spoken);
  const beats = beatTimes(edit.bgm, edit.duration);

  const addSfx = (id: (typeof BUILTIN_SFX)[number]["id"]) => {
    const b = BUILTIN_SFX.find((x) => x.id === id)!;
    const x: EditSfx = { id: uid(), src: sfxSrc(id), name: b.name, start: round2(now()), dur: b.dur, volume: 0.6 };
    apply({ ...edit, sfx: [...edit.sfx, x].sort((a, c) => a.start - c.start) }, "set");
  };
  const toBeat = () => {
    if (!beats.length) return;
    const snap = (t: number) => snapToBeat(t, beats, 0.25);
    const talking = edit.voices.length > 0; // captions follow the voice; only move them in music-only videos
    apply(
      {
        ...edit,
        overlays: edit.overlays.map((o) => ({ ...o, start: snap(o.start) })),
        sfx: edit.sfx.map((x) => (x.name === "Whoosh" ? x : { ...x, start: snap(x.start) })),
        captions: talking ? edit.captions : edit.captions.map((c) => ({ ...c, start: snap(c.start), end: Math.max(snap(c.start) + 0.2, snap(c.end)) })),
      },
      "set",
    );
    toast.success(`Stiker, SFX${talking ? "" : ", dan teks"} dirapatkan ke beat (${edit.bgm?.bpm} BPM)`);
  };

  return (
    <div className="space-y-3">
      {/* one-take voice-over */}
      <div className={card}>
        <p className="flex items-center gap-1.5 text-xs font-medium"><Mic className="size-3.5" /> Voice-over utuh</p>
        <p className="text-[11px] text-muted-foreground">
          Satu naskah dibaca nonstop dari detik 0 sampai akhir (gaya 18/30 video laris), subtitle ikut kata yang diucapkan.
          {edit.voices.length > 0 && <> Sekarang: suara {spoken.toFixed(1)} dtk dari {edit.duration.toFixed(1)} dtk{silence > 1 ? <b className="text-amber-600 dark:text-amber-400"> · {silence.toFixed(1)} dtk hening</b> : null}.</>}
        </p>
        <textarea className="w-full resize-y rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-ring" rows={script ? 4 : 2} value={script} onChange={(e) => setScript(e.target.value)} placeholder={`Tulis naskah (±${Math.round(edit.duration * 2.6)} kata) atau klik "Tulis dengan AI"`} />
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={secondary} disabled={!!busy} onClick={() => run("script", () => draftFullScript(projectId, patch()).then(setScript))}>
            {busy === "script" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Tulis dengan AI
          </button>
          <span className="text-[11px] text-muted-foreground">{script.trim() ? `${script.trim().split(/\s+/).length} kata` : ""}</span>
          <select className="ml-auto h-7 rounded-md border bg-background px-1.5 text-[11px]" value={words} onChange={(e) => setWords(Number(e.target.value))} aria-label="Kata per subtitle">
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} kata/subtitle</option>)}
          </select>
          <button
            type="button"
            className={primary}
            disabled={!!busy || script.trim().split(/\s+/).length < 5}
            onClick={() =>
              run("voice", async () => {
                const r = await makeFullVoice(projectId, patch(), script, words);
                apply(r.edit, "reset");
                toast.success(`Voice-over ${r.spokenSec} dtk${r.timed ? ", subtitle pas per kata" : ""}`);
              })
            }
          >
            {busy === "voice" ? <Loader2 className="size-3.5 animate-spin" /> : <AudioLines className="size-3.5" />} Buat suara
          </button>
        </div>
      </div>

      {/* fit clips to the voice */}
      <div className={card}>
        <p className="flex items-center gap-1.5 text-xs font-medium"><Scissors className="size-3.5" /> Pas-kan klip ke suara</p>
        <p className="text-[11px] text-muted-foreground">Potong bagian hening: tiap klip dipendekkan sampai suaranya selesai, sisanya maju. Video jadi lebih padat.</p>
        <div className="flex gap-1.5">
          <button
            type="button"
            className={secondary}
            disabled={!!busy || !edit.voices.length}
            onClick={() =>
              run("fit", async () => {
                const e = await fitToVoice(projectId, patch());
                apply(e, "reset");
                toast.success(`Durasi ${edit.duration.toFixed(1)} → ${e.duration.toFixed(1)} dtk`);
              })
            }
          >
            {busy === "fit" ? <Loader2 className="size-3.5 animate-spin" /> : <Scissors className="size-3.5" />} Pas-kan sekarang
          </button>
          {edit.beforeFit && (
            <button type="button" className={secondary} disabled={!!busy} onClick={() => run("unfit", async () => apply(await undoFit(projectId), "reset"))}>
              <Undo2 className="size-3.5" /> Kembalikan ({edit.beforeFit.duration.toFixed(1)} dtk)
            </button>
          )}
        </div>
      </div>

      {/* music library */}
      <div className={card}>
        <p className="flex items-center gap-1.5 text-xs font-medium"><Music className="size-3.5" /> Pustaka musik</p>
        {lib === null ? (
          <p className="text-[11px] text-muted-foreground">Memuat...</p>
        ) : lib.music.length ? (
          <div className="grid max-h-44 gap-1 overflow-y-auto">
            {lib.music.map((m) => (
              <div key={m.src} className={`flex items-center gap-2 rounded-md border px-2 py-1 text-[11px] ${edit.bgm?.name === m.name ? "border-primary bg-primary/5" : ""}`}>
                <Preview src={m.src} />
                <span className="min-w-0 flex-1 truncate" title={m.name}>{m.name}</span>
                <span className="font-mono text-muted-foreground">{fmt(m.dur)}{m.bpm ? ` · ${Math.round(m.bpm)} BPM` : ""}</span>
                <button type="button" className={secondary} disabled={!!busy} onClick={() => run("pick", async () => apply({ ...edit, bgm: await pickLibraryMusic(projectId, m.src) }, "set"))}>Pakai</button>
                <button type="button" className={icon} aria-label="Hapus dari pustaka" onClick={() => run("del", async () => setLib({ ...lib, music: await deleteLibraryMusic(m.src) }))}><Trash2 className="size-3.5" /></button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Belum ada. Musik yang kamu tambahkan (tombol di bawah) otomatis masuk pustaka dan bisa dipakai di proyek lain. Pakai musik bebas royalti supaya video tidak dibisukan TikTok.</p>
        )}
        {edit.bgm && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <Zap className="size-3.5" />
            {edit.bgm.bpm ? <>Tempo {Math.round(edit.bgm.bpm)} BPM · {beats.length} beat di video</> : "Tempo musik ini belum diketahui"}
            <button type="button" className={`${secondary} ml-auto`} disabled={!beats.length} onClick={toBeat} title="Geser stiker & SFX (dan teks di video tanpa suara) ke beat terdekat">
              <Wand2 className="size-3.5" /> Rapatkan ke beat
            </button>
          </div>
        )}
        {edit.bgm && edit.voices.length > 0 && <p className="text-[11px] text-muted-foreground">Musik otomatis mengecil saat voice-over bicara (ducking).</p>}
      </div>

      {/* sound effects */}
      <div className={card}>
        <div className="flex items-center gap-1.5">
          <p className="flex flex-1 items-center gap-1.5 text-xs font-medium"><Sparkles className="size-3.5" /> Efek suara (SFX) <span className="font-normal text-muted-foreground">· {edit.sfx.length}</span></p>
          {edit.sfx.length > 0 && <button type="button" className={icon} title="Hapus semua SFX" onClick={() => apply({ ...edit, sfx: [] }, "set")}><Trash2 className="size-3.5" /></button>}
        </div>
        <button type="button" className={secondary} onClick={() => apply({ ...edit, sfx: autoSfx(edit) }, "set")} title="Whoosh di tiap pergantian scene, pop saat stiker muncul, ding di harga">
          <Wand2 className="size-3.5" /> SFX otomatis
        </button>
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-muted-foreground">Tambah di playhead:</span>
          {BUILTIN_SFX.map((s) => (
            <span key={s.id} className="flex items-center rounded-full border">
              <Preview src={sfxSrc(s.id)} small />
              <button type="button" className="h-6 pr-2 text-[11px] hover:text-foreground" onClick={() => addSfx(s.id)}>{s.name}</button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Tiny play/stop button for a library file. */
function Preview({ src, small }: { src: string; small?: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  return (
    <>
      <audio ref={ref} src={mediaUrl(src)} preload="none" onEnded={() => setOn(false)} onPause={() => setOn(false)} />
      <button
        type="button"
        className={small ? "grid size-6 place-items-center rounded-full text-muted-foreground hover:text-foreground" : icon}
        aria-label={on ? "Stop" : "Dengar"}
        onClick={() => {
          const a = ref.current;
          if (!a) return;
          if (on) a.pause();
          else {
            a.currentTime = 0;
            void playMedia(a);
            setOn(true);
          }
        }}
      >
        {on ? <Pause className="size-3" /> : <Play className="size-3" />}
      </button>
    </>
  );
}
