import {
  CalendarClock, ChartNoAxesColumn, Clapperboard, Download, Film, FolderKanban, ImagePlus, Images, LayoutDashboard, Settings, Store, TrendingUp, UserCircle, Users,
} from "lucide-react";

// Single source for sidebar, page headers, command menu and placeholder routes. Add a menu here, then build its page.
// The sidebar puts what every seller does first: make a video ("Buat video", the big button on top), the videos made
// and the posting schedule, then research and the gallery. Then one entry per live platform (TikTok, YouTube), each a place with a few numbered pages
// (components/platform-tabs.tsx). Research and the gallery sit right under the schedule. sidebar: false keeps a page out of the list; it stays reachable
// from its platform's tabs, the command menu and links. A menu without a page folder shows the placeholder page.
export const NAV = [
  { slug: "beranda", title: "Beranda", icon: LayoutDashboard, group: "Utama", color: "#2fa868", desc: "Yang perlu dikerjakan hari ini: buat video, jadwal posting, dan video terbaru." },
  { slug: "video", title: "Buat Video", icon: Clapperboard, group: "Utama", color: "#f2994a", desc: "Pilih konsep, masukkan produk, AI bikin videonya.", sidebar: false }, // the big button on top
  { slug: "proyek", title: "Video Saya", icon: FolderKanban, group: "Utama", color: "#56ccf2", desc: "Semua video: draf, sedang dibuat, dan yang sudah jadi." },
  { slug: "jadwal", title: "Jadwal Posting", icon: CalendarClock, group: "Utama", color: "#5e6ad2", desc: "Jadwalkan satu video ke beberapa platform sekaligus, dan lihat kalender posting." },
  { slug: "riset", title: "Riset Produk", icon: TrendingUp, group: "Utama", color: "#26b5ce", desc: "Produk & video terlaris TikTok Shop dan Shopee dari KaloData, plus produk tersimpan." },
  { slug: "galeri", title: "Galeri", icon: Images, group: "Utama", color: "#f2c94c", desc: "Foto unggahan, gambar AI, dan video jadi di satu tempat, siap dipakai ulang." },
  { slug: "galeri-video", title: "Galeri Video", icon: Film, group: "Utama", color: "#4ea7fc", desc: "Semua video siap unggah dan riwayatnya.", sidebar: false }, // a tab of Galeri
  { slug: "gambar-ai", title: "Buat Gambar AI", icon: ImagePlus, group: "Utama", color: "#e535ab", desc: "Bikin gambar produk dan konten dari prompt.", sidebar: false }, // ponytail: not built; AI images live in Galeri → Hasil AI

  // TikTok: the account cards; each account has 1 Profil, 2 Etalase
  { slug: "tiktok-shop", title: "Akun TikTok", short: "TikTok", icon: LayoutDashboard, group: "Platform", platform: "tiktok", color: "#ff3b6b", desc: "Akun TikTok yang sudah login. Klik akun untuk melihat profil dan etalasenya." },
  { slug: "profil", title: "Profil TikTok", icon: UserCircle, group: "Platform", platform: "tiktok", color: "#ff3b6b", desc: "Profil, poin akun, dan performa postingan akun ini.", sidebar: false },
  { slug: "showcase", title: "Etalase TikTok", icon: Store, group: "Platform", platform: "tiktok", color: "#4cb782", desc: "Etalase produk affiliate akun ini, sinkron otomatis dari TikTok Shop.", sidebar: false },
  // YouTube: 1 Channel, 2 Performa, 3 Unduh Shorts
  { slug: "youtube", title: "Channel YouTube", short: "YouTube", icon: LayoutDashboard, group: "Platform", platform: "youtube", color: "#ff3333", desc: "Channel YouTube yang tersambung, sesi login, dan pengaturan upload." },
  { slug: "youtube-performa", title: "Performa YouTube", icon: ChartNoAxesColumn, group: "Platform", platform: "youtube", color: "#ff3333", desc: "Semua video & Shorts, Insight 28 hari, dan progres monetisasi dari YouTube Studio.", sidebar: false },
  { slug: "youtube-shorts", title: "Unduh Shorts YouTube", icon: Download, group: "Platform", platform: "youtube", color: "#ff3333", desc: "Unduh semua Shorts dari satu channel YouTube ke folder video kamu.", sidebar: false },
  { slug: "akun", title: "Akun Sosial", icon: Users, group: "Platform", color: "#26b5ce", desc: "Sambungkan dan kelola akun TikTok, YouTube, Instagram, Facebook, dan Shopee.", sidebar: false }, // "Tambah akun" on the platform pages
  // platforms not live yet: placeholder pages until they are built (status follows the website roadmap)
  { slug: "shopee", title: "Shopee", icon: Store, group: "Platform", platform: "shopee", status: "Segera", color: "#ee4d2d", desc: "Akun Shopee Video, etalase, dan jadwal upload dari video yang sama. Sedang dikerjakan.", sidebar: false },
  // shown in the sidebar as "Segera": being built (Rifq); their pages are placeholders until then
  { slug: "instagram", title: "Instagram", icon: Store, group: "Platform", platform: "instagram", status: "Segera", color: "#ff2d7a", desc: "Upload Reels ke akun Instagram Business/Creator dari video yang sama. Sedang dikerjakan." },
  { slug: "facebook", title: "Facebook", icon: Store, group: "Platform", platform: "facebook", status: "Segera", color: "#3b82f6", desc: "Upload Reels ke Facebook Page dari video yang sama. Sedang dikerjakan." },


  { slug: "pengaturan", title: "Pengaturan", icon: Settings, group: "Pengaturan", color: "#8b7cf6", desc: "Lisensi, akun Google, aturan naskah, suara, dan mesin AI." },
] as const;

export const NAV_GROUPS = ["Utama", "Platform", "Pengaturan"] as const;

export type NavItem = (typeof NAV)[number];
export type NavCounts = Partial<Record<string, number>>;

export const navBySlug = (slug: string) => NAV.find((n) => n.slug === slug);
export const navColor = (item: NavItem) => ("color" in item ? item.color : undefined);
/** A live platform's home in the sidebar (its other pages are tabs of it). */
export const PLATFORM_HOME: Record<string, { slug: string; label: string }> = {
  tiktok: { slug: "tiktok-shop", label: "TikTok" },
  youtube: { slug: "youtube", label: "YouTube" },
};
