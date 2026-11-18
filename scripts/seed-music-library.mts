// Fill the music library (MEDIA_DIR/pustaka/musik) with royalty-free Mixkit tracks.
// Mixkit Stock Music Free License: allowed in social media video posts and online marketing ads, no attribution;
// not allowed: remixing into music-only tracks, claiming as your own, registering on Content ID.
// Usage: npx tsx --conditions=react-server scripts/seed-music-library.mts
import { addMusic, listMusic } from "@/lib/audio-library";

const TRACKS: [number, string][] = [
  [371, "Cat Walk - Arulo (Mixkit)"], [288, "One More Dance - Arulo (Mixkit)"], [200, "Oh Lord - Arulo (Mixkit)"],
  [1147, "Midnight Funk - Michael Ramir C (Mixkit)"], [935, "Disco Ain't Old School - Michael Ramir C (Mixkit)"],
  [836, "Let's Move - Michael Ramir C (Mixkit)"], [1210, "Can't Get You Off My Mind - Michael Ramir C (Mixkit)"],
  [158, "Happy Times - Alejandro Magana (Mixkit)"], [282, "Sweet September - Arulo (Mixkit)"],
  [135, "Sleepy Cat - Alejandro Magana (Mixkit)"], [250, "Island Beat - Arulo (Mixkit)"], [738, "Hip Hop 02 - Lily J (Mixkit)"],
  [801, "Happy Home - Michael Ramir C (Mixkit)"], [5, "Feeling Happy - Ahjay Stelino (Mixkit)"],
  [983, "Cherry on Top - Michael Ramir C (Mixkit)"], [1168, "Coffee or Tea - Michael Ramir C (Mixkit)"],
];

const have = new Set((await listMusic()).map((m) => m.name));
for (const [id, name] of TRACKS) {
  if (have.has(name)) continue;
  try {
    const res = await fetch(`https://assets.mixkit.co/music/${id}/${id}.mp3`, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok || !/audio/.test(res.headers.get("content-type") ?? "")) throw new Error(`HTTP ${res.status}`);
    const m = await addMusic(Buffer.from(await res.arrayBuffer()), name, ".mp3");
    console.log("ok", name, `${m.dur}s`, m.bpm ? `${m.bpm} BPM` : "BPM ?", "beat", m.beat);
  } catch (e) {
    console.log("fail", name, (e as Error).message);
  }
  await new Promise((r) => setTimeout(r, 800));
}
console.log((await listMusic()).length, "tracks in library");
process.exit(0);
