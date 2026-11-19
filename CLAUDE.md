# Traktiva V2

App pembuat & pengunggah video affiliate TikTok Shop / Shopee (desktop Electron + web). Penerus `bot-autoupload` (V1).
Dikerjakan berdua (Rifq & Azzam): baca **Kerja tim** sebelum membuat branch, migrasi, atau PR.

**Peta kode**: baca `docs/architecture.md` sebelum mengubah alur video (Studio, render, editor), upload/jadwal TikTok, otomasi browser, atau KaloData.

## Stack
- Next.js 16 (App Router, TS): satu kode untuk web & desktop. Server actions untuk semua aksi data.
- Electron 45 (`electron/main.js`). Dev: buka `localhost:3000`. Paket: `.next/standalone/server.js` lewat `utilityProcess` di `127.0.0.1:<port acak>`
- UI: Tailwind v4 + shadcn/ui (style base-nova, Base UI: pakai prop `render`, bukan `asChild`), lucide, sonner
- DB: SQLite (libsql) + Drizzle. File: `TRAKTIVA_DATA_DIR` (Electron = `%APPDATA%\Traktiva`) atau `./data` saat dev. Migrasi jalan otomatis saat server start (`instrumentation-node.ts`); tanpa restart: `npx tsx --conditions=react-server scripts/migrate.mts`
- Perintah lain: lihat `package.json`

## Kerja tim
- Branch: `main` = rilis, `dev` = integrasi. Kerja di branch sendiri dari `dev` terbaru (`rifq/<fitur>`, `azzam/<fitur>`), PR ke `dev`, di-review satu orang lain. `main` hanya diisi dari `dev`.
- Satu PR = satu fitur, kecil (±30 file). Sebelum PR: `git pull --rebase origin dev`, lalu `npx tsc --noEmit` dan `npm run lint` bersih (CI mengecek hal yang sama).
- **Migrasi DB**: setelah mengubah `lib/db/schema.ts` jalankan `npm run db:generate` dan commit isi `drizzle/`. Kalau nomor migrasi bentrok dengan `dev` (dua orang sama-sama `00NN_`): hapus migrasi milikmu (file `.sql`, snapshot, entri `_journal.json`), rebase, generate ulang. Migrasi yang sudah ada di `dev` bersifat final.
- File rawan bentrok: `app/(dashboard)/video/[id]/wizard.tsx`, `app/(dashboard)/video/project-actions.ts`, `lib/edit.ts`, `app/(dashboard)/video/[id]/editor.tsx`. Kerjakan perubahan kecil & terfokus di sana, dan kabari partner.
- Commit message bahasa Inggris (`feat(jadwal): …`, `fix(studio): …`). Teks UI & pesan ke user bahasa Indonesia.

## Aturan produk
- Menu di `lib/nav.ts`. Menu tanpa folder `app/(dashboard)/<slug>/` otomatis tampil sebagai placeholder.
- Kerja berat (Playwright/Camoufox, ffmpeg, ADB, Flow) jalan di server (server action / route / runner), komponen client hanya memanggilnya.
- Fitur khusus desktop lewat `electron/preload.js` → `window.desktop`; mode web tetap jalan tanpa itu.
- Naskah & suara AI: CTA = "cek keranjang di bawah". Frasa "keranjang kuning" / "link di kiri bawah" dilarang. Aturan di Pengaturan AI → Aturan naskah (`lib/writing.ts`); setiap prompt penulis memakai `rulesPrompt()` dan hasilnya disaring `applyRules()`. Angka ditulis sebagai digit (`lib/angka.ts`).
- Konfirmasi pakai `confirmDialog()` (`components/confirm-dialog.tsx`), bukan `window.confirm/alert`. Preview media pakai `openLightbox()`.
- Build menghapus `.next/standalone/data` supaya DB dev tidak ikut ke installer.

## Akun, data & keamanan
- `data/` (DB, sesi, setelan, kunci API), `.env*`, cookie, HAR: lokal per laptop, tidak pernah di-commit atau dikirim. Repo ini publik.
- Otomasi berjalan di akun asli (TikTok, Google/Flow, ChatGPT, KaloData). Uji upload TikTok dengan dry-run (`scripts/try-upload.mts`, tidak pernah menekan Post). Satu profil akun login di satu laptop saja; dua laptop bersamaan memicu limit/ban.
- Captcha / "Security Check" platform: hentikan dan tampilkan pesan ke user. Tidak ada kode yang mencoba melewatinya.

## Gotcha
- `page.evaluate` yang dijalankan lewat `tsx` (scripts/): esbuild menyisipkan `__name` ke fungsi bernama → pakai arrow function anonim di dalam evaluate.
- `waitForFunction` macet di Camoufox headless; baca DOM lewat `locator(...).textContent()`.
- Profil Camoufox dikunci lintas proses (`withProfile`); jangan buka profil yang sama paralel, panggilannya akan antre.
- Lint react-hooks: tanpa `Date.now()` saat render (`useState(() => Date.now())`), tanpa `setState` sinkron di effect (pakai `useSyncExternalStore` / reset saat render), fungsi bernama `use…` dianggap hook.
- Nomor langkah proyek di DB tetap 1–6 (runner menulis 4/5/6); UI memetakannya ke 3 tab (`viewOf` di `wizard.tsx`).
- `video_projects.options` = map string (maks 3000 karakter per nilai). Kunci penting: `format`, `clips`, `finals`, `versions`/`versionOf`, `written`, `outline`, `showcaseId`.
