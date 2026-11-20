# Desain Lisensi Traktiva V2

Status: **tahap 1–2 jalan** · server live di `https://43.156.15.173:8443` sejak 20 Nov 2026 (runbook: `server/license/OPS.md`). Login app = splash + layar aktivasi di `electron/screens/`, penjaga di `electron/license.js`.

## Keputusan yang sudah dikunci

| Hal | Keputusan |
|---|---|
| Server | Baru, di **shopeeboosthelper** (bukan `license.etnicstore.com`) |
| Alamat | **IP + HTTPS self-signed**, sertifikat di-*pin* di app. Domain menyusul |
| Offline | **Tidak boleh.** App wajib terhubung ke server lisensi |
| Lisensi V1 | Tidak dibawa. Semua pembeli **aktivasi ulang** dengan key V2 |
| Fitur yang dikunci di server | **Worker upload, akses AI, update app** |

## Prinsip

1. **Server yang menentukan, bukan app.** App lokal hanya menampilkan hasil keputusan server. Fitur bernilai (AI, worker, update) hanya bisa jalan kalau server mengizinkan, karena kemampuannya memang ada di server.
2. **Tidak ada rahasia di dalam `.exe`.** API key AI, kunci privat penandatangan, dan logika harga hanya ada di server.
3. **Key saja tidak cukup.** Setiap perangkat punya pasangan kunci sendiri, jadi key yang bocor tidak bisa langsung dipakai di perangkat lain.
4. **Batas jujur:** pengecekan di sisi app selalu bisa diakali oleh orang yang sangat niat. Targetnya adalah **membuat versi bajakan tidak berguna** (tanpa AI, worker, dan update), bukan membuat pembobolan mustahil.

## Komponen

```
[Traktiva.exe]                         [shopeeboosthelper]
 Electron main  ── HTTPS (pinned) ──▶   license-server (Node + SQLite, pm2)
  ├ penjaga lisensi                      ├ /v1/activate, /v1/session, /v1/heartbeat
  ├ kunci perangkat (safeStorage)        ├ proxy AI (API key di server)
  └ Next lokal (UI)                      ├ feed update (perlu token)
                                         └ admin (hanya localhost, lewat SSH tunnel)
                                       [upload worker] ── cek token ke license-server
```

## Alur

### 1. Aktivasi (sekali per perangkat)
1. Pembeli memasukkan key di layar aktivasi.
2. App membuat **pasangan kunci Ed25519 perangkat**. Kunci privat disimpan terenkripsi dengan `safeStorage` (DPAPI Windows), sedangkan kunci publik dikirim ke server bersama *device hash*.
3. Server memeriksa: key valid, belum dicabut, dan jumlah perangkat belum melebihi batas (default 1). Server lalu mencatat perangkat beserta kunci publiknya.
4. Key **tidak disimpan** di app setelah aktivasi berhasil. Yang tersimpan hanya ID perangkat dan kunci privatnya.

### 2. Membuka app dan selama app dipakai
1. App meminta *nonce* ke server, menandatanganinya dengan kunci perangkat, lalu mengirimnya kembali (challenge–response). Tanda tangan lama tidak bisa diputar ulang.
2. Server menerbitkan **token sesi bertanda tangan** (Ed25519, umur 15 menit) yang berisi lisensi, perangkat, paket, fitur, dan waktu kedaluwarsa. App hanya menyimpan kunci publik server untuk memverifikasi token itu, tidak bisa membuatnya sendiri.
3. **Heartbeat tiap 5 menit** memperbarui token. Server bisa membalas *suspend/revoke*, dan app langsung pindah ke layar terkunci.
4. **Toleransi gangguan jaringan:** 10 menit. Lewat dari itu, app terkunci sampai terhubung lagi. Ini konsekuensi pilihan "selalu online".

### 3. Fitur yang dikunci di server
- **AI:** semua permintaan AI lewat proxy di server dengan token sesi. API key Gemini dan lainnya tidak pernah dikirim ke app. Kuota per lisensi bisa diatur.
- **Worker upload:** worker menolak job tanpa token sesi yang valid dan masih berlaku.
- **Update:** feed `electron-updater` meminta token, jadi versi bajakan tidak mendapat update.

### 4. Ganti perangkat
Owner melakukan reset perangkat dari admin, atau nanti pembeli bisa melakukannya sendiri lewat OTP email (Waroeng Verify) dengan batas misalnya 2× per bulan.

## Data (SQLite di server)

| Tabel | Isi penting |
|---|---|
| `licenses` | `key_hash` (SHA-256 + pepper, key asli **tidak disimpan**), paket, fitur, `max_devices`, status (active/suspended/revoked), kedaluwarsa, catatan pembeli |
| `devices` | `license_id`, `device_hash`, kunci publik perangkat, nama PC, versi app, terakhir terlihat, IP terakhir |
| `nonces` | nonce sekali pakai + waktu kedaluwarsa (pencegah replay) |
| `audit_events` | aktivasi, gagal aktivasi, reset, suspend, anomali (misalnya 1 key dari banyak IP) |

Format key: `TRK-XXXX-XXXX-XXXX-XXXX` (acak ≥ 80 bit). Key hanya ditampilkan sekali saat dibuat.

## Keamanan server
- **Rate limit** per IP dan per key. Setelah beberapa kali gagal aktivasi, IP dikunci sementara.
- Pembandingan konstan-waktu untuk hash key.
- Admin **hanya di `127.0.0.1`**, diakses lewat SSH tunnel (pola yang sama dengan social-uploader), dengan token admin terpisah.
- Kunci privat penandatangan token: file berizin 600, di luar folder app, dan ikut dibackup terenkripsi.
- nginx di port 8443 dengan sertifikat self-signed untuk IP (berlaku s/d 2036). Sertifikat dan sidik jari SHA-256-nya di-*pin* di Electron main (`electron/license-pins.json`); koneksi dengan sertifikat lain ditolak.

## Pengerasan sisi app (mempersulit, bukan jaminan)
- Electron fuses: matikan `RunAsNode` dan `NODE_OPTIONS`, nyalakan integritas asar dan `OnlyLoadAppFromAsar`.
- Semua logika lisensi ada di Electron main, tidak ada di renderer.
- Next lokal mendapat token dari main lewat secret acak per sesi yang hanya berlaku di localhost.

## Operasional
- pm2 `license-server` dengan `max_memory_restart: 200M`. Ini wajib karena helper sering berat oleh Chrome.
- Masuk `cek-server` dan alarm Telegram. Kalau server ini mati, **semua pembeli terkunci**.
- Backup DB harian ke bucket Supabase `server-backups`, sama seperti app lain di helper.

## Tahapan
1. **Server MVP:** aktivasi, sesi, heartbeat, revoke, dan CLI admin (buat key, reset perangkat, suspend).
2. **Integrasi app:** layar aktivasi, layar terkunci, penjaga lisensi di Electron main, pinning.
3. **Gating fitur:** proxy AI, feed update dengan token, cek token di worker.
4. **Pengerasan + monitoring:** fuses, alarm, backup, migrasi pembeli V1 (buat key massal).

## Belum diputuskan
- **Mode web** (dibuka di browser tanpa Electron): perlu login akun, atau dibatasi hanya untuk desktop?
- Paket dan harga (misalnya per bulan / lifetime, jumlah perangkat).
- Domain final.
