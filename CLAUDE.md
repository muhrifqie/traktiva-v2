# Traktiva V2

Penerus `C:\BOT\Traktiva\bot-autoupload` (Electron + HTML polos + file JSON). Fitur dipindahkan satu per satu.

## Stack
- Next.js 16 (App Router, TS) — satu kode untuk web & desktop
- Electron 45 — `electron/main.js`. Dev: membuka `localhost:3000`. Paket: menjalankan `.next/standalone/server.js` lewat `utilityProcess` di `127.0.0.1:<port acak>`
- UI: Tailwind v4 + shadcn/ui (style base-nova, Base UI — pakai prop `render`, bukan `asChild`), lucide, sonner
- DB: SQLite (libsql) + Drizzle. File: `TRAKTIVA_DATA_DIR` (Electron = `%APPDATA%\Traktiva`) atau `./data` saat dev
- Migrasi dijalankan otomatis saat server start (`instrumentation-node.ts`)

## Perintah
- `npm run dev` — web saja · `npm run dev:electron` — web + jendela Electron
- `npm run db:generate` — setelah mengubah `lib/db/schema.ts` (hasilnya di `drizzle/`, wajib di-commit)
- `npm run build` lalu `npm start` — tes server produksi · `npm run dist` — installer NSIS di `dist/`

## Aturan
- Menu ada di `lib/nav.ts`. Menu yang belum punya folder di `app/(dashboard)/<slug>/` otomatis tampil sebagai placeholder
- Kerja berat (Playwright, ffmpeg, ADB) dijalankan di server (server action / route / worker), jangan di komponen client
- Fitur khusus desktop: lewat `electron/preload.js` → `window.desktop`. Mode web harus tetap jalan tanpa fitur itu
- Script build menghapus `.next/standalone/data` supaya DB dev tidak ikut ke installer
- Naskah & suara AI: CTA = "cek keranjang di bawah", **jangan pernah** "keranjang kuning" / "link di kiri bawah". Diatur di Pengaturan AI → Aturan naskah (`lib/writing.ts`, `settings.writing`); semua prompt penulis memakai `rulesPrompt()` dan hasilnya disaring `applyRules()`
