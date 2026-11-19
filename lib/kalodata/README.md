# Kalodata client

Client TypeScript untuk API [Kalodata](https://www.kalodata.com) — analitik TikTok Shop (produk, video, kreator, revenue). Dipakai di sisi server Traktiva (server action / route / worker), **bukan** di komponen client.

> ⚠️ Endpoint ini **di-reverse dari traffic browser**, bukan API resmi. Field bisa berubah sewaktu-waktu. Pakai hanya untuk akun Kalodata milik sendiri. Scraping kasar bisa kena ban akun — jaga jeda antar request.

## Letak file

```
lib/kalodata/
├── index.ts          # entry point — impor dari "@/lib/kalodata"
├── client.ts         # KaloClient + parseKaloNumber
├── signup.ts         # signupKalodata / signupKalodataBatch (cetak SESSION)
├── waroengmail.ts    # WaroengMail — email disposable buat terima OTP
├── types.ts          # semua tipe respons + KaloError
├── client.test.ts    # self-check client (npx tsx lib/kalodata/client.test.ts)
├── signup.test.ts    # self-check signup (npx tsx lib/kalodata/signup.test.ts)
└── README.md         # file ini
```

## Cara auth

Kalodata pakai cookie **`SESSION`** (berlaku ±15 hari), **tanpa request signing**. Dapatnya dari login Google OAuth di `POST /user/login`. Ambil nilai `SESSION` dari:

- DevTools → Application → Cookies → `www.kalodata.com` → `SESSION`, atau
- file HAR (cari header `set-cookie: SESSION=...` di respons `/user/login`).

Simpan nilainya di env/DB, jangan di-commit.

## Kuota (penting)

Kuota diikat ke **akun (userId)**, dicek server-side. **Tidak bisa dipaksa** dengan retry / ganti IP / ganti header. Jenisnya:

| Cause | Kena di | Arti |
|---|---|---|
| `FILTER.CUSTOM_TIMES` | `productList`, `searchList` dengan filter | jatah query/search harian habis |
| `DETAIL.ACCESS_TIMES` | semua `product...` detail | jatah buka detail harian habis |
| `PRODUCT.LIST` | pagination | `pageSize`/`pageNo` lewat batas paket (trial maks `pageSize` 10) |

Dua cara nambah throughput:

1. **Rotasi multi-sesi** — isi beberapa cookie `SESSION` di `sessions[]`. Begitu satu sesi kena kuota, client otomatis pindah ke sesi berikut. Butuh beberapa akun Google + fingerprint beda per akun (mis. proxy/anti-detect browser) kalau serius.
2. **Bayar / upgrade paket** — lebih aman, tanpa risiko ban.

Jalur yang **tahan kuota filter**: `fullTextSearch` / `collectProducts` tetap jalan walau `FILTER.CUSTOM_TIMES` habis — tapi cuma mengembalikan nama produk + GMV 30 hari, bukan metrik lengkap.

## Auto-signup (cetak SESSION)

`signupKalodata()` mencetak akun trial baru lewat email disposable WaroengMail dan mengembalikan cookie `SESSION` siap pakai. Flow (terbukti dari reverse HAR, 2026-11-18): `GET /signup` → `emailSendMessage` (captcha di-skip pakai `response:"token"`) → poll OTP WaroengMail → `checkSignupVerification` → `user/signup`. **Tanpa browser, captcha solver, atau fingerprint.** Gate server cuma `page_session` + `deviceId`.

```ts
import { KaloClient, signupKalodata, signupKalodataBatch } from "@/lib/kalodata";

// 1 akun
const acc = await signupKalodata();            // { email, session, deviceId, sessionCookie, ... }
const kalo = new KaloClient({ sessions: [acc] });

// N akun untuk rotasi (jeda antar signup, deviceId acak per akun)
const { sessions, failed } = await signupKalodataBatch(3, { delayMs: 8000 });
const pool = new KaloClient({ sessions }); // kuota efektif 3× lipat
```

Opsi penting `SignupOptions`: `deviceId` (default UUID acak — beda per akun = lebih aman), `mailDomain`, `fetchFn` (suntik proxy per akun), `otpTimeoutMs`, `tcCode`.

> ⚠️ **Risiko ban.** Banyak akun dari satu IP + deviceId mirip bisa di-flag/ban Kalodata belakangan, walau signup-nya lolos. Untuk >beberapa akun: pakai proxy berbeda (`fetchFn`) + `deviceId` acak per akun, dan jangan burst. Celah skip-captcha (`response:"token"`) bisa ditutup Kalodata kapan saja — kalau `emailSendMessage` mulai ditolak (`KaloError` kind `auth`), captcha sudah diperketat dan butuh solver (lihat skill `localsolver`).

## Quick start

```ts
import { KaloClient, parseKaloNumber } from "@/lib/kalodata";

const kalo = new KaloClient({
  sessions: [
    { sessionCookie: process.env.KALODATA_SESSION_1!, label: "akun-1" },
    { sessionCookie: process.env.KALODATA_SESSION_2!, label: "akun-2" }, // opsional: rotasi
  ],
  currency: "IDR",
  country: "ID",
  minDelayMs: 2500, // jeda antar request (anti rate-limit)
});

// 1. Tentukan rentang 30 hari terakhir (data Kalodata telat 1–2 hari)
const range = await kalo.last30Days(); // { startDate, endDate }

// 2. Kumpulkan produk via full-text search (bebas kuota filter)
const products = await kalo.collectProducts(["microphone", "mikrofon", "mic wireless"]);
console.log(products.size, "produk unik");

// 3. Detail per produk (kena kuota DETAIL.ACCESS_TIMES — pakai hemat)
const [first] = products.values();
const total = await kalo.productTotal(first.product_id, range);
const history = await kalo.productHistory(first.product_id, range);
const videos = await kalo.productVideos(first.product_id, range);

console.log("GMV:", parseKaloNumber(total.revenue));
```

## API

Semua method `async`. Error dilempar sebagai `KaloError` dengan `.kind` (`quota` | `pagination` | `auth` | `http` | `parse` | `unknown`) dan `.cause`.

### Tanggal & akun
| Method | Keterangan | Kuota |
|---|---|---|
| `allLastDay()` | tanggal data terbaru semua negara | — |
| `latestDate(country?)` | tanggal terbaru satu negara | — |
| `last30Days(country?)` | `{ startDate, endDate }` 30 hari terakhir | — |
| `membership()` | status langganan sesi aktif | — |

### Produk
| Method | Keterangan | Kuota |
|---|---|---|
| `fullTextSearch(keyword, pageNo?, pageSize?)` | cari produk (nama + GMV 30h) | tahan kuota filter |
| `collectProducts(keywords[], opts?)` | gabung banyak keyword, dedup → `Map` | tahan kuota filter |
| `productList(range, opts?)` | ranking lengkap (filter kategori, sort, query) | `FILTER.CUSTOM_TIMES` + `PRODUCT.LIST` |
| `searchCategory(keyword)` | cari ID kategori untuk `cateIds` | — |

### Detail produk (semua kena `DETAIL.ACCESS_TIMES`)
| Method | Keterangan |
|---|---|
| `productTotal(id, range)` | metrik total (revenue, sale, video/live/mall) |
| `productHistory(id, range)` | tren harian per `partition_day` |
| `productVideos(id, range, pageNo?, pageSize?)` | video penjual, urut revenue |
| `productCreators(id, range, pageNo?, pageSize?)` | kreator penjual, urut revenue |
| `videoUrl(videoId)` | link MP4 (kedaluwarsa, ada `key`+`time`) |

### Helper
| Fungsi | Keterangan |
|---|---|
| `parseKaloNumber(s)` | `"Rp52.85b"` → `52850000000` (b/m/k) |
| `kalo.liveSessionCount` | jumlah sesi yang masih punya kuota |
| `kalo.resetQuota()` | reset penanda kuota habis (panggil saat ganti hari) |

## Pola pakai di Traktiva

- **Server action / route handler**: instansiasi `KaloClient` sekali, ambil cookie dari DB/env. Jangan taruh cookie di kode client.
- **Worker / job terjadwal**: untuk scrape besar, jalankan sebagai worker di server dengan `minDelayMs` ≥ 2500 dan rotasi sesi. Cek `liveSessionCount` — kalau 0, hentikan dan lanjut besok (`resetQuota()` setelah ganti hari).
- **Mata uang**: field `revenue` dkk sudah terformat sesuai `currency` client. Untuk hitung-hitungan pakai `parseKaloNumber` atau field mentah (`gmv_A`, `original_revenue`).

## Env yang disarankan

```
KALODATA_SESSION_1=<nilai cookie SESSION akun 1>
KALODATA_SESSION_2=<nilai cookie SESSION akun 2>
```

## Batasan jujur

- Data Kalodata = **estimasi harian**, telat 1–2 hari, bukan realtime TikTok.
- `fullTextSearch` hanya nama + GMV 30 hari. Metrik lengkap wajib lewat endpoint detail yang kena kuota.
- Rotasi multi-akun menambah risiko ban kalau fingerprint/pola mirip. Untuk pemakaian rutin & serius, 1 akun berbayar lebih aman.
