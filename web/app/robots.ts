import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/akun", "/lisensi", "/pesanan", "/aktivitas", "/bantuan", "/pengaturan", "/beli", "/atur-password", "/email/"] },
    sitemap: "https://traktiva.site/sitemap.xml",
  };
}
