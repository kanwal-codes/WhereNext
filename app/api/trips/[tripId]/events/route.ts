import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withRoute, fail } from "@/lib/server/with-route";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { events as ticketmasterEvents } from "@/packages/providers/ticketmaster/client";
import { localEvents } from "@/packages/providers/eventbrite/client";
import { cached } from "@/lib/server/ttl-cache";
import { mergeEventSources, presentEvent } from "@/lib/application/nearby-events";

/** How long Eventbrite may keep the section waiting once Ticketmaster has answered. */
const EB_GRACE_MS = 500;

/** Ticketmaster + Eventbrite events near a place, for the detail-page "what's on" section. */
export const GET = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    await requireTripMember((await params).tripId, { limit: LIMITS.provider });
    const search = new URL(request.url).searchParams;
    const location = (search.get("location") ?? "").trim();
    const query = (search.get("query") ?? "").trim();
    // Integer and bounded: `page` is part of the shared cache key, so a fractional or huge value
    // would mint unlimited distinct keys (and provider calls).
    const page = Math.min(20, Math.max(0, Math.floor(Number(search.get("page") ?? 0) || 0)));
    if (!location) return NextResponse.json({ error: "A location is required" }, { status: 400 });

    const wantTm = Boolean(process.env.TICKETMASTER_CONSUMER_KEY || process.env.TICKETMASTER_API_KEY);
    const wantEb = Boolean(process.env.EVENTBRITE_API_KEY);
    if (!wantTm && !wantEb) return NextResponse.json({ error: "Events are not configured" }, { status: 503 });

    // Each provider is cached on its own (shared across users), on its own signal rather than this caller's: a disconnecting first
    // request used to abort every sub-call and cache an empty list for 10 min. They are kept apart so the slow one can be left
    // behind: Ticketmaster answers in about 0.3 s and Eventbrite in 0.7-1.2 s, and a section that waits for both is as slow as the worse.
    const sharedSignal = AbortSignal.timeout(15_000);
    const hasAnchor = search.has("lat") && search.has("lng");
    const lat = Number(search.get("lat"));
    const lng = Number(search.get("lng"));
    const anchorPoint = hasAnchor && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { latitude: lat, longitude: lng } : null;
    const tmP = wantTm
      ? cached(`events:tm:${JSON.stringify([location.toLowerCase(), query.toLowerCase(), page])}`, 10 * 60_000, () => ticketmasterEvents(query, location, undefined, sharedSignal, "date", page)).catch(() => null)
      : Promise.resolve(null);
    // Eventbrite takes a point, not a place name. The caller's own point (the place on screen) saves looking the city up again, and
    // searches around that place; without one the city is geocoded as before. Rounded to ~1 km so nearby places share an entry.
    const ebP = wantEb
      ? (async () => {
          const point = anchorPoint ?? (await new GooglePlacesProvider().search(location, sharedSignal).then((hits) => hits[0]).catch(() => null));
          if (!point) return null;
          return cached(`events:eb:${query.toLowerCase()}:${point.latitude.toFixed(2)},${point.longitude.toFixed(2)}`, 10 * 60_000, () => localEvents(query, point.latitude, point.longitude, sharedSignal)).catch(() => null);
        })()
      : Promise.resolve(null);
    const tm = await tmP;
    // Eventbrite gets a short grace after Ticketmaster has answered; if it is still out, the section goes ahead without it. Its request
    // carries on and is cached, so the next look includes it.
    const eb = await Promise.race([ebP, new Promise<null>((resolve) => setTimeout(() => resolve(null), tm ? EB_GRACE_MS : 6_000))]);
    const tmList = (tm ?? []).map((e) => ({ title: e.title, url: e.url, date: e.date, venue: e.venue, source: "ticketmaster", imageUrl: e.imageUrl }));
    const ebList = (eb ?? []).map((e) => ({ title: e.title, url: e.url, date: e.date, venue: e.venue, source: "eventbrite" as string, imageUrl: e.imageUrl }));
    const list = mergeEventSources(tmList, ebList);
    const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 2 && !["concert", "event", "events", "near"].includes(term));
    const relevant = terms.length ? list.filter((event) => terms.every((term) => event.title.toLowerCase().includes(term))) : list;
    const result = { events: (terms.length ? relevant : list).map(presentEvent), retrievedAt: new Date().toISOString() };

    return NextResponse.json({ events: result.events, page, hasMore: wantTm && result.events.length > 0, freshness: { retrievedAt: result.retrievedAt, cacheTtlSeconds: 600 } });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Events are unavailable right now");
  }
});
