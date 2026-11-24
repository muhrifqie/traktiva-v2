import Link from "next/link";
import { Film, ImagePlus, Sparkles } from "lucide-react";

// Galeri = one menu for everything made or uploaded: photos, AI images and finished videos (separate routes, one tab row)
const TABS = [
  { key: "uploads", href: "/galeri", label: "Unggahanku", icon: ImagePlus },
  { key: "ai", href: "/galeri?tab=ai", label: "Hasil AI", icon: Sparkles },
  { key: "video", href: "/galeri-video", label: "Video", icon: Film },
] as const;

export type GaleriTab = (typeof TABS)[number]["key"];

export function GaleriTabs({ current, counts }: { current: GaleriTab; counts: Partial<Record<GaleriTab, number>> }) {
  return (
    <nav className="flex rounded-lg border bg-card p-0.5" aria-label="Isi galeri">
      {TABS.map(({ key, href, label, icon: Icon }) => (
        <Link key={key} href={href} className={`flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium ${current === key ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <Icon className="size-3.5" /> {label}
          {counts[key] != null && <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{counts[key]}</span>}
        </Link>
      ))}
    </nav>
  );
}
