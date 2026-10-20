import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withRoute, fail } from "@/lib/server/with-route";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { events as ticketmasterEvents } from "@/packages/providers/ticketmaster/client";
import { localEvents } from "@/packages/providers/eventbrite/client";
import { cached } from "@/lib/server/ttl-cache";
import { mergeEventSources, presentEvent } from "@/lib/application/nearby-events";

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

    // The loader's result is shared across users, so it runs on its own signal, not this caller's:
    // a disconnecting first request used to abort every sub-call and cache an empty list for 10 min.
    const sharedSignal = AbortSignal.timeout(15_000);
    let degraded: { events: ReturnType<typeof presentEvent>[]; retrievedAt: string } | null = null;
    const result = await cached(`events:${JSON.stringify([location.toLowerCase(), query.toLowerCase(), page])}`, 10 * 60_000, async () => {
      // The geocode is only needed for Eventbrite (it takes lat/lng, not a place name) — Ticketmaster
      // doesn't depend on it at all, so the two start together instead of Ticketmaster waiting on a
      // lookup it has no use for.
      const [tm, pointResult] = await Promise.allSettled([
        wantTm ? ticketmasterEvents(query, location, undefined, sharedSignal, "date", page) : Promise.resolve([]),
        wantEb ? new GooglePlacesProvider().search(location, sharedSignal).then((hits) => hits[0]) : Promise.resolve(null),
      ]);
      const point = pointResult.status === "fulfilled" ? pointResult.value : null;
      const eb = wantEb && point ? await localEvents(query, point.latitude, point.longitude, sharedSignal).catch(() => null) : null;
      const tmList = (tm.status === "fulfilled" ? tm.value : []).map((e) => ({ title: e.title, url: e.url, date: e.date, venue: e.venue, source: "ticketmaster", imageUrl: e.imageUrl }));
      const ebList = (eb ?? []).map((e) => ({ title: e.title, url: e.url, date: e.date, venue: e.venue, source: "eventbrite" as string }));
      const list = mergeEventSources(tmList, ebList);
      const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 2 && !["concert", "event", "events", "near"].includes(term));
      const relevant = terms.length ? list.filter((event) => terms.every((term) => event.title.toLowerCase().includes(term))) : list;
      const built = { events: (terms.length ? relevant : list).map(presentEvent), retrievedAt: new Date().toISOString() };
      // Every configured provider failing is a degraded answer, not an empty one: serve it but do not
      // cache it (a thrown loader skips the store).
      if ((!wantTm || tm.status === "rejected") && (!wantEb || eb === null)) {
        degraded = built;
        throw new Error("events degraded — not cached");
      }
      return built;
    }).catch((err) => {
      if (degraded) return degraded;
      throw err;
    });

    return NextResponse.json({ events: result.events, page, hasMore: wantTm && result.events.length > 0, freshness: { retrievedAt: result.retrievedAt, cacheTtlSeconds: 600 } });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Events are unavailable right now");
  }
});
