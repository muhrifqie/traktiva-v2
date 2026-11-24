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

/** Lines added to every writer prompt. */
export function rulesPrompt(r: WritingRules = DEFAULT_WRITING) {
  const lines = [`- Call to action (spoken at the end): "${r.cta}" (same meaning, may be phrased casually).`];
  for (const x of r.replace) lines.push(`- Never write or say "${x.from}"; say "${x.to}" instead.`);
  if (r.notes.trim()) lines.push(`- Owner's rules: ${r.notes.trim().replace(/\s+/g, " ")}`);
  return `OWNER'S WRITING RULES (override any example in this prompt)\n${lines.join("\n")}`;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Safety net after the AI answers (and before any text is spoken): swap banned phrases, keeping a leading capital. */
export function applyRules(text: string, r: WritingRules = DEFAULT_WRITING) {
  let out = text;
  for (const x of r.replace) {
    if (!x.from.trim()) continue;
    out = out.replace(new RegExp(esc(x.from.trim()), "gi"), (m) => (m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase() ? x.to.charAt(0).toUpperCase() + x.to.slice(1) : x.to));
  }
  return out;
}
