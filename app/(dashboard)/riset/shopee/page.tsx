import { ShopeeStudio, type ShopeeTab } from "../../kalodata/shopee-studio";
import { risetData } from "../riset-header";

export const dynamic = "force-dynamic";

// Riset → Shopee: KaloData's Shopee best sellers (ID, TH, VN) + saved Shopee products.
export default async function RisetShopeePage({ searchParams }: PageProps<"/riset/shopee">) {
  const sp = await searchParams;
  const { header, saved, savedCount, savedKeys, hasSession } = await risetData("shopee");
  const tab: ShopeeTab = sp.tab === "tersimpan" ? "tersimpan" : "produk";
  return (
    <>
      {header}
      <ShopeeStudio hasSession={hasSession} initialTab={tab} saved={saved} savedCount={savedCount} savedKeys={savedKeys} />
    </>
  );
}
