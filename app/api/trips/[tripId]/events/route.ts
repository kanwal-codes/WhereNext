import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { events as ticketmasterEvents } from "@/packages/providers/ticketmaster/client";
import { localEvents } from "@/packages/providers/eventbrite/client";
import { cached } from "@/lib/server/ttl-cache";

export type NearbyEvent = { title: string; url: string; date?: string; venue?: string; source: string; imageUrl?: string };

const presentEvent = (event: NearbyEvent): NearbyEvent => ({
  ...event,
  date: event.date?.trim() || "Date to be confirmed",
  venue: event.venue?.trim() || "Venue to be confirmed",
});

/** Ticketmaster + Eventbrite events near a place, for the detail-page "what's on" section. */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    await requireTripMember((await params).tripId);
    const search = new URL(request.url).searchParams;
    const location = (search.get("location") ?? "").trim();
    const query = (search.get("query") ?? "").trim();
    const page = Math.max(0, Number(search.get("page") ?? 0) || 0);
    if (!location) return NextResponse.json({ error: "A location is required" }, { status: 400 });

    const wantTm = Boolean(process.env.TICKETMASTER_CONSUMER_KEY || process.env.TICKETMASTER_API_KEY);
    const wantEb = Boolean(process.env.EVENTBRITE_API_KEY);
    if (!wantTm && !wantEb) return NextResponse.json({ error: "Events are not configured" }, { status: 503 });

    const result = await cached(`events:${location.toLowerCase()}:${query.toLowerCase()}:page:${page}`, 10 * 60_000, async () => {
      const point = wantEb ? await new GooglePlacesProvider().search(location, request.signal).then((hits) => hits[0]).catch(() => null) : null;
      const [tm, eb] = await Promise.allSettled([
        wantTm ? ticketmasterEvents(query, location, undefined, request.signal, "date", page) : Promise.resolve([]),
        wantEb && point ? localEvents(query, point.latitude, point.longitude, request.signal) : Promise.resolve([]),
      ]);
      const list: NearbyEvent[] = [];
      const tmList = (tm.status === "fulfilled" ? tm.value : []).map((e) => ({ title: e.title, url: e.url, date: e.date, venue: e.venue, source: "ticketmaster", imageUrl: e.imageUrl }));
      const ebList = (eb.status === "fulfilled" ? eb.value : []).map((e) => ({ title: e.title, url: e.url, date: e.date, venue: e.venue, source: "eventbrite" as string }));
      for (let i = 0; i < Math.max(tmList.length, ebList.length); i += 1) {
        if (tmList[i]) list.push(tmList[i]);
        if (ebList[i]) list.push(ebList[i]);
      }
      const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 2 && !["concert", "event", "events", "near"].includes(term));
      const relevant = terms.length ? list.filter((event) => terms.every((term) => event.title.toLowerCase().includes(term))) : list;
      return { events: (terms.length ? relevant : list).map(presentEvent), retrievedAt: new Date().toISOString() };
    });

    return NextResponse.json({ events: result.events, page, hasMore: wantTm && result.events.length > 0, freshness: { retrievedAt: result.retrievedAt, cacheTtlSeconds: 600 } });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Events are unavailable right now");
  }
}
