"use client";

// YouTube Editor → settings column: four tabs (Tata letak, Waktu, Teks, Suara) and the render summary underneath.

import { useEffect, useRef, useState } from "react";
import {
  Blend, Clock, Crop, FlipHorizontal2, Frame, LayoutPanelLeft, Layers, Maximize2, Move, Music, Palette, PictureInPicture2, Play, Plus, Ratio, Scissors, Shuffle, Square,
  Timer, Type, Video, Volume2, VolumeX, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { mediaUrl } from "@/lib/media-url";
import { ASPECTS, PIP_RANGE, RATIO_RANGE, type Aspect, type EditorSettings, type Fill, type Fit, type Flip, type Seam } from "@/lib/youtube-editor-config";
import { musicList, uploadEditorMusic } from "./actions";
import { FLIPS, fmt, ON, Row, Section, Segmented, SHAPES, Slider } from "./ui";

type PanelTab = "layout" | "time" | "text" | "sound";
const TAB_KEY = "trk-yt-editor-settings-tab";
const TABS: { v: PanelTab; label: string; icon: typeof Clock }[] = [
  { v: "layout", label: "Tata letak", icon: LayoutPanelLeft },
  { v: "time", label: "Waktu", icon: Clock },
  { v: "text", label: "Teks", icon: Type },
  { v: "sound", label: "Suara", icon: Music },
];

export function SettingsPanel({
  cfg, set, setMany, running, gameLen, random, initialMusic, footer,
}: {
  cfg: EditorSettings;
  set: <K extends keyof EditorSettings>(k: K, v: EditorSettings[K]) => void;
  setMany: (patch: Partial<EditorSettings>) => void;
  running: boolean;
  gameLen: number;
  random: boolean;
  initialMusic: { src: string; name: string; dur: number }[];
  footer: React.ReactNode;
}) {
  const [tab, setTab] = useState<PanelTab>("layout");
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const v = localStorage.getItem(TAB_KEY) as PanelTab | null;
        if (v && TABS.some((x) => x.v === v)) setTab(v);
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const pickTab = (v: PanelTab) => {
    setTab(v);
    try {
      localStorage.setItem(TAB_KEY, v);
    } catch {}
  };
  // what each tab holds, so its button can show it is in use
  const badge: Record<PanelTab, string | null> = {
    layout: null,
    time: cfg.maxLen || cfg.trimStart ? "•" : null,
    text: cfg.textMode !== "none" ? "•" : null,
    sound: cfg.music ? "•" : null,
  };

  // ---- music (shared Pustaka) ----
  const [music, setMusic] = useState(initialMusic);
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState<string | null>(null);
  const ear = useRef<HTMLAudioElement>(null);
  const listen = (src: string) => {
    const a = ear.current!;
    if (listening === src) {
      a.pause();
      setListening(null);
      return;
    }
    a.src = mediaUrl(src);
    a.volume = 0.6;
    void a.play();
    setListening(src);
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.set("music", file);
    const r = await uploadEditorMusic(fd);
    setUploading(false);
    if ("error" in r) return toast.error(r.error);
    setMusic(await musicList());
    set("music", r.ok!.src);
    toast.success(`Musik "${r.ok!.name}" ditambahkan`);
  };

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
      <div className="grid grid-cols-4 gap-1 border-b p-1.5" role="tablist" aria-label="Setelan">
        {TABS.map(({ v, label, icon: Icon }) => (
          <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => pickTab(v)} className={`relative flex h-11 flex-col items-center justify-center gap-0.5 rounded-md text-xs font-medium transition-colors ${tab === v ? "bg-amber-500/15 text-orange-700 dark:text-amber-200" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
            <Icon className="size-4" />
            {label}
            {badge[v] && <span className="absolute top-1.5 right-2 size-1.5 rounded-full bg-orange-500" />}
          </button>
        ))}
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {tab === "layout" && (
          <>
          {cfg.layout === "pip" ? (
            <>
              <Section icon={PictureInPicture2} tone="bg-rose-500/15 text-rose-400" title="Overlay" value={`${cfg.pipSize}% lebar`}>
                <Segmented value={cfg.pipMain} onChange={(v) => set("pipMain", v)} disabled={running} items={[{ v: "original", label: "Asli di belakang" }, { v: "game", label: "Overlay di belakang" }]} />
                <Row icon={Frame} label="Bentuk">
                  <div className="grid grid-cols-3 gap-1">
                    {SHAPES.map((sh) => (
                      <button key={sh.v} type="button" onClick={() => set("pipShape", sh.v)} disabled={running} aria-pressed={cfg.pipShape === sh.v} className={`flex h-8 items-center justify-center gap-1.5 rounded-md border text-xs ${cfg.pipShape === sh.v ? ON : "hover:bg-accent"}`}>
                        <span className="size-3 border-[1.5px] border-current" style={{ borderRadius: sh.radius }} /> {sh.label}
                      </button>
                    ))}
                  </div>
                </Row>
                <Row icon={Maximize2} label="Ukuran">
                  <div className="flex items-center gap-2">
                    <Slider label="Ukuran overlay" value={cfg.pipSize} min={PIP_RANGE[0]} max={PIP_RANGE[1]} onChange={(v) => set("pipSize", v)} disabled={running} />
                    <span className="w-9 shrink-0 text-right text-xs tabular-nums">{cfg.pipSize}%</span>
                  </div>
                </Row>
                <Row icon={Move} label="Posisi">
                  <div className="grid w-fit grid-cols-3 gap-1">
                    {[0, 50, 100].flatMap((y) => [0, 50, 100].map((x) => ({ x, y }))).map(({ x, y }) => {
                      const on = cfg.pipX === x && cfg.pipY === y;
                      return (
                        <button key={`${x}-${y}`} type="button" onClick={() => setMany({ pipX: x, pipY: y })} disabled={running} aria-label={`Posisi ${x}% ${y}%`} className={`relative size-7 rounded-md border ${on ? ON : "hover:bg-accent"}`}>
                          <span className={`absolute size-2 rounded-sm ${on ? "bg-orange-500" : "bg-muted-foreground/50"}`} style={{ left: `calc(${x}% * 0.55 + 3px)`, top: `calc(${y}% * 0.55 + 3px)` }} />
                        </button>
                      );
                    })}
                  </div>
                </Row>
              </Section>
              <Section icon={Scissors} tone="bg-red-500/15 text-red-400" title="Crop overlay" value={cfg.pipShape === "circle" ? "1:1" : cfg.pipAspect}>
                <div className="grid grid-cols-5 gap-1">
                  {(Object.keys(ASPECTS) as Aspect[]).map((a) => {
                    const on = cfg.pipShape === "circle" ? a === "1:1" : cfg.pipAspect === a;
                    const r = ASPECTS[a];
                    return (
                      <button key={a} type="button" onClick={() => set("pipAspect", a)} disabled={running || cfg.pipShape === "circle"} aria-pressed={on} className={`flex h-11 flex-col items-center justify-center gap-1 rounded-md border text-[11px] tabular-nums disabled:opacity-50 ${on ? ON : "hover:bg-accent"}`}>
                        <span className="block rounded-[2px] border-[1.5px] border-current" style={r >= 1 ? { width: 16, height: Math.round(16 / r) } : { height: 16, width: Math.round(16 * r) }} />
                        {a}
                      </button>
                    );
                  })}
                </div>
                {cfg.pipShape === "circle" && <p className="text-xs text-muted-foreground">Lingkaran selalu 1:1.</p>}
                <Row icon={Scissors} label="Zoom">
                  <div className="flex items-center gap-2">
                    <Slider label="Zoom crop" value={cfg.pipZoom} min={100} max={300} step={10} onChange={(v) => set("pipZoom", v)} disabled={running} />
                    <span className="w-9 shrink-0 text-right text-xs tabular-nums">{(cfg.pipZoom / 100).toFixed(1)}×</span>
                  </div>
                </Row>
                <Row icon={Move} label="Geser ←→">
                  <Slider label="Fokus crop kiri-kanan" value={cfg.pipFocusX} min={0} max={100} onChange={(v) => set("pipFocusX", v)} disabled={running} />
                </Row>
                <Row icon={Move} label="Geser ↑↓">
                  <Slider label="Fokus crop atas-bawah" value={cfg.pipFocusY} min={0} max={100} onChange={(v) => set("pipFocusY", v)} disabled={running} />
                </Row>
              </Section>
              <Section icon={Frame} tone="bg-stone-500/20 text-stone-300" title="Bingkai">
                <Segmented value={String(cfg.pipBorder) as "0" | "1" | "2" | "3"} onChange={(v) => set("pipBorder", Number(v) as 0 | 1 | 2 | 3)} disabled={running} items={[{ v: "0", label: "Tanpa" }, { v: "1", label: "Tipis" }, { v: "2", label: "Sedang" }, { v: "3", label: "Tebal" }]} />
                <div className="grid grid-cols-2 gap-1">
                  {([["white", "Putih", "#fff"], ["black", "Hitam", "#000"]] as const).map(([v, label, bg]) => (
                    <button key={v} type="button" onClick={() => set("pipBorderColor", v)} disabled={running || !cfg.pipBorder} aria-pressed={cfg.pipBorderColor === v} className={`flex h-8 items-center justify-center gap-1.5 rounded-md border text-xs disabled:opacity-50 ${cfg.pipBorderColor === v ? ON : "hover:bg-accent"}`}>
                      <span className="size-3 rounded-full border" style={{ background: bg }} /> {label}
                    </button>
                  ))}
                </div>
              </Section>
            </>
          ) : (
            <Section icon={Ratio} tone="bg-rose-500/15 text-rose-400" title="Porsi asli : overlay" value={`${cfg.ratio} : ${100 - cfg.ratio}`}>
              <Slider label="Porsi video asli" value={cfg.ratio} min={RATIO_RANGE[0]} max={RATIO_RANGE[1]} onChange={(v) => set("ratio", v)} disabled={running} />
              <div className="flex gap-1">
                {[50, 60, 70].map((r) => (
                  <button key={r} type="button" onClick={() => set("ratio", r)} disabled={running} className={`h-7 flex-1 rounded-md border text-xs tabular-nums ${cfg.ratio === r ? ON : "border-transparent bg-muted text-muted-foreground hover:text-foreground"}`}>{r} : {100 - r}</button>
                ))}
              </div>
              <Row icon={Blend} label="Garis tengah">
                <Segmented value={String(cfg.seam) as "0" | "24" | "64"} onChange={(v) => set("seam", Number(v) as Seam)} disabled={running} items={[{ v: "0", label: "Tajam" }, { v: "24", label: "Halus" }, { v: "64", label: "Lembut" }]} />
              </Row>
            </Section>
          )}
          <Section icon={Crop} tone="bg-amber-500/15 text-amber-500" title="Tampilan">
            {([["fitOriginal", "Video asli", Video], ["fitGame", "Overlay", Layers]] as const).map(([k, label, Icon]) => (
              <Row key={k} icon={Icon} label={label}>
                <Segmented value={cfg[k]} onChange={(v: Fit) => set(k, v)} disabled={running} items={[{ v: "cover", label: "Penuh", title: "Memenuhi bagiannya, tepi terpotong" }, { v: "contain", label: "Utuh", title: "Tidak terpotong, sisanya diisi warna latar" }]} />
              </Row>
            ))}
            <Row icon={Palette} label="Latar">
              <div className="grid grid-cols-3 gap-1">
                {([["blur", "Blur", "linear-gradient(135deg,#94a3b8,#475569)"], ["black", "Hitam", "#000"], ["white", "Putih", "#fff"]] as [Fill, string, string][]).map(([v, label, bg]) => (
                  <button key={v} type="button" onClick={() => set("fill", v)} disabled={running} aria-pressed={cfg.fill === v} className={`flex h-8 items-center justify-center gap-1 rounded-md border text-xs font-medium disabled:opacity-50 ${cfg.fill === v ? ON : "hover:bg-accent"}`}>
                    <span className="size-3 rounded-full border" style={{ background: bg }} /> {label}
                  </button>
                ))}
              </div>
            </Row>
          </Section>
          <Section icon={FlipHorizontal2} tone="bg-orange-500/15 text-orange-400" title="Cermin / balik">
            {([["flipOriginal", "Video asli", Video], ["flipGame", "Overlay", Layers]] as const).map(([k, label, Icon]) => (
              <Row key={k} icon={Icon} label={label}>
                <Segmented value={cfg[k]} onChange={(v: Flip) => set(k, v)} disabled={running} items={FLIPS} />
              </Row>
            ))}
          </Section>
          </>
        )}
        {tab === "time" && (
          <>
          <Section icon={Play} tone="bg-yellow-500/15 text-yellow-500" title="Mulai overlay" value={cfg.gameStart === -1 ? "acak" : cfg.gameStart === -2 ? "bersambung" : `detik ${fmt(cfg.gameStart)}`}>
            <Segmented
              value={cfg.gameStart === -1 ? "acak" : cfg.gameStart === -2 ? "sambung" : "pilih"}
              onChange={(v) => set("gameStart", v === "acak" ? -1 : v === "sambung" ? -2 : 0)}
              disabled={running}
              items={[
                { v: "acak", label: <><Shuffle className="size-3.5" /> Acak</>, title: "Tiap video mulai dari titik acak" },
                { v: "sambung", label: "Bersambung", title: "Video berikutnya melanjutkan overlay dari titik video sebelumnya berhenti: tidak ada bagian yang terulang" },
                { v: "pilih", label: <><Timer className="size-3.5" /> Detik…</>, title: "Semua video mulai dari detik yang sama" },
              ]}
            />
            {cfg.gameStart >= 0 && (
              <div className="flex items-center gap-2">
                <Slider label="Detik mulai overlay" value={Math.min(cfg.gameStart, Math.max(1, Math.floor(gameLen) - 1))} min={0} max={Math.max(1, Math.floor(gameLen) - 1)} step={1} onChange={(v) => set("gameStart", v)} disabled={running} />
                <input type="number" aria-label="Detik mulai" min={0} max={Math.floor(gameLen) || undefined} value={cfg.gameStart} onChange={(e) => set("gameStart", Math.max(0, Math.round(Number(e.target.value) || 0)))} disabled={running} className="h-8 w-16 shrink-0 rounded-md border bg-background px-2 text-right text-xs tabular-nums" />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {gameLen ? `Video overlay ${fmt(gameLen)}. ` : ""}
              {cfg.gameStart === -2 ? "Video ke-2 melanjutkan dari titik video ke-1 berhenti, dan seterusnya. " : ""}
              {random ? "Klip overlay dibagi bergiliran acak: tidak ada yang terulang sebelum semua terpakai." : "Klip overlay dipakai bergantian sesuai urutan."}
            </p>
          </Section>
          <Section icon={Timer} tone="bg-amber-500/15 text-amber-500" title="Durasi" value={cfg.maxLen ? `maks ${fmt(cfg.maxLen)}` : "penuh"}>
            <Row icon={Scissors} label="Lewati awal">
              <div className="flex items-center gap-2">
                <Slider label="Lewati detik awal" value={Math.min(cfg.trimStart, 30)} min={0} max={30} step={1} onChange={(v) => set("trimStart", v)} disabled={running} />
                <span className="w-9 shrink-0 text-right text-xs tabular-nums">{cfg.trimStart} dtk</span>
              </div>
            </Row>
            <Row icon={Timer} label="Panjang maks">
              <Segmented value={String(cfg.maxLen) as string} onChange={(v) => set("maxLen", Number(v))} disabled={running} items={[{ v: "0", label: "Penuh" }, { v: "59", label: "59 dtk" }, { v: "45", label: "45" }, { v: "30", label: "30" }]} />
            </Row>
            <p className="text-xs text-muted-foreground">Berlaku untuk semua video. 59 detik = aman sebagai Shorts.</p>
          </Section>
          </>
        )}
        {tab === "text" && (
          <>
          <Section icon={Type} tone="bg-pink-500/15 text-pink-400" title="Teks di video" value={{ none: "tanpa", title: "judul", custom: "sendiri" }[cfg.textMode]}>
            <Segmented value={cfg.textMode} onChange={(v) => set("textMode", v)} disabled={running} items={[{ v: "none", label: "Tanpa" }, { v: "title", label: "Judul Short" }, { v: "custom", label: "Tulis sendiri" }]} />
            {cfg.textMode === "custom" && (
              <textarea value={cfg.textCustom} onChange={(e) => set("textCustom", e.target.value.slice(0, 200))} rows={2} disabled={running} placeholder="Mis. Tunggu endingnya! {judul}" aria-label="Teks di video" className="w-full resize-none rounded-md border bg-background px-2 py-1.5 text-xs" />
            )}
            {cfg.textMode !== "none" && (
              <>
                <Row icon={Move} label="Posisi">
                  <Segmented value={cfg.textPos} onChange={(v) => set("textPos", v)} disabled={running} items={[{ v: "top", label: "Atas" }, { v: "middle", label: "Tengah" }, { v: "bottom", label: "Bawah" }]} />
                </Row>
                <Row icon={Maximize2} label="Ukuran">
                  <Segmented value={cfg.textSize} onChange={(v) => set("textSize", v)} disabled={running} items={[{ v: "s", label: "Kecil" }, { v: "m", label: "Sedang" }, { v: "l", label: "Besar" }]} />
                </Row>
                <div className="grid grid-cols-3 gap-1">
                  {([["box", "Kotak", "bg-black/70 text-white"], ["outline", "Garis", "text-white [text-shadow:0_0_2px_#000,0_0_2px_#000,0_0_2px_#000]"], ["yellow", "Kuning", "text-[#FFD93D] [text-shadow:0_0_2px_#000,0_0_2px_#000,0_0_2px_#000]"]] as const).map(([v, label, look]) => (
                    <button key={v} type="button" onClick={() => set("textStyle", v)} disabled={running} aria-pressed={cfg.textStyle === v} className={`flex h-10 items-center justify-center rounded-md border bg-stone-500/30 text-xs ${cfg.textStyle === v ? "ring-2 ring-orange-400" : "hover:bg-stone-500/40"}`}>
                      <span className={`rounded px-1.5 py-0.5 font-bold ${look}`}>{label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{"{judul}"} diganti judul Short (tanpa nama channel dan emoji).</p>
              </>
            )}
          </Section>
          </>
        )}
        {tab === "sound" && (
          <>
          <Section icon={Music} tone="bg-fuchsia-500/15 text-fuchsia-400" title="Musik" value={!cfg.music ? "tanpa" : cfg.music === "*" ? "acak" : `${cfg.volMusic}%`}>
            <div className="space-y-1">
              {[{ src: "", name: "Tanpa musik", dur: 0 }, { src: "*", name: "Acak dari Pustaka", dur: 0 }, ...music].map((m) => {
                const on = cfg.music === m.src;
                const track = m.src !== "" && m.src !== "*";
                return (
                  <div key={m.src || "none"} className={`flex items-center gap-1 rounded-lg border pr-1 transition-colors ${on ? ON : "border-transparent hover:bg-accent"}`}>
                    <button type="button" onClick={() => set("music", m.src)} disabled={running || (m.src === "*" && !music.length)} aria-pressed={on} className="flex h-9 min-w-0 flex-1 items-center gap-2 px-2.5 text-left text-xs disabled:opacity-50">
                      {m.src === "" ? <VolumeX className="size-3.5 shrink-0" /> : m.src === "*" ? <Shuffle className="size-3.5 shrink-0" /> : <Music className="size-3.5 shrink-0" />}
                      <span className="truncate">{m.name}</span>
                      {m.dur > 0 && <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{fmt(m.dur)}</span>}
                    </button>
                    {track && (
                      <button type="button" onClick={() => listen(m.src)} aria-label={listening === m.src ? "Hentikan" : "Dengarkan"} title={listening === m.src ? "Hentikan" : "Dengarkan"} className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-background">
                        {listening === m.src ? <Square className="size-3 fill-current" /> : <Play className="size-3 fill-current" />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <label className={`flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed text-xs hover:bg-accent ${uploading ? "pointer-events-none opacity-60" : ""}`}>
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} {uploading ? "Mengunggah…" : "Unggah musik (MP3, WAV, M4A)"}
              <input type="file" accept="audio/*" hidden onChange={(e) => (void upload(e.target.files?.[0]), (e.target.value = ""))} />
            </label>
            <Row icon={Volume2} label="Volume">
              <div className="flex items-center gap-2">
                <Slider label="Volume musik" value={cfg.volMusic} min={0} max={100} onChange={(v) => set("volMusic", v)} disabled={running || !cfg.music} />
                <span className="w-9 shrink-0 text-right text-xs tabular-nums">{cfg.volMusic}%</span>
              </div>
            </Row>
            <p className="text-xs text-muted-foreground">Musik diulang sepanjang video dan memudar di 2 detik terakhir. Lagu yang sama ada di Pustaka Buat Video. Pakai musik bebas royalti.</p>
            <audio ref={ear} onEnded={() => setListening(null)} hidden />
          </Section>
          </>
        )}
          <p className="px-4 py-3 text-xs text-muted-foreground">Metadata hasil dirapikan (judul & tanggal). Semua setelan tersimpan otomatis.</p>
      </div>
      {footer}
    </section>
  );
}
