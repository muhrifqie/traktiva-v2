import type { MetadataRoute } from "next";

const SITE = "https://traktiva.site";

/** Public marketing pages only (the member area and the admin panel are not indexed). */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ["/", 1], ["/fitur", 0.8], ["/cara-kerja", 0.8], ["/harga", 0.9], ["/faq", 0.7], ["/kontak", 0.5], ["/privasi", 0.3], ["/ketentuan", 0.3],
  ].map(([path, priority]) => ({ url: `${SITE}${path}`, changeFrequency: "monthly", priority: priority as number }));
}
