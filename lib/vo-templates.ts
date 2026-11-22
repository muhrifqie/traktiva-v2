// Ready-made voice-over scripts for the Studio's "Naskah voice-over" box: the owner picks a selling style, the script
// is filled in with the product's short name and price, and stays editable. Casual Indonesian, CTA "cek keranjang di
// bawah" (lib/writing.ts rules), numbers as digits. Shared by the browser (no imports).

export const VO_MIN_CHARS = 150;

type Fill = { name: string; price: string };

// ~25 words: what fits a 10 s clip at a brisk natural pace; every script stays above VO_MIN_CHARS.
const priceOr = (price: string, withPrice: (p: string) => string, without: string) => (price ? withPrice(price) : without);

export const VO_STYLES: { id: string; label: string; hint: string; write: (f: Fill) => string }[] = [
  {
    id: "hard",
    label: "Hard selling",
    hint: "Langsung jualan, tegas, ajak beli sekarang",
    write: ({ name, price }) =>
      `Stop scroll! ${name} lagi promo, ${priceOr(price, (p) => `cuma ${p}`, "harganya terjangkau banget")}! Kualitasnya bagus dan lagi banyak yang beli. Jangan sampai nyesel, langsung cek keranjang di bawah ya!`,
  },
  {
    id: "soft",
    label: "Soft selling",
    hint: "Santai, cerita pengalaman, ajakan halus",
    write: ({ name, price }) =>
      `Jujur aku langsung suka sama ${name} ini. Enak dipakai, hasilnya kerasa, ${priceOr(price, (p) => `harganya cuma ${p}`, "harganya juga ramah di kantong")}. Kalau penasaran, boleh cek keranjang di bawah ya.`,
  },
  {
    id: "story",
    label: "Storytelling",
    hint: "Cerita singkat sebelum & sesudah pakai",
    write: ({ name, price }) =>
      `Dulu aku bingung cari yang cocok, sampai nyobain ${name}. Ternyata beda banget, sekarang jadi andalan tiap hari. ${priceOr(price, (p) => `Harganya cuma ${p}`, "Harganya juga terjangkau")}, cek keranjang di bawah ya.`,
  },
  {
    id: "problem",
    label: "Masalah → solusi",
    hint: "Angkat masalah sehari-hari, produk jadi solusinya",
    write: ({ name, price }) =>
      `Sering ribet sama masalah yang itu-itu aja? Coba ${name}, praktis dan hasilnya langsung kelihatan. ${priceOr(price, (p) => `Cuma ${p}`, "Harganya terjangkau")}, langsung cek keranjang di bawah ya.`,
  },
  {
    id: "review",
    label: "Review jujur",
    hint: "Kesan jujur setelah dipakai",
    write: ({ name, price }) =>
      `Review jujur ${name} setelah seminggu dipakai. Kualitasnya oke, sesuai foto, dan worth it ${priceOr(price, (p) => `buat harga ${p}`, "buat harganya yang terjangkau")}. Kalau kamu butuh, cek keranjang di bawah ya.`,
  },
  {
    id: "edu",
    label: "Edukasi / tips",
    hint: "Kasih tips, produk sebagai contoh",
    write: ({ name, price }) =>
      `Tips biar hasilnya maksimal: pilih yang praktis dan nyaman dipakai tiap hari, kayak ${name} ini. ${priceOr(price, (p) => `Harganya cuma ${p}`, "Harganya juga terjangkau banget")}, cek keranjang di bawah ya.`,
  },
];

/** "Jian Care herbal Tagen original 60 Kapsul [PROMO]" → "Jian Care herbal Tagen" (a name that sounds natural when spoken). */
export function shortName(name: string) {
  const clean = name.replace(/[[(【][^\])】]*[\])】]/g, " ").replace(/[|•·,/].*$/, "").replace(/\s[-–]\s.*$/, "").replace(/\s+/g, " ").trim();
  const words = clean.split(" ").filter(Boolean);
  return words.length ? words.slice(0, 4).join(" ") : "produk ini";
}

/** "Rp42.000" / "42000" / "Rp 42.000 - Rp 50.000" → "Rp42.000"; "" when there is no price. */
export function spokenPrice(price: string) {
  const m = price.replace(/\s/g, "").match(/(?:rp\.?)?(\d{1,3}(?:\.\d{3})+|\d+)/i);
  if (!m) return "";
  const n = Number(m[1].replace(/\./g, ""));
  return n > 0 ? `Rp${n.toLocaleString("id-ID")}` : "";
}

export function voTemplate(styleId: string, product: { name: string; price: string }) {
  const s = VO_STYLES.find((x) => x.id === styleId);
  return s ? s.write({ name: shortName(product.name), price: spokenPrice(product.price) }) : "";
}

// ---------------------------------------------------------------- several finals: same script, a different hook each
/** The script's first sentence (the hook) and the rest. */
export function splitHook(script: string) {
  const t = script.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.+?[.!?])\s+(.+)$/);
  return m ? { hook: m[1], body: m[2] } : { hook: t, body: "" };
}

// Opening lines of versions B–E, matching each version's story angle (lib/presets.ts VERSIONS); a spare is used when
// one would sound like the hook of video A.
// Each hook in two forms: with the product name (the replaced first sentence was often where the script named it),
// and plain, for scripts whose next sentence already names the product. Short on purpose: the new hook should not
// make the script longer than the clip.
type Hook = [withName: (name: string) => string, plain: string];
const VERSION_HOOKS: Record<string, Hook> = {
  B: [(n) => `Masih ribet tiap hari? Cobain ${n}!`, "Masih ribet tiap hari?"],
  C: [(n) => `Jujur, ${n} ini di luar ekspektasi!`, "Jujur, ini di luar ekspektasi!"],
  D: [(n) => `Lihat dulu ${n} ini, baru percaya!`, "Lihat dulu, baru percaya!"],
  E: [(n) => `Paket ${n} baru datang nih!`, "Paketnya baru datang nih!"],
};
// used when the version's own hook would sound like video A's
const SPARE_HOOKS: Hook[] = [
  [(n) => `Stop scroll, ${n} wajib kalian tahu!`, "Stop scroll, wajib tahu ini!"],
  [(n) => `Kalian wajib tahu ${n} ini!`, "Kalian wajib tahu ini!"],
  [(n) => `${n} lagi rame banget!`, "Lagi rame banget nih!"],
  [(n) => `Nyesel baru tahu ${n} sekarang!`, "Nyesel baru tahu sekarang!"],
];
const opening = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").split(" ").filter(Boolean).slice(0, 2).join(" ");

/**
 * Version B–E of a video with the owner's own voice-over: the same script (style, product, price, CTA) with this
 * version's own hook, so a hook test compares opening lines only. Video A keeps the script as written.
 */
export function versionScript(script: string, key: string, productName: string) {
  const { hook, body } = splitHook(script);
  if (!body || !VERSION_HOOKS[key]) return script;
  const name = shortName(productName);
  const named = !splitHook(body).hook.toLowerCase().includes(name.toLowerCase()); // name it unless the next sentence does
  const pick = ([withName, plain]: Hook) => (named ? withName(name) : plain);
  const keys = Object.keys(VERSION_HOOKS);
  const hookOf = (h: Hook) => (opening(pick(h)) === opening(hook) ? pick(SPARE_HOOKS[keys.indexOf(key) % SPARE_HOOKS.length]) : pick(h));
  // a long first sentence carries the message itself (e.g. the "tips" style): keep it and put a short hook before it
  if (hook.split(" ").length > 10) {
    const [, plain] = VERSION_HOOKS[key];
    return `${opening(plain) === opening(hook) ? SPARE_HOOKS[keys.indexOf(key) % SPARE_HOOKS.length][1] : plain} ${script.replace(/\s+/g, " ").trim()}`;
  }
  return `${hookOf(VERSION_HOOKS[key])} ${body}`;
}

/** What version `key` says before the shared part of the script (its new hook), for the Studio preview. */
export function versionHook(script: string, key: string, productName: string) {
  const full = versionScript(script, key, productName);
  const shared = full.endsWith(script.replace(/\s+/g, " ").trim()) ? script.replace(/\s+/g, " ").trim() : splitHook(script).body;
  return shared && full.endsWith(shared) ? full.slice(0, full.length - shared.length).trim() : splitHook(full).hook;
}
