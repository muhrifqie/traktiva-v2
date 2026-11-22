// Indonesian numbers, both ways. Captions show digits ("Rp34.900", "4,6", "5.000", "50%"); the voice (TTS) gets
// words ("tiga puluh empat ribu sembilan ratus rupiah") so it never misreads "5.000" or "Rp". Shared by the
// browser editor and the server (no imports).

export type Tok = { text: string; start?: number; end?: number };

const UNIT: Record<string, number> = { nol: 0, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9 };
const SE: Record<string, number> = { sepuluh: 10, sebelas: 11, seratus: 100 };
const SEBIG: Record<string, number> = { seribu: 1e3, sejuta: 1e6, semiliar: 1e9 };
const BIG: Record<string, number> = { ribu: 1e3, juta: 1e6, miliar: 1e9, triliun: 1e12 };
// a number right after one of these (or followed by "rupiah") is money
const MONEY_BEFORE = /^(harga(nya)?|cuma|cuman|hanya|seharga|diskon|potongan|hemat|mulai|modal|bayar|budget|bujet|senilai|cashback|ongkir|rp)$/;

const DIGITS = /^\d+(?:[.,]\d+)*$/;
const split = (t: string) => {
  const m = t.match(/^([(“"']*)(.*?)([.,!?;:)”"']*)$/)!;
  return { lead: m[1], core: m[2].toLowerCase(), trail: m[3] };
};
/** "172.000" → 172000, "4,8" / "4.8" → 4.8 (a dot before exactly 3 digits groups thousands). */
const parseDigits = (s: string) => (/^\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, "")) : Number(s.replace(",", ".")));
const isNumWord = (w: string) =>
  w in UNIT || w in SE || w in SEBIG || w in BIG || /^(belas|puluh|ratus)$/.test(w) || /^(puluh|ratus|ribu|juta|miliar)an$/.test(w) || DIGITS.test(w) || /^\d+(rb|k|jt)$/.test(w);
const isValueWord = (w: string) => w in UNIT || w in SE || w in SEBIG || DIGITS.test(w) || /^\d+(rb|k|jt)$/.test(w);

/** Value of a run of number words/digits; null when it holds no actual number ("ribuan" alone, "satu" alone). */
function parseRun(words: string[]) {
  let total = 0, group = 0, pending = 0, dec = "", inDec = false, approx: string | null = null, top = 1;
  const frac = () => (dec ? Number(`0.${dec}`) : 0);
  let prevUnit = false;
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    if (inDec && w in UNIT) { dec += UNIT[w]; continue; }
    inDec = false;
    // two digit words in a row are a spoken shorthand, never a sum: "dua lima puluh" = 250 (the first one is the
    // hundreds), "tujuh sembilan ribu" = 79 ribu (the first one is the tens)
    if (w in UNIT && prevUnit) {
      group += pending * (words[k + 1] === "puluh" || words[k + 1] === "puluhan" ? 100 : 10);
      pending = UNIT[w];
      continue;
    }
    prevUnit = w in UNIT;
    if (w === "koma") { inDec = true; continue; }
    const short = w.match(/^(\d+)(rb|k|jt)$/);
    if (short) { total += Number(short[1]) * (short[2] === "jt" ? 1e6 : 1e3); top = Math.max(top, short[2] === "jt" ? 1e6 : 1e3); continue; }
    if (DIGITS.test(w)) { pending += parseDigits(w); continue; }
    if (w in UNIT) { pending += UNIT[w]; continue; }
    if (w in SE) { group += SE[w]; continue; }
    if (w in SEBIG) { total += SEBIG[w]; top = Math.max(top, SEBIG[w]); continue; }
    if (w === "belas") { group += pending + 10; pending = 0; continue; }
    const base = w.replace(/an$/, "");
    if (base !== w) approx = w;
    if (base === "puluh") { group += (pending || 1) * 10; pending = 0; continue; }
    if (base === "ratus") { group += (pending || 1) * 100; pending = 0; continue; }
    if (base in BIG) {
      total += (group + pending + frac() || 1) * BIG[base];
      top = Math.max(top, BIG[base]);
      group = pending = 0;
      dec = "";
    }
  }
  const value = total + group + pending + frac();
  if (!words.some(isValueWord)) return null; // "puluhan ribu" alone is not a number
  return { value: Math.round(value * 100) / 100, approx, top };
}

const fmt = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 2 });

function format(r: { value: number; approx: string | null; top: number }, money: boolean, percent: boolean) {
  if (percent) return `${fmt(r.value)}%`;
  const p = money ? "Rp" : "";
  if (r.approx && r.top >= 1e3) {
    const unit = r.top >= 1e6 ? 1e6 : 1e3;
    return `${p}${fmt(r.value / unit)} ${r.approx}`; // "Rp34 ribuan", "5 ribuan"
  }
  if (r.value >= 1e6 && r.value % 1e5 === 0) return `${p}${fmt(r.value / 1e6)} juta`; // "Rp1,5 juta"
  return `${p}${fmt(r.value)}`;
}

/**
 * Turn spoken number words into digits, merging each number into ONE token (timings joined): "harganya cuma tiga
 * puluh empat ribuan" → "harganya cuma Rp34 ribuan"; "empat koma enam" → "4,6"; "lima puluh persen" → "50%".
 * A lone "satu" stays a word ("salah satu"); other lone digits become numbers ("dua warna" → "2 warna").
 */
export function numberize<T extends Tok>(toks: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < toks.length; ) {
    const first = split(toks[i].text);
    if (!isNumWord(first.core) || first.core === "koma") {
      out.push(toks[i++]);
      continue;
    }
    // collect the run: number words, "koma" between numbers; stop after a token with trailing punctuation
    let j = i;
    const words: string[] = [];
    while (j < toks.length) {
      const s = split(toks[j].text);
      const nextIsNum = j + 1 < toks.length && isNumWord(split(toks[j + 1].text).core);
      if (!(isNumWord(s.core) || (s.core === "koma" && nextIsNum && words.length))) break;
      words.push(s.core);
      j++;
      if (s.trail) break;
    }
    const r = parseRun(words);
    if (!r || (words.length === 1 && (words[0] === "satu" || words[0] === "nol"))) {
      out.push(...toks.slice(i, j));
      i = j;
      continue;
    }
    const last = split(toks[j - 1].text);
    let trail = last.trail, end = toks[j - 1].end;
    let money = MONEY_BEFORE.test(split(out[out.length - 1]?.text ?? "").core);
    let percent = false;
    const next = !trail && j < toks.length ? split(toks[j].text) : null;
    if (next && /^(rupiah|perak)$/.test(next.core)) { money = true; trail = next.trail; end = toks[j].end; j++; }
    else if (next && next.core === "persen") { percent = true; trail = next.trail; end = toks[j].end; j++; }
    out.push({ ...toks[i], text: `${first.lead}${format(r, money, percent)}${trail}`, start: toks[i].start, end });
    i = j;
  }
  return out;
}

/** 172000 → "seratus tujuh puluh dua ribu". Integers only. */
export function terbilang(n: number): string {
  n = Math.floor(Math.abs(n));
  const w = ["nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
  const rest = (r: number) => (r ? ` ${terbilang(r)}` : "");
  if (n < 12) return w[n];
  if (n < 20) return `${w[n - 10]} belas`;
  if (n < 100) return `${w[Math.floor(n / 10)]} puluh${rest(n % 10)}`;
  if (n < 200) return `seratus${rest(n - 100)}`;
  if (n < 1000) return `${w[Math.floor(n / 100)]} ratus${rest(n % 100)}`;
  if (n < 2000) return `seribu${rest(n - 1000)}`;
  if (n < 1e6) return `${terbilang(Math.floor(n / 1e3))} ribu${rest(n % 1e3)}`;
  if (n < 1e9) return `${terbilang(Math.floor(n / 1e6))} juta${rest(n % 1e6)}`;
  return `${terbilang(Math.floor(n / 1e9))} miliar${rest(n % 1e9)}`;
}

/** "4,8" → "empat koma delapan"; "5.000" → "lima ribu". */
const say = (s: string) => {
  const v = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s.replace(".", ",");
  const [int, dec] = v.split(",");
  return `${terbilang(Number(int))}${dec ? ` koma ${[...dec].map((d) => terbilang(Number(d))).join(" ")}` : ""}`;
};
const NUM = String.raw`\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d{1,2})?`;

/** Text for the voice (TTS): every number, price and percentage written out the Indonesian way. */
export function spokenNumbers(t: string) {
  return t
    .replace(new RegExp(String.raw`Rp\.?\s?(${NUM})\s?(rb|ribu|k|jt|juta)?\b`, "gi"), (_, n: string, u?: string) => `${say(n)}${u ? (/^j/i.test(u) ? " juta" : " ribu") : ""} rupiah`)
    .replace(new RegExp(String.raw`(${NUM})\s?%`, "g"), (_, n: string) => `${say(n)} persen`)
    .replace(new RegExp(String.raw`(${NUM})(rb|k|jt)\b`, "gi"), (_, n: string, u: string) => `${say(n)} ${/^j/i.test(u) ? "juta" : "ribu"}`)
    .replace(new RegExp(String.raw`(${NUM})\+`, "g"), (_, n: string) => `${say(n)} lebih`)
    .replace(new RegExp(String.raw`(\d+)x\b`, "g"), (_, n: string) => `${say(n)} kali`)
    .replace(new RegExp(String.raw`(?<![\w.,])(${NUM})(?![\w])`, "g"), (_, n: string) => say(n));
}
