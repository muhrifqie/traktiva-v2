import type { NextConfig } from "next";

// Traktiva web: admin panel (/admin) now, buyer site (/) when the domain exists.
// It never touches the license DB or keys: everything goes through the license server's internal API (lib/license-api.ts).
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,
  // web/ lives inside the desktop app's repo: pin the root so the parent's instrumentation.ts / lockfile are ignored.
  outputFileTracingRoot: import.meta.dirname,
  turbopack: {
    root: import.meta.dirname,
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  // member pages moved from /akun/<page> to /<page> (Ringkasan stays at /akun): old links and bookmarks keep working
  async redirects() {
    return [
      { source: "/akun/:page(lisensi|pesanan|aktivitas|bantuan|pengaturan)/:rest*", destination: "/:page/:rest*", permanent: true },
      { source: "/akun/download", destination: "/aplikasi", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
