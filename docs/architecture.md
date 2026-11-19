# Peta kode Traktiva V2

Untuk agen & developer: di mana tiap fitur tinggal dan bagaimana datanya mengalir. Aturan kerja ada di `CLAUDE.md`.

## Halaman (`app/(dashboard)/`)
| Menu | Folder | Inti |
|---|---|---|
| Beranda | `beranda/` | ringkasan + tile insight KaloData (`kalo-insight.tsx`) |
| Riset Produk | `riset/`, `kalodata/` | ranking & detail produk/video KaloData (TikTok + Shopee) |
| Proyek Video | `proyek/` | daftar proyek, multi-select arsip/hapus, Autopilot (`proyek/autopilot/`) |
| Studio | `video/[id]/` | wizard 3 tab: `wizard.tsx` (Siapkan, Adegan), `editor.tsx` (Hasil), `voice-panel.tsx` |
| Galeri Video | `galeri-video/` | semua hasil export (`lib/video-gallery.ts`) |
| Jadwal Upload | `jadwal/` | antrean upload TikTok + rekomendasi jam (`lib/uploads.ts`, `lib/schedule-tips.ts`) |
| TikTok Shop (Etalase) | `showcase/` | etalase akun, detail produk (`product-detail.tsx`) |
| Pengaturan AI | `pengaturan/` | akun Google/ChatGPT, kecepatan, suara, aturan naskah |

Server actions Studio: `app/(dashboard)/video/project-actions.ts` (semua aksi proyek, versi B–E, `quickMake`, Etalase → produk).

## Alur pembuatan video
1. **Proyek** (`video_projects`): `product` (nama, harga, keunggulan/fakta untuk AI, foto), `presetId` (konsep, `lib/presets.ts`), `options`, `clipSec`, `scenes[]`, `edit`.
2. **Storyboard**: `buildStoryboard()` menyusun adegan dari template konsep (`fitScenes` menyesuaikan jumlah). Video Pendek = 1 adegan; Video Panjang = 6–12 adegan + kerangka bab.
3. **Penulis AI**: `lib/prompt-writer.ts` (`writeScenes`, `writeOutline`, `describeProduct`) → `lib/writer.ts` (ChatGPT kalau diset, fallback Gemini) → `lib/platforms/{chatgpt,gemini}.ts` (browser Camoufox, siaga di `lib/ai-standby.ts`).
4. **Gambar & klip**: `lib/projects.ts` (`queueImages`, `queueRender`) → `lib/flow2api.ts` (flow2api lokal = Google Flow). Paralelisme dibatasi slot global `withSlot` (`lib/video.ts`, setelan Kecepatan). QC gambar oleh Gemini + perbaikan otomatis sekali.
5. **Edit**: `lib/editor.ts` (`prepareEdit`, voice-over satu tarikan Cartesia `lib/cartesia.ts`, `exportEdit` ffmpeg 1080p). Model timeline & caption: `lib/edit.ts`. Overlay digambar di browser (`lib/render-overlays.ts`).
6. **Otomatis penuh**: `autoFinish()` di `lib/autopilot.ts` menjalankan langkah 3–5 tanpa klik. Dipakai Autopilot dan tombol "Buat video sekarang" (`quickMake`, semua versi jalan paralel, status di memori proses server).

## Upload & akun
- TikTok Studio upload: `lib/platforms/tiktok-upload.ts` (caption, produk keranjang, dry-run). Runner terjadwal: `lib/uploads.ts` (dimulai di `instrumentation-node.ts`).
- Etalase TikTok Shop: `lib/platforms/tiktok-shop.ts` (panggilan bertanda tangan dari dalam halaman Streamer Desktop; detail produk dibuka lewat halaman etalase) + cermin lokal `lib/showcase.ts`.
- Browser otomasi: `lib/browser/camoufox.ts` (`withProfile`, satu profil per akun, kunci lintas proses).
- KaloData: `lib/kalodata/` (klien API, lihat `lib/kalodata/README.md`), cache di `lib/kalo.ts`.

## Data
- Skema: `lib/db/schema.ts`; migrasi `drizzle/`. File media di `MEDIA_DIR` (`lib/media.ts`), dilayani `/api/media/...` (`lib/media-url.ts`).
- Setelan & kunci API: `lib/settings.ts` → file JSON di data dir (lokal, tidak di-commit).
