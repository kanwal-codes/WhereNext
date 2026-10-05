import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

// Deliberately NOT cached by the service worker: `/api/trips/:tripId/workspace` returns
// per-member data (the personal conversation slice differs by viewer), but the Cache API keys
// purely on URL — a shared/kiosk device signed in as a different member could be served the
// previous member's cached trip content if a fetch ever fell back to cache. It's always fetched
// live instead; offline-store.ts's IndexedDB mirror (already keyed for the "Today" view) is the
// real offline fallback for this data, not the service worker's HTTP cache.
const runtimeCaching: RuntimeCaching[] = [
  {
    // Map imagery + place and hotel photos — fine to serve stale while revalidating.
    matcher: ({ url }) =>
      url.hostname.endsWith("mapbox.com") || url.pathname === "/api/hotel-photo" || /\/api\/trips\/[^/]+\/(map\/static|places\/google\/photo)/.test(url.pathname),
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
