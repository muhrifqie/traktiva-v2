import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone server is what Electron spawns in production
  output: "standalone",
  devIndicators: false,
  // product photos are uploaded through a server action
  experimental: { serverActions: { bodySizeLimit: "30mb" } },
  // native/browser-driving packages must stay real node_modules, not bundled
  serverExternalPackages: ["@libsql/client", "libsql", "playwright-core", "better-sqlite3", "ffmpeg-static"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
