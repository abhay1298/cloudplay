import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "CloudPlay",
    short_name: "CloudPlay",
    description: "Your Cloud Videos. One Place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#07070d",
    theme_color: "#07070d",
    categories: ["entertainment", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Universal Player", url: "/player", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Convert", url: "/convert", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My Library", url: "/library", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
