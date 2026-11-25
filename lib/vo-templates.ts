// Ready-made voice-over scripts for the Studio's "Naskah voice-over" box: the owner picks a selling style, the script
// is filled in with the product's short name and price, and stays editable. Casual Indonesian, CTA "cek keranjang di
// bawah" (lib/writing.ts rules), numbers as digits. Shared by the browser (no imports).

export const VO_MIN_CHARS = 150;

type Fill = { name: string; price: string };

// ~25 words: what fits a 10 s clip at a brisk natural pace; every script stays above VO_MIN_CHARS.
const priceOr = (price: string, withPrice: (p: string) => string, without: string) => (price ? withPrice(price) : without);

type Write = (f: Fill) => string;
/**
 * Selling styles, each with several ready scripts so videos don't all say the same thing. They are also the instant
 * fallback of "Tulis pakai AI" (writeVoScript in lib/prompt-writer.ts), which writes a fresh one from the product.
 * `ai` = how the style is described to the AI writer.
 */
export const VO_STYLES: { id: string; label: string; hint: string; ai: string; writes: Write[] }[] = [
  {
    id: "hard",
    label: "Hard selling",
    hint: "Langsung jualan, tegas, ajak beli sekarang",
    ai: "hard selling: direct and energetic, push to buy now",
    writes: [
      ({ name, price }) => `Stop scroll! ${name} lagi promo, ${priceOr(price, (p) => `cuma ${p}`, "harganya terjangkau banget")}! Kualitasnya bagus dan lagi banyak yang beli. Jangan sampai nyesel, langsung cek keranjang di bawah ya!`,
      ({ name, price }) => `Yang dari kemarin nyari ${name}, ini dia! ${priceOr(price, (p) => `Harganya cuma ${p}`, "Harganya bersahabat")}, kualitasnya nggak main-main. Mumpung lagi rame, buruan cek keranjang di bawah sekarang!`,
      ({ name, price }) => `Serius, ${name} ini wajib punya! ${priceOr(price, (p) => `Cuma ${p} aja`, "Harganya murah banget")}, dipakai tiap hari juga awet dan nyaman. Nggak usah mikir lama, langsung cek keranjang di bawah ya!`,
      ({ name, price }) => `Kalian harus coba ${name} ini sekarang juga! ${priceOr(price, (p) => `Dengan ${p} doang`, "Dengan harga segini")} udah dapet kualitas sebagus ini, rugi kalau dilewatin. Langsung checkout, cek keranjang di bawah!`,
    ],
  },
  {
    id: "soft",
    label: "Soft selling",
    hint: "Santai, cerita pengalaman, ajakan halus",
    ai: "soft selling: relaxed personal experience, gentle invitation",
    writes: [
      ({ name, price }) => `Jujur aku langsung suka sama ${name} ini. Enak dipakai, hasilnya kerasa, ${priceOr(price, (p) => `harganya cuma ${p}`, "harganya juga ramah di kantong")}. Kalau penasaran, boleh cek keranjang di bawah ya.`,
      ({ name, price }) => `Akhir-akhir ini aku lagi suka banget pakai ${name}. Simpel, nyaman, dan bikin hari lebih praktis. ${priceOr(price, (p) => `Harganya ${p}`, "Harganya juga masuk akal")}, cek keranjang di bawah kalau mau coba.`,
      ({ name, price }) => `Nemu ${name} ini dan ternyata cocok banget buat aku. Nggak ribet, hasilnya rapi, ${priceOr(price, (p) => `dan cuma ${p}`, "dan harganya terjangkau")}. Siapa tahu kamu juga butuh, cek keranjang di bawah ya.`,
      ({ name, price }) => `Pelan-pelan aku jadi andalin ${name} ini tiap hari. Kualitasnya oke dan dipakainya enak. ${priceOr(price, (p) => `Cuma ${p}`, "Harganya juga pas")}, kalau tertarik boleh cek keranjang di bawah.`,
    ],
  },
  {
    id: "story",
    label: "Storytelling",
    hint: "Cerita singkat sebelum & sesudah pakai",
    ai: "storytelling: a short before/after story from the speaker's own life",
    writes: [
      ({ name, price }) => `Dulu aku bingung cari yang cocok, sampai nyobain ${name}. Ternyata beda banget, sekarang jadi andalan tiap hari. ${priceOr(price, (p) => `Harganya cuma ${p}`, "Harganya juga terjangkau")}, cek keranjang di bawah ya.`,
      ({ name, price }) => `Minggu lalu temenku nunjukin ${name} ini, awalnya aku ragu. Pas aku coba sendiri, langsung ngerti kenapa dia suka. ${priceOr(price, (p) => `Cuma ${p}`, "Harganya ramah")}, cek keranjang di bawah.`,
      ({ name, price }) => `Aku sempat capek sama barang yang cepat rusak. Terus ketemu ${name}, dan sampai sekarang masih awet dipakai. ${priceOr(price, (p) => `Harganya ${p} aja`, "Harganya juga oke")}, cek keranjang di bawah ya.`,
      ({ name, price }) => `Awalnya iseng beli ${name}, eh malah jadi barang yang paling sering aku pakai. Nyesel kenapa nggak dari dulu. ${priceOr(price, (p) => `Cuma ${p}`, "Harganya terjangkau")}, cek keranjang di bawah.`,
    ],
  },
  {
    id: "problem",
    label: "Masalah → solusi",
    hint: "Angkat masalah sehari-hari, produk jadi solusinya",
    ai: "problem then solution: open with an everyday problem, the product solves it",
    writes: [
      ({ name, price }) => `Sering ribet sama masalah yang itu-itu aja? Coba ${name}, praktis dan hasilnya langsung kelihatan. ${priceOr(price, (p) => `Cuma ${p}`, "Harganya terjangkau")}, langsung cek keranjang di bawah ya.`,
      ({ name, price }) => `Capek tiap hari harus repot sendiri? ${name} ini bikin semuanya jadi lebih gampang, cepat, dan rapi. ${priceOr(price, (p) => `Harganya ${p}`, "Harganya bersahabat")}, cek keranjang di bawah ya.`,
      ({ name, price }) => `Kesel nggak sih kalau barangnya nggak awet dan bikin boros? Makanya aku pindah ke ${name}, jauh lebih tahan lama. ${priceOr(price, (p) => `Cuma ${p}`, "Harganya oke")}, cek keranjang di bawah.`,
      ({ name, price }) => `Waktu pagi selalu mepet? ${name} bantu kamu beres lebih cepat tanpa ribet sama sekali. ${priceOr(price, (p) => `Harganya cuma ${p}`, "Harganya juga terjangkau")}, langsung aja cek keranjang di bawah ya.`,
    ],
  },
  {
    id: "review",
    label: "Review jujur",
    hint: "Kesan jujur setelah dipakai",
    ai: "honest review: plain first impressions after really using it",
    writes: [
      ({ name, price }) => `Review jujur ${name} setelah seminggu dipakai. Kualitasnya oke, sesuai foto, dan worth it ${priceOr(price, (p) => `buat harga ${p}`, "buat harganya yang terjangkau")}. Kalau kamu butuh, cek keranjang di bawah ya.`,
      ({ name, price }) => `Oke, ini pendapat jujurku soal ${name}. Bahannya bagus, enak dipakai, pengirimannya juga cepat. ${priceOr(price, (p) => `Untuk ${p}`, "Untuk harganya")} ini sepadan banget. Cek keranjang di bawah ya.`,
      ({ name, price }) => `Udah dua minggu pakai ${name}, ini kesanku. Awet, praktis, enak dipakai, dan nggak mengecewakan. ${priceOr(price, (p) => `Dengan harga ${p}`, "Dengan harga segini")}, aku rekomen. Cek keranjang di bawah.`,
      ({ name, price }) => `Jujur aja ya, ekspektasiku biasa aja ke ${name}. Ternyata hasilnya lebih bagus dari dugaan. ${priceOr(price, (p) => `Harganya ${p}`, "Harganya juga masuk akal")}, cek keranjang di bawah kalau mau.`,
    ],
  },
  {
    id: "edu",
    label: "Edukasi / tips",
    hint: "Kasih tips, produk sebagai contoh",
    ai: "educational tips: give a useful tip, the product is the example",
    writes: [
      ({ name, price }) => `Tips biar hasilnya maksimal: pilih yang praktis dan nyaman dipakai tiap hari, kayak ${name} ini. ${priceOr(price, (p) => `Harganya cuma ${p}`, "Harganya juga terjangkau banget")}, cek keranjang di bawah ya.`,
      ({ name, price }) => `Satu tips simpel: jangan asal pilih, cek dulu bahan dan kenyamanannya. Contohnya ${name}, kualitasnya jelas dan nyaman dipakai. ${priceOr(price, (p) => `Cuma ${p}`, "Harganya oke")}, cek keranjang di bawah.`,
      ({ name, price }) => `Biar nggak salah beli, perhatikan tiga hal: awet, praktis, dan harganya masuk akal. ${name} lolos semuanya. ${priceOr(price, (p) => `Harganya ${p}`, "Harganya terjangkau")}, cek keranjang di bawah ya.`,
      ({ name, price }) => `Banyak yang belum tahu, barang yang tepat bikin rutinitas jauh lebih ringan. Aku pakai ${name} buat itu. ${priceOr(price, (p) => `Cuma ${p}`, "Harganya bersahabat")}, cek keranjang di bawah.`,
    ],
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

/**
 * A script from the server's template gallery (Galeri template → Naskah VO): {nama} / {harga}; a [segment] that holds
 * {harga} is dropped when the product has no price, other brackets just lose their brackets.
 */
export function fillLine(line: string, { name, price }: Fill) {
  return line
    .replace(/\[([^\]]*)\]/g, (_, seg: string) => (seg.includes("{harga}") && !price ? "" : seg))
    .replaceAll("{nama}", name)
    .replaceAll("{harga}", price || "harga terjangkau")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
/** Server script styles (lib/templates.ts scriptStyles) in the same shape as VO_STYLES. */
export type ScriptStyle = { id: string; label: string; hint: string; ai: string; lines: string[] };
export const withScriptStyles = (extra: ScriptStyle[] = []) => [...VO_STYLES, ...extra.map((s) => ({ ...s, writes: s.lines.map((l): Write => (f) => fillLine(l, f)) }))];

/** A ready script in this style for the product, a different one from `avoid` (the script in the box now). */
export function voTemplate(styleId: string, product: { name: string; price: string }, avoid = "", extra: ScriptStyle[] = []) {
  const s = withScriptStyles(extra).find((x) => x.id === styleId);
  if (!s) return "";
  const fill = { name: shortName(product.name), price: spokenPrice(product.price) };
  const all = s.writes.map((w) => w(fill));
  const fresh = all.filter((t) => t !== avoid.trim());
  return fresh[Math.floor(Math.random() * fresh.length)] ?? all[0];
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
