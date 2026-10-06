import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

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
  {
    // Every other same-origin API response is per-viewer (workspace, conversation, account export, …) and
    // the Cache API keys on URL alone. Serwist's defaultCache would otherwise add a catch-all NetworkFirst
    // `/api/` cache that stores them for 24h and serves them back on a timeout or offline — this route
    // must come BEFORE it for the exclusion above to actually hold. Imagery is matched earlier.
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"),
    handler: new NetworkOnly(),
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
