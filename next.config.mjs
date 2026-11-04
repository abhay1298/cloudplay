// Plain JavaScript on purpose: a .ts config needs TypeScript at runtime, which the
// production image (dev dependencies pruned) does not have.
/** @type {import("next").NextConfig} */
const nextConfig = {
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
