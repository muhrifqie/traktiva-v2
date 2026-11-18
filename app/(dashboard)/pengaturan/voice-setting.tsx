"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound, Loader2, Mic, Pause, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { chooseCartesiaVoice, previewCartesiaVoice, removeCartesiaKey, saveCartesiaKey, setVoiceProvider, setVoiceSpeed } from "./actions";

type Voice = { id: string; name: string; description: string; gender: string | null };

const PROVIDERS = [
  { id: "flow", label: "Bawaan Flow", hint: "Suara langsung dari video AI. Gratis, tapi kadang kurang natural.", ready: true },
  { id: "cartesia", label: "Cartesia", hint: "Suara manusiawi (Sonic 3.6), bahasa Indonesia natural. Pakai kredit Cartesia.", ready: true },
  { id: "elevenlabs", label: "ElevenLabs", hint: "Segera hadir.", ready: false },
] as const;
const SPEEDS = [0.9, 1, 1.1, 1.2];

export function VoiceSetting({
  provider, hasKey, maskedKey, voiceId, voices, speed,
}: { provider: string; hasKey: boolean; maskedKey: string | null; voiceId: string | null; voices: Voice[]; speed: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [key, setKey] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const run = (fn: () => Promise<unknown>, ok?: string) =>
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal");
      }
    });

  const preview = async (id: string) => {
    if (playing === id) {
      audio.current?.pause();
      setPlaying(null);
      return;
    }
    setLoadingPreview(id);
    try {
      const url = await previewCartesiaVoice(id);
      audio.current?.pause();
      audio.current = new Audio(url);
      audio.current.onended = () => setPlaying(null);
      await audio.current.play();
      setPlaying(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memutar contoh");
    } finally {
      setLoadingPreview(null);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-[#ff3b6b1a] text-[#ff3b6b]"><Mic className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold">Suara voice-over · default</h2>
          <p className="text-xs text-muted-foreground">Pilihan awal untuk proyek baru. Tiap proyek tetap bisa memilih suaranya sendiri di Storyboard sebelum render. Pilih Cartesia untuk memasang API key-nya.</p>
        </div>
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Sumber suara">
        {PROVIDERS.map((p) => {
          const on = provider === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={pending || !p.ready}
              onClick={() => !on && run(() => setVoiceProvider(p.id), `Suara: ${p.label}`)}
              className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed ${on ? "border-primary/50 bg-primary/10" : p.ready ? "bg-background hover:bg-accent" : "bg-background opacity-50"}`}
            >
              <span className="flex items-center gap-1.5 text-[13px] font-medium">
                {on && <Check className="size-3.5 text-brand-light" />}
                {p.label}
                {!p.ready && <span className="ml-auto rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">Segera</span>}
              </span>
              <span className="text-[11px] leading-snug text-muted-foreground">{p.hint}</span>
            </button>
          );
        })}
      </div>

      {/* Cartesia setup: only when Cartesia is the chosen voice (Flow's own voice needs no key) */}
      {provider === "cartesia" && (
        <div className="space-y-3 rounded-lg border bg-background p-3">
          <div className="flex flex-wrap items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium">API key Cartesia</span>
            {hasKey ? (
              <>
                <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{maskedKey}</code>
                <button type="button" disabled={pending} onClick={() => run(removeCartesiaKey, "API key dihapus")} className="ml-auto flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-destructive">
                  <Trash2 className="size-3.5" /> Hapus
                </button>
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground">belum diisi · dapatkan di play.cartesia.ai/keys</span>
            )}
          </div>
          {!hasKey && (
            <div className="flex gap-2">
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk_car_..." autoComplete="off" className="h-9 min-w-0 flex-1 rounded-lg border bg-card px-3 font-mono text-xs outline-none focus:border-ring" />
              <button type="button" disabled={pending || key.trim().length < 12} onClick={() => run(async () => { const n = await saveCartesiaKey(key); setKey(""); toast.success(`Tersambung · ${n} suara Indonesia`); })} className="flex h-9 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                Simpan
              </button>
            </div>
          )}

          {hasKey && voices.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium">Suara</span>
                <span className="text-[11px] text-muted-foreground">klik ▶ untuk dengar contoh (memakai sedikit kredit)</span>
                <div className="ml-auto flex items-center gap-1 rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Kecepatan bicara">
                  {SPEEDS.map((sp) => (
                    <button key={sp} type="button" disabled={pending} onClick={() => sp !== speed && run(() => setVoiceSpeed(sp))} className={`h-7 rounded-md px-2 text-[11px] font-medium ${speed === sp ? "bg-background shadow-xs ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}>
                      {sp}×
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                {voices.map((v) => {
                  const on = v.id === voiceId;
                  return (
                    <div key={v.id} className={`flex items-center gap-2 rounded-lg border p-2 ${on ? "border-primary/50 bg-primary/10" : "bg-card"}`}>
                      <button
                        type="button"
                        onClick={() => preview(v.id)}
                        aria-label={`Dengar contoh ${v.name}`}
                        className="grid size-8 shrink-0 place-items-center rounded-full bg-muted hover:bg-accent"
                      >
                        {loadingPreview === v.id ? <Loader2 className="size-3.5 animate-spin" /> : playing === v.id ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                      </button>
                      <button type="button" disabled={pending || on} onClick={() => run(() => chooseCartesiaVoice(v.id, v.name), `Suara: ${v.name}`)} className="min-w-0 flex-1 text-left">
                        <span className="flex items-center gap-1 text-xs font-medium">
                          {v.name}
                          <span className="text-[10px] font-normal text-muted-foreground">{/fem/i.test(v.gender ?? "") ? "cewek" : /mas/i.test(v.gender ?? "") ? "cowok" : ""}</span>
                          {on && <Check className="ml-auto size-3.5 text-brand-light" />}
                        </span>
                        <span className="line-clamp-1 text-[10px] text-muted-foreground" title={v.description}>{v.description}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
