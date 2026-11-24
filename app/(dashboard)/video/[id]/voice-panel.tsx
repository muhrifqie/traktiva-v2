"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Loader2, Mic, MicOff, Pause, Play, Volume2 } from "lucide-react";
import { CartesiaIcon, VeoIcon } from "@/components/brand-icons";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { VoiceChoice } from "@/lib/voice";
import { previewVoiceLine, setProjectVoice } from "../project-actions";
import { isAbortError } from "@/lib/play-media";

export type VoiceOption = { id: string; name: string; description: string; gender: string | null };
export type ProjectVoiceState = { choice: VoiceChoice; voiceId: string | null; voiceName: string | null; speed: number };

const CHOICES: { id: VoiceChoice; label: string; icon: (p: { className?: string }) => React.ReactNode; ready: boolean; hint: string }[] = [
  { id: "flow", label: "Bawaan Flow", icon: VeoIcon, ready: true, hint: "Suara langsung dari video AI" },
  { id: "cartesia", label: "Cartesia", icon: CartesiaIcon, ready: true, hint: "Suara manusiawi, dibuat terpisah lalu digabung" },
  { id: "off", label: "Tanpa suara", icon: MicOff, ready: true, hint: "Senyap, tambah musik sendiri" },
];
const SPEEDS = [0.9, 1, 1.1, 1.2];
const gender = (g: string | null) => (/fem/i.test(g ?? "") ? "cewek" : /mas/i.test(g ?? "") ? "cowok" : "");

/** Shared audio player so only one sample plays at a time. */
function usePlayer() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const play = async (key: string, getUrl: () => Promise<string>) => {
    if (playing === key) {
      audio.current?.pause();
      setPlaying(null);
      return;
    }
    setLoading(key);
    try {
      const url = await getUrl();
      audio.current?.pause();
      audio.current = new Audio(url);
      audio.current.onended = () => setPlaying(null);
      await audio.current.play();
      setPlaying(key);
    } catch (e) {
      if (!isAbortError(e)) toast.error(e instanceof Error ? e.message : "Gagal memutar");
    } finally {
      setLoading(null);
    }
  };
  return { play, playing, loading };
}

/** Storyboard voice panel: who speaks this project's voice-over (before render). */
export function VoicePanel({
  projectId, state, voices, hasKey, disabled, locked, onSaved,
}: { projectId: number; state: ProjectVoiceState; voices: VoiceOption[]; hasKey: boolean; disabled: boolean; locked?: string | null; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const { play, playing, loading } = usePlayer();
  const current = voices.find((v) => v.id === state.voiceId) ?? null;

  const save = async (patch: Partial<{ voice: VoiceChoice; voiceId: string; voiceName: string; voiceSpeed: number }>) => {
    setSaving(true);
    try {
      await setProjectVoice(projectId, { voice: patch.voice ?? state.choice, voiceId: patch.voiceId ?? state.voiceId ?? undefined, voiceName: patch.voiceName ?? state.voiceName ?? undefined, voiceSpeed: patch.voiceSpeed ?? state.speed });
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal");
    } finally {
      setSaving(false);
    }
  };

  if (locked) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
        <MicOff className="size-4" /> {locked}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold"><Mic className="size-3.5 text-black dark:text-white" /> Suara voice-over</span>
        {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        <span className="text-[11px] text-muted-foreground">dipilih per proyek sebelum render · mengganti suara membuat klip perlu dirender ulang</span>
      </div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Sumber suara">
        {CHOICES.map((c) => {
          const on = state.choice === c.id;
          const blocked = c.id === "cartesia" && !hasKey;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled || saving || !c.ready || on}
              title={blocked ? "Masukkan API key Cartesia di Pengaturan dulu" : c.hint}
              onClick={() => (blocked ? toast.error("Masukkan API key Cartesia di Pengaturan dulu.") : save({ voice: c.id as VoiceChoice }))}
              className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed ${on ? "border-primary/50 bg-primary/10 text-foreground" : c.ready ? "bg-card text-muted-foreground hover:text-foreground" : "bg-card text-muted-foreground opacity-50"}`}
            >
              {on ? <Check className="size-3.5 text-brand-light" /> : <c.icon className="size-3.5" />}
              {c.label}
              {!c.ready && <span className="rounded-full bg-muted px-1.5 text-[10px]">Segera</span>}
            </button>
          );
        })}
      </div>

      {state.choice === "cartesia" && (
        hasKey ? (
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger disabled={disabled || saving} className="flex h-8 min-w-48 items-center gap-2 rounded-lg border bg-card px-2.5 text-left text-xs font-medium outline-none hover:bg-accent disabled:opacity-60">
                <Volume2 className="size-3.5 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{current ? `${current.name} · ${gender(current.gender)}` : state.voiceName ?? "Pilih suara"}</span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                {voices.map((v) => (
                  <DropdownMenuItem key={v.id} onClick={() => v.id !== state.voiceId && save({ voiceId: v.id, voiceName: v.name })} className="gap-2 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px]">{v.name} <span className="text-[11px] text-muted-foreground">{gender(v.gender)}</span></span>
                      <span className="block truncate text-[10px] text-muted-foreground">{v.description}</span>
                    </span>
                    {v.id === state.voiceId && <Check className="size-3.5 text-brand-light" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {state.voiceId && (
              <button
                type="button"
                onClick={() => play("sample", () => previewVoiceLine("Halo! Ini suaraku buat video kamu. Cek keranjang di bawah ya!", state.voiceId!, state.speed))}
                className="flex h-8 items-center gap-1 rounded-lg border bg-card px-2.5 text-xs font-medium hover:bg-accent"
              >
                {loading === "sample" ? <Loader2 className="size-3.5 animate-spin" /> : playing === "sample" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} Contoh
              </button>
            )}
            <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Kecepatan bicara">
              {SPEEDS.map((sp) => (
                <button key={sp} type="button" disabled={disabled || saving} onClick={() => sp !== state.speed && save({ voiceSpeed: sp })} className={`h-7 rounded-md px-2 text-[11px] font-medium ${state.speed === sp ? "bg-background shadow-xs ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}>
                  {sp}×
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Cartesia belum tersambung. <Link href="/pengaturan" className="font-medium text-brand-light underline">Masukkan API key di Pengaturan</Link>.</p>
        )
      )}
    </div>
  );
}

/** One scene's spoken line, with a ▶ to hear it in the chosen Cartesia voice. */
export function SceneVoiceLine({ line, state, hasKey, player }: { line: string | null; state: ProjectVoiceState; hasKey: boolean; player: ReturnType<typeof usePlayer> }) {
  if (state.choice === "off") return null;
  if (!line) return <p className="text-[10px] text-muted-foreground">Tanpa naskah suara di scene ini.</p>;
  const canPlay = state.choice === "cartesia" && hasKey && state.voiceId;
  const key = `line:${line}`;
  return (
    <div className="flex items-start gap-1.5 rounded-md bg-muted/60 px-2 py-1.5 text-[11px]">
      {canPlay ? (
        <button type="button" onClick={() => player.play(key, () => previewVoiceLine(line, state.voiceId!, state.speed))} aria-label="Dengar naskah" className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-background hover:bg-accent">
          {player.loading === key ? <Loader2 className="size-3 animate-spin" /> : player.playing === key ? <Pause className="size-3" /> : <Play className="size-3" />}
        </button>
      ) : (
        <Volume2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0">
        <span className="text-muted-foreground">Naskah: </span>“{line}”
        {state.choice === "flow" && <span className="text-muted-foreground"> · dibacakan Flow</span>}
      </span>
    </div>
  );
}

export { usePlayer };
