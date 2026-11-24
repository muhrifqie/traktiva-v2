// Dev check (no DB writes): one-take voice-over → fit clips → auto SFX → test music → export, on one project.
// Usage: npx tsx --conditions=react-server scripts/try-full-vo.mts <projectId>
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import ffmpeg from "ffmpeg-static";
import { db } from "@/lib/db";
import { videoProjects } from "@/lib/db/schema";
import { autoSfx, beatTimes, normalizeEdit } from "@/lib/edit";
import { addMusic, copyMusicToProject, ensureSfx } from "@/lib/audio-library";
import { exportEdit, fitClipsToVoice, fullVoiceOver, writeFullScript } from "@/lib/editor";
import { resolveMedia } from "@/lib/media";
import fs from "node:fs/promises";

const p = (await db.select().from(videoProjects).where(eq(videoProjects.id, Number(process.argv[2]))).get())!;
let e = normalizeEdit(p.edit!);
const t0 = Date.now();
const script = await writeFullScript(p, e);
console.log("script", script.split(" ").length, "words:", script);
const r = await fullVoiceOver(p, e, script, 2);
console.log("voice", r.spokenSec, "s, timed:", r.timed, "speed", r.edit.voices[0].speed, "captions", r.edit.captions.length, r.edit.captions.slice(0, 4).map((c) => `${c.start}-${c.end} ${c.text}`).join(" | "));
e = await fitClipsToVoice(p, r.edit);
console.log("fit: duration", r.edit.duration, "→", e.duration);
await ensureSfx();
// synthetic 120 BPM "music" (kick + hat) so the export exercises music, ducking and beats
const tmp = resolveMedia("pustaka/_test-music.wav");
await promisify(execFile)(ffmpeg!, ["-y", "-f", "lavfi", "-i", "aevalsrc='0.6*sin(2*PI*70*t)*exp(-25*mod(t,0.5))+0.15*sin(2*PI*880*t)*exp(-60*mod(t+0.25,0.5))':d=40", tmp]);
const m = await addMusic(await fs.readFile(tmp), "test-120bpm.wav", ".wav");
const pm = await copyMusicToProject(m.src, p.folder);
e = { ...e, bgm: { src: pm.src, name: pm.name, dur: pm.dur, volume: 0.35, offset: 0, fade: true, bpm: pm.bpm, beat: pm.beat } };
e = { ...e, sfx: autoSfx(e) };
console.log("music bpm", pm.bpm, "beat", pm.beat, "beats in video", beatTimes(e.bgm, e.duration).length, "| sfx", e.sfx.map((x) => `${x.name}@${x.start}`).join(" "));
console.log("export →", await exportEdit(p, e, []), Math.round((Date.now() - t0) / 1000), "s");
await fs.rm(tmp, { force: true });
process.exit(0);
