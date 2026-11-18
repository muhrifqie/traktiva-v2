# Gaya edit video affiliate terlaris (data KaloData)

Riset 18 Nov 2026. Bahan: **30 video terlaris** (6 per produk) dari 5 produk TikTok Shop Indonesia yang sudah dibuka di KaloData — 3 sepatu, 1 setelan baju, 1 mouse gaming. Omzet per video Rp8 jt – Rp310 jt / 30 hari.

Cara ulang: `npx tsx --conditions=react-server scripts/collect-kalo-videos.mts` → `npx tsx scripts/analyze-kalo-videos.mts` → `python scripts/transcribe-kalo-videos.py small`. Hasil mentah di `data/research/kalo/` (tidak di-commit).

**Batasan:** sampel kecil dan condong ke sepatu (18/30); tanpa pembanding video yang *tidak* laku, jadi ini pola "yang laku itu seperti apa", bukan bukti sebab-akibat.

## Dua format yang dominan

| | A. Ngobrol / review (18/30) | B. Estetik musik (12/30) |
|---|---|---|
| Durasi | 30–68 dtk (median ±50) | 13–20 dtk |
| Suara | Voice-over/ngomong **mulai detik 0**, cepat **165–200 kata/menit** | Musik saja, tanpa omongan |
| Gambar | Wajah + produk dipegang, 1 take | Produk dipegang tangan / dicoba di kaki, 1 take |
| Teks layar | Tidak ada, atau subtitle 1–3 kata kecil (huruf kapital/kecil) di tengah-bawah, kadang 1 kata kuning | 2 baris kecil statis di **atas** sepanjang video ("Sepatu cakep poll / Empuk, nyaman di kaki ✨") |
| CTA | **Lisan**: "cek keranjang kuning / link di kiri bawah" + urgensi | Tidak ada CTA di layar |

Gadget (mouse) beda: **potongan cepat ±3 dtk** (13–19 potongan per video), demo hasil (tes CPS, menu software), subtitle 1 kata kecil di ±78% tinggi, judul tebal di atas hanya 2 detik pertama (1 video).

## Angka

- Video 1 take (≤1 potongan): **18/30**. Sepatu 12/18, baju 5/6, mouse 1/6.
- Produk sudah terlihat di **frame pertama**: 30/30.
- Teks layar: tidak ada 16, statis atas 5, subtitle per kata 7, judul hook besar 1.
- **Badge harga / stiker CTA di layar: 0/30. Transisi efek (zoom/flash): 0/30.**
- Loudness median **−16,7 LUFS** (rentang −31 s/d −8).
- Caption postingan: median 33 huruf + 4 hashtag; sering harga coret ("1,6 jt❌ 160rb✅").

## Pola hook (kalimat pertama, 0–4 dtk)

1. **Jangkar harga** — "harganya bukan 1 juta, bukan 500 ribu…", "looknya kayak sepatu jutaan padahal cuma 160 ribuan", "yang dapat harga 300 ribu kemarin nangis".
2. **Larangan / kebiasaan** — "Di rumah jangan pakai daster terus, Bun", "jangan beli yang KW, ini original".
3. **Tantangan demo** — "kalian bisa gini ga?" sambil menunjukkan fitur.
4. **Bukti sosial / tren** — "Ini yang lagi booming dan turun harga guys".

## Pola penutup (CTA lisan)

"cek keranjang kuning / link di kiri bawah" + urgensi: "mumpung promo", "sebelum stoknya habis", "jangan sampai gak kebagian", info pre-order. Tidak ada yang memakai stiker CTA.

## Dampak ke Traktiva

- Default editor terlalu ramai dibanding video laku: caption besar ber-outline, badge harga, transisi. Sediakan preset **minimal** dan jadikan efek opsional (default mati).
- Template per format: **Review** (VO dari detik 0, hook jangkar harga, CTA lisan + urgensi, subtitle 1–3 kata kecil), **Estetik** (15–20 dtk, musik, teks 2 baris kecil di atas), **Demo cepat** (gadget: potong 2–3 dtk).
- Naskah voice-over: ±2,8–3,3 kata/detik; CTA keranjang kuning ada di naskah, bukan stiker.
- Export: normalisasi loudness ke ±−15 LUFS.
