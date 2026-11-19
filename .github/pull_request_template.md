## Apa yang berubah
<!-- 1–5 poin. Fitur/halaman mana yang kena. -->

## Kenapa
<!-- Masalah atau permintaan yang diselesaikan. -->

## Cara ngetes
<!-- Langkah yang sudah kamu jalankan + hasilnya (screenshot UI kalau ada). -->

## Checklist
- [ ] `npx tsc --noEmit` dan `npm run lint` bersih
- [ ] Ada perubahan `lib/db/schema.ts`? → migrasi baru dari `npm run db:generate` ikut di-commit, nomornya tidak bentrok dengan `dev`
- [ ] Tidak ada secret / `.env` / cookie / isi `data/` yang ikut
- [ ] Teks UI bahasa Indonesia; CTA naskah tetap "cek keranjang di bawah"
- [ ] Otomasi akun (TikTok / Google / ChatGPT / KaloData) diuji dengan dry-run atau akun sendiri, tidak memposting tanpa sengaja
