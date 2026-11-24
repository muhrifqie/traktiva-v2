import {
  CalendarClock, Clapperboard, Film, FolderKanban, ImagePlus, Images, LayoutDashboard, Settings, Store, TrendingUp, UserCircle, Users,
} from "lucide-react";

// Single source for sidebar, page headers, command menu and placeholder routes. Add a menu here, then build its page.
// Sidebar order: what every seller uses (research, calendar, content) → one group per platform (only what is specific
// to that platform) → platforms not live yet as placeholders → accounts & settings. "Buat Video" is the big button on
// top (sidebar: false keeps it out of the list). A menu without a page folder shows the placeholder page.
export const NAV = [
  { slug: "beranda", title: "Beranda", icon: LayoutDashboard, group: "Utama", color: "#2fa868", desc: "Ringkasan akun, jadwal, dan aktivitas bot hari ini." },
  { slug: "riset", title: "Riset Produk", icon: TrendingUp, group: "Utama", color: "#26b5ce", desc: "Produk & video terlaris TikTok Shop dan Shopee dari KaloData, plus produk tersimpan." },
  { slug: "jadwal", title: "Kalender Upload", icon: CalendarClock, group: "Utama", color: "#5e6ad2", desc: "Semua upload terjadwal per hari, dan atur kapan video diunggah ke tiap akun." },
  { slug: "video", title: "Buat Video Reels", icon: Clapperboard, group: "Buat Konten", color: "#f2994a", desc: "Pilih konsep, masukkan produk, AI bikin videonya.", sidebar: false },
  { slug: "proyek", title: "Proyek Video", icon: FolderKanban, group: "Buat Konten", color: "#56ccf2", desc: "Semua proyek video: draf, sedang dibuat, dan yang sudah jadi." },
  { slug: "gambar-ai", title: "Buat Gambar AI", icon: ImagePlus, group: "Buat Konten", color: "#e535ab", desc: "Bikin gambar produk dan konten dari prompt.", sidebar: false }, // ponytail: not built; AI images live in Galeri → Hasil AI
  { slug: "galeri", title: "Galeri", icon: Images, group: "Pustaka", color: "#f2c94c", desc: "Foto unggahan, gambar AI, dan video jadi di satu tempat, siap dipakai ulang." },
  { slug: "galeri-video", title: "Galeri Video", icon: Film, group: "Pustaka", color: "#4ea7fc", desc: "Semua video siap unggah dan riwayatnya.", sidebar: false }, // a tab of Galeri
  { slug: "tiktok-shop", title: "TikTok Shop", icon: Store, group: "TikTok Shop", platform: "tiktok", color: "#ff3b6b", desc: "Ringkasan semua akun TikTok Shop: login, etalase, antrean upload, dan performa.", sidebar: false }, // the group button
  { slug: "showcase", title: "Etalase TikTok Shop", short: "Etalase", icon: Store, group: "TikTok Shop", color: "#4cb782", desc: "Etalase produk affiliate dan sinkron otomatis dari TikTok Shop." },
  { slug: "profil", title: "Profil & Postingan", short: "Performa akun", icon: UserCircle, group: "TikTok Shop", color: "#ff3b6b", desc: "Profil, poin akun, dan performa postingan tiap akun." },
  // platforms not live yet: placeholder pages until they are built (status follows the website roadmap)
  { slug: "shopee", title: "Shopee", icon: Store, group: "Segera hadir", platform: "shopee", status: "Segera", color: "#ee4d2d", desc: "Akun Shopee Video, etalase, dan jadwal upload dari video yang sama. Sedang dikerjakan." },
  { slug: "instagram", title: "Instagram", icon: Store, group: "Segera hadir", platform: "instagram", status: "Rencana", color: "#ff2d7a", desc: "Upload Reels ke akun Instagram Business/Creator dari video yang sama. Direncanakan." },
  { slug: "facebook", title: "Facebook", icon: Store, group: "Segera hadir", platform: "facebook", status: "Rencana", color: "#3b82f6", desc: "Upload Reels ke Facebook Page dari video yang sama. Direncanakan." },
  { slug: "youtube", title: "YouTube Shorts", icon: Store, group: "YouTube", platform: "youtube", color: "#ff3333", desc: "Unduh semua Shorts dari satu channel YouTube ke folder video kamu." }, // live: Shorts downloader; upload comes later
  { slug: "akun", title: "Akun Sosial", icon: Users, group: "Akun", color: "#26b5ce", desc: "Kelola akun TikTok, Instagram, Facebook, YouTube, dan Shopee." },
  { slug: "pengaturan", title: "Pengaturan", icon: Settings, group: "Pengaturan", color: "#8b7cf6", desc: "Lisensi, akun Google, aturan naskah, suara, dan mesin AI." },
] as const;

export const NAV_GROUPS = ["Utama", "Buat Konten", "Pustaka", "TikTok Shop", "YouTube", "Segera hadir", "Akun", "Pengaturan"] as const;

export type NavItem = (typeof NAV)[number];
export type NavCounts = Partial<Record<string, number>>;

export const navBySlug = (slug: string) => NAV.find((n) => n.slug === slug);
export const navColor = (item: NavItem) => ("color" in item ? item.color : undefined);
