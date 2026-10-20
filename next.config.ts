import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withSerwistInit from "@serwist/next";

const isDev = process.env.NODE_ENV !== "production";

/** Origin of the Supabase project, so a custom-domain deployment is covered too. */
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

// Browser-side connections the app actually makes: Supabase (REST + realtime ws),
// Mapbox (in-browser map tiles/telemetry), and Sentry ingest when a DSN is set.
// Everything else (provider APIs) is server-to-server and never hits the browser.
const connectSrc = [
  "'self'",
  "https://*.supabase.co",
  "wss://*.supabase.co",
  supabaseOrigin,
  supabaseOrigin.replace(/^http/, "ws"),
  "https://api.mapbox.com",
  "https://events.mapbox.com",
  "https://*.tiles.mapbox.com",
  "https://*.sentry.io",
  "https://*.ingest.sentry.io",
  "https://*.ingest.us.sentry.io",
  isDev ? "ws://localhost:*" : "",
]
  .filter(Boolean)
  .join(" ");

// script/style stay pragmatic: Next's App Router injects inline bootstrap scripts and
// Tailwind/motion inject inline styles, and there's no nonce pipeline here. The real
// hardening is frame-ancestors / object-src / base-uri / form-action + the connect allow-list.
const csp = [
  "default-src 'self'",
  // va.vercel-scripts.com serves the Analytics/Speed Insights loader; both report back
  // to same-origin /_vercel/... endpoints, already covered by 'self' in connect-src.
  `script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // dev runs the Next server on a sibling port behind the preview proxy, so same-origin
  // proxy URLs (photos, static maps) can carry that port — allow localhost in dev only.
  `img-src 'self' data: blob: https:${isDev ? " http://localhost:*" : ""}`,
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "worker-src 'self' blob:",
  `frame-src 'self'`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "manifest-src 'self'",
  // Production only: WebKit (Safari, the iOS simulator, a phone on the LAN) upgrades every
  // subresource of an http://localhost page to https, so dev loads unstyled and never hydrates.
  isDev ? "" : "upgrade-insecure-requests",
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Speech input needs the mic; the map may ask for location. Everything else is off.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self), payment=(), usb=(), interest-cohort=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  // Keep development output separate from production builds. Running `next build`
  // beside `next dev` must never remove chunks from the live development server.
  distDir: process.env.NEXT_DIST_DIR ?? (isDev ? ".next-dev" : ".next"),
  // The round "N" dev badge floats over the bottom-left of every phone screen while developing; it adds nothing here.
  devIndicators: false,
  experimental: {
    // Next's default (0s for dynamic segments) treats every trip layout as stale
    // immediately, so each in-app navigation re-runs requireTripMember's live
    // Supabase auth check + membership query before rendering anything — the
    // multi-second lag switching between trip tabs. The original 30s fix here was
    // still short of how long someone actually spends reading a page before
    // clicking the next thing, so most real navigations kept landing on a cold
    // cache anyway. 300s (5 min) covers a normal browsing session without
    // re-paying that cost on every click; `app/trips/(workspace)/[tripId]/loading.tsx` (and
    // `app/trips/(home)/loading.tsx`) now also give a cold navigation an instant
    // skeleton instead of a frozen screen, so a cache miss here is no longer the
    // dead-freeze it used to be — this is about frequency, not just severity. A
    // removed member can still see cached trip content for up to this window,
    // which mutation routes' `revalidateTag`/`router.refresh()` don't shorten
    // (those refresh data, not this navigation cache).
    staleTimes: { dynamic: 300 },
  },
  async headers() {
    // Images and icons in /public are served with `max-age=0, must-revalidate` by default, so every visit asked the server again about
    // each of them. A day fresh, and a week of serving the old one while a new one is fetched, keeps a revisit to the HTML.
    const publicAssets = { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" };
    return [
      { source: "/:path*", headers: securityHeaders },
      ...["design", "hero", "icons"].map((dir) => ({ source: `/${dir}/:path*`, headers: [publicAssets] })),
    ];
  },
};

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // No SW in `next dev` — keeps Playwright and hot-reload unaffected.
  disable: process.env.NODE_ENV === "development",
  // What the worker precaches on a first visit, beyond the build's own JS and CSS. Setting this REPLACES
  // the default, which is every file in /public ("**/*") — 16.9 MB of photographs, all 30 hero frames and
  // every design image, downloaded in the background before anyone had asked to see one, and again
  // whenever any of them changed. A picture is cached the moment it is actually shown, by the
  // `static-image-assets` rule in `defaultCache` (app/sw.ts).
  // What does belong here is the offline page: the fallback in app/sw.ts answers with
  // `matchPrecache("/~offline")`, and a manifest of static files never includes a route's HTML, so the
  // fallback was dead — losing the network anywhere unvisited showed the browser's own error page.
  // Revisioned per build, since that page's HTML names that build's own chunks.
  additionalPrecacheEntries: [{ url: "/~offline", revision: process.env.VERCEL_DEPLOYMENT_ID ?? Date.now().toString(36) }],
  // Not reloadOnOnline: it force-reloads the whole page the instant connectivity returns, with
  // no regard for unsaved input (a mid-typed message, an open form) — common on mobile where
  // connectivity flaps. App-shell freshness is already covered by `skipWaiting`/`clientsClaim`
  // below, and data freshness by the realtime + workspace-change refresh path (trip-realtime.ts,
  // TripDataProvider) — Supabase Realtime reconnects on its own once the network returns.
});

// The Sentry runtime SDK is a no-op without SENTRY_DSN; the build plugin is a no-op
// without SENTRY_AUTH_TOKEN. Wiring it unconditionally keeps the config simple.
const withObservability = (config: NextConfig): NextConfig =>
  process.env.SENTRY_DSN ? withSentryConfig(config, { silent: !process.env.CI, disableLogger: true }) : config;

export default withSerwist(withObservability(nextConfig));
