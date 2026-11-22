// Marketing copy shared by the landing page and the detail pages (one source, so they never disagree).
import { BarChart3, CalendarClock, Clapperboard, Mic, Search, ShieldCheck, type LucideIcon } from "lucide-react";

export type Feature = { id: string; icon: LucideIcon; title: string; short: string; points: string[] };

export const FEATURES: Feature[] = [
  {
    id: "riset", icon: Search, title: "Riset produk laris",
    short: "Data KaloData di dalam app: produk, video, dan kreator terlaris. Satu klik jadi proyek video.",
    points: ["Produk terlaris TikTok Shop Indonesia per kategori", "Video dan kreator terlaris untuk tiap produk", "Satu klik: produk jadi proyek video lengkap dengan referensi gaya"],
  },
  {
    id: "video", icon: Clapperboard, title: "1 produk, sampai 5 video",
    short: "Hook langsung, masalah → solusi, review jujur, unboxing. Dibuat bersamaan dari satu produk.",
    points: ["Naskah AI dengan gaya video yang terbukti laku", "Gambar dan klip dibuat di server AI, PC biasa cukup", "Format Review, Estetik, dan Demo cepat"],
  },
  {
    id: "suara", icon: Mic, title: "Suara, subtitle, musik",
    short: "Voice-over AI satu tarikan, subtitle 1–2 kata yang pas dengan suara, musik bebas royalti.",
    points: ["Voice-over bahasa Indonesia yang natural", "Subtitle otomatis yang mengikuti suara", "Pustaka musik bebas royalti + efek suara", "Editor timeline untuk sentuhan akhir"],
  },
  {
    id: "jadwal", icon: CalendarClock, title: "Upload terjadwal ke TikTok",
    short: "Pakai fitur jadwal milik TikTok, jadi video tetap tayang walau PC sudah dimatikan.",
    points: ["Banyak akun TikTok dari satu app", "Atur jam tayang per akun", "Jadwal sampai ±10 hari ke depan, sisanya antre otomatis"],
  },
  {
    id: "analisis", icon: BarChart3, title: "Analisis akun",
    short: "Rata-rata penonton, tren 7 hari, jam terbaik posting, dan saran kapan ganti konten.",
    points: ["Statistik tiap akun dalam satu layar", "Jam terbaik posting dari data akunmu sendiri", "Tanda akun yang perlu ganti sudut konten"],
  },
  {
    id: "aman", icon: ShieldCheck, title: "Akunmu tetap milikmu",
    short: "Login di Chrome PC kamu sendiri dengan jeda wajar. Ada verifikasi? App berhenti dan memberi tahu.",
    points: ["Tidak ada password akun yang dikirim ke server kami", "Tidak ada trik melewati captcha atau verifikasi", "Satu akun cukup login di satu PC"],
  },
];

export const STEPS = [
  { title: "Pilih produk", text: "Dari etalase TikTok Shop kamu atau dari riset produk laris." },
  { title: "AI bikin videonya", text: "Naskah, gambar, klip, suara, dan subtitle: sampai 5 versi sekaligus." },
  { title: "Rapikan kalau mau", text: "Editor timeline untuk sentuhan akhir, atau langsung pakai." },
  { title: "Jadwalkan & tayang", text: "Atur jam tayang per akun, TikTok yang memposting tepat waktu." },
];

export const NEEDS = [
  "PC Windows 10/11 64-bit dengan Google Chrome",
  "Internet stabil (video dibuat di server AI, PC biasa cukup)",
  "Akun TikTok Shop affiliate",
  "Akun Google untuk pembuatan video",
];

export type FaqGroup = { title: string; items: [string, string][] };

export const FAQ: FaqGroup[] = [
  {
    title: "Umum",
    items: [
      ["Traktiva itu apa?", "App Windows untuk affiliate TikTok Shop: cari produk laris, bikin video dengan AI (sampai 5 versi per produk), lalu jadwalkan upload ke TikTok."],
      ["Butuh PC seperti apa?", "Windows 10/11 dengan Google Chrome terpasang dan internet stabil. Pembuatan video berjalan di server AI, jadi PC biasa sudah cukup."],
      ["Apa yang dibutuhkan selain key?", "Akun TikTok Shop affiliate dan akun Google untuk pembuatan video. Semua dipasang dari dalam app."],
    ],
  },
  {
    title: "Pembayaran & lisensi",
    items: [
      ["Bayarnya gimana?", "QRIS dari semua e-wallet & m-banking langsung di website. Key otomatis masuk ke akunmu ±1 menit setelah lunas. Bisa juga lewat WhatsApp penjual."],
      ["Apa beda tiap paket?", "Fiturnya sama persis. Yang beda hanya masa aktif, jumlah PC, dan harga."],
      ["Bisa perpanjang sebelum habis?", "Bisa. Perpanjangan menambah masa aktif dari tanggal habis yang sekarang, jadi tidak ada hari yang hilang."],
      ["Satu key bisa dipakai di berapa PC?", "Sesuai paket. Satu akun website bisa menyimpan banyak key, misalnya untuk beberapa PC atau tim."],
      ["Ganti PC atau upgrade hardware?", "Di akun member tekan Lepas PC atau Pindah PC (1× per hari per lisensi), lalu tempel key di PC baru."],
    ],
  },
  {
    title: "Akun & keamanan",
    items: [
      ["Aman untuk akun TikTok saya?", "Traktiva memakai Chrome dan akun kamu sendiri dengan jeda wajar, tanpa trik melewati verifikasi. Tetap ada risiko limit dari platform kalau mengunggah terlalu banyak; mulai pelan dan naikkan bertahap."],
      ["Password akun TikTok/Google saya disimpan di mana?", "Tidak di server kami. Kamu login langsung di Chrome di PC-mu sendiri; sesi login tersimpan di PC itu."],
      ["Muncul captcha atau verifikasi?", "App berhenti dan memberi tahu. Selesaikan verifikasinya sendiri di jendela Chrome, lalu lanjutkan."],
    ],
  },
];

/** The first questions of each group, for the landing page. */
export const FAQ_TOP = FAQ.flatMap((g) => g.items.slice(0, 2));
