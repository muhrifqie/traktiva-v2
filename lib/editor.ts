import "server-only";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import type { VideoProject } from "@/lib/db/schema";
import {
  ACCENTS, ANIM_DUR, autoCaptions, captionsFromWords, CAPTION_ANIMS, CAPTION_FONTS, CAPTION_PRESETS, OUT_DUR, clamp, cutsOf, DEFAULT_CAPTION_STYLE, DEFAULT_FX, DEFAULT_SAFE, FX, exportSize, needsNormalize, normalizeEdit, OVERLAY_KINDS, round2, TRANSITIONS, uid,
  type CaptionAnim, type EditOverlay, type EditVoice, type ProjectEdit,
} from "@/lib/edit";
import { probeMedia, resolveMedia, writeMedia } from "@/lib/media";
import { concat } from "@/lib/projects";
import { isSilent, projectName } from "@/lib/presets";
import { voiceLine } from "@/lib/voice";
import { writingRules } from "@/lib/settings";
import { applyRules, rulesPrompt } from "@/lib/writing";
import { provenHooksPrompt } from "@/lib/insights";

const run = promisify(execFile);
const exists = (rel: string) => fs.stat(resolveMedia(rel)).then((s) => s.isFile(), () => false);

/**
 * Editor state for a rendered project. The base video is the raw Flow clips joined WITHOUT the Cartesia voice
 * (so voice, captions and music stay separate, editable tracks). Built once; rebuilt when the clips change.
 */
/**
 * "Video Panjang": each scene's label (= its chapter title from the outline) as a small text at the top for the
 * first 2.5 s of that scene. Re-running replaces only these auto titles (ids "bab-…").
 */
export function withChapters(p: VideoProject, e: ProjectEdit): ProjectEdit {
  if (p.options.format !== "long" || e.clips.length < 2) return e;
  const titles = e.clips.map((c, i) => ({ id: `bab-${i}`, kind: "info" as const, start: c.start, end: round2(Math.min(c.start + 2.5, c.start + c.dur)), text: c.label ?? `Bagian ${i + 1}`, x: 0.5, y: 0.1, size: 0.036, anim: "fade" as const }));
  return { ...e, overlays: [...e.overlays.filter((o) => !o.id.startsWith("bab-")), ...titles] };
}

const building = (globalThis as unknown as { __editBuild?: Map<number, Promise<ProjectEdit>> }).__editBuild ??
  ((globalThis as unknown as { __editBuild: Map<number, Promise<ProjectEdit>> }).__editBuild = new Map());

/** Editor state for a rendered project; a second caller for the same project waits for the build already running. */
export function prepareEdit(p: VideoProject): Promise<ProjectEdit> {
  const running = building.get(p.id);
  if (running) return running;
  const job = buildEdit(p).finally(() => building.delete(p.id));
  building.set(p.id, job);
  return job;
}

async function buildEdit(p: VideoProject): Promise<ProjectEdit> {
  if (p.scenes.some((s) => !s.clip)) throw new Error("Render semua klip dulu.");
  // a Cartesia clip is "<raw>-vo.mp4"; its raw clip and voice WAV (suara/<raw>.wav) are kept next to it
  const parts = await Promise.all(
    p.scenes.map(async (s) => {
      const vo = /-vo\.mp4$/.test(s.clip!);
      const raw = vo ? s.clip!.replace(/-vo\.mp4$/, ".mp4") : s.clip!;
      const wav = `${p.folder}/suara/${path.basename(raw, ".mp4")}.wav`;
      const useRaw = vo && (await exists(raw)) && (await exists(wav));
      return { src: useRaw ? raw : s.clip!, wav: useRaw ? wav : null, label: s.label, line: (l => l && applyRules(l, writingRules()))(voiceLine(s.motionPrompt)) };
    }),
  );
  const baseKey = parts.map((x) => x.src).join("|");
  const old = p.edit;
  if (old && old.baseKey === baseKey && (await exists(old.base))) return needsNormalize(old) ? normalizeEdit(old) : old;

  const probes = await Promise.all(parts.map((x) => probeMedia(x.src)));
  const base = `${p.folder}/edit/base.mp4`;
  await fs.mkdir(path.dirname(resolveMedia(base)), { recursive: true });
  const silent = isSilent(p.presetId, p.options) || !probes.some((x) => x.hasAudio);
  await concat(parts.map((x) => resolveMedia(x.src)), resolveMedia(base), silent);
  const info = await probeMedia(base);

  let t = 0;
  const clips = parts.map((x, i) => {
    const c = { src: x.src, start: round2(t), dur: round2(probes[i].seconds), label: x.label };
    t += probes[i].seconds;
    return c;
  });
  const voices: EditVoice[] = [];
  for (const [i, x] of parts.entries()) {
    if (!x.wav) continue;
    const dur = (await probeMedia(x.wav)).seconds;
    const room = Math.max(1, clips[i].dur - 0.5);
    voices.push({ id: uid(), src: x.wav, start: round2(clips[i].start + 0.3), dur: round2(dur), speed: round2(dur > room ? Math.min(1.35, dur / room) : 1), volume: 1, text: x.line });
  }
  // captions follow the voice-over; with Flow's own voice they follow each clip's spoken line
  const segments = voices.length
    ? voices.map((v) => ({ start: v.start, dur: v.dur / v.speed, text: v.text ?? "" }))
    : silent ? [] : parts.map((x, i) => ({ start: clips[i].start + 0.3, dur: Math.max(0.5, clips[i].dur - 0.8), text: x.line ?? "" }));

  // a fresh build (new or changed clips) gets the long-video chapter titles at the new clip times
  return withChapters(p, {
    base,
    baseKey,
    duration: round2(info.seconds || t),
    width: info.width || 720,
    height: info.height || 1280,
    baseAudio: info.hasAudio,
    clips,
    clipVolume: old?.clipVolume ?? (voices.length ? 0.25 : 1),
    captions: old?.captions?.length ? old.captions : autoCaptions(segments),
    captionStyle: { ...DEFAULT_CAPTION_STYLE, ...old?.captionStyle },
    safe: old?.safe ?? DEFAULT_SAFE,
    overlays: old?.overlays ?? [],
    fx: { ...DEFAULT_FX, ...old?.fx },
    voices,
    voiceVolume: old?.voiceVolume ?? 1,
    bgm: old?.bgm ?? null,
    sfx: old?.sfx ?? [],
  });
}

export type CaptionOverlay = { start: number; end: number; x: number; y: number; w: number; h: number; png: string; anim?: CaptionAnim; out?: boolean };

/** Zoom-punch / Ken Burns (scale + centre crop) and flash / dip-to-black (eq brightness). Same curves as fxAt(). */
function fxFilter(e: ProjectEdit) {
  const fx = e.fx ?? DEFAULT_FX;
  const cuts = cutsOf(e);
  const zoom: string[] = [];
  if (fx.kenburns) zoom.push(`(1+${FX.kenburns}*(${e.clips.map((c) => `between(t,${c.start},${round2(c.start + c.dur)})*(t-${c.start})/${c.dur}`).join("+")}))`);
  if (fx.transition === "zoom") for (const c of cuts) zoom.push(`(1+${FX.punch}*pow(max(0,1-(t-${c})/${FX.punchDur}),2)*gte(t,${c}))`);
  const light =
    fx.transition === "flash" ? cuts.map((c) => `${FX.flash}*max(0,1-(t-${c})/${FX.flashDur})*gte(t,${c})`).join("+")
    : fx.transition === "gelap" ? cuts.map((c) => `-max(0,1-abs(t-${c})/${FX.darkDur})`).join("")
    : "";
  const chain: string[] = [];
  if (zoom.length) chain.push(`scale=w='trunc(iw*${zoom.join("*")}/2)*2':h=-2:eval=frame`, `crop=${e.width}:${e.height}:'(in_w-${e.width})/2':'(in_h-${e.height})/2'`);
  if (light) chain.push(`eq=brightness='${light}':eval=frame`);
  return chain.join(",");
}

/**
 * Burn captions (PNG overlays drawn by the editor) + mix clip sound, voice-over and music → final.mp4 at -15 LUFS
 * (best sellers sit around -17..-12). A base video that decodes to no frames (left corrupt by an older build that
 * wrote it twice at once) is rebuilt from the clips once and the export retried.
 */
export async function exportEdit(p: VideoProject, src: ProjectEdit, overlays: CaptionOverlay[], name = "final") {
  const key = `${p.id}:${name}`;
  exporting.set(key, { projectId: p.id, title: projectName(p), file: `${name}.mp4`, startedAt: Date.now() });
  try {
    return await exportOnce(p, src, overlays, name);
  } catch (e) {
    const brokenBase = /video:0kB/.test(String(e)) && src.base === `${p.folder}/edit/base.mp4`;
    if (!brokenBase) throw e;
    await fs.rm(resolveMedia(src.base), { force: true });
    await prepareEdit({ ...p, edit: null }); // writes a fresh base.mp4 at the same path (same clips, same timing)
    return exportOnce(p, src, overlays, name);
  } finally {
    exporting.delete(key);
  }
}

type ExportRun = { projectId: number; title: string; file: string; startedAt: number };
const exporting = ((globalThis as unknown as { __exporting?: Map<string, ExportRun> }).__exporting ??= new Map());
/** Exports (ffmpeg) running right now, for the status bar. */
export const activeExports = () => [...exporting.values()];

async function exportOnce(p: VideoProject, src: ProjectEdit, overlays: CaptionOverlay[], name: string) {
  if (!ffmpegPath) throw new Error("ffmpeg tidak tersedia di perangkat ini.");
  // everything below works at the export size (1080p); the base video is upscaled once, captions arrive drawn at it
  const size = exportSize(src);
  const upscale = size.w !== src.width;
  const e: ProjectEdit = { ...src, width: size.w, height: size.h };
  const D = e.duration;
  const args = ["-y", "-i", resolveMedia(e.base)];
  let n = 1;
  const voiceIn = e.voices.map((v) => (args.push("-i", resolveMedia(v.src)), n++));
  const bgmIn = e.bgm ? (args.push("-stream_loop", "-1", "-ss", String(e.bgm.offset), "-i", resolveMedia(e.bgm.src)), n++) : -1;
  const sfx = (e.sfx ?? []).filter((x) => x.start < D);
  const sfxIn = sfx.map((x) => (args.push("-i", resolveMedia(x.src)), n++));
  const dir = `${p.folder}/edit`;
  const animOf = (o: CaptionOverlay) => o.anim ?? e.captionStyle.anim ?? "none";
  const pngIn: number[] = [];
  for (const [i, o] of overlays.entries()) {
    const rel = await writeMedia(`${dir}/caption-${i + 1}.png`, Buffer.from(o.png.replace(/^data:image\/png;base64,/, ""), "base64"));
    // animated: a looped still that only exists during the caption (itsoffset = its start on the timeline)
    if (animOf(o) !== "none" || o.out) args.push("-loop", "1", "-framerate", "30", "-t", (o.end - o.start).toFixed(2), "-itsoffset", o.start.toFixed(2));
    args.push("-i", resolveMedia(rel));
    pngIn.push(n++);
  }

  const f: string[] = [];
  let v = "0:v";
  if (upscale) {
    // Lanczos upscale + a light sharpen (AI clips are soft); square pixels for players that read SAR
    f.push(`[0:v]scale=${e.width}:${e.height}:flags=lanczos,unsharp=5:5:0.45:5:5:0,setsar=1[up]`);
    v = "up";
  }
  const fxChain = fxFilter(e);
  if (fxChain) {
    f.push(`[${v}]${fxChain}[fx]`);
    v = "fx";
  }
  overlays.forEach((o, i) => {
    const x = Math.round(o.x), y = Math.round(o.y);
    const anim = animOf(o);
    if (anim === "none" && !o.out) {
      f.push(`[${v}][${pngIn[i]}:v]overlay=${x}:${y}:enable='between(t,${o.start.toFixed(2)},${o.end.toFixed(2)})'[v${i}]`);
    } else {
      // same curves as animState() in lib/edit.ts
      const d = ANIM_DUR[anim] || 0.01, a = o.start.toFixed(2);
      const P = (tv: string) => `clip((${tv}-${a})/${d},0,1)`;
      let chain = "format=rgba";
      let ox = String(x), oy = String(y);
      if (anim === "fade" || anim === "naik") chain += `,fade=t=in:st=${a}:d=${d}:alpha=1`;
      if (anim === "naik") oy = `'${y}+pow(1-${P("t")},3)*${round2(0.05 * e.height)}'`;
      if (anim === "pop") {
        const sc = `(0.6+0.4*(1+2.70158*pow(${P("t")}-1,3)+1.70158*pow(${P("t")}-1,2)))`;
        chain += `,scale=w='max(2,trunc(iw*${sc}/2)*2)':h=-2:eval=frame,fade=t=in:st=${a}:d=${round2(d / 4)}:alpha=1`;
        ox = `'${x}+(${Math.round(o.w)}-overlay_w)/2'`;
        oy = `'${y}+(${Math.round(o.h)}-overlay_h)/2'`;
      }
      if (anim === "sapu") chain += `,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(X,W*${P("T")}),alpha(X,Y),0)'`;
      if (anim === "zoom") {
        chain += `,scale=w='max(2,trunc(iw*(1.5-0.5*(1-pow(1-${P("t")},3)))/2)*2)':h=-2:eval=frame,fade=t=in:st=${a}:d=${round2(d / 4)}:alpha=1`;
        ox = `'${x}+(${Math.round(o.w)}-overlay_w)/2'`;
        oy = `'${y}+(${Math.round(o.h)}-overlay_h)/2'`;
      }
      if (anim === "kiri") {
        chain += `,fade=t=in:st=${a}:d=${d}:alpha=1`;
        ox = `'${x}-${round2(0.25 * e.height)}*pow(1-${P("t")},3)'`;
      }
      if (anim === "pantul") {
        chain += `,fade=t=in:st=${a}:d=${round2(d / 5)}:alpha=1`;
        oy = `'${y}-${round2(0.08 * e.height)}*exp(-5*${P("t")})*cos(10.5*${P("t")})*(1-${P("t")})'`;
      }
      // exit fade over the last OUT_DUR seconds (blitCaption does the same)
      if (o.out) chain += `,fade=t=out:st=${Math.max(o.start, o.end - OUT_DUR).toFixed(2)}:d=${OUT_DUR}:alpha=1`;
      f.push(`[${pngIn[i]}:v]${chain}[c${i}]`, `[${v}][c${i}]overlay=x=${ox}:y=${oy}:eof_action=pass[v${i}]`);
    }
    v = `v${i}`;
  });
  const mix: string[] = ["[a0]"];
  f.push(e.baseAudio ? `[0:a]volume=${clamp(e.clipVolume, 0, 2)}[a0]` : `aevalsrc=0:d=${D}[a0]`);
  e.voices.forEach((x, i) => {
    const ms = Math.max(0, Math.round(x.start * 1000));
    f.push(`[${voiceIn[i]}:a]atempo=${clamp(x.speed, 0.5, 2)},adelay=delays=${ms}:all=1,volume=${round2(clamp(x.volume, 0, 2) * clamp(e.voiceVolume, 0, 2))}[vo${i}]`);
  });
  // all voices as one stream; with music, a copy of it drives the ducking (music dips while someone talks)
  const duck = !!e.bgm && e.voices.length > 0 && e.voiceVolume > 0;
  if (e.voices.length) {
    f.push(`${e.voices.map((_, i) => `[vo${i}]`).join("")}amix=inputs=${e.voices.length}:duration=longest:dropout_transition=0:normalize=0${duck ? ",asplit=2[voices][vkey]" : "[voices]"}`);
    mix.push("[voices]");
  }
  if (e.bgm) {
    const fade = e.bgm.fade && D > 3 ? `,afade=t=in:d=0.5,afade=t=out:st=${(D - 2).toFixed(2)}:d=2` : "";
    f.push(`[${bgmIn}:a]atrim=0:${D},asetpts=PTS-STARTPTS,volume=${clamp(e.bgm.volume, 0, 2)}${fade}${duck ? "[bgmraw]" : "[bgm]"}`);
    if (duck) f.push("[bgmraw][vkey]sidechaincompress=threshold=0.02:ratio=6:attack=30:release=350:makeup=1[bgm]");
    mix.push("[bgm]");
  }
  sfx.forEach((x, i) => {
    f.push(`[${sfxIn[i]}:a]adelay=delays=${Math.max(0, Math.round(x.start * 1000))}:all=1,volume=${clamp(x.volume, 0, 2)}[sfx${i}]`);
    mix.push(`[sfx${i}]`);
  });
  f.push(`${mix.join("")}amix=inputs=${mix.length}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95,loudnorm=I=-15:TP=-1.5:LRA=11,aresample=48000[aout]`);

  const out = `${p.folder}/${name}.mp4`;
  const tmp = resolveMedia(`${dir}/export-${name}.mp4`);
  await run(ffmpegPath, [
    ...args,
    "-filter_complex", f.join(";"),
    "-map", v === "0:v" ? "0:v" : `[${v}]`, "-map", "[aout]", "-t", String(D),
    // upload master for TikTok: H.264 High 4.2, ~8–14 Mbps at 1080p (TikTok re-encodes; a rich source keeps detail)
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-maxrate", "14M", "-bufsize", "28M", "-profile:v", "high", "-level", "4.2",
    "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-c:a", "aac", "-b:a", "192k",
    "-map_metadata", "-1", "-map_chapters", "-1", "-metadata:s:v:0", "handler_name=VideoHandler", "-metadata:s:a:0", "handler_name=SoundHandler",
    "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact", "-movflags", "+faststart", tmp,
  ], { windowsHide: true, maxBuffer: 32 * 1024 * 1024 }).catch((err) => {
    throw new Error(`Export gagal: ${String(err?.stderr ?? err).slice(-300)}`);
  });
  await fs.rename(tmp, resolveMedia(out));
  return out;
}

/** Last raw Gemini answer (debugging bad JSON). */
export const answerLog: { last: string } = { last: "" };

// formats measured on 30 best-selling KaloData videos (docs/edit-style-kalodata.md)
const DIRECTOR_ANGLES = [
  `Format: REVIEW (18/30 best sellers). Hook line says a price anchor or a "stop doing X" line. Captions as small subtitles of 1-3 words each (captionStyle.preset "minimal", upper true, size about 0.045, y about 0.66, karaoke true, anim "none"). No stickers except, if it really helps, one small "judul" in the first 2 s. fx.transition "none".`,
  `Format: ESTETIK (12/30 best sellers, music videos). captions: [] (no subtitles). Exactly one overlay of kind "info": two short lines at the top (y about 0.15, size about 0.042) for the WHOLE video, e.g. "Sepatu cakep poll\\nEmpuk, nyaman di kaki ✨". fx.transition "none", kenburns may be true.`,
  `Format: DEMO CEPAT (gadget best sellers). Captions of 1 word each, lowercase, small (preset "minimal", size about 0.04, y about 0.78). One bold "judul" overlay only in the first 2 s naming the main benefit. fx.transition "zoom" is fine.`,
];

/**
 * Let Gemini adjust the timeline from a plain-language instruction ("caption lebih catchy", "musik pelan").
 * It may change text, timing, volumes, caption style, overlays (hook/price/CTA) and clip effects; media files stay
 * as they are. Every value is clamped here. `director` = build a complete ready-to-post version.
 */
export async function aiAdjustEdit(p: VideoProject, e: ProjectEdit, instruction: string, opts: { director?: boolean; angle?: number } = {}) {
  const { extractJson } = await import("@/lib/platforms/gemini");
  const { askWriter } = await import("@/lib/writer");
  const { geminiAccount } = await import("@/lib/prompt-writer");
  const g = await geminiAccount();
  const state = {
    durationSec: e.duration,
    product: { name: p.product.name, price: p.product.price },
    clips: e.clips.map((c) => ({ label: c.label, start: c.start, dur: c.dur })),
    captions: e.captions.map(({ start, end, text }) => ({ start, end, text })),
    captionStyle: e.captionStyle,
    safe: e.safe,
    overlays: e.overlays.map(({ kind, start, end, text, x, y, size, anim }) => ({ kind, start, end, text, x, y, size, anim })),
    fx: e.fx,
    voices: e.voices.map((v) => ({ id: v.id, start: v.start, durSec: round2(v.dur / v.speed), speed: v.speed, volume: v.volume, text: v.text })),
    clipVolume: e.clipVolume,
    voiceVolume: e.voiceVolume,
    bgm: e.bgm && { name: e.bgm.name, volume: e.bgm.volume, offset: e.bgm.offset, fade: e.bgm.fade },
  };
  const wish = instruction.replace(/"/g, "'").slice(0, 600);
  const task = opts.director
    ? `Act as the video's director: produce a complete, ready-to-post edit in the style of best-selling Indonesian TikTok affiliate videos.
- What the data says: the product is shown from second 0, text on screen is small and quiet, 0 of 30 best sellers used price badges or CTA stickers, 0 used flashy transitions; the CTA ("cek keranjang di bawah") is SPOKEN, so only add "harga"/"cta" stickers if the user asks for them.
- Rewrite captions to be punchy (still matching the voice timing).
- ${DIRECTOR_ANGLES[(opts.angle ?? 0) % DIRECTOR_ANGLES.length]}
Extra wishes from the user (Indonesian, may be empty): "${wish}"`
    : `Instruction from the user (Indonesian): "${wish}"
Only change what the instruction asks for (plus fixes needed to keep things valid). Keep everything else identical.`;
  const prompt = `You edit a short vertical TikTok affiliate video (Indonesian) on a timeline, like a CapCut editor.
Current timeline (JSON, times in seconds, volumes are gains where 1 = original, max 2):
${JSON.stringify(state)}

${task}

Rules:
${rulesPrompt(writingRules())}
- Captions are on-screen text in casual Indonesian, max ~5 words each, must not overlap, must stay inside 0..durationSec, and should match when the voice speaks. Write numbers as digits the way Indonesian TikTok captions do: prices "Rp34.900" / "Rp34 ribuan" / "Rp1,5 juta", ratings "4,8", counts "5.000+ terjual", "50%"; no trailing period or comma.
- captionStyle.preset is one of ${CAPTION_PRESETS.map((x) => x.id).join("|")} (minimal = small white text, what most best sellers use); captionStyle.font is one of ${CAPTION_FONTS.filter((f) => !f.hidden).map((f) => `${f.id} (${f.mood})`).join(", ")}; optional fine-tuning: captionStyle.stroke (outline 0-0.3 of font size), shadow (0-1), spacing (letter spacing em, -0.05-0.3), lineHeight (0.9-1.6), light (thinner weight); captionStyle.anim is the entrance animation, one of ${CAPTION_ANIMS.map((a) => a.id).join("|")}; captionStyle.out true = fade out at the end; captionStyle.karaoke true = the spoken word lights up in captionStyle.accent (one of ${ACCENTS.join(", ")}); captionStyle.x / captionStyle.y are the horizontal / vertical center (0-1; text is kept inside the safe area "safe" automatically); captionStyle.size is font size / video width (0.04-0.09); captionStyle.upper true = UPPERCASE.
- overlays are stickers on their own track: kind is one of judul|harga|cta|info (info = small 2-line text at the top for the whole video, use \\n for the line break); x/y center 0-1; size 0.04-0.1; anim like captions. Keep them from covering the captions (different y).
- fx.transition at each clip cut is one of ${TRANSITIONS.map((t) => t.id).join("|")}; fx.kenburns true = slow zoom on every clip.
- You may move voices (start), change their volume (0-2) or speed (0.8-1.4). Keep voices from overlapping each other.
- Background music (bgm) usually sits at 0.1-0.25 under a voice-over. clipVolume is the original clip sound.

Output ONLY JSON with the same shape: {"captions":[...],"captionStyle":{...},"overlays":[...],"fx":{...},"voices":[{"id":"...","start":0,"speed":1,"volume":1}],"clipVolume":1,"voiceVolume":1,"bgm":{"volume":0.2,"offset":0,"fade":true}} (omit bgm if there is none), plus "note": a one-sentence Indonesian summary of what you changed${opts.director ? " (name the angle)" : ""}.`;
  const ans = extractJson<{
    captions?: { start: number; end: number; text: string }[];
    captionStyle?: Partial<ProjectEdit["captionStyle"]>;
    overlays?: Partial<EditOverlay>[];
    fx?: Partial<ProjectEdit["fx"]>;
    voices?: { id: string; start?: number; speed?: number; volume?: number }[];
    clipVolume?: number;
    voiceVolume?: number;
    bgm?: { volume?: number; offset?: number; fade?: boolean };
    note?: string;
  }>(await askWriter(g.sessionKey, prompt).then((r) => (answerLog.last = r.text)));
  if (!ans || typeof ans !== "object") throw new Error("Jawaban Gemini tidak terbaca. Coba lagi.");

  const D = e.duration;
  const isAnim = (a: unknown): a is CaptionAnim => CAPTION_ANIMS.some((x) => x.id === a);
  const next: ProjectEdit = { ...e };
  if (Array.isArray(ans.captions))
    next.captions = ans.captions
      .filter((c) => c && String(c.text ?? "").trim())
      .map((c) => {
        const start = round2(clamp(Number(c.start), 0, D - 0.2));
        return { id: uid(), start, end: round2(clamp(Number(c.end), start + 0.2, D)), text: applyRules(String(c.text).trim(), writingRules()).slice(0, 120) };
      })
      .sort((a, b) => a.start - b.start)
      .slice(0, 80);
  if (ans.captionStyle) {
    const s = ans.captionStyle;
    const cs = e.captionStyle;
    next.captionStyle = {
      preset: CAPTION_PRESETS.some((x) => x.id === s.preset) ? (s.preset as ProjectEdit["captionStyle"]["preset"]) : cs.preset,
      x: s.x != null ? round2(clamp(Number(s.x), 0.1, 0.9)) : cs.x,
      y: s.y != null ? round2(clamp(Number(s.y), 0.1, 0.9)) : cs.y,
      anim: isAnim(s.anim) ? s.anim : cs.anim,
      size: s.size != null ? clamp(Number(s.size), 0.035, 0.1) : cs.size,
      upper: s.upper != null ? !!s.upper : cs.upper,
      karaoke: s.karaoke != null ? !!s.karaoke : cs.karaoke,
      accent: /^#[0-9a-f]{6}$/i.test(String(s.accent)) ? String(s.accent) : cs.accent,
      font: CAPTION_FONTS.some((f) => f.id === s.font) ? s.font! : cs.font,
      color: s.color === null || /^#[0-9a-f]{6}$/i.test(String(s.color)) ? (s.color ?? null) : cs.color,
      box: cs.box,
      out: s.out != null ? !!s.out : cs.out,
    };
  }
  if (Array.isArray(ans.overlays))
    next.overlays = ans.overlays
      .filter((o) => o && OVERLAY_KINDS.some((k) => k.id === o.kind) && String(o.text ?? "").trim())
      .slice(0, 8)
      .map((o) => {
        const k = OVERLAY_KINDS.find((x) => x.id === o.kind)!;
        const start = round2(clamp(Number(o.start ?? 0), 0, D - 0.3));
        return {
          id: uid(),
          kind: k.id,
          start,
          end: round2(clamp(Number(o.end ?? start + 2), start + 0.3, D)),
          text: applyRules(String(o.text).trim(), writingRules()).slice(0, 60),
          x: round2(clamp(Number(o.x ?? 0.5), 0.1, 0.9)),
          y: round2(clamp(Number(o.y ?? k.y), 0.1, 0.9)),
          size: clamp(Number(o.size ?? k.size), 0.035, 0.12),
          anim: isAnim(o.anim) ? o.anim : "pop",
        };
      });
  if (ans.fx)
    next.fx = {
      transition: TRANSITIONS.some((t) => t.id === ans.fx!.transition) ? ans.fx.transition! : e.fx.transition,
      kenburns: ans.fx.kenburns != null ? !!ans.fx.kenburns : e.fx.kenburns,
    };
  if (Array.isArray(ans.voices))
    next.voices = e.voices.map((v) => {
      const a = ans.voices!.find((x) => x?.id === v.id);
      return a ? { ...v, start: round2(clamp(Number(a.start ?? v.start), 0, D - 0.3)), speed: round2(clamp(Number(a.speed ?? v.speed), 0.5, 2)), volume: round2(clamp(Number(a.volume ?? v.volume), 0, 2)) } : v;
    });
  if (ans.clipVolume != null) next.clipVolume = round2(clamp(Number(ans.clipVolume), 0, 2));
  if (ans.voiceVolume != null) next.voiceVolume = round2(clamp(Number(ans.voiceVolume), 0, 2));
  if (ans.bgm && e.bgm)
    next.bgm = { ...e.bgm, volume: round2(clamp(Number(ans.bgm.volume ?? e.bgm.volume), 0, 2)), offset: round2(clamp(Number(ans.bgm.offset ?? e.bgm.offset), 0, Math.max(0, e.bgm.dur - 1))), fade: ans.bgm.fade ?? e.bgm.fade };
  return { edit: next, note: String(ans.note ?? "Timeline diperbarui.").slice(0, 200) };
}

// ---------------------------------------------------------------- one-take voice-over & fitting clips to the voice

/** The spoken script for the whole video: Gemini writes it once, sized to the video at ~2.6 words per second. */
export async function writeFullScript(p: VideoProject, e: ProjectEdit, wish = "") {
  if (p.options.vo?.trim() && !wish) return applyRules(p.options.vo.replace(/\s+/g, " ").trim(), writingRules()); // the owner wrote it
  const { extractJson } = await import("@/lib/platforms/gemini");
  const { askWriter } = await import("@/lib/writer");
  const { geminiAccount } = await import("@/lib/prompt-writer");
  const g = await geminiAccount();
  const words = Math.round(e.duration * 2.6);
  const scenes = e.clips.map((c, i) => ({ label: c.label, start: c.start, dur: c.dur, line: voiceLine(p.scenes[i]?.motionPrompt ?? "") }));
  const prompt = `Write ONE continuous Indonesian voice-over for a ${Math.round(e.duration)}-second vertical TikTok affiliate video, read by one person from the first second to the end without pauses.
Product: ${p.product.name}. Price: ${p.product.price || "-"}. Details: ${(p.product.details || "-").slice(0, 600)}
The video shows these scenes in order (follow them so the words match what is on screen): ${JSON.stringify(scenes)}
Rules (from 30 best-selling Indonesian affiliate videos):
- About ${words} words (brisk natural pace, ~2.6 words per second). Casual everyday Indonesian, light Jakarta slang, like talking to a friend.
- First sentence = hook: a price anchor ("looknya kayak jutaan, padahal cuma ..."), a "stop doing X" line, a demo challenge ("kalian bisa gini ga?") or "lagi booming". Only quote prices that are in the product data.
- Middle: concrete benefits you can see in the scenes.
- End with the spoken call to action from the owner's rules below, with light urgency only if the data supports it. No invented discounts, stock limits, medical or absolute claims. Never use absolute words like "dijamin", "100%", "pasti", "paling" and never say "kehabisan"/"stok terbatas"/"sebelum habis" unless the product data says stock is limited; neutral urgency like "mumpung masih promo" only if a promo is in the data, otherwise just the plain call to action.
- Write numbers with digits as they would appear on screen: prices "Rp34.900" (or "Rp34 ribuan" when rounding), ratings "4,8", counts "5.000+ terjual", "50%". They are spoken correctly automatically, never spell them out in words. Use the product price exactly as given.
${rulesPrompt(writingRules())}
${await provenHooksPrompt()}
${wish ? `Extra wishes: "${wish.replace(/"/g, "'").slice(0, 300)}"` : ""}
Output ONLY JSON: {"script":"..."}`;
  const ans = extractJson<{ script?: string }>((await askWriter(g.sessionKey, prompt)).text);
  const script = applyRules(String(ans?.script ?? "").replace(/\s+/g, " ").trim(), writingRules());
  if (script.split(" ").length < 5) throw new Error("Naskah dari Gemini kosong. Coba lagi.");
  return script;
}

/**
 * Replace the per-scene voice lines with ONE take spoken over the whole video (Cartesia, word timestamps), starting
 * at 0.1 s like best sellers, sped up (max 1.2×) only if it would run past the end. Subtitles follow the real words.
 */
export async function fullVoiceOver(p: VideoProject, e: ProjectEdit, script: string, words = 2) {
  const { getSettings } = await import("@/lib/settings");
  const { projectVoice, spoken } = await import("@/lib/voice");
  const { synthesizeTimed } = await import("@/lib/cartesia");
  const defaults = getSettings().voice ?? { provider: "flow" };
  const pv = projectVoice(p.options, defaults);
  if (!defaults.cartesiaKey || !pv.voiceId) throw new Error("Pilih suara Cartesia dulu (Pengaturan → Suara).");
  const { wav, words: timed } = await synthesizeTimed(defaults.cartesiaKey, spoken(applyRules(script, writingRules())), pv.voiceId, { speed: pv.speed });
  const src = await writeMedia(`${p.folder}/suara/vo-utuh-${Date.now().toString(36)}.wav`, wav);
  const dur = (await probeMedia(src)).seconds;
  const at = 0.1;
  const room = e.duration - at - 0.3;
  const speed = round2(dur > room ? Math.min(1.2, dur / room) : 1);
  const voice: EditVoice = { id: uid(), src, start: at, dur: round2(dur), speed, volume: 1, text: script };
  const captions = timed.length ? captionsFromWords(timed, at, speed, words) : autoCaptions([{ start: at, dur: dur / speed, text: script }], words);
  const next: ProjectEdit = { ...e, voices: [voice], captions, clipVolume: Math.min(e.clipVolume, 0.25), voiceVolume: 1 };
  return { edit: next, spokenSec: round2(dur / speed), timed: timed.length > 0 };
}

/**
 * "Pas-kan klip ke suara": with one long voice the video ends 0.6 s after it; with per-scene voices every clip is
 * cut to its own voice (+0.35 s, min 1.5 s) and everything after it moves up. The state before is kept to undo.
 */
export async function fitClipsToVoice(p: VideoProject, e: ProjectEdit): Promise<ProjectEdit> {
  if (!e.voices.length) throw new Error("Belum ada voice-over untuk dijadikan patokan.");
  const before = { ...e, beforeFit: undefined };
  const voiceEnd = (v: EditVoice) => v.start + v.dur / v.speed;
  if (e.voices.length === 1 && e.voices[0].dur / e.voices[0].speed > e.clips[0].dur) {
    const D = round2(Math.min(e.duration, voiceEnd(e.voices[0]) + 0.6));
    return {
      ...e,
      duration: D,
      clips: e.clips.filter((c) => c.start < D).map((c) => ({ ...c, dur: round2(Math.min(c.dur, D - c.start)) })),
      captions: e.captions.filter((c) => c.start < D).map((c) => ({ ...c, end: Math.min(c.end, D) })),
      overlays: e.overlays.filter((o) => o.start < D).map((o) => ({ ...o, end: Math.min(o.end, D) })),
      sfx: e.sfx.filter((x) => x.start < D),
      beforeFit: before,
    };
  }
  if (!ffmpegPath) throw new Error("ffmpeg tidak tersedia di perangkat ini.");
  // new length of each clip = until its last voice ends (+0.35 s)
  const keep = e.clips.map((c) => {
    const ends = e.voices.filter((v) => v.start >= c.start - 0.05 && v.start < c.start + c.dur).map((v) => voiceEnd(v) - c.start);
    return round2(ends.length ? Math.min(c.dur, Math.max(1.5, Math.max(...ends) + 0.35)) : c.dur);
  });
  const dir = `${p.folder}/edit`;
  const parts: string[] = [];
  for (const [i, c] of e.clips.entries()) {
    const rel = `${dir}/fit-${i + 1}.mp4`;
    await run(ffmpegPath, ["-y", "-i", resolveMedia(c.src), "-t", String(keep[i]), "-c:v", "libx264", "-preset", "fast", "-crf", "14", "-c:a", "aac", "-b:a", "192k", resolveMedia(rel)], { windowsHide: true });
    parts.push(resolveMedia(rel));
  }
  const base = `${dir}/base-fit.mp4`;
  await concat(parts, resolveMedia(base), !e.baseAudio);
  let t = 0;
  const clips = e.clips.map((c, i) => {
    const out = { ...c, start: round2(t), dur: keep[i] };
    t += keep[i];
    return out;
  });
  // old timeline time → new: same offset inside its clip, clamped to the shortened clip
  const map = (time: number) => {
    const i = Math.max(0, e.clips.findLastIndex((c) => time >= c.start - 0.001));
    return round2(clips[i].start + Math.min(time - e.clips[i].start, keep[i]));
  };
  const D = round2(t);
  return {
    ...e,
    base,
    duration: D,
    clips,
    voices: e.voices.map((v) => ({ ...v, start: map(v.start) })),
    captions: e.captions.map((c) => ({ ...c, start: map(c.start), end: Math.max(map(c.start) + 0.2, map(c.end)) })).filter((c) => c.start < D),
    overlays: e.overlays.map((o) => ({ ...o, start: map(o.start), end: Math.max(map(o.start) + 0.3, map(o.end)) })),
    sfx: e.sfx.map((x) => ({ ...x, start: map(x.start) })),
    beforeFit: before,
  };
}

// ---------------------------------------------------------------- hook A/B variants

const HOOK_PATTERNS = [
  "price anchor (looks expensive but the real price is low; only the price in the product data)",
  "stop doing X / a relatable problem the viewer has",
  "demo challenge or a surprising result (\"kalian bisa gini ga?\")",
  "lagi booming / social proof (only numbers in the product data)",
];

/**
 * Hook A/B test: the same video with only the opening line changed. The writer gives n new first sentences
 * (one proven pattern each), each is voiced as a new one-take voice-over (Cartesia) with its own subtitles.
 * Body, clips, style and music stay the same, so the test isolates the hook (the first 3 seconds).
 */
export async function hookVariants(p: VideoProject, e: ProjectEdit, n = 3) {
  const script = e.voices.length === 1 ? (e.voices[0].text ?? "").trim() : "";
  if (script.split(/\s+/).length < 8) throw new Error("Varian hook butuh voice-over utuh dulu (Audio → Voice-over utuh).");
  const first = script.match(/^.+?[.!?](?:\s|$)/)?.[0] ?? script.split(/\s+/).slice(0, 10).join(" ");
  const rest = script.slice(first.length).trim();
  const { extractJson } = await import("@/lib/platforms/gemini");
  const { askWriter } = await import("@/lib/writer");
  const { geminiAccount } = await import("@/lib/prompt-writer");
  const g = await geminiAccount();
  const prompt = `This is the Indonesian voice-over of a TikTok Shop affiliate video for "${p.product.name}" (price: ${p.product.price || "-"}; details: ${(p.product.details || "-").slice(0, 400)}).
Current opening line: "${first.trim()}"
The rest (stays the same): "${rest.slice(0, 900)}"
Write ${n} NEW opening lines for an A/B test, each using a different pattern from: ${HOOK_PATTERNS.map((x, i) => `${i + 1}) ${x}`).join("; ")}.
Rules: casual everyday Indonesian like talking to a friend, max 12 words, spoken in under 3 seconds, must flow into the rest naturally, no invented discounts/stock/claims, numbers and prices with digits (Rp34.900, 4,8).
${rulesPrompt(writingRules())}
${await provenHooksPrompt()}
Output ONLY JSON: {"hooks":[{"pattern":"<short Indonesian name of the pattern>","line":"..."}]}`;
  const ans = extractJson<{ hooks?: { pattern?: string; line?: string }[] }>((await askWriter(g.sessionKey, prompt)).text);
  const hooks = (ans?.hooks ?? []).map((h) => ({ pattern: String(h.pattern ?? "Hook").slice(0, 40), line: applyRules(String(h.line ?? "").trim(), writingRules()) })).filter((h) => h.line.split(/\s+/).length >= 3).slice(0, n);
  if (!hooks.length) throw new Error("AI tidak memberi hook baru. Coba lagi.");
  const words = Math.max(1, Math.min(6, Math.round(e.captions.reduce((a, c) => a + c.text.split(/\s+/).length, 0) / Math.max(1, e.captions.length))));
  const out: { edit: ProjectEdit; note: string; hook: string }[] = [];
  for (const h of hooks) {
    // one after another: Cartesia + the writer profile are shared
    const r = await fullVoiceOver(p, e, `${h.line} ${rest}`.trim(), words);
    out.push({ edit: r.edit, note: `${h.pattern}: “${h.line}”`, hook: h.line });
  }
  return out;
}
