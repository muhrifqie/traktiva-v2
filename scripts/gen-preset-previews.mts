// Generates the example frames shown on the concept gallery cards (public/presets/<id>-<n>.jpg).
// Uses the preset's own scene templates with a sample product, so previews match what users get.
// Run: npx tsx --conditions=react-server scripts/gen-preset-previews.mts [presetId | presetId:n ...]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import { generateFlowImage } from "@/lib/flow2api";
import { defaultOptions, PRESETS, type Product } from "@/lib/presets";

const SAMPLES: Record<string, Product> = {
  jj: { name: "Velvet Matte Lipstick", details: "red lipstick in a gold tube", price: "Rp 49.000", photos: [] },
  pov: { name: "Glow Serum", details: "small amber glass dropper bottle skincare serum", price: "", photos: [] },
  pov2: { name: "Wireless Earbuds", details: "white earbuds in a small charging case", price: "", photos: [] },
  daster: { name: "Floral Rayon Daster", details: "loose ankle-length Indonesian house dress with pastel floral print", price: "", photos: [] },
  sensasi: { name: "Mini Portable Blender", details: "pastel pink portable bottle blender", price: "Rp 89.000", photos: [] },
};
// JJ is for fashion: its examples show a well-styled creator (dark "starboy" streetwear look) with a sneaker,
// following the same three shots as the preset (hero, candid, cool pose)
const JJ_LOOK = "stylish young Indonesian man with a sleek dark 'starboy' streetwear look: black oversized leather jacket over a white tee, silver chain, small silver earring, neat textured black hair";
const JJ = [
  `Hero shot of a ${JJ_LOOK}, holding a clean white leather sneaker toward the camera, urban night street with soft neon bokeh, editorial fashion photo, vertical 9:16, realistic, sharp focus, no text`,
  `Candid moment: ${JJ_LOOK}, looking at the white sneaker in his hand with a confident half-smile, leaning on a concrete wall, moody city light, fashion street photo, vertical 9:16, realistic, no text`,
  `Full-body cool pose of a ${JJ_LOOK}, wearing the white sneakers and black cargo pants, one hand in pocket, minimalist dark studio with a single spotlight, fashion lookbook photo, vertical 9:16, realistic, no text`,
];
// "Sensasi" = a glamorous creator selling the product with her looks: pretty, stylish, confident (tasteful)
const SENSASI_LOOK = "beautiful glamorous young Indonesian woman content creator, long glossy hair, soft glam makeup, trendy fitted black top, confident alluring smile";
const SENSASI = [
  `${SENSASI_LOOK}, holding a pastel pink portable bottle blender close to her face, looking into the camera, warm golden-hour light in a chic apartment, vertical 9:16, realistic, sharp focus, no text`,
  `${SENSASI_LOOK}, showing the pastel pink portable bottle blender to the camera with one hand, playful head tilt, aesthetic vanity corner with ring light glow, vertical 9:16, realistic, no text`,
  `${SENSASI_LOOK}, posing elegantly with the pastel pink portable bottle blender, winking, soft studio light, beauty influencer photo, vertical 9:16, realistic, no text`,
];
const SERIAL = [
  "Cute low-poly 3D cartoon character, a small farmer with a straw hat standing on an empty grass field at sunrise, game-like render, soft lighting, vertical 9:16, no text",
  "Cute low-poly 3D cartoon character building a tiny wooden hut, sawdust and tools around, game-like render, vertical 9:16, no text",
  "Cute low-poly 3D cartoon character proudly standing in front of a small farm with crops and a hut, sunset, game-like render, vertical 9:16, no text",
];

const out = path.join(process.cwd(), "public", "presets");
fs.mkdirSync(out, { recursive: true });
const only = process.argv.slice(2);

const jobs: { id: string; n: number; prompt: string }[] = [];
for (const p of PRESETS) {
  // args: "jj" = all of a preset's frames, "jj:2" = only that frame
  const prompts = p.id === "serial3d" ? SERIAL : p.id === "jj" ? JJ : p.id === "sensasi" ? SENSASI : p.scenes(SAMPLES[p.id], defaultOptions(p)).slice(0, 3).map((s) => s.imagePrompt.replace(", exactly as in the reference photo", ""));
  prompts.forEach((prompt, i) => {
    if (!only.length || only.includes(p.id) || only.includes(`${p.id}:${i + 1}`)) jobs.push({ id: p.id, n: i + 1, prompt });
  });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "preset-"));
async function one(j: (typeof jobs)[number]) {
  const url = await generateFlowImage(j.prompt, []);
  const buf = url.startsWith("data:") ? Buffer.from(url.split(",")[1], "base64") : Buffer.from(await (await fetch(url)).arrayBuffer());
  const raw = path.join(tmp, `${j.id}-${j.n}.img`);
  fs.writeFileSync(raw, buf);
  // small JPEG: the gallery shows them at ~120px wide
  execFileSync(ffmpeg!, ["-y", "-i", raw, "-vf", "scale=360:-2", "-q:v", "5", path.join(out, `${j.id}-${j.n}.jpg`)], { stdio: "ignore" });
  console.log("ok", j.id, j.n);
}

// 4 at a time, retry each once
let next = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      await one(j).catch(() => one(j)).catch((e) => console.log("FAIL", j.id, j.n, String(e).slice(0, 160)));
    }
  }),
);
process.exit(0);
