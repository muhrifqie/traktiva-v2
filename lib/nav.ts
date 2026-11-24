import {
  CalendarClock, CalendarDays, ChartNoAxesColumn, Clapperboard, Columns2, Download, Film, FolderKanban, ImagePlus, Images, LayoutDashboard, Settings, Store, TrendingUp, UserCircle, Users,
} from "lucide-react";

// Single source for sidebar, page headers, command menu and placeholder routes. Add a menu here, then build its page.
// Sidebar order: what every seller uses (research, calendar, content) → one group per platform (only what is specific
// to that platform) → platforms not live yet as placeholders → accounts & settings. "Buat Video" is the big button on
// top (sidebar: false keeps it out of the list). A menu without a page folder shows the placeholder page.
export const NAV = [
  { slug: "beranda", title: "Beranda", icon: LayoutDashboard, group: "Utama", color: "#2fa868", desc: "Ringkasan akun, jadwal, dan aktivitas bot hari ini." },
  { slug: "riset", title: "Riset Produk", icon: TrendingUp, group: "Utama", color: "#26b5ce", desc: "Produk & video terlaris TikTok Shop dan Shopee dari KaloData, plus produk tersimpan." },
  { slug: "video", title: "Buat Video Reels", short: "Buat Video", icon: Clapperboard, group: "Buat Konten", color: "#f2994a", desc: "Pilih konsep, masukkan produk, AI bikin videonya." },
  { slug: "proyek", title: "Proyek Video", icon: FolderKanban, group: "Buat Konten", color: "#56ccf2", desc: "Semua proyek video: draf, sedang dibuat, dan yang sudah jadi." },
  { slug: "jadwal", title: "Kalender Upload", icon: CalendarClock, group: "Buat Konten", color: "#5e6ad2", desc: "Semua upload terjadwal per hari, dan atur kapan video diunggah ke tiap akun." },
  { slug: "gambar-ai", title: "Buat Gambar AI", icon: ImagePlus, group: "Buat Konten", color: "#e535ab", desc: "Bikin gambar produk dan konten dari prompt.", sidebar: false }, // ponytail: not built; AI images live in Galeri → Hasil AI
  { slug: "galeri", title: "Galeri", icon: Images, group: "Pustaka", color: "#f2c94c", desc: "Foto unggahan, gambar AI, dan video jadi di satu tempat, siap dipakai ulang." },
  { slug: "galeri-video", title: "Galeri Video", icon: Film, group: "Pustaka", color: "#4ea7fc", desc: "Semua video siap unggah dan riwayatnya.", sidebar: false }, // a tab of Galeri
  { slug: "tiktok-shop", title: "TikTok Shop", short: "Ringkasan", icon: LayoutDashboard, group: "TikTok Shop", platform: "tiktok", color: "#ff3b6b", desc: "Ringkasan semua akun TikTok Shop: login, etalase, antrean upload, dan performa." }, // overview: first branch + the group button
  { slug: "showcase", title: "Etalase TikTok Shop", short: "Etalase", icon: Store, group: "TikTok Shop", color: "#4cb782", desc: "Etalase produk affiliate dan sinkron otomatis dari TikTok Shop." },
  { slug: "profil", title: "Profil & Postingan", short: "Performa akun", icon: UserCircle, group: "TikTok Shop", color: "#ff3b6b", desc: "Profil, poin akun, dan performa postingan tiap akun." },
  // platforms not live yet: placeholder pages until they are built (status follows the website roadmap)
  { slug: "shopee", title: "Shopee", icon: Store, group: "Segera hadir", platform: "shopee", status: "Segera", color: "#ee4d2d", desc: "Akun Shopee Video, etalase, dan jadwal upload dari video yang sama. Sedang dikerjakan." },
  { slug: "instagram", title: "Instagram", short: "Ringkasan", icon: LayoutDashboard, group: "Instagram", platform: "instagram", color: "#ff2d7a", desc: "Akun Instagram yang tersambung dan sesi loginnya. Upload Reels menyusul." },
  { slug: "facebook", title: "Facebook", short: "Ringkasan", icon: LayoutDashboard, group: "Facebook", platform: "facebook", color: "#3b82f6", desc: "Akun Facebook yang tersambung dan sesi loginnya. Upload Reels ke Page menyusul." },
  { slug: "youtube", title: "YouTube", short: "Ringkasan", icon: LayoutDashboard, group: "YouTube", platform: "youtube", color: "#ff3333", desc: "Channel YouTube yang tersambung, sesi login, dan alat YouTube." }, // overview: first branch + the group button
  { slug: "youtube-kalender", title: "Kalender YouTube", short: "Kalender", icon: CalendarDays, group: "YouTube", color: "#ff3333", desc: "Tarik video ke tanggal; jam tayang diisi otomatis, untuk beberapa channel sekaligus." },
  { slug: "youtube-channel", title: "Channel YouTube", icon: UserCircle, group: "YouTube", color: "#ff3333", desc: "Ringkasan channel ini, sesi login, dan pengaturan upload.", sidebar: false }, // opened from a channel card
  { slug: "youtube-performa", title: "Performa Channel", short: "Performa", icon: ChartNoAxesColumn, group: "YouTube", color: "#ff3333", desc: "Semua video & Shorts, Insight 28 hari, dan progres monetisasi dari YouTube Studio." },
  { slug: "youtube-shorts", title: "Shorts Downloader", short: "Unduh Shorts", icon: Download, group: "YouTube", color: "#ff3333", desc: "Unduh semua Shorts dari satu channel YouTube ke folder video kamu." },
  { slug: "youtube-editor", title: "Editor Video", short: "Editor", icon: Columns2, group: "YouTube", color: "#ff3333", desc: "Gabungkan dua video jadi satu Shorts: video asli di kiri, gameplay di kanan." },
  { slug: "akun", title: "Akun Sosial", icon: Users, group: "Akun", color: "#26b5ce", desc: "Kelola akun TikTok, Instagram, Facebook, YouTube, dan Shopee." },
  { slug: "pengaturan", title: "Pengaturan", icon: Settings, group: "Pengaturan", color: "#8b7cf6", desc: "Lisensi, akun Google, aturan naskah, suara, dan mesin AI." },
] as const;

export const NAV_GROUPS = ["Utama", "Buat Konten", "Pustaka", "TikTok Shop", "YouTube", "Instagram", "Facebook", "Segera hadir", "Akun", "Pengaturan"] as const;

export type NavItem = (typeof NAV)[number];
export type NavCounts = Partial<Record<string, number>>;

export const navBySlug = (slug: string) => NAV.find((n) => n.slug === slug);
export const navColor = (item: NavItem) => ("color" in item ? item.color : undefined);
