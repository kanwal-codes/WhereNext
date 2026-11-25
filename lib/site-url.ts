/** The public address of the site, no trailing slash. One fallback for every caller (layout metadata, sitemap, robots, emails). */
export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://www.wherenexts.com").replace(/\/$/, "");
