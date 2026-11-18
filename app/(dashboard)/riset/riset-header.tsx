import Link from "next/link";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { PlatformIcon } from "@/components/platform-icon";
import { db } from "@/lib/db";
import { kaloSessions, savedProducts } from "@/lib/db/schema";
import { maskCookie } from "@/lib/kalo";
import { PRESETS } from "@/lib/presets";
import { SessionsButton } from "../kalodata/kalo-studio";
import { SavedList } from "./saved-list";

const fmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export const RISET_PLATFORMS = [
  { id: "tiktok", icon: "tiktok", label: "TikTok Shop" },
  { id: "shopee", icon: "shopee", label: "Shopee" },
] as const;

/** Everything a Riset sub-page needs: KaloData sessions, saved products of that platform, the header. */
export async function risetData(platform: "tiktok" | "shopee") {
  const sessions = (await db.select().from(kaloSessions).orderBy(desc(kaloSessions.id))).map((r) => ({
    id: r.id, label: r.label, masked: maskCookie(r.sessionCookie), email: r.email, source: r.source, status: r.status, lastError: r.lastError, created: fmt.format(r.createdAt),
  }));
  const all = await db.select().from(savedProducts).orderBy(desc(savedProducts.createdAt));
  const mine = all.filter((s) => (platform === "shopee" ? s.source === "shopee" : s.source !== "shopee"));
  const concepts = PRESETS.filter((p) => p.available).map((p) => ({ id: p.id, title: p.title, bestFor: p.bestFor }));
  const saved = (
    <SavedList
      concepts={concepts}
      items={mine.map((s) => ({ id: s.id, productId: s.productId, country: s.country, source: s.source, title: s.title, image: s.image, price: s.price, shopName: s.shopName, metrics: s.metrics, created: fmt.format(s.createdAt) }))}
    />
  );
  const header = (
    <PageHeader slug="riset">
      <SessionsButton sessions={sessions} active={sessions.filter((s) => s.status === "active").length} />
      <nav className="flex rounded-lg border bg-card p-0.5" aria-label="Platform">
        {RISET_PLATFORMS.map((p) => (
          <Link
            key={p.id}
            href={`/riset/${p.id}`}
            className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${p.id === platform ? "bg-primary/12 text-foreground ring-1 ring-primary/40" : "text-muted-foreground hover:text-foreground"}`}
          >
            <PlatformIcon platform={p.icon} className="size-3.5" /> {p.label}
          </Link>
        ))}
      </nav>
    </PageHeader>
  );
  return {
    header,
    saved,
    savedCount: mine.length,
    savedKeys: all.map((s) => `${s.productId}:${s.country}`),
    hasSession: sessions.some((s) => s.status !== "dead"),
  };
}
