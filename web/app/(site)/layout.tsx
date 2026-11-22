import Link from "next/link";
import { cookies } from "next/headers";
import { memberMe } from "@/lib/license-api";
import { SiteNav, type Hosts, type NavUser, type Theme } from "./site-nav";

/** app. origin from SITE_URL, the marketing origin is the same without "app." (both "" in dev = relative links). */
const APP = (process.env.SITE_URL || "").replace(/\/+$/, "");
const HOSTS: Hosts = { app: APP, main: APP.replace("://app.", "://") };

export const dynamic = "force-dynamic";

/** Public site chrome: sticky nav + substantial footer. Content lives on the .site dark green canvas. */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const me = await memberMe().catch(() => null); // license server down → the public site still renders, signed out
  const nav: NavUser = me && {
    name: me.user.name ?? "", email: me.user.email, avatar: me.user.avatar, isAdmin: me.user.isAdmin,
  };
  const theme: Theme = (await cookies()).get("trk_theme")?.value === "light" ? "light" : "dark";
  return (
    <div className="site creator min-h-screen">
      <SiteNav user={nav} theme={theme} hosts={HOSTS} />
      {children}
      <footer className="border-t bg-card">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-[2fr_1fr_1fr_1fr] md:px-8">
          <div className="space-y-4">
            <p className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="" className="size-10" />
              <span className="text-2xl font-semibold">Traktiva</span>
            </p>
            <p className="max-w-sm text-muted-foreground">Studio video affiliate TikTok Shop di PC kamu. Dari etalase sampai jadwal upload.</p>
          </div>
          {[
            ["Produk", [[HOSTS.main + "/fitur", "Fitur"], [HOSTS.main + "/platform", "Platform"], [HOSTS.main + "/cara-kerja", "Cara kerja"], [HOSTS.main + "/harga", "Harga"], [HOSTS.main + "/faq", "FAQ"]]],
            ["Pembeli", [[HOSTS.app + "/masuk", "Masuk"], [HOSTS.app + "/daftar", "Daftar akun"], [HOSTS.app + "/lisensi", "Lisensi & key"], [HOSTS.app + "/bantuan", "Panduan & download"]]],
            ["Traktiva", [[HOSTS.main + "/kontak", "Kontak"], [HOSTS.main + "/privasi", "Kebijakan Privasi"], [HOSTS.main + "/ketentuan", "Ketentuan Layanan"]]],
          ].map(([title, links]) => (
            <div key={title as string} className="grid content-start gap-3">
              <p className="text-base font-semibold">{title as string}</p>
              {(links as string[][]).map(([href, label]) => (
                <Link key={href} href={href} className="text-muted-foreground hover:text-leaf-ink">{label}</Link>
              ))}
            </div>
          ))}
        </div>
        <div className="mx-auto max-w-6xl border-t px-5 py-6 text-sm text-muted-foreground md:px-8">
          © 2026 Traktiva. Bukan produk resmi TikTok atau Google.
        </div>
      </footer>
    </div>
  );
}
