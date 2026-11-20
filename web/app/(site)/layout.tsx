import Link from "next/link";
import { memberMe } from "@/lib/license-api";
import { SiteNav, type NavUser } from "./site-nav";

export const dynamic = "force-dynamic";

/** Public site chrome: sticky nav + substantial footer. Content lives on the .site dark green canvas. */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const me = await memberMe().catch(() => null); // license server down → the public site still renders, signed out
  const nav: NavUser = me && {
    name: me.user.name ?? "", email: me.user.email, avatar: me.user.avatar, isAdmin: me.user.isAdmin,
    alert: me.user.isAdmin && !me.user.totp,
  };
  return (
    <div className="site min-h-screen">
      <SiteNav user={nav} />
      {children}
      <footer className="bg-black">
        <div className="mx-auto grid max-w-[1260px] gap-10 px-5 py-16 md:grid-cols-[2fr_1fr_1fr] md:px-8">
          <div className="space-y-3">
            <p className="flex items-center gap-2.5 text-lg font-semibold">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="" className="size-7" /> Traktiva
            </p>
            <p className="max-w-sm text-[15px] text-[var(--site-muted)]">Studio video affiliate TikTok Shop di PC kamu. Dari etalase sampai jadwal upload.</p>
          </div>
          <div className="grid content-start gap-3 text-[15px]">
            <p className="font-medium">Produk</p>
            <Link href="/#fitur" className="text-[var(--site-muted)] hover:text-white">Fitur</Link>
            <Link href="/#harga" className="text-[var(--site-muted)] hover:text-white">Harga</Link>
            <Link href="/#faq" className="text-[var(--site-muted)] hover:text-white">FAQ</Link>
          </div>
          <div className="grid content-start gap-3 text-[15px]">
            <p className="font-medium">Pembeli</p>
            <Link href="/masuk" className="text-[var(--site-muted)] hover:text-white">Masuk</Link>
            <Link href="/daftar" className="text-[var(--site-muted)] hover:text-white">Daftar akun</Link>
            <Link href="/akun/lisensi" className="text-[var(--site-muted)] hover:text-white">Lisensi & download</Link>
          </div>
        </div>
        <div className="mx-auto max-w-[1260px] border-t border-white/8 px-5 py-6 text-[13px] text-[var(--site-muted)] md:px-8">
          © 2026 Traktiva. Bukan produk resmi TikTok atau Google.
        </div>
      </footer>
    </div>
  );
}
