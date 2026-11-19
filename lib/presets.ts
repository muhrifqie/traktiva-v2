// Affiliate video concepts. Each preset = a template: which style options to ask, and how to turn the
// product + options into storyboard scenes (image prompt + motion prompt). Prompts are English because
// Flow models follow English best; users can edit every scene before rendering. Gemini-written
// storyboards replace these templates later; the shapes stay the same.

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

/**
 * Tidy "aesthetic product background" sets, the look of affiliate product shots on Pinterest/TikTok Shop: one clean
 * surface, the product as hero, 1–3 soft props, gentle light. The value is the English set description the image
 * prompts use; "auto" lets the writer pick the set that fits the product (BACKDROPS without "auto" is that list).
 */
export const BACKDROPS: { value: string; label: string }[] = [
  { value: "auto", label: "Otomatis (AI pilih sesuai produk)" },
  { value: "clean white tabletop corner, a pleated table lamp glowing warm, a few pink tulips in a clear glass vase and a small stack of pastel books softly blurred behind, soft daylight", label: "Meja putih + lampu lipit + tulip" },
  { value: "round fluffy light-grey rug on a pale floor, the product placed in its center, a small potted plant at the edge, soft window daylight", label: "Karpet bulu bulat" },
  { value: "white desk against a light grey wall, a sleek desk lamp casting a soft pool of light, a large monstera leaf at the side, calm and minimal", label: "Meja kerja + lampu + monstera" },
  { value: "pastel pink vanity corner with a wavy mirror, soft pink LED glow, tulips and a cute mushroom lamp, girly and dreamy", label: "Pink girly + cermin" },
  { value: "warm wooden table by a sunny window, soft leaf shadows falling across the surface, one small green plant, cozy and natural", label: "Meja kayu + bayangan daun" },
  { value: "plain off-white wall corner and tabletop with soft leaf shadows, very minimal and airy, lots of empty space", label: "Polos minimal + bayangan daun" },
  { value: "cream knitted round placemat on white linen, dried flowers in an amber glass bottle, warm golden-hour light", label: "Rajut krem + bunga kering" },
  { value: "fresh green artificial grass mat with sunflowers and a white pegboard wall behind, bright cheerful daylight", label: "Rumput hijau + bunga matahari" },
  { value: "dark grey carpet with a black-and-white round rug, a cool blue LED strip along the wall, modern and moody", label: "Gelap modern + LED (cowok/gadget)" },
  { value: "minimal white studio with soft daylight", label: "Studio putih polos" },
  { value: "modern bathroom vanity with marble top", label: "Wastafel marmer" },
];
/** The set an image prompt uses ("auto" in templates = the classic white tabletop; the AI writer picks its own). */
export const backdropOf = (v?: string) => (!v || v === "auto" ? BACKDROPS[1].value : v);
const BACKGROUND: Field = { key: "background", label: "Latar produk", type: "select", default: "auto", options: BACKDROPS };
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

/**
 * "Jumlah video final" (max 5): version A is the project itself; B–E are sibling projects of the same product with their
 * own story angle (fed to the AI storyboard writer) and, when the set is "auto", their own set, so the finals differ.
 */
export const VERSIONS = [
  { key: "A", desc: "Sesuai pilihanmu", angle: "", set: "" },
  {
    key: "B",
    desc: "Masalah → solusi",
    angle: "Problem → solution: the hook names an everyday annoyance the product fixes, the middle shows the product solving it, the end shows the result and the CTA.",
    set: BACKDROPS[5].value,
  },
  {
    key: "C",
    desc: "Review jujur",
    angle: "Honest buyer review: the hook is a surprising honest verdict, the middle shows 2–3 concrete details up close, the end is a personal recommendation and the CTA.",
    set: BACKDROPS[6].value,
  },
  {
    key: "D",
    desc: "Hasil dulu",
    angle: "Result first: the hook shows the end result or the product already in use, then how it gets there in one smooth action, then the CTA.",
    set: BACKDROPS[2].value,
  },
  {
    key: "E",
    desc: "Unboxing POV",
    angle: "Buyer POV unboxing: the hook is the parcel opening, then the first touch and one detail up close with a genuine reaction, then the CTA.",
    set: BACKDROPS[7].value,
  },
] as const;

/** Clip lengths Flow's Omni 1.2 model renders (3–15 s); above 10 s needs a Google AI Plus/Pro/Ultra plan. */
export const CLIP_SECS = Array.from({ length: 13 }, (_, i) => i + 3);
export const PRO_CLIP_SEC = 11;

/**
 * Resize a template storyboard to `n` clips: fewer = keep the opening ones and the closing (CTA) scene; more = add
 * variations of the middle scenes before the closing one, each asking for a different angle so clips don't repeat.
 */
export function fitScenes<T extends SceneDraft>(scenes: T[], n: number): T[] {
  if (!n || n === scenes.length || !scenes.length) return scenes;
  const last = scenes[scenes.length - 1];
  if (n < scenes.length) return n === 1 ? [scenes[0]] : [...scenes.slice(0, n - 1), last];
  const body = scenes.length > 2 ? scenes.slice(1, -1) : scenes.slice(0, 1);
  const extra = Array.from({ length: n - scenes.length }, (_, k) => {
    const s = body[k % body.length];
    return { ...s, label: `${s.label} ${Math.floor(k / body.length) + 2}`.slice(0, 60), imagePrompt: `${s.imagePrompt}, different camera angle and pose from the other shots` };
  });
  return scenes.length > 1 ? [...scenes.slice(0, -1), ...extra, last] : [...scenes, ...extra];
}

/** "Video Panjang" explanation types: what the AI outline and storyboard are built around. */
export const EXPLAIN = [
  { key: "tutorial", label: "Tutorial", desc: "Langkah demi langkah cara pakai", brief: "Step-by-step tutorial: each chapter is one step of using the product, in order, with the result shown at the end." },
  { key: "compare", label: "Perbandingan", desc: "Sebelum vs sesudah, atau vs produk biasa", brief: "Comparison: before vs after (or vs an ordinary alternative, never a named brand), proving the difference visually." },
  { key: "deep", label: "Review mendalam", desc: "Kelebihan, kekurangan jujur, cocok untuk siapa", brief: "In-depth honest review: first impression, 3 strengths shown in use, 1 honest minor drawback, who it is for, verdict." },
  { key: "unbox", label: "Unboxing + tes", desc: "Buka paket, cek isi, langsung dites", brief: "Unboxing and test: packaging, what is inside, build quality up close, then a real test in daily use." },
] as const;
export type ExplainKey = (typeof EXPLAIN)[number]["key"];

/** Seconds from a KaloData duration ("00:15", "1:02:03", "15", "15s"). */
export function parseDuration(v?: string | number | null) {
  if (v == null) return 0;
  const s = String(v).trim();
  if (s.includes(":")) return s.split(":").map(Number).reduce((a, x) => a * 60 + (x || 0), 0);
  return parseFloat(s) || 0;
}

/** Format + length that matches how long the product's best-selling videos are (KaloData). */
export function suggestFromRef(sec: number): { format: "short" | "long"; clips: number; clipSec: number } | null {
  if (!sec) return null;
  if (sec <= 12) return { format: "short", clips: 1, clipSec: sec <= 8.5 ? 8 : 10 };
  if (sec <= 50) return { format: "short", clips: Math.min(10, Math.max(2, Math.round(sec / 6))), clipSec: 6 };
  return { format: "long", clips: Math.min(12, Math.max(6, Math.round(sec / 10))), clipSec: 10 };
}

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
      { label: "Pakai", imagePrompt: `First-person POV, hands using ${product(p)} naturally, ${o.background}, ${vertical}`, motionPrompt: `Hands demonstrate using the product, satisfying motion. ${voiceLine(o, "Wajib punya, cek keranjang di bawah ya!")}` },
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
      { label: "Penutup", imagePrompt: `First-person POV, hand placing ${product(p)} neatly on the surface, ${o.background}, ${vertical}`, motionPrompt: `The hand sets the product down and taps it twice. ${voiceLine(o, "Linknya ada di keranjang bawah!")}` },
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
      { label: "Ajakan", imagePrompt: `${o.model} pointing down toward the bottom of the frame while holding ${product(p)}, ${o.background}, ${vertical}`, motionPrompt: `Points down and winks. ${voiceLine(o, `Cuma ${p.price || "harga terjangkau"}, cek keranjang di bawah!`)}` },
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
      BACKGROUND,
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
  return `${p.name} lagi rame banget! ${p.details ? `${p.details}. ` : ""}${p.price ? `Cuma ${p.price}. ` : ""}Cek keranjang di bawah ya 🛒\n\n#${tag || "racuntiktok"} #racuntiktok #tiktokshop #fyp`;
}
