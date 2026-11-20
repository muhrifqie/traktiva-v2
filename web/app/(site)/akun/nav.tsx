"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound, LayoutGrid, Receipt, Settings } from "lucide-react";

const NAV = [
  { href: "/akun", label: "Ringkasan", icon: LayoutGrid },
  { href: "/akun/lisensi", label: "Lisensi & PC", icon: KeyRound },
  { href: "/akun/pesanan", label: "Pesanan", icon: Receipt },
  { href: "/akun/pengaturan", label: "Pengaturan", icon: Settings },
];

/** Account sections: vertical list on desktop, scrollable tabs on phones. */
export function AccountNav({ badges }: { badges: Partial<Record<string, string | number>> }) {
  const path = usePathname();
  const on = (href: string) => (href === "/akun" ? path === "/akun" : path.startsWith(href));
  return (
    <nav aria-label="Menu akun" className="-mx-5 flex gap-1 overflow-x-auto px-5 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={on(href) ? "page" : undefined}
          className={`relative flex h-11 shrink-0 items-center gap-3 rounded-full px-4 text-[15px] transition-colors lg:rounded-xl ${
            on(href) ? "bg-white/[0.08] text-white" : "text-[var(--site-body)] hover:bg-white/[0.04] hover:text-white"
          }`}
        >
          {on(href) && <span className="absolute top-1/2 left-0 hidden h-5 w-0.5 -translate-y-1/2 rounded-full bg-[var(--site-signal)] lg:block" />}
          <Icon className={`size-[18px] ${on(href) ? "text-[var(--site-signal)]" : ""}`} />
          {label}
          {badges[href] != null && (
            <span className="ml-auto rounded-full bg-amber-300/15 px-2 py-0.5 text-[11px] font-semibold text-amber-200 lg:ml-auto">{badges[href]}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
