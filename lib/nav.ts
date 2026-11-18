import {
  CalendarClock, Clapperboard, Film, FolderKanban, ImagePlus, Images, LayoutDashboard, Settings, Store, TrendingUp, UserCircle, Users,
} from "lucide-react";

// Single source for sidebar, page headers, command menu and placeholder routes. Add a menu here, then build its page.
// Groups follow the seller's workflow: research → make content → keep assets → sell & publish → settings.
export const NAV = [
  { slug: "beranda", title: "Beranda", icon: LayoutDashboard, group: "Utama", color: "#2fa868", desc: "Ringkasan akun, jadwal, dan aktivitas bot hari ini." },
  { slug: "riset", title: "Riset Produk", icon: TrendingUp, group: "Riset", color: "#26b5ce", desc: "Produk & video terlaris TikTok Shop dan Shopee dari KaloData, plus produk tersimpan." },
  { slug: "video", title: "Buat Video Reels", icon: Clapperboard, group: "Buat Konten", color: "#f2994a", desc: "Pilih konsep, masukkan produk, AI bikin videonya." },
  { slug: "proyek", title: "Proyek Video", icon: FolderKanban, group: "Buat Konten", color: "#56ccf2", desc: "Semua proyek video: draf, sedang dibuat, dan yang sudah jadi." },
  { slug: "gambar-ai", title: "Buat Gambar AI", icon: ImagePlus, group: "Buat Konten", color: "#e535ab", desc: "Bikin gambar produk dan konten dari prompt." },
  { slug: "galeri", title: "Gambar & Unggahan", icon: Images, group: "Pustaka", color: "#f2c94c", desc: "Foto unggahan dan gambar AI, siap dipakai ulang tanpa unggah lagi." },
  { slug: "galeri-video", title: "Galeri Video", icon: Film, group: "Pustaka", color: "#4ea7fc", desc: "Semua video siap unggah dan riwayatnya." },
  { slug: "showcase", title: "TikTok Shop", icon: Store, group: "Jualan & Akun", color: "#4cb782", desc: "Etalase, kesehatan akun, dan performa LIVE." },
  { slug: "akun", title: "Akun Sosial", icon: Users, group: "Jualan & Akun", color: "#26b5ce", desc: "Kelola akun TikTok, Instagram, Facebook, YouTube, dan Shopee." },
  { slug: "profil", title: "Profil & Postingan", icon: UserCircle, group: "Jualan & Akun", color: "#ff3b6b", desc: "Lihat profil dan performa postingan tiap akun." },
  { slug: "jadwal", title: "Jadwal Upload", icon: CalendarClock, group: "Jualan & Akun", color: "#5e6ad2", desc: "Atur kapan video diunggah ke tiap akun." },
  { slug: "pengaturan", title: "Pengaturan AI", icon: Settings, group: "Pengaturan", color: "#8b7cf6", desc: "Akun Google, kecepatan pembuatan, dan mesin AI." },
] as const;

export const NAV_GROUPS = ["Utama", "Riset", "Buat Konten", "Pustaka", "Jualan & Akun", "Pengaturan"] as const;

export type NavItem = (typeof NAV)[number];
export type NavCounts = Partial<Record<string, number>>;

export const navBySlug = (slug: string) => NAV.find((n) => n.slug === slug);
export const navColor = (item: NavItem) => ("color" in item ? item.color : undefined);
