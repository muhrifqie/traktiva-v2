import Link from "next/link";
import { cookies } from "next/headers";
import { memberMe } from "@/lib/license-api";
import { SiteNav, type NavUser, type Theme } from "./site-nav";

export const dynamic = "force-dynamic";

/** Public site chrome: sticky nav + substantial footer. Content lives on the .site dark green canvas. */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const me = await memberMe().catch(() => null); // license server down → the public site still renders, signed out
  const nav: NavUser = me && {
    name: me.user.name ?? "", email: me.user.email, avatar: me.user.avatar, isAdmin: me.user.isAdmin,
    alert: me.user.isAdmin && !me.user.totp,
  };
  const theme: Theme = (await cookies()).get("trk_theme")?.value === "light" ? "light" : "dark";
  return (
    <div className="site creator min-h-screen">
      <SiteNav user={nav} theme={theme} />
      {children}
      <footer className="border-t bg-card">
        <div className="mx-auto grid max-w-[90rem] gap-10 px-5 py-16 md:grid-cols-[2fr_1fr_1fr_1fr] md:px-10">
          <div className="space-y-4">
            <p className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="" className="size-10" />
              <span className="font-display text-3xl font-extrabold">Traktiva</span>
            </p>
            <p className="max-w-sm text-muted-foreground">Studio video affiliate TikTok Shop di PC kamu. Dari etalase sampai jadwal upload.</p>
          </div>
          {[
            ["Produk", [["/#fitur", "Fitur"], ["/#cara-kerja", "Cara kerja"], ["/harga", "Harga"], ["/#faq", "FAQ"]]],
            ["Pembeli", [["/masuk", "Masuk"], ["/daftar", "Daftar akun"], ["/lisensi", "Lisensi & key"], ["/aplikasi", "Download app"]]],
            ["Akun", [["/lupa-password", "Lupa password"], ["/pengaturan", "Pengaturan"], ["/pesanan", "Pesanan"]]],
          ].map(([title, links]) => (
            <div key={title as string} className="grid content-start gap-3">
              <p className="font-display text-lg font-bold">{title as string}</p>
              {(links as string[][]).map(([href, label]) => (
                <Link key={href} href={href} className="text-muted-foreground hover:text-leaf-ink">{label}</Link>
              ))}
            </div>
          ))}
        </div>
        <div className="mx-auto max-w-[90rem] border-t px-5 py-6 text-sm text-muted-foreground md:px-10">
          © 2026 Traktiva. Bukan produk resmi TikTok atau Google.
        </div>
      </footer>
    </div>
  );
}
