// Global writing rules for everything the AI writes or says (scripts, scene voice lines, captions, stickers).
// Set in Pengaturan → Aturan naskah; stored in settings.json (lib/settings.ts → writingRules()).
// No imports: used by the server and the browser.

export type WritingRules = {
  cta: string; // the spoken call to action at the end of every video
  replace: { from: string; to: string }[]; // words the AI must never use, swapped automatically if it still does
  notes: string; // free extra rules (Indonesian), passed to the writer as-is
};

export const DEFAULT_WRITING: WritingRules = {
  cta: "cek keranjang di bawah ya",
  replace: [
    { from: "keranjang kuning", to: "keranjang di bawah" },
    { from: "link di kiri bawah", to: "keranjang di bawah" },
  ],
  notes: "",
};

/**
 * Words TikTok Shop / Shopee reject in health, herbal and supplement content (claims about the body, sexual
 * wording, cure claims). Always on, on top of the owner's own list in Pengaturan AI, and not removable there:
 * a flagged video can get the account limited. `whole` = only as a separate word ("obat", not "obati").
 */
export const PLATFORM_REPLACE: { from: string; to: string; whole?: boolean }[] = [
  { from: "stamina", to: "performa" },
  { from: "obat kuat", to: "suplemen herbal" },
  { from: "vitalitas pria", to: "kebugaran pria" },
  { from: "vitalitas", to: "kebugaran" },
  { from: "perkasa", to: "bugar" },
  { from: "lemah syahwat", to: "kurang fit" },
  { from: "ereksi", to: "performa" },
  { from: "impoten", to: "kurang fit" },
  // longest phrases first: each swap must not leave half of a longer one behind
  { from: "dijamin sembuh total", to: "bantu lebih nyaman" },
  { from: "dijamin sembuh", to: "bantu lebih nyaman" },
  { from: "sembuh total", to: "lebih nyaman" },
  { from: "menyembuhkan", to: "membantu meredakan" },
  { from: "obat", to: "produk", whole: true }, // "obat herbal" → "produk herbal", "bukan obat kimia" → "bukan produk kimia"
];

/** What the platforms forbid that can't be fixed by swapping one word: told to every writer. */
export const PLATFORM_NOTES =
  "Platform rules (TikTok Shop & Shopee ban these, even in a voice line or a scene description): no health or medical claims (curing, healing, disease names such as diabetes, kanker, hipertensi, asam urat), no sexual or adult wording, never call a herbal product or supplement \"obat\", no before/after body numbers (\"turun 5 kg\"), no absolute guarantees. Say \"performa\" instead of \"stamina\".";

/** Lines added to every writer prompt. */
export function rulesPrompt(r: WritingRules = DEFAULT_WRITING) {
  const lines = [`- Call to action (spoken at the end): "${r.cta}" (same meaning, may be phrased casually).`];
  for (const x of [...PLATFORM_REPLACE, ...r.replace]) lines.push(x.to ? `- Never write or say "${x.from}"; say "${x.to}" instead.` : `- Never write or say "${x.from}".`);
  lines.push(`- ${PLATFORM_NOTES}`);
  if (r.notes.trim()) lines.push(`- Owner's rules: ${r.notes.trim().replace(/\s+/g, " ")}`);
  return `OWNER'S WRITING RULES (override any example in this prompt)\n${lines.join("\n")}`;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Safety net after the AI answers (and before any text is spoken or shown): swap banned phrases, the platform's list
 * first, keeping a leading capital. A word is matched at a word start ("Stamina", "staminanya"), never inside another.
 */
export function applyRules(text: string, r: WritingRules = DEFAULT_WRITING) {
  let out = text;
  for (const x of [...PLATFORM_REPLACE, ...r.replace]) {
    const from = x.from.trim();
    if (!from) continue;
    const end = "whole" in x && x.whole ? "(?![\\p{L}\\d])" : "";
    out = out.replace(new RegExp(`(?<![\\p{L}\\d])${esc(from)}${end}`, "giu"), (m) => (m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase() ? x.to.charAt(0).toUpperCase() + x.to.slice(1) : x.to));
  }
  return out.replace(/ {2,}/g, " ").replace(/ ([,.!?])/g, "$1");
}
