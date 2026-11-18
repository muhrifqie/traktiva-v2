import { redirect } from "next/navigation";

// Riset is split into /riset/tiktok and /riset/shopee (both from KaloData). Old links keep working.
export default async function RisetPage({ searchParams }: PageProps<"/riset">) {
  const sp = await searchParams;
  if (sp.platform === "shopee") redirect("/riset/shopee");
  const q = typeof sp.q === "string" && sp.q ? `&q=${encodeURIComponent(sp.q)}` : "";
  const produk = typeof sp.produk === "string" ? `&produk=${sp.produk}` : "";
  const tab = sp.sumber === "tersimpan" ? "tersimpan" : sp.sumber === "kalodata" ? "cari" : "produk";
  redirect(`/riset/tiktok?tab=${tab}${q}${produk}`);
}
