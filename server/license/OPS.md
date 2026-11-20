# OPS — Traktiva license server

Server lisensi app desktop Traktiva V2 (aktivasi key, sesi, heartbeat). Desain: `docs/license-design.md` di repo Traktiva V2.
**Kalau server ini mati, semua pembeli Traktiva terkunci** (app wajib online; toleransi 10 menit).

## Lokasi
| Hal | Nilai |
|---|---|
| Server | shopeeboosthelper (43.156.15.173) |
| Folder | `/srv/traktiva-license` (kode: `lib.mjs`, `server.mjs`, `admin.mjs`; sumber: repo `server/license/`) |
| Data | `/srv/traktiva-license/data` (700): `license.db` (SQLite), `secrets.json` (600, kunci tanda tangan + pepper) |
| Proses | pm2 `traktiva-license` → `127.0.0.1:3820`, `max_memory_restart 200M` |
| Publik | nginx `https://43.156.15.173:8443` → `/etc/nginx/sites-available/traktiva-license` (rate limit 30/menit/IP, burst 20) |
| TLS | self-signed IP `/etc/nginx/ssl/traktiva-license.{crt,key}` (s/d 2036). **Sertifikat ini di-pin di app** (`electron/license-pins.json`) |
| Firewall | ufw `8443/tcp` (Tencent security group juga harus mengizinkan) |

## Admin Panel (web, sejak 2026-11-20)
- Next.js app `web/` di repo → `/srv/traktiva-web` (standalone), pm2 `traktiva-web` → **hanya** `127.0.0.1:3821` (tidak dibuka di nginx/ufw). Env di `ecosystem.config.cjs` (600; membaca token layanan saat start).
- App web **tidak memegang DB/rahasia**: semua lewat pm2 `traktiva-license-internal` (`internal-api.mjs`) → `127.0.0.1:3822`, wajib token layanan (`data/service-token`, 600) + sesi admin.
- Buka: **https://43.156.15.173:8443/admin** (sertifikat self-signed → klik Advanced/Lanjutkan; sementara sampai ada domain). nginx meneruskan `/admin`, `/_next/`, `/icon.png`, `/logo.svg` ke 3821 (snippet `/etc/nginx/snippets/traktiva-admin-proxy.conf`), sisanya tetap ke API lisensi. Batas: 120 req/menit/IP, `/admin/login` 6/menit/IP. Cookie `Secure` (`ADMIN_COOKIE_SECURE=1`). Cadangan: SSH tunnel `ssh -N -L 3821:127.0.0.1:3821 shopeeboosthelper` → `http://localhost:3821`. Backup config sebelum perubahan: `traktiva-license.bak-20261120`.
- Admin: **Owner** dan **Azzam**, login **username + password** (scrypt, setiap aksi tercatat dengan nama di Log). Ganti password sendiri: Pengaturan → Ganti password (sesi lain keluar). Admin baru / lupa password: `node admin.mjs add-admin <nama>` → password acak tampil sekali (sesi lama orang itu keluar). Hapus: `remove-admin <nama>`. Sesi 12 jam. 5× salah dari satu IP = IP itu dikunci 15 menit (IP lain tetap bisa), ditambah nginx 6 percobaan/menit/IP.
- Isi panel: Ringkasan · Lisensi (cari, filter, **Buat key**: paket + hari + perangkat + jumlah, key tampil sekali + CSV) · Detail (perpanjang, lifetime, ubah catatan/perangkat, tangguhkan/aktifkan, cabut, reset perangkat, riwayat) · Log · Pengaturan (paket & harga).

## Website & pusat informasi (sejak 2026-11-20)
- **https://43.156.15.173:8443/** = landing jualan · `/masuk` + `/akun` = area pembeli (login pakai key lisensi, sesi 7 hari, 10× salah per IP = kunci 15 menit) · `/admin` = panel. Semua dari pm2 `traktiva-web`; nginx hanya meneruskan `/v1/*` dan `/health` ke API lisensi.
- Panel → **Pengumuman** (banner di app + dashboard pembeli), **Rilis** (versi terbaru + link installer https; "wajib" = banner merah di app lama), **Pengaturan** → harga paket (tampil di landing), nomor WA (tombol Beli/Perpanjang), **Setelan app jarak jauh** (flag ke semua app; `maxParallel` membatasi slot Flow).
- App desktop menerima semua itu di jawaban `/v1/session` (heartbeat 5 menit) → `<userData>/server-info.json` → `lib/server-info.ts`.
- Harga 0 = "Hubungi kami" di landing; WA kosong = tombol beli nonaktif.

## Kunci hardware, peran, ganti lisensi (sejak 2026-11-20)
- **HWID**: saat aktivasi app mengirim hash per komponen (Windows/MachineGuid, motherboard UUID + serial, CPU, total RAM, disk sistem, BIOS); tiap heartbeat dibandingkan. Lebih banyak komponen beda dari toleransi (Pengaturan → Kunci hardware, default 0 = ketat) → `device_changed`, app terkunci + pesan komponen mana. Solusi pembeli ganti RAM/disk: **reset perangkat** lalu aktivasi ulang (terkunci ke hardware baru). Kejadian tercatat di Log "Hardware berubah, ditolak".
- **Peran**: `member` (pembeli) / `admin` (tim: label Admin + pintasan Panel admin di app; panel tetap butuh login). Buat: centang "Lisensi admin" atau `node admin.mjs create --role admin`. Ubah: detail lisensi → Peran.
- **Ganti lisensi** (sidebar app → kartu lisensi): app melepas slot PC-nya sendiri (`POST /v1/release`, ditandatangani kunci perangkat), lalu minta key baru. Layar terkunci juga punya "Pakai key lain".

## Akun member (sejak 2026-11-20)
- Pembeli daftar di `/daftar` (email + password, atau Google), masuk di `/masuk`, lalu **klaim key** di `/akun`. App desktop tetap aktivasi pakai key.
- Data: tabel `users`, `user_sessions` (sesi 30 hari), `licenses.user_id` (pemilik), `licenses.self_reset_at`. Kode: `members.mjs` (dipanggil web lewat API internal, header `x-member-session`).
- Pembeli boleh **lepas 1 PC per lisensi per 7 hari** sendiri; lebih dari itu lewat admin (detail lisensi → Reset). Log: "Perangkat direset … (oleh pembeli)".
- Admin: email pemilik tampil di daftar/detail lisensi (cari pakai email), tombol "Lepas dari akun" kalau key salah akun / pindah tangan.
- Batas percobaan: 10× salah per IP (daftar/masuk) atau per akun (klaim key) → jeda 15 menit.
- **Lupa password**: belum ada kirim email. Pembeli masuk pakai Google, atau admin bantu (sementara).
- **Login Google** (butuh domain; IP tidak diterima Google): Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application), Authorized redirect URI `https://<domain>/api/auth/google/callback`. Isi di `/srv/traktiva-web/ecosystem.config.cjs` (env): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SITE_URL=https://<domain>`, lalu `pm2 delete traktiva-web && pm2 start ecosystem.config.cjs && pm2 save`. Tombol "Masuk dengan Google" muncul otomatis.

## Admin lewat akun member, 2FA, bayar online, pengingat (sejak 2026-11-20)

- **Satu login**: akun member dengan `is_admin` bisa membuka `/admin` (masuk di `/masuk`, email atau Google). Wajib verifikasi 2 langkah (TOTP, Google Authenticator) selama Pengaturan → "Wajib 2FA admin" aktif. Admin token lama tetap jalan.
- Buat admin pertama: `node admin.mjs member-admin <email> [--name "Nama"]` → link `/atur-password?t=…` (sekali pakai, 30 menit; pemilik akun bikin password sendiri, min 10 karakter). Link lupa password: `node admin.mjs member-link <email>`, atau panel → Member → Link password. HP authenticator hilang: Member → Reset 2FA.
- **Bayar otomatis (WaroengPay QRIS)**: env `WAROENGPAY_API_KEY`, `WAROENGPAY_WEBHOOK_SECRET`, `SITE_URL` (opsional `WAROENGPAY_BASE`) di proses `traktiva-license-internal`, lalu Pengaturan → Bayar otomatis. Key `wp_test_…` = mode uji (tagihan tak pernah jadi uang). Webhook: `<SITE_URL>/api/pay/webhook` (web meneruskan body mentah; tanda tangan HMAC dicek di server lisensi, 1 event = 1 pengiriman). Pesanan: tabel `orders`, panel → Pesanan. Mati = tombol beli kembali ke WhatsApp.
- **Pengingat**: banner di /akun (≤ 7 hari) selalu tampil. WA H-7/H-1/habis lewat webhook (POST JSON `phone, text, kind, licenseId`) di Pengaturan → Pengingat; mati secara default. Dicatat di `reminder_log` (tidak dobel).

## Lupa password & sesi (sejak 2026-11-21)
- **Lupa password** (`/lupa-password`): kode 6 angka lewat **Waroengku Verify** (`purpose: "reset"`, SMTP SumoPod, pengirim `Traktiva <noreply@shopeeboost.com>`). Klien `traktiva` di `serverku:/srv/waroeng-verify/clients.json`; kunci ada di `data/verify.json` (600: `{ "url": "https://waroengin.com/_verify", "key": "…" }`) atau env `VERIFY_URL`/`VERIFY_KEY`. Batas dari pusat: kode 10 menit, 5 salah, kirim ulang 60 dtk, 5 kode/jam/email. Email tak terdaftar dijawab sama (tanpa kirim). Berhasil → semua sesi lain keluar.
- **Perangkat & sesi** (/akun/pengaturan): `user_sessions` menyimpan `created_at, last_seen, ip, ua`; member bisa mengeluarkan sesi lain.

## Admin (CLI, di server)
```bash
cd /srv/traktiva-license && alias trk='node --disable-warning=ExperimentalWarning admin.mjs'
trk create --days 30 --devices 1 --note "Nama pembeli"   # key tampil SEKALI, simpan/kirim ke pembeli
trk create --count 10 --days 365                          # banyak sekaligus
trk list                                                  # semua lisensi + pemakaian perangkat
trk devices <licenseId>                                   # perangkat satu lisensi
trk reset <deviceId>                                      # pembeli ganti PC
trk suspend|activate|revoke <licenseId>
trk extend <licenseId> <hari>
```

## Operasional
- Cek: `curl -sk https://43.156.15.173:8443/health` → `{"ok":true,...}` · `pm2 logs traktiva-license --lines 50`
- Deploy server lisensi: salin `lib.mjs server.mjs admin.mjs internal-api.mjs members.mjs payments.mjs totp.mjs verify.mjs test.mjs` ke folder ini, jalankan `./backup.sh`, `node test.mjs` (self-test di folder sementara), lalu `pm2 restart traktiva-license traktiva-license-internal` (data tidak tersentuh; tabel baru dibuat otomatis).
- Deploy panel: di PC `cd web && npm run build`, gabungkan `.next/standalone` + `.next/static` (→ `.next/static`) + `public`, ganti isi `/srv/traktiva-web` (jaga `ecosystem.config.cjs`), lalu `pm2 restart traktiva-web --update-env`.
- Rollback panel lama (vanilla, masih ada di folder ini): `pm2 delete traktiva-web && pm2 start admin-web.mjs --name traktiva-license-admin`.
- **Jangan pernah** hapus/ganti `secrets.json` atau sertifikat: kunci publik server dan sidik jari sertifikat tertanam di setiap installer. Mengganti salah satunya = semua app terpasang tidak bisa login sampai update.
## Backup (aktif sejak 2026-11-20)
- **03.40** `backup.sh` (cron user ubuntu, log `~/.local/state/traktiva-license-backup.log`): snapshot `license.db` + `secrets.json` → AES-256 (kunci acak) yang kuncinya disegel RSA-4096 → `backup/traktiva-license-YYYYMMDD-HHMM.tar` (600, simpan 14 terakhir).
- **03.50** `backup-harian … traktiva-license` mengunggah file terbaru ke bucket Supabase `server-backups/shopeeboosthelper/traktiva-license/` (alarm bila macet ikut sistem backup-harian).
- Server **hanya punya kunci publik** (`backup-pub.pem`), jadi tidak bisa membuka backup-nya sendiri. **Kunci privat hanya di PC owner**: `%USERPROFILE%\.traktiva-backup\license-backup-private.pem` → simpan salinannya di tempat aman lain (password manager / USB). Hilang kunci privat = backup tidak bisa dibuka.
- Restore (di PC owner, Git Bash): `backup-harian ambil traktiva-license <file>` di server atau scp dari `backup/`, lalu `bash server/license/restore-backup.sh <file.tar> <private.pem> <outdir>` → salin `license.db` + `secrets.json` ke `data/` → `pm2 restart traktiva-license`. Diuji 2026-11-20: kunci publik hasil restore = yang tertanam di app.
