import "server-only";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import type { VideoProject } from "@/lib/db/schema";
import {
  ACCENTS, ANIM_DUR, autoCaptions, CAPTION_ANIMS, clamp, cutsOf, DEFAULT_CAPTION_STYLE, DEFAULT_FX, DEFAULT_SAFE, FX, needsNormalize, normalizeEdit, OVERLAY_KINDS, round2, TRANSITIONS, uid,
  type CaptionAnim, type EditOverlay, type EditVoice, type ProjectEdit,
} from "@/lib/edit";
import { probeMedia, resolveMedia, writeMedia } from "@/lib/media";
import { concat } from "@/lib/projects";
import { isSilent } from "@/lib/presets";
import { voiceLine } from "@/lib/voice";

const run = promisify(execFile);
const exists = (rel: string) => fs.stat(resolveMedia(rel)).then((s) => s.isFile(), () => false);

/**
 * Editor state for a rendered project. The base video is the raw Flow clips joined WITHOUT the Cartesia voice
 * (so voice, captions and music stay separate, editable tracks). Built once; rebuilt when the clips change.
 */
export async function prepareEdit(p: VideoProject): Promise<ProjectEdit> {
  if (p.scenes.some((s) => !s.clip)) throw new Error("Render semua klip dulu.");
  // a Cartesia clip is "<raw>-vo.mp4"; its raw clip and voice WAV (suara/<raw>.wav) are kept next to it
  const parts = await Promise.all(
    p.scenes.map(async (s) => {
      const vo = /-vo\.mp4$/.test(s.clip!);
      const raw = vo ? s.clip!.replace(/-vo\.mp4$/, ".mp4") : s.clip!;
      const wav = `${p.folder}/suara/${path.basename(raw, ".mp4")}.wav`;
      const useRaw = vo && (await exists(raw)) && (await exists(wav));
      return { src: useRaw ? raw : s.clip!, wav: useRaw ? wav : null, label: s.label, line: voiceLine(s.motionPrompt) };
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

  return {
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
  };
}

export type CaptionOverlay = { start: number; end: number; x: number; y: number; w: number; h: number; png: string; anim?: CaptionAnim };

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

/** Burn captions (PNG overlays drawn by the editor) + mix clip sound, voice-over and music → final.mp4. */
export async function exportEdit(p: VideoProject, e: ProjectEdit, overlays: CaptionOverlay[]) {
  if (!ffmpegPath) throw new Error("ffmpeg tidak tersedia di perangkat ini.");
  const D = e.duration;
  const args = ["-y", "-i", resolveMedia(e.base)];
  let n = 1;
  const voiceIn = e.voices.map((v) => (args.push("-i", resolveMedia(v.src)), n++));
  const bgmIn = e.bgm ? (args.push("-stream_loop", "-1", "-ss", String(e.bgm.offset), "-i", resolveMedia(e.bgm.src)), n++) : -1;
  const dir = `${p.folder}/edit`;
  const animOf = (o: CaptionOverlay) => o.anim ?? e.captionStyle.anim ?? "none";
  const pngIn: number[] = [];
  for (const [i, o] of overlays.entries()) {
    const rel = await writeMedia(`${dir}/caption-${i + 1}.png`, Buffer.from(o.png.replace(/^data:image\/png;base64,/, ""), "base64"));
    // animated: a looped still that only exists during the caption (itsoffset = its start on the timeline)
    if (animOf(o) !== "none") args.push("-loop", "1", "-framerate", "30", "-t", (o.end - o.start).toFixed(2), "-itsoffset", o.start.toFixed(2));
    args.push("-i", resolveMedia(rel));
    pngIn.push(n++);
  }

  const f: string[] = [];
  let v = "0:v";
  const fxChain = fxFilter(e);
  if (fxChain) {
    f.push(`[0:v]${fxChain}[fx]`);
    v = "fx";
  }
  overlays.forEach((o, i) => {
    const x = Math.round(o.x), y = Math.round(o.y);
    const anim = animOf(o);
    if (anim === "none") {
      f.push(`[${v}][${pngIn[i]}:v]overlay=${x}:${y}:enable='between(t,${o.start.toFixed(2)},${o.end.toFixed(2)})'[v${i}]`);
    } else {
      // same curves as animState() in lib/edit.ts
      const d = ANIM_DUR[anim], a = o.start.toFixed(2);
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
      f.push(`[${pngIn[i]}:v]${chain}[c${i}]`, `[${v}][c${i}]overlay=x=${ox}:y=${oy}:eof_action=pass[v${i}]`);
    }
    v = `v${i}`;
  });
  const mix: string[] = ["[a0]"];
  f.push(e.baseAudio ? `[0:a]volume=${clamp(e.clipVolume, 0, 2)}[a0]` : `aevalsrc=0:d=${D}[a0]`);
  e.voices.forEach((x, i) => {
    const ms = Math.max(0, Math.round(x.start * 1000));
    f.push(`[${voiceIn[i]}:a]atempo=${clamp(x.speed, 0.5, 2)},adelay=delays=${ms}:all=1,volume=${round2(clamp(x.volume, 0, 2) * clamp(e.voiceVolume, 0, 2))}[vo${i}]`);
    mix.push(`[vo${i}]`);
  });
  if (e.bgm) {
    const fade = e.bgm.fade && D > 3 ? `,afade=t=in:d=0.5,afade=t=out:st=${(D - 2).toFixed(2)}:d=2` : "";
    f.push(`[${bgmIn}:a]atrim=0:${D},asetpts=PTS-STARTPTS,volume=${clamp(e.bgm.volume, 0, 2)}${fade}[bgm]`);
    mix.push("[bgm]");
  }
  f.push(`${mix.join("")}amix=inputs=${mix.length}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]`);

  const out = `${p.folder}/final.mp4`;
  const tmp = resolveMedia(`${dir}/export.mp4`);
  await run(ffmpegPath, [
    ...args,
    "-filter_complex", f.join(";"),
    "-map", v === "0:v" ? "0:v" : `[${v}]`, "-map", "[aout]", "-t", String(D),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
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

const DIRECTOR_ANGLES = [
  "Angle: masalah → solusi. Hook menyebut masalah yang dirasakan pembeli, gaya caption tegas.",
  "Angle: bukti & harga. Hook menonjolkan harga/promo atau rating, badge harga menonjol.",
  "Angle: hype & tren. Hook penasaran/FOMO ala anak TikTok, animasi dan transisi lebih energik.",
];

/**
 * Let Gemini adjust the timeline from a plain-language instruction ("caption lebih catchy", "musik pelan").
 * It may change text, timing, volumes, caption style, overlays (hook/price/CTA) and clip effects; media files stay
 * as they are. Every value is clamped here. `director` = build a complete ready-to-post version.
 */
export async function aiAdjustEdit(p: VideoProject, e: ProjectEdit, instruction: string, opts: { director?: boolean; angle?: number } = {}) {
  const { askGemini, extractJson } = await import("@/lib/platforms/gemini");
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
    ? `Act as the video's director: produce a complete, ready-to-post edit that maximises watch time and clicks to the product.
- Strong hook in the first 2 seconds: an overlay of kind "judul" (max 4 words) from ~0 to ~2.5s.
- A price badge (kind "harga", short text like "Rp99rb" from the product price) when the price is known, while the product is described.
- A CTA (kind "cta", e.g. "Cek keranjang kuning 👇") in the last ~2.5 seconds.
- Rewrite captions to be punchy (still matching the voice), pick a fitting captionStyle (consider karaoke true), an entrance anim, and fx.
- ${DIRECTOR_ANGLES[(opts.angle ?? 0) % DIRECTOR_ANGLES.length]}
Extra wishes from the user (Indonesian, may be empty): "${wish}"`
    : `Instruction from the user (Indonesian): "${wish}"
Only change what the instruction asks for (plus fixes needed to keep things valid). Keep everything else identical.`;
  const prompt = `You edit a short vertical TikTok affiliate video (Indonesian) on a timeline, like a CapCut editor.
Current timeline (JSON, times in seconds, volumes are gains where 1 = original, max 2):
${JSON.stringify(state)}

${task}

Rules:
- Captions are on-screen text in casual Indonesian, max ~5 words each, must not overlap, must stay inside 0..durationSec, and should match when the voice speaks.
- captionStyle.preset is one of tiktok|kotak|kuning|bersih; captionStyle.anim is the entrance animation, one of none|pop|fade|naik|sapu; captionStyle.karaoke true = the spoken word lights up in captionStyle.accent (one of ${ACCENTS.join(", ")}); captionStyle.x / captionStyle.y are the horizontal / vertical center (0-1; text is kept inside the safe area "safe" automatically); captionStyle.size is font size / video width (0.04-0.09); captionStyle.upper true = UPPERCASE.
- overlays are stickers on their own track: kind is one of judul|harga|cta; x/y center 0-1; size 0.04-0.1; anim like captions. Keep them from covering the captions (different y).
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
  }>(await askGemini(g.sessionKey, prompt).then((raw) => (answerLog.last = raw)));
  if (!ans || typeof ans !== "object") throw new Error("Jawaban Gemini tidak terbaca. Coba lagi.");

  const D = e.duration;
  const isAnim = (a: unknown): a is CaptionAnim => CAPTION_ANIMS.some((x) => x.id === a);
  const next: ProjectEdit = { ...e };
  if (Array.isArray(ans.captions))
    next.captions = ans.captions
      .filter((c) => c && String(c.text ?? "").trim())
      .map((c) => {
        const start = round2(clamp(Number(c.start), 0, D - 0.2));
        return { id: uid(), start, end: round2(clamp(Number(c.end), start + 0.2, D)), text: String(c.text).trim().slice(0, 120) };
      })
      .sort((a, b) => a.start - b.start)
      .slice(0, 80);
  if (ans.captionStyle) {
    const s = ans.captionStyle;
    const cs = e.captionStyle;
    next.captionStyle = {
      preset: ["tiktok", "kotak", "kuning", "bersih"].includes(String(s.preset)) ? (s.preset as ProjectEdit["captionStyle"]["preset"]) : cs.preset,
      x: s.x != null ? round2(clamp(Number(s.x), 0.1, 0.9)) : cs.x,
      y: s.y != null ? round2(clamp(Number(s.y), 0.1, 0.9)) : cs.y,
      anim: isAnim(s.anim) ? s.anim : cs.anim,
      size: s.size != null ? clamp(Number(s.size), 0.035, 0.1) : cs.size,
      upper: s.upper != null ? !!s.upper : cs.upper,
      karaoke: s.karaoke != null ? !!s.karaoke : cs.karaoke,
      accent: /^#[0-9a-f]{6}$/i.test(String(s.accent)) ? String(s.accent) : cs.accent,
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
          text: String(o.text).trim().slice(0, 60),
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
