// Dev check: synthesise the built-in SFX and detect the tempo of a synthetic 120 BPM click track.
// Usage: npx tsx --conditions=react-server scripts/try-audio-library.mts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpeg from "ffmpeg-static";
import { detectTempo, ensureSfx } from "@/lib/audio-library";
import { resolveMedia } from "@/lib/media";

console.log((await ensureSfx()).map((s) => s.src).join(", "));
const rel = "pustaka/_test-120bpm.wav";
// kick every 0.5 s (120 BPM), first beat at 0.25 s
await promisify(execFile)(ffmpeg!, ["-y", "-f", "lavfi", "-i", "aevalsrc='0.9*sin(2*PI*80*t)*exp(-30*mod(t-0.25+10,0.5))*gte(t,0.25)':d=30", resolveMedia(rel)]);
console.log("tempo", await detectTempo(rel));
await (await import("node:fs/promises")).rm(resolveMedia(rel), { force: true });
process.exit(0);
