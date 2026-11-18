// Affiliate video concepts. Each preset = a template: which style options to ask, and how to turn the
// product + options into storyboard scenes (image prompt + motion prompt). Prompts are English because
// Flow models follow English best; users can edit every scene before rendering. Gemini-written
// storyboards replace these templates later; the shapes stay the same.

import { voiceLine as voiceLineOf, withoutVoice } from "@/lib/voice";

export type Product = { name: string; details: string; price: string; photos: string[] /* MEDIA_DIR-relative */ };
export type Field =
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; default: string }
  | { key: string; label: string; type: "text"; placeholder?: string; default: string };
export type SceneDraft = { label: string; imagePrompt: string; motionPrompt: string };
export type Options = Record<string, string>;

export type Preset = {
  id: string;
  title: string;
  badge?: "Stabil" | "Baru" | "Segera" | "Bebas";
  summary: string;
  bestFor: string; // plain-language "good for" line on the gallery card
  pipeline: string[];
  available: boolean;
  silent?: boolean; // strip audio from clips (e.g. JJ is synced to music later in CapCut)
  custom?: boolean; // user writes every scene; product photos optional
  fields: Field[];
  scenes: (p: Product, o: Options) => SceneDraft[];
};

const BACKGROUND: Field = {
  key: "background",
  label: "Latar",
  type: "select",
  default: "minimal white studio with soft daylight",
  options: [
    { value: "minimal white studio with soft daylight", label: "Studio putih minimalis" },
    { value: "cozy aesthetic bedroom with warm lamp light", label: "Kamar estetik hangat" },
    { value: "wooden table in a bright cafe", label: "Meja kafe terang" },
    { value: "modern bathroom vanity with marble top", label: "Wastafel marmer" },
    { value: "outdoor garden with natural sunlight", label: "Taman outdoor" },
  ],
};
const MODEL: Field = {
  key: "model",
  label: "Model",
  type: "select",
  default: "young Indonesian woman",
  options: [
    { value: "young Indonesian woman", label: "Cewek" },
    { value: "young Indonesian man", label: "Cowok" },
  ],
};
const VOICE: Field = {
  key: "voice",
  label: "Voice-over",
  type: "select",
  default: "female",
  options: [
    { value: "female", label: "Suara cewek" },
    { value: "male", label: "Suara cowok" },
    { value: "none", label: "Tanpa suara" },
  ],
};

const product = (p: Product) => `the product "${p.name}"${p.details ? ` (${p.details})` : ""}, exactly as in the reference photo`;
const vertical = "vertical 9:16 smartphone photo, realistic, sharp focus, natural colors, no text, no watermark";
const voiceLine = (o: Options, line: string) =>
  o.voice === "none" ? "No dialogue, natural ambient sound." : `A ${o.voice} Indonesian voice says casually in Bahasa Indonesia: "${line}"`;

export const PRESETS: Preset[] = [
  {
    id: "jj",
    title: "TikTok Affiliate Jedag-Jedug (JJ)",
    badge: "Stabil",
    summary: "1 foto master + 3 foto candid dengan variasi gestur tangan, lalu video gerak tanpa suara untuk disinkronkan ke beat di CapCut.",
    bestFor: "Fashion, aksesoris, kosmetik. Video cepat ikut beat musik.",
    pipeline: ["Master", "3 Candid", "Klip senyap"],
    available: true,
    silent: true,
    fields: [BACKGROUND, MODEL],
    scenes: (p, o) => [
      { label: "Master", imagePrompt: `Hero shot of ${o.model} holding ${product(p)} toward the camera, ${o.background}, ${vertical}`, motionPrompt: "Subtle slow push-in, the person smiles and tilts the product to catch the light. Silent, no music, no speech." },
      { label: "Candid 1", imagePrompt: `Candid moment: ${o.model} pointing at ${product(p)} with a surprised face, ${o.background}, ${vertical}`, motionPrompt: "Quick natural hand gesture pointing at the product, slight camera shake like handheld. Silent." },
      { label: "Candid 2", imagePrompt: `Close-up of hands showing details of ${product(p)}, ${o.background}, ${vertical}`, motionPrompt: "Hands rotate the product slowly to show details, smooth motion. Silent." },
      { label: "Candid 3", imagePrompt: `${o.model} giving a thumbs up next to ${product(p)}, cheerful, ${o.background}, ${vertical}`, motionPrompt: "Confident thumbs up then a small nod, energetic but smooth. Silent." },
    ],
  },
  {
    id: "pov",
    title: "POV Tangan",
    summary: "Review produk dari sudut pandang tangan (hands-only) di atas latar pilihanmu, lengkap dengan voice-over.",
    bestFor: "Skincare, gadget kecil, makanan. Review jujur dari tangan.",
    pipeline: ["Produk + latar", "Prompt + VO", "Flow"],
    available: true,
    fields: [BACKGROUND, VOICE],
    scenes: (p, o) => [
      { label: "Buka", imagePrompt: `First-person POV, only hands visible, unboxing ${product(p)} on a ${o.background}, ${vertical}`, motionPrompt: `Hands lift the product out of the box toward the camera. ${voiceLine(o, `Akhirnya ${p.name} datang juga!`)}` },
      { label: "Detail", imagePrompt: `First-person POV close-up, hands holding ${product(p)} showing texture and details, ${o.background}, ${vertical}`, motionPrompt: `Hands turn the product slowly, macro feel. ${voiceLine(o, "Lihat detailnya, rapi banget.")}` },
      { label: "Pakai", imagePrompt: `First-person POV, hands using ${product(p)} naturally, ${o.background}, ${vertical}`, motionPrompt: `Hands demonstrate using the product, satisfying motion. ${voiceLine(o, "Wajib punya, cek keranjang kuning ya!")}` },
    ],
  },
  {
    id: "pov2",
    title: "POV Tangan V2",
    badge: "Baru",
    summary: "Tangan memegang produk di latar pilihanmu: AI membuat frame awal + prompt sekaligus. Lebih cepat, adegan lebih sedikit.",
    bestFor: "Produk kecil apa saja. Paling cepat jadi, cukup 2 adegan.",
    pipeline: ["Produk + latar", "Gambar + prompt", "Flow"],
    available: true,
    fields: [BACKGROUND, VOICE],
    scenes: (p, o) => [
      { label: "Frame awal", imagePrompt: `First-person POV, a hand holding ${product(p)} in front of the camera, ${o.background}, ${vertical}`, motionPrompt: `The hand brings the product closer and shows it from two angles. ${voiceLine(o, `${p.name} ini lagi viral, aku cobain ya.`)}` },
      { label: "Penutup", imagePrompt: `First-person POV, hand placing ${product(p)} neatly on the surface, ${o.background}, ${vertical}`, motionPrompt: `The hand sets the product down and taps it twice. ${voiceLine(o, "Link ada di keranjang kuning!")}` },
    ],
  },
  {
    id: "daster",
    title: "Daster & Homewear Try-On",
    summary: "Gaya santai rumahan: fokus motif daster, jatuh kain, pose anggun di rumah, dan gerak halus.",
    bestFor: "Daster, piyama, baju rumahan, hijab santai.",
    pipeline: ["Detail motif", "Kasual indoor", "Motion halus"],
    available: true,
    fields: [
      {
        key: "room",
        label: "Ruangan",
        type: "select",
        default: "bright living room with plants",
        options: [
          { value: "bright living room with plants", label: "Ruang tamu terang" },
          { value: "cozy bedroom with soft morning light", label: "Kamar pagi hari" },
          { value: "minimalist kitchen", label: "Dapur minimalis" },
        ],
      },
    ],
    scenes: (p, o) => [
      { label: "Detail motif", imagePrompt: `Close-up of the fabric pattern of ${product(p)}, showing texture and drape, ${o.room}, ${vertical}`, motionPrompt: "Slow pan across the fabric, gentle breeze moves the cloth." },
      { label: "Pose kasual", imagePrompt: `Young Indonesian woman wearing ${product(p)}, relaxed elegant pose at home, ${o.room}, full body, ${vertical}`, motionPrompt: "She shifts her weight and smiles, fabric flows naturally." },
      { label: "Putar halus", imagePrompt: `Young Indonesian woman in ${product(p)} doing a slow graceful turn, ${o.room}, full body, ${vertical}`, motionPrompt: "A slow half-turn showing how the dress falls, smooth cinematic motion." },
    ],
  },
  {
    id: "sensasi",
    title: "Sensasi POV Creator",
    summary: "Storyboard kreator: foto model + produk, pose kreator, lalu gerakan video halus dengan voice-over.",
    bestFor: "Produk yang perlu dicontohkan: alat dapur, beauty tools.",
    pipeline: ["Model + produk", "Pose", "Flow"],
    available: true,
    fields: [MODEL, BACKGROUND, VOICE],
    scenes: (p, o) => [
      { label: "Hook", imagePrompt: `${o.model} content creator holding ${product(p)} close to the face, excited expression, ${o.background}, ${vertical}`, motionPrompt: `Leans toward the camera with an excited reaction. ${voiceLine(o, `Kalian harus tahu ${p.name} ini!`)}` },
      { label: "Demo", imagePrompt: `${o.model} demonstrating ${product(p)} to the camera, ${o.background}, ${vertical}`, motionPrompt: `Shows how the product works with natural hand movements. ${voiceLine(o, "Pakainya gampang banget, hasilnya langsung kelihatan.")}` },
      { label: "Ajakan", imagePrompt: `${o.model} pointing down toward the bottom of the frame while holding ${product(p)}, ${o.background}, ${vertical}`, motionPrompt: `Points down and winks. ${voiceLine(o, `Cuma ${p.price || "harga terjangkau"}, klik keranjang kuning!`)}` },
    ],
  },
  {
    id: "custom",
    title: "Racikan Sendiri",
    badge: "Bebas",
    summary: "Tulis prompt sendiri untuk tiap adegan, pakai gambarmu sendiri atau buatan AI. Atur jumlah dan urutan adegan sesukamu.",
    bestFor: "Yang sudah punya ide, gambar, atau gaya sendiri.",
    pipeline: ["Adegan bebas", "Prompt sendiri", "Gambar sendiri / AI"],
    available: true,
    custom: true,
    fields: [
      {
        key: "audio",
        label: "Suara video",
        type: "select",
        default: "on",
        options: [
          { value: "on", label: "Pakai suara dari AI" },
          { value: "off", label: "Tanpa suara (tambah musik sendiri)" },
        ],
      },
    ],
    scenes: () => [
      { label: "Adegan 1", imagePrompt: "", motionPrompt: "" },
      { label: "Adegan 2", imagePrompt: "", motionPrompt: "" },
    ],
  },
  {
    id: "serial3d",
    title: "Serial Animasi Day-N",
    badge: "Segera",
    summary: "Serial 3D low-poly \"day 1 dari nol\": karakter bernarasi, caption kata-per-kata, badge DAY N. Dirender di GPU PC, bukan lewat Flow.",
    bestFor: "Akun konten harian berseri (bukan jualan langsung).",
    pipeline: ["Karakter", "Premis", "Naskah", "Render"],
    available: false,
    fields: [],
    scenes: () => [],
  },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);

/** Display name: a custom project name, else the product name, else the concept title. */
export const projectName = (p: { title: string; presetId: string; product: { name: string } }) =>
  (p.title && p.title !== presetById(p.presetId)?.title ? p.title : "") || p.product.name || presetById(p.presetId)?.title || "Proyek";

/** Clips keep their audio unless the concept is silent or the project turned sound off. */
export const isSilent = (presetId: string, options: Options) => !!presetById(presetId)?.silent || options.audio === "off" || options.voice === "off";
export const defaultOptions = (p: Preset): Options => Object.fromEntries(p.fields.map((f) => [f.key, f.default]));

/** Caption template until Gemini writes captions. */
export function draftCaption(p: Product) {
  const tag = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `${p.name} lagi rame banget! ${p.details ? `${p.details}. ` : ""}${p.price ? `Cuma ${p.price}. ` : ""}Cek keranjang kuning sebelum kehabisan 🛒\n\n#${tag || "racuntiktok"} #racuntiktok #tiktokshop #fyp`;
}

// ---------- one video = one continuous clip, up to 4 different videos per product ----------

/** Total video lengths offered (Omni makes 3–15 s in one take). */
export const VIDEO_SECS = [6, 8, 10, 12, 15] as const;
export const DEFAULT_VIDEO_SEC = 10;
/** How many different videos one product can get in one go. */
export const MAX_VIDEOS = 4;
const WORDS_PER_SEC = 2.4; // relaxed Indonesian voice-over pace

/** Project in "videos" mode: every scene is its own finished video (no joining, no timeline). */
export const isVideosMode = (options: Options) => options.mode === "videos";
/** Finished video file of scene `i` in "videos" mode (MEDIA_DIR-relative). */
export const videoFile = (folder: string, i: number) => `${folder}/video-${i + 1}.mp4`;
export const videoCount = (options: Options) => Math.min(MAX_VIDEOS, Math.max(1, Number(options.videos) || 1));

type Facts = { name: string; short: string; price: string; rating: string | null; sold: string | null };

/** Spoken-friendly product facts out of the name/details fields (filled from the showcase/Kalodata). */
function factsOf(p: Product): Facts {
  const short = p.name.replace(/[([{][^)\]}]*[)\]}]/g, " ").replace(/[-_/|]+/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 4).join(" ");
  return {
    name: p.name,
    short: short || p.name,
    price: p.price,
    rating: p.details.match(/rating\s*(\d+(?:[.,]\d+)?)/i)?.[1] ?? null,
    sold: p.details.match(/terjual\s+(lebih dari\s+[^,]+?|[\d.,]+\s*\w*)\s+dalam/i)?.[1] ?? null,
  };
}

/**
 * The 4 takes on one product: same product, different camera angle, camera movement, starting frame and
 * talking points. Variant 1 keeps the concept as designed.
 */
type Variant = {
  label: string;
  camera: string; // added to the start-frame image prompt
  move: string; // camera movement for the whole take
  start: number; // which concept scene gives the start frame (beats rotate from there)
  script: ((f: Facts) => string[]) | null; // null = the concept's own lines
};
const VARIANTS: Variant[] = [
  { label: "Unboxing", camera: "", move: "", start: 0, script: null },
  {
    label: "Masalah → solusi",
    camera: "shot from a top-down angle directly above (flat-lay view)",
    move: "Smooth overhead camera with a very slow rotation.",
    start: 1,
    script: (f) => [`Susah cari yang pas dan nyaman?`, `${f.short} ini jawabannya.`, `Langsung cek keranjang kuning!`],
  },
  {
    label: "Harga & promo",
    camera: "shot from a 45-degree side angle, product closer to the lens",
    move: "Handheld push-in toward the product, energetic but steady.",
    start: 2,
    script: (f) => [
      f.price ? `Cuma ${f.price} aja!` : `Harganya bikin kaget!`,
      f.sold ? `Udah ${f.sold} terjual.` : `Lagi banyak yang beli.`,
      `Mumpung promo, checkout sekarang!`,
    ],
  },
  {
    label: "Detail & kualitas",
    camera: "eye-level macro close-up with shallow depth of field",
    move: "Slow orbit around the product, revealing texture and details.",
    start: 0,
    script: (f) => [f.rating ? `Rating ${f.rating}, pantes laris.` : `Kualitasnya beneran oke.`, `Lihat detailnya, rapi banget.`, `Wajib masuk keranjang!`],
  },
];

/**
 * One continuous shot of `sec` seconds made from a concept's scenes: the chosen scene's image is the start
 * frame, the scenes from there on become timed beats of the same take (natural order kept), and the spoken lines
 * become one script that fits the length (middle lines dropped first).
 */
function oneShot(scenes: SceneDraft[], sec: number, o: Options, v: Variant, f: Facts, label: string): SceneDraft {
  // start at the variant's scene and keep the concept's order from there (never wrap: "use" before "unbox" reads wrong)
  const order = scenes.slice(Math.min(v.start, scenes.length - 1));
  const step = sec / Math.max(1, order.length);
  const t = (x: number) => (Math.round(x * 10) / 10).toString();
  const beats = order.map((s, i) => `${t(i * step)}–${t((i + 1) * step)}s: ${withoutVoice(s.motionPrompt).replace(/\s*Silent\.?$/i, "")}`);

  const conceptLines = order.map((s) => voiceLineOf(s.motionPrompt)).filter((l): l is string => !!l);
  const speaks = conceptLines.length > 0 && o.voice !== "none";
  // long marketplace titles are unnatural to say out loud: speak the short name
  let lines = speaks ? (v.script ? v.script(f) : conceptLines).map((l) => l.split(f.name).join(f.short)) : [];
  const budget = Math.max(4, Math.floor((sec - 1) * WORDS_PER_SEC));
  const words = (ls: string[]) => ls.join(" ").split(/\s+/).length;
  while (lines.length > 2 && words(lines) > budget) lines = [...lines.slice(0, 1), ...lines.slice(2)];
  if (lines.length === 2 && words(lines) > budget) lines = [lines[0]];
  const audio = lines.length ? `${voiceLine(o, lines.join(" "))} The line is spread naturally over the whole clip.` : "No dialogue, no voice-over.";

  const image = order[0]?.imagePrompt ?? "";
  return {
    label,
    imagePrompt: v.camera ? image.replace(/, vertical 9:16/, `, ${v.camera}, vertical 9:16`) : image,
    motionPrompt: `One continuous ${sec}-second take, no cuts, the same place and product throughout. ${v.move} ${beats.join(" ")} ${audio}`.replace(/\s{2,}/g, " ").trim(),
  };
}

/** `count` (1–4) finished videos for one product, each a single take of `sec` seconds with its own angle and talking points. */
export function buildVideos(scenes: SceneDraft[], sec: number, o: Options, product: Product, count: number): SceneDraft[] {
  if (!scenes.length) return [];
  const f = factsOf(product);
  const n = Math.min(MAX_VIDEOS, Math.max(1, count));
  return VARIANTS.slice(0, n).map((v, i) => oneShot(scenes, sec, o, v, f, n === 1 ? "Video" : `Video ${i + 1} · ${v.label}`));
}
