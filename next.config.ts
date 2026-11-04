import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Request bodies for API routes are small JSON; files never pass through the server.
  experimental: { serverActions: { bodySizeLimit: "16kb" } },
  async headers() {
    return [
      {
        // The service worker must always be revalidated so updates reach installed apps.
        source: "/sw.js",
        headers: [
          { key: "cache-control", value: "no-cache, no-store, must-revalidate" },
          { key: "content-type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
