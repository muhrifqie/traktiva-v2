import { getKv } from "@/lib/kalo";
import { KaloStudio, type TikTokTab } from "../../kalodata/kalo-studio";
import type { KaloHit } from "../../kalodata/actions";
import { risetData } from "../riset-header";

export const dynamic = "force-dynamic";

const TABS: TikTokTab[] = ["produk", "video", "cari", "tersimpan"];

// Riset → TikTok Shop: everything from KaloData (top products / top videos per market, keyword search) + saved products.
export default async function RisetTiktokPage({ searchParams }: PageProps<"/riset/tiktok">) {
  const sp = await searchParams;
  const { header, saved, savedCount, savedKeys, hasSession, connect } = await risetData("tiktok");
  const q = typeof sp.q === "string" ? sp.q : null;
  const tab = q ? "cari" : (TABS.find((t) => t === sp.tab) ?? "produk");
  // the last keyword search and its results come back from the DB, so closing/refreshing loses nothing
  const last = await getKv<{ keywords: string[]; country?: string }>("kalo:last-search");
  const country = last?.data.country ?? "ID";
  const lastResults = !q && last ? await getKv<KaloHit[]>(`kalo:search:${country}:${[...last.data.keywords].sort().join("|")}`) : null;
  return (
    <>
      {header}
      <KaloStudio
        hasSession={hasSession}
        connect={connect}
        initialTab={tab}
        saved={saved}
        savedCount={savedCount}
        lastKeywords={q ? [q] : last?.data.keywords ?? []}
        lastCountry={country}
        autoSearch={!!q}
        initialResults={lastResults?.data ?? null}
        initialDetailId={typeof sp.produk === "string" ? sp.produk : null}
        savedKeys={savedKeys}
      />
    </>
  );
}
