import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// Only the marketing surface. Shared trips are unlisted links by design — not enumerated here.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl(), changeFrequency: "monthly", priority: 1 },
    { url: `${siteUrl()}/sign-up`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${siteUrl()}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${siteUrl()}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
