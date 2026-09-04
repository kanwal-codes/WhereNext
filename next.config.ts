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
  supabaseOrigin.replace(/^https:/, "wss:"),
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
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // dev runs the Next server on a sibling port behind the preview proxy, so same-origin
  // proxy URLs (photos, static maps) can carry that port — allow localhost in dev only.
  `img-src 'self' data: blob: https:${isDev ? " http://localhost:*" : ""}`,
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Speech input needs the mic; the map may ask for location. Everything else is off.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self), payment=(), usb=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // No SW in `next dev` — keeps Playwright and hot-reload unaffected.
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
});

// The Sentry runtime SDK is a no-op without SENTRY_DSN; the build plugin is a no-op
// without SENTRY_AUTH_TOKEN. Wiring it unconditionally keeps the config simple.
const withObservability = (config: NextConfig): NextConfig =>
  process.env.SENTRY_DSN ? withSentryConfig(config, { silent: !process.env.CI, disableLogger: true }) : config;

export default withSerwist(withObservability(nextConfig));
