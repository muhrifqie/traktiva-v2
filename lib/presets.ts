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
  character?: boolean; // a person is the star: the owner can upload the character's face (options.face)
  direction?: string; // English director's note for the AI writer, overrides its generic rules where they differ
  characterLook?: string; // English look of the AI-made character when the owner uploads no face
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
const BACKGROUND: Field = { key: "background", label: "Background", type: "select", default: "auto", options: BACKDROPS };
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

/** Flow video models, saved as options.videoModel. Veo 3.1 Lite (image-to-video) is fixed at 8 s / 720p. */
export const VIDEO_MODELS = [
  { id: "omni", label: "Omni 1.2 Flash", hint: "Durasi 3–15 dtk, bisa pilih resolusi" },
  { id: "veo", label: "Veo 3.1 - Lite", hint: "Klip 8 dtk, 720p" },
] as const;
export const VEO_CLIP_SEC = 8;
export const isVeo = (options: Record<string, string>) => options.videoModel === "veo";
/** A project whose final video is rendered and exported is locked: view, rename, schedule or duplicate only. */
export const isLocked = (p: { status: string; finalPath: string | null; edit?: { exportedAt?: number | null } | null }) =>
  p.status === "done" && !!p.finalPath && !!p.edit?.exportedAt;
/** flow2api model id for one clip of the project. */
export const flowVideoModel = (options: Record<string, string>, clipSec: number) =>
  isVeo(options) ? "veo_3_1_i2v_lite_portrait" : `omni-1.2-flash-${clipSec}s-portrait`;

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
// JJ frames are cut to a fast beat: punchy, high-energy stills instead of calm product shots
const jjLook = "energetic TikTok jedag-jedug edit frame, bold dutch or low camera angle, punchy high-contrast lighting with a soft camera flash, dynamic confident pose";
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
      { label: "Master", imagePrompt: `Hero shot of ${o.model} thrusting ${product(p)} toward the camera lens, ${jjLook}, ${o.background}, ${vertical}`, motionPrompt: "Subtle slow push-in, the person smiles and tilts the product to catch the light. Silent, no music, no speech." },
      { label: "Candid 1", imagePrompt: `Candid moment: ${o.model} pointing at ${product(p)} with a hyped surprised face, mid-movement, ${jjLook}, ${o.background}, ${vertical}`, motionPrompt: "Quick natural hand gesture pointing at the product, slight camera shake like handheld. Silent." },
      { label: "Candid 2", imagePrompt: `Extreme close-up of hands snapping ${product(p)} into frame, details crisp, ${jjLook}, ${o.background}, ${vertical}`, motionPrompt: "Hands rotate the product slowly to show details, smooth motion. Silent." },
      { label: "Candid 3", imagePrompt: `${o.model} striking a cool pose with ${product(p)} and a thumbs up, hair in motion, ${jjLook}, ${o.background}, ${vertical}`, motionPrompt: "Confident thumbs up then a small nod, energetic but smooth. Silent." },
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
    character: true,
    characterLook: "a natural, friendly Indonesian woman around 28 with a warm smile, light natural makeup, shoulder-length black hair",
    direction: "One Indonesian woman wears the product in every scene, face clearly visible and the same person throughout (same face, hair and makeup). Full-body or knee-up shots so the fabric, motif and drape read clearly; relaxed, graceful at-home poses.",
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
    title: "Sensasi Model Cantik",
    summary: "Model cewek cantik dengan pose memikat sambil memegang produk. Wajah karakter bisa pakai fotomu sendiri, lengkap dengan voice-over.",
    bestFor: "Skincare, parfum, kosmetik, fashion, minuman. Konten yang jual lewat visual model.",
    pipeline: ["Wajah karakter", "Pose memikat", "Flow"],
    available: true,
    character: true,
    characterLook: "a beautiful, glamorous Indonesian woman in her mid-20s with glowing skin, polished natural makeup, long dark wavy hair and a confident look",
    direction:
      "The star is one beautiful, glamorous Indonesian woman in her mid-20s, face clearly visible and the same person in every scene. She strikes confident, alluring fashion-model poses that stop the scroll: a slow over-the-shoulder glance, hand on hip, leaning toward the lens, chin down with eyes up, a playful smile or wink, a soft hair flip. Stylish fitted outfit, polished natural makeup, glowing skin, flattering soft light, a clean aesthetic set. She holds the product near her face or at chest height with the label facing the camera. Keep it platform-safe for TikTok Shop: fully clothed, no lingerie or swimwear, no nudity, no focus on cleavage, nothing sexual.",
    fields: [BACKGROUND, VOICE],
    scenes: (p, o) => [
      { label: "Hook", imagePrompt: `Beautiful glamorous Indonesian woman in her mid-20s, confident alluring over-the-shoulder pose, holding ${product(p)} beside her face with the label to the camera, stylish fitted outfit, ${o.background}, ${vertical}`, motionPrompt: `She turns her head slowly to the lens with a confident smile and lifts the product a little. ${voiceLine(o, `Rahasia aku tampil pede ya ${p.name} ini!`)}` },
      { label: "Pose", imagePrompt: `The same woman leaning slightly toward the camera, hand on hip, holding ${product(p)} at chest height, playful look, ${o.background}, ${vertical}`, motionPrompt: `She shifts her weight to the other hip and tilts the product toward the light. ${voiceLine(o, "Hasilnya bikin makin pede seharian.")}` },
      { label: "Ajakan", imagePrompt: `The same woman with a soft hair flip, smiling at the lens, holding ${product(p)} up near her chin, ${o.background}, ${vertical}`, motionPrompt: `A small wink, then she points the product down toward the bottom of the frame. ${voiceLine(o, `Cuma ${p.price || "harga terjangkau"}, cek keranjang di bawah!`)}` },
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

// The owner's own concepts ("Buat konsep sendiri") choose what the built-in concepts fix in code: who is on screen
// (free text, e.g. "cewek setengah badan pakai celana" or "tangan saja"; a face slot appears when the text describes a
// person whose face shows), the mood, the voice and an opening hook. Saved as options.cast / mood / voice / hook.
/** Older concepts saved a fixed choice instead of free text. */
const OLD_CASTS: Record<string, string> = {
  hands: "Only hands are visible, first-person POV; no face in any scene.",
  woman: "One Indonesian woman is the star, her face clearly visible.",
  man: "One Indonesian man is the star, his face clearly visible.",
  none: "No people at all: product-only shots on the set; motion comes from the camera, light or the product itself.",
};
export const MOODS = [
  { value: "natural", label: "Santai & natural", en: "relaxed and natural, like a real buyer filming at home" },
  { value: "energetic", label: "Energik & cepat", en: "high energy and punchy: dynamic poses, bold angles, quick simple actions, upbeat delivery" },
  { value: "elegant", label: "Mewah & elegan", en: "premium and elegant: calm graceful movement, tidy styled set, soft flattering light, confident delivery" },
  { value: "funny", label: "Lucu & menghibur", en: "playful and funny: a light everyday joke or an exaggerated reaction, while the product stays clearly visible" },
] as const;
export const CONCEPT_VOICES = [
  { value: "female", label: "Suara cewek" },
  { value: "male", label: "Suara cowok" },
  { value: "none", label: "Tanpa suara (tambah musik sendiri)" },
] as const;

type ProjectLike = { presetId: string; options: Options };

// Read from the owner's "Siapa yang tampil?" text: is a face on screen (then the project gets a face slot)?
const NO_FACE = /tanpa (orang|wajah|muka|model)|(wajah|muka)(nya)? (tidak|tak|gak|ga|nggak|engga|enggak) (kelihatan|terlihat|tampak|tampil)|tidak (ada|pakai) (wajah|muka|orang)|tangan( saja| aja| doang)?\b|\bpov\b|(pinggang|leher|dada|perut) ke bawah|badan bagian bawah|produk (saja|aja|doang)/i;
const MAN = /\b(cowok|cowo|pria|laki|bapak|om|mas)\b/i;
const WOMAN = /\b(cewek|cewe|wanita|perempuan|ibu|mbak|hijab|hijaber|gadis)\b/i;
const PERSON = /\b(orang|model|kreator|creator|influencer|selebgram|host|anak|remaja)\b/i;

/**
 * The on-screen character whose face stays the same in every scene (face reference, AI-made face), as the noun the
 * prompts use ("woman" / "man" / "person"); null when no face is shown.
 */
export function castOf(p: ProjectLike): string | null {
  if (presetById(p.presetId)?.character) return "woman";
  const c = p.options.cast ?? "";
  if (c === "woman" || c === "man") return c; // older concepts
  if (!c || NO_FACE.test(c)) return null;
  return MAN.test(c) ? "man" : WOMAN.test(c) ? "woman" : PERSON.test(c) ? "person" : null;
}

/** Director's note for the AI writer: the built-in concept's own, or one made from the owner's concept choices. */
export function directionOf(p: ProjectLike): string | undefined {
  const own = presetById(p.presetId)?.direction;
  if (own) return own;
  const cast = p.options.cast ? OLD_CASTS[p.options.cast] ?? `Who is on screen and how they are framed (the owner's own words, in Indonesian; follow them exactly in every scene): ${p.options.cast}` : "";
  const mood = MOODS.find((m) => m.value === p.options.mood);
  const parts = [
    cast,
    castOf(p) && !OLD_CASTS[p.options.cast ?? ""] ? "The person's face is visible and it is the same person in every scene (same face, hair and outfit)." : "",
    mood && `Mood: ${mood.en}.`,
    p.options.voice === "female" || p.options.voice === "male" ? `The voice-over is a ${p.options.voice} Indonesian voice.` : "",
    p.options.hook ? `Open the first scene with this hook idea from the owner (keep its meaning, polish the wording): "${p.options.hook}".` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

/** How the AI-made character looks when the owner uploads no face. */
export function characterLookOf(p: ProjectLike) {
  const own = presetById(p.presetId)?.characterLook;
  if (own) return own;
  if (p.options.cast === "man") return "a friendly Indonesian man in his late 20s with neat short black hair and a natural look";
  if (p.options.cast && !OLD_CASTS[p.options.cast]) return `an Indonesian person who fits this description (the owner's words, in Indonesian): "${p.options.cast}"`;
  return "a friendly Indonesian woman in her mid-20s with natural makeup and black hair";
}

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
