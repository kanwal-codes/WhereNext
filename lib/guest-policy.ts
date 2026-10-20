/**
 * What an anonymous (guest) session may reach. Guests get Roam and nothing else: no itinerary, no
 * saved places, no group chat, no bookings, no editing the trip. This is the single source of
 * truth, enforced for every request in `middleware.ts` (deny by default), so a route someone adds
 * later is closed to guests until it is listed here. The UI locks the same features, but that is
 * only manners: this is the part that actually holds.
 *
 * Pure and dependency-free so it runs in the edge middleware and in unit tests.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

type ApiRule = { methods: readonly string[]; path: RegExp };

/** The API surface the Roam chat needs: start/reset a guest, get a ticket to move to an existing account, take a turn, and read what the page shows. */
const API_ALLOW: readonly ApiRule[] = [
  { methods: ["POST"], path: /^\/api\/guest\/(start|reset|claim-ticket)$/ },
  { methods: ["POST"], path: /^\/api\/ai$/ },
  { methods: ["GET"], path: /^\/api\/(health|profile)$/ },
  // Hotel photographs from Google's image hosts, served from our origin (lib/hotel-photo.ts). Host-allow-listed in the route itself.
  { methods: ["GET"], path: /^\/api\/hotel-photo$/ },
  // The map's public token (the maps Roam opens beside a card).
  { methods: ["GET"], path: /^\/api\/config\/mapbox$/ },
  {
    // Reads only. `places/google` (+ `about`) + `stays/:id` + `events/detail` are the card "Details" lookups; `stays`, `flights/places` and `places/google/autocomplete` are the cards' own search bars; `cover` is the sidebar's destination photo. All rate-limited per user.
    methods: ["GET"],
    path: new RegExp(
      `^/api/trips/${UUID}/(conversation|workspace|members|memory|decisions|map/static|cover|places/google|places/google/(about|photo|autocomplete)|events/detail|flights/places|stays|stays/[^/]+)$`,
      "i",
    ),
  },
  {
    // The flights card searches again when its route or dates change. These are searches, not writes (provider-limited per user), same as the chat turn that produced the card.
    methods: ["POST"],
    path: new RegExp(`^/api/trips/${UUID}/flights(/return)?$`, "i"),
  },
];

/** Pages a guest can open. Anything else under /trips is bounced back to the chat. */
const PAGE_ALLOW: readonly RegExp[] = [
  /^\/$/,
  /^\/(landing-next|sign-in|sign-up|forgot-password|reset-password|auth-callback|privacy|terms)\/?$/,
  new RegExp(`^/trips/${UUID}/chat/?$`, "i"),
];

const FILE = /\.[a-z0-9]{2,5}$/i;
const CHAT_PAGE = new RegExp(`^/trips/(${UUID})(?:/|$)`, "i");

export type GuestDecision =
  | { allow: true }
  | { allow: false; kind: "api" }
  | { allow: false; kind: "page"; redirectTo: string };

export function guestDecision(pathname: string, method: string): GuestDecision {
  if (pathname.startsWith("/_next/") || pathname.startsWith("/_vercel/") || FILE.test(pathname)) return { allow: true };

  if (pathname.startsWith("/api/")) {
    const verb = method.toUpperCase();
    return API_ALLOW.some((rule) => rule.methods.includes(verb) && rule.path.test(pathname)) ? { allow: true } : { allow: false, kind: "api" };
  }

  if (PAGE_ALLOW.some((rule) => rule.test(pathname))) return { allow: true };
  const trip = CHAT_PAGE.exec(pathname);
  return { allow: false, kind: "page", redirectTo: trip ? `/trips/${trip[1]}/chat` : "/" };
}

/** Body every denied API call returns, so the client can tell "sign up" from a real failure. */
export const ACCOUNT_REQUIRED = { error: "Create a free account to use this.", code: "account_required" } as const;
