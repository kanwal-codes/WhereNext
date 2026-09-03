import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = { distDir: process.env.NEXT_DIST_DIR ?? ".next" };

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
