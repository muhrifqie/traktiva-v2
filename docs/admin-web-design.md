# Rancangan Web Admin & Web Pembeli Traktiva

Status: **tahap 1 (Admin Panel) live** sejak 20 Nov 2026 di helper (pm2 `traktiva-license-admin`, lewat SSH tunnel; runbook `server/license/OPS.md`). Tahap 2–4 menunggu domain. Lanjutan dari `docs/license-design.md` (server lisensi sudah live, `server/license/`).

## Gambaran

```
                     ┌──────────── shopeeboosthelper ────────────┐
[Owner / Azzam] ─SSH─▶ Admin Panel  ──▶  License Server (sumber kebenaran)
                     │  127.0.0.1:3821    :3820 · SQLite · secrets │
                     └──────────────▲─────────────────▲───────────┘
                                    │ order + webhook  │ aktivasi/sesi (sudah jalan)
[Pembeli] ──▶ Web Pembeli ──▶ WaroengPay (QRIS)        [Traktiva.exe]
              landing · checkout · portal  ──▶ Waroeng Verify (OTP + email key)
```

Server lisensi tetap satu-satunya yang membuat dan menyimpan key. Web admin dan web pembeli hanya memanggilnya.

## 1. Admin Panel (internal)

**Akses:** hanya `127.0.0.1:3821` di helper, dibuka lewat SSH tunnel (pola yang sama dengan Social Uploader), plus login token admin. Tidak ada di internet, jadi tidak bisa ditebak atau di-brute-force. Kalau nanti sudah ada domain dan perlu dibuka dari HP: pindahkan ke subdomain di balik login + TOTP.

```
ssh -N -L 3821:127.0.0.1:3821 shopeeboosthelper   →   http://localhost:3821
```

| Halaman | Isi |
|---|---|
| **Ringkasan** | Lisensi aktif, aktivasi hari ini, akan kedaluwarsa 7 hari, perangkat online (heartbeat < 10 menit), pendapatan bulan ini |
| **Lisensi** | Tabel cari/filter (status, paket, kedaluwarsa). **Buat key** (satu atau banyak, paket, hari, jumlah perangkat, catatan pembeli). Key tampil sekali dengan tombol salin / unduh CSV |
| **Detail lisensi** | Perangkat terikat (nama PC, versi app, IP, terakhir online) · reset perangkat · suspend / aktifkan / cabut · perpanjang · catatan · riwayat (audit) |
| **Pesanan** | Pesanan dari web pembeli: status bayar, key yang terbit, kirim ulang email |
| **Log** | Audit: aktivasi, gagal aktivasi (deteksi key dibagi-bagi), reset, perubahan status |
| **Pengaturan** | Paket & harga, batas perangkat default, versi app terbaru + link unduh |

**Teknis:** HTML + JS polos yang dilayani proses Node terpisah (`admin.mjs serve`) di folder yang sama, memakai DB yang sama. Tanpa framework, tanpa build, tema gelap Traktiva. Semua aksi tercatat di `audit_events` beserta nama admin.

## 2. Web Pembeli (publik)

| Bagian | Alur |
|---|---|
| **Landing** | Apa itu Traktiva, video demo, contoh hasil, harga, FAQ. HTML statis (keputusan ekosistem: landing = HTML statis + Geist) |
| **Checkout** | Email → OTP (Waroeng Verify `register`) → pilih paket → tagihan QRIS WaroengPay → webhook `payment.paid` → server lisensi membuat key → key tampil di halaman **dan** dikirim ke email |
| **Portal pembeli** | Masuk dengan OTP email (tanpa password): lihat key & masa aktif, perangkat terikat, **reset perangkat sendiri** (maks 2×/bulan), perpanjang, unduh installer terbaru |

**Teknis:** halaman statis + API kecil di server lisensi (`/v1/shop/*`, `/v1/portal/*`). Webhook WaroengPay diverifikasi HMAC dan bersifat idempoten (satu pembayaran = satu key). Key hanya disimpan sebagai hash; email pembeli disimpan untuk portal.

## 3. Unduhan & update
Installer dan feed update `electron-updater` disajikan dengan token sesi lisensi, jadi versi bajakan tidak mendapat update (sesuai desain lisensi tahap 3).

## Tahapan
1. **Admin Panel MVP**: lisensi, detail, buat key, reset/suspend, log (lewat tunnel). Menggantikan CLI.
2. **Web pembeli**: landing + checkout WaroengPay + email key.
3. **Portal pembeli**: login OTP, reset perangkat sendiri, perpanjang.
4. **Update & unduhan bertoken**, dashboard pendapatan.

## Keputusan owner (20 Nov 2026)
| Hal | Keputusan |
|---|---|
| Akses admin | **SSH tunnel dulu** (localhost + token) |
| Paket | **Bulanan, Tahunan, Lifetime** (ketiganya dijual) |
| Domain | **Pakai domain sendiri + subdomain `api.`** untuk API, tapi **domain belum dibeli**. Admin panel jalan dulu; web pembeli menunggu domain |
| Admin | **Owner + Azzam**, akun/token terpisah, semua aksi tercatat atas nama masing-masing |

## Masih terbuka
- Nama domain, harga tiap paket, jumlah perangkat per paket.
- Pembayaran: WaroengPay (QRIS) saja, atau juga jual manual/reseller.
