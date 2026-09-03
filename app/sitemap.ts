import type { MetadataRoute } from "next";

const base = () => process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// Only the marketing surface. Shared trips are unlisted links by design — not enumerated here.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: base(), changeFrequency: "monthly", priority: 1 },
    { url: `${base()}/sign-up`, changeFrequency: "yearly", priority: 0.5 },
  ];
}
