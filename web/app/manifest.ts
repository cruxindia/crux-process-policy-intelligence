import type { MetadataRoute } from "next";

/** Web app manifest: lets people install the platform from the browser (desktop and phone), no app store. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "CRUX Process & Policy Intelligence",
    short_name: "CRUX PPI",
    description: "Processes, policies, documents and reviews for CRUX — installable from the browser.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#0f5bd8",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
