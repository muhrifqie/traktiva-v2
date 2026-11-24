"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, KeyRound, Loader2, Mic, Pause, Play, Trash2 } from "lucide-react";
import { CartesiaIcon, VeoIcon } from "@/components/brand-icons";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { chooseCartesiaVoice, previewCartesiaVoice, removeCartesiaKey, saveCartesiaKey, setVoiceProvider, setVoiceSpeed } from "./actions";
import { isAbortError } from "@/lib/play-media";

type Voice = { id: string; name: string; description: string; gender: string | null };

const PROVIDERS = [
  { id: "flow", label: "Bawaan Flow", icon: VeoIcon, hint: "Suara langsung dari video AI. Gratis, tanpa pengaturan." },
  { id: "cartesia", label: "Cartesia", icon: CartesiaIcon, hint: "Suara lebih manusiawi, bahasa Indonesia natural. Pakai API key & kredit Cartesia." },
] as const;
const SPEEDS = [0.9, 1, 1.1, 1.2];
const genderOf = (g: string | null) => (/fem/i.test(g ?? "") ? "cewek" : /mas/i.test(g ?? "") ? "cowok" : "");

/**
 * Default voice-over source for new projects. Flow is the default; the Cartesia part (API key, voice, speed)
 * only shows while Cartesia is picked. Picking Cartesia without a key opens the key form instead of failing;
 * saving the key switches the default to Cartesia.
 */
export function VoiceSetting({
  provider, hasKey, maskedKey, voiceId, voices, speed,
}: { provider: string; hasKey: boolean; maskedKey: string | null; voiceId: string | null; voices: Voice[]; speed: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [key, setKey] = useState("");
  // Cartesia picked but no key saved yet: show the key form without changing the saved default
  const [wantCartesia, setWantCartesia] = useState(false);
  const selected = provider === "cartesia" || wantCartesia ? "cartesia" : "flow";
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

  const pick = (id: "flow" | "cartesia") => {
    if (id === selected) return;
    if (id === "cartesia" && !hasKey) return setWantCartesia(true);
    setWantCartesia(false);
    if (id !== provider) run(() => setVoiceProvider(id), `Suara default: ${PROVIDERS.find((p) => p.id === id)!.label}`);
  };

  const saveKey = () =>
    run(async () => {
      const n = await saveCartesiaKey(key);
      setKey("");
      setWantCartesia(false);
      toast.success(`Cartesia tersambung · ${n} suara Indonesia`);
    });

  const removeKey = async () => {
    if (!(await confirmDialog({ title: "Hapus API key Cartesia?", description: "Suara default kembali ke Bawaan Flow.", confirmLabel: "Hapus", danger: true }))) return;
    run(removeCartesiaKey, "API key dihapus · suara kembali ke Bawaan Flow");
  };

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
      if (!isAbortError(e)) toast.error(e instanceof Error ? e.message : "Gagal memutar contoh");
    } finally {
      setLoadingPreview(null);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-muted text-black dark:text-white"><Mic className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold">Suara voice-over</h2>
          <p className="text-xs text-muted-foreground">Suara default untuk proyek baru. Tiap proyek tetap bisa memilih suaranya sendiri di Studio.</p>
        </div>
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Sumber suara">
        {PROVIDERS.map((p) => {
          const on = selected === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={pending}
              onClick={() => pick(p.id)}
              className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors disabled:opacity-70 ${on ? "border-primary/50 bg-primary/10" : "bg-background hover:bg-accent"}`}
            >
              <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border ${on ? "border-primary bg-primary text-primary-foreground" : ""}`}>
                {on && <Check className="size-2.5" />}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[13px] font-medium">
                  <p.icon className="size-4" />
                  {p.label}
                  {p.id === "flow" && <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-normal text-muted-foreground">default</span>}
                </span>
                <span className="block text-[11px] leading-snug text-muted-foreground">{p.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {selected === "cartesia" && (
        <div className="space-y-4 border-t pt-4">
          {/* API key: a form until saved, then one status row */}
          {hasKey ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background px-3 py-2">
              <KeyRound className="size-4 text-muted-foreground" />
              <span className="text-xs font-medium">API key Cartesia</span>
              <span className="rounded-full bg-status-ok/10 px-1.5 py-px text-[10px] font-medium text-status-ok">Tersambung</span>
              <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{maskedKey}</code>
              <button type="button" disabled={pending} onClick={removeKey} className="ml-auto flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-destructive">
                <Trash2 className="size-3.5" /> Hapus
              </button>
            </div>
          ) : (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                saveKey();
              }}
            >
              <label htmlFor="cartesia-key" className="flex items-center gap-1.5 text-xs font-medium">
                <KeyRound className="size-3.5 text-muted-foreground" /> API key Cartesia
              </label>
              <div className="flex gap-2">
                <input
                  id="cartesia-key"
                  type="password"
                  autoFocus
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="sk_car_..."
                  autoComplete="off"
                  className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 font-mono text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
                <button type="submit" disabled={pending || key.trim().length < 12} className="flex h-9 items-center rounded-lg bg-primary px-3.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                  Simpan & sambungkan
                </button>
              </div>
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                Belum punya? Buat di
                <a href="https://play.cartesia.ai/keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-foreground hover:underline">
                  play.cartesia.ai/keys <ExternalLink className="size-3" />
                </a>
                · suara default pindah ke Cartesia setelah tersambung.
              </p>
            </form>
          )}

          {hasKey && voices.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div>
                  <p className="text-xs font-medium">Pilih suara</p>
                  <p className="text-[11px] text-muted-foreground">Klik ▶ untuk dengar contoh (memakai sedikit kredit).</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Kecepatan</span>
                  <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Kecepatan bicara">
                    {SPEEDS.map((sp) => (
                      <button key={sp} type="button" role="radio" aria-checked={speed === sp} disabled={pending} onClick={() => sp !== speed && run(() => setVoiceSpeed(sp))} className={`h-7 rounded-md px-2 text-[11px] font-medium ${speed === sp ? "bg-background shadow-xs ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}>
                        {sp}×
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                {voices.map((v) => {
                  const on = v.id === voiceId;
                  return (
                    <div key={v.id} className={`flex items-center gap-2 rounded-lg border p-2 ${on ? "border-primary/50 bg-primary/10" : "bg-background"}`}>
                      <button type="button" onClick={() => preview(v.id)} aria-label={`Dengar contoh ${v.name}`} className="grid size-8 shrink-0 place-items-center rounded-full bg-muted hover:bg-accent">
                        {loadingPreview === v.id ? <Loader2 className="size-3.5 animate-spin" /> : playing === v.id ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                      </button>
                      <button type="button" disabled={pending || on} onClick={() => run(() => chooseCartesiaVoice(v.id, v.name), `Suara: ${v.name}`)} className="min-w-0 flex-1 text-left">
                        <span className="flex items-center gap-1 text-xs font-medium">
                          <span className="truncate">{v.name}</span>
                          {genderOf(v.gender) && <span className="shrink-0 text-[10px] font-normal text-muted-foreground">{genderOf(v.gender)}</span>}
                          {on && <Check className="ml-auto size-3.5 shrink-0 text-brand-light" />}
                        </span>
                        <span className="line-clamp-1 text-[10px] text-muted-foreground" title={v.description}>{v.description}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
