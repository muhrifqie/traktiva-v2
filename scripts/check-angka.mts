// Self-check for lib/angka.ts (numbers in captions ⇄ voice). Usage: npx tsx scripts/check-angka.mts
import assert from "node:assert/strict";
import { numberize, spokenNumbers, terbilang } from "../lib/angka";
import { autoCaptions } from "../lib/edit";

const nz = (s: string) => numberize(s.split(" ").map((text) => ({ text }))).map((t) => t.text).join(" ");

assert.equal(nz("harganya cuma tiga puluh empat ribuan!"), "harganya cuma Rp34 ribuan!");
assert.equal(nz("Rating-nya empat koma enam, dan udah terjual lebih dari lima ribu dalam tiga puluh hari"), "Rating-nya 4,6, dan udah terjual lebih dari 5.000 dalam 30 hari");
assert.equal(nz("cuma seratus tujuh puluh dua ribu rupiah aja"), "cuma Rp172.000 aja");
assert.equal(nz("diskon lima puluh persen"), "diskon 50%");
assert.equal(nz("harga satu koma lima juta"), "harga Rp1,5 juta");
assert.equal(nz("salah satu yang dua warna"), "salah satu yang 2 warna");
assert.equal(nz("cuma 85 ribu"), "cuma Rp85.000");
assert.equal(nz("dua ratus lima puluh ribu orang"), "250.000 orang");
assert.equal(nz("ada sebelas varian"), "ada 11 varian");
assert.equal(nz("puluhan ribu pembeli"), "puluhan ribu pembeli"); // no number: kept

assert.equal(terbilang(172000), "seratus tujuh puluh dua ribu");
assert.equal(terbilang(1015), "seribu lima belas");
assert.equal(spokenNumbers("cuma Rp34.900, rating 4,8"), "cuma tiga puluh empat ribu sembilan ratus rupiah, rating empat koma delapan");
assert.equal(spokenNumbers("diskon 50% dan 5.000+ terjual"), "diskon lima puluh persen dan lima ribu lebih terjual");
assert.equal(spokenNumbers("Rp85rb aja"), "delapan puluh lima ribu rupiah aja");

// round trip: what the voice says comes back as the caption text
assert.equal(nz(spokenNumbers("cuma Rp34.900")), "cuma Rp34.900");

const caps = autoCaptions([{ start: 0, dur: 6, text: "Lagi booming nih, harganya cuma tiga puluh empat ribuan. Rating-nya empat koma enam." }], 2).map((c) => c.text);
console.log(caps);
assert.ok(caps.includes("cuma Rp34 ribuan"), "number kept with 'cuma' in one chunk");
assert.ok(caps.every((c) => !/[.,]$/.test(c)), "no trailing punctuation");
console.log("angka: ok");
