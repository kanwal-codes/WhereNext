import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Where next?",
    short_name: "Where next?",
    description: "Plan a trip by talking about it — then explore, compare and build the itinerary in one place.",
    start_url: "/trips",
    display: "standalone",
    background_color: "#f7f6f3",
    theme_color: "#1b1c20",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
