import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin, NetworkFirst, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const runtimeCaching: RuntimeCaching[] = [
  {
    // The trip snapshot — keep the last good copy for offline "Today".
    matcher: ({ url }) => /\/api\/trips\/[^/]+\/workspace/.test(url.pathname),
    handler: new NetworkFirst({
      cacheName: "trip-workspace",
      networkTimeoutSeconds: 5,
      plugins: [new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 })],
    }),
  },
  {
    // Map imagery + place photos — fine to serve stale while revalidating.
    matcher: ({ url }) =>
      url.hostname.endsWith("mapbox.com") || /\/api\/trips\/[^/]+\/(map\/static|places\/google\/photo)/.test(url.pathname),
    handler: new StaleWhileRevalidate({
      cacheName: "trip-imagery",
      plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 7 })],
    }),
  },
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [{ url: "/~offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
