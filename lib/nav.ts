import {
  CalendarClock, ChartNoAxesColumn, Clapperboard, Download, Film, FolderKanban, ImagePlus, Images, LayoutDashboard, Settings, Store, TrendingUp, UserCircle, Users,
} from "lucide-react";

// Single source for sidebar, page headers, command menu and placeholder routes. Add a menu here, then build its page.
// The sidebar puts what every seller does first: make a video ("Buat video", the big button on top), the videos made
// and the posting schedule. Everything else sits under "Lainnya"; accounts and platform pages (TikTok Shop, YouTube,
// upcoming platforms) live behind one entry, Akun dan Performa (sidebar: false keeps a page out of the list, it stays
// reachable from its hub, the command menu and links). A menu without a page folder shows the placeholder page.
export const NAV = [
  { slug: "beranda", title: "Beranda", icon: LayoutDashboard, group: "Utama", color: "#2fa868", desc: "Yang perlu dikerjakan hari ini: buat video, jadwal posting, dan video terbaru." },
  { slug: "video", title: "Buat Video", icon: Clapperboard, group: "Utama", color: "#f2994a", desc: "Pilih konsep, masukkan produk, AI bikin videonya.", sidebar: false }, // the big button on top
  { slug: "proyek", title: "Video Saya", icon: FolderKanban, group: "Utama", color: "#56ccf2", desc: "Semua video: draf, sedang dibuat, dan yang sudah jadi." },
  { slug: "jadwal", title: "Jadwal Posting", icon: CalendarClock, group: "Utama", color: "#5e6ad2", desc: "Jadwalkan satu video ke beberapa platform sekaligus, dan lihat kalender posting." },

  { slug: "riset", title: "Riset Produk", icon: TrendingUp, group: "Lainnya", color: "#26b5ce", desc: "Produk & video terlaris TikTok Shop dan Shopee dari KaloData, plus produk tersimpan." },
  { slug: "showcase", title: "Etalase TikTok Shop", short: "Etalase", icon: Store, group: "Lainnya", color: "#4cb782", desc: "Etalase produk affiliate dan sinkron otomatis dari TikTok Shop." },
  { slug: "galeri", title: "Galeri", icon: Images, group: "Lainnya", color: "#f2c94c", desc: "Foto unggahan, gambar AI, dan video jadi di satu tempat, siap dipakai ulang." },
  { slug: "galeri-video", title: "Galeri Video", icon: Film, group: "Lainnya", color: "#4ea7fc", desc: "Semua video siap unggah dan riwayatnya.", sidebar: false }, // a tab of Galeri
  { slug: "gambar-ai", title: "Buat Gambar AI", icon: ImagePlus, group: "Lainnya", color: "#e535ab", desc: "Bikin gambar produk dan konten dari prompt.", sidebar: false }, // ponytail: not built; AI images live in Galeri → Hasil AI
  { slug: "performa", title: "Akun dan Performa", icon: ChartNoAxesColumn, group: "Lainnya", color: "#ff3b6b", desc: "Akun yang tersambung, performa TikTok dan YouTube, dan alat tiap platform." },

  // behind Akun dan Performa (hub page app/(dashboard)/performa)
  { slug: "akun", title: "Akun Sosial", icon: Users, group: "Akun dan Performa", color: "#26b5ce", desc: "Sambungkan dan kelola akun TikTok, YouTube, Instagram, Facebook, dan Shopee.", sidebar: false },
  { slug: "profil", title: "Performa TikTok", icon: UserCircle, group: "Akun dan Performa", platform: "tiktok", color: "#ff3b6b", desc: "Profil, poin akun, dan performa postingan tiap akun TikTok.", sidebar: false },
  { slug: "tiktok-shop", title: "Ringkasan TikTok Shop", icon: LayoutDashboard, group: "Akun dan Performa", platform: "tiktok", color: "#ff3b6b", desc: "Semua akun TikTok Shop: login, etalase, antrean upload, dan performa.", sidebar: false },
  { slug: "youtube", title: "Channel YouTube", icon: LayoutDashboard, group: "Akun dan Performa", platform: "youtube", color: "#ff3333", desc: "Channel YouTube yang tersambung, sesi login, dan pengaturan upload.", sidebar: false },
  { slug: "youtube-performa", title: "Performa YouTube", icon: ChartNoAxesColumn, group: "Akun dan Performa", platform: "youtube", color: "#ff3333", desc: "Semua video & Shorts, Insight 28 hari, dan progres monetisasi dari YouTube Studio.", sidebar: false },
  { slug: "youtube-shorts", title: "Unduh Shorts YouTube", icon: Download, group: "Akun dan Performa", platform: "youtube", color: "#ff3333", desc: "Unduh semua Shorts dari satu channel YouTube ke folder video kamu.", sidebar: false },
  // platforms not live yet: placeholder pages until they are built (status follows the website roadmap)
  { slug: "shopee", title: "Shopee", icon: Store, group: "Akun dan Performa", platform: "shopee", status: "Segera", color: "#ee4d2d", desc: "Akun Shopee Video, etalase, dan jadwal upload dari video yang sama. Sedang dikerjakan.", sidebar: false },
  { slug: "instagram", title: "Instagram", icon: Store, group: "Akun dan Performa", platform: "instagram", status: "Rencana", color: "#ff2d7a", desc: "Upload Reels ke akun Instagram Business/Creator dari video yang sama. Direncanakan.", sidebar: false },
  { slug: "facebook", title: "Facebook", icon: Store, group: "Akun dan Performa", platform: "facebook", status: "Rencana", color: "#3b82f6", desc: "Upload Reels ke Facebook Page dari video yang sama. Direncanakan.", sidebar: false },

  { slug: "pengaturan", title: "Pengaturan", icon: Settings, group: "Pengaturan", color: "#8b7cf6", desc: "Lisensi, akun Google, aturan naskah, suara, dan mesin AI." },
] as const;

export const NAV_GROUPS = ["Utama", "Lainnya", "Akun dan Performa", "Pengaturan"] as const;

export type NavItem = (typeof NAV)[number];
export type NavCounts = Partial<Record<string, number>>;

export const navBySlug = (slug: string) => NAV.find((n) => n.slug === slug);
export const navColor = (item: NavItem) => ("color" in item ? item.color : undefined);
/** Pages that live behind the Akun dan Performa hub (the sidebar marks the hub as active on them). */
export const PERFORMA_PAGES: readonly string[] = NAV.filter((n) => n.group === "Akun dan Performa").map((n) => n.slug);
