import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// /join/ and /s/ stay crawlable on purpose: both carry a noindex tag, which a crawler only sees if it may fetch the page.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/s/"], disallow: ["/trips/", "/account", "/api/", "/eat", "/flights", "/stay"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
