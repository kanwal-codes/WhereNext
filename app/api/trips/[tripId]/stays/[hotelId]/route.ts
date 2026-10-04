import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { fail } from "@/lib/server/with-route";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";
import { hotelDetails, liteApiConfigured, stayReviews, stayRooms } from "@/packages/providers/liteapi/client";
import { research } from "@/packages/providers/tavily/client";
import { generateText } from "@/packages/ai/model-policy";
import { resolveStayDates } from "@/lib/application/stay-dates";
import { resolveCurrency } from "@/lib/currency";
import { loadTravellerDefaults, withTravellerDefaults } from "@/lib/server/traveller-defaults";
import { cached } from "@/lib/server/ttl-cache";

/** Tighten LiteAPI's marketing description into 2–3 honest sentences. Falls back to a trimmed original. */
async function summariseAbout(name: string, raw: string, signal?: AbortSignal): Promise<string> {
  const text = raw.trim();
  if (text.length < 240 || !process.env.AI_GATEWAY_API_KEY) return text.slice(0, 700);
  try {
    return (
      await generateText(
        "bulk",
        [
          {
            role: "system",
            content:
              "Rewrite this hotel description as 2–3 plain, factual sentences: what kind of property it is, where it sits, and who it suits (location, style, standout amenities). Drop marketing adjectives, exclamation, room-rate talk and lists. British English.",
          },
          { role: "user", content: `${name}:\n${text.slice(0, 3000)}` },
        ],
        signal,
      )
    ).trim();
  } catch {
    return text.slice(0, 700);
  }
}

/** One clean paragraph on what guests actually say, from web results. Null if nothing usable. */
async function guestSentiment(name: string, city: string | null, signal?: AbortSignal): Promise<string | null> {
  if (!process.env.TAVILY_API_KEY) return null;
  let notes = "";
  try {
    const hits = await research(`${name}${city ? ` ${city}` : ""} hotel guest reviews — what travellers like and complain about`, signal);
    notes = hits.map((h) => h.content).filter(Boolean).join("\n\n").slice(0, 3000);
  } catch {
    return null;
  }
  if (!notes) return null;
  if (!process.env.AI_GATEWAY_API_KEY) return notes.slice(0, 400);
  try {
    return (
      await generateText(
        "bulk",
        [
          {
            role: "system",
            content:
              "From the notes, write TWO or THREE sentences on what guests consistently praise and what they complain about at this hotel. Balanced and specific (location, cleanliness, staff, breakfast, noise, value…). No scores, no marketing lines, no sources, no lists. British English.",
          },
          { role: "user", content: `${name}:\n${notes}` },
        ],
        signal,
      )
    ).trim();
  } catch {
    return notes.slice(0, 400);
  }
}

/** Hotel content + dated room rates + guest reviews + a web sentiment read. Each part degrades to null. */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string; hotelId: string }> }) {
  try {
    const { tripId, hotelId } = await params;
    const { supabase, user } = await requireTripMember(tripId, { limit: LIMITS.provider });
    if (!liteApiConfigured()) return NextResponse.json({ error: "Stay search is not configured" }, { status: 503 });

    const [trip, prefs, defaults] = await Promise.all([
      createTripRepository(supabase).get(tripId),
      supabase.from("trip_preferences").select("data").eq("trip_id", tripId).maybeSingle(),
      loadTravellerDefaults(supabase, user.id, request.headers),
    ]);
    const currency = resolveCurrency(withTravellerDefaults((prefs.data?.data ?? {}) as Record<string, unknown>, defaults));

    const q = new URL(request.url).searchParams;
    const adults = Math.max(1, Math.min(Number(q.get("adults")) || (trip as { travelers?: number } | null)?.travelers || 2, 24));
    const rooms = Math.max(1, Math.min(Number(q.get("rooms")) || 1, 8));
    const { checkin, checkout, assumed } = resolveStayDates(q.get("checkin"), q.get("checkout"), {
      checkin: (trip as { start_date?: string | null } | null)?.start_date,
      checkout: (trip as { end_date?: string | null } | null)?.end_date,
    });

    const [details, rates, reviews] = await Promise.allSettled([
      cached(`stay:details:${hotelId}`, 10 * 60_000, () => hotelDetails(hotelId, request.signal)),
      cached(`stay:rooms:${hotelId}:${checkin}:${checkout}:${adults}:${rooms}:${currency}`, 5 * 60_000, () =>
        stayRooms({ hotelId, checkin, checkout, adults, rooms, currency }, request.signal),
      ),
      cached(`stay:reviews:${hotelId}`, 6 * 60 * 60_000, () => stayReviews(hotelId, 12, request.signal)),
    ]);

    if (details.status === "rejected" && rates.status === "rejected") {
      return NextResponse.json({ error: "Hotel details are unavailable right now" }, { status: 503 });
    }

    let hotel = details.status === "fulfilled" ? details.value : null;
    const [sentiment, about] = hotel
      ? await Promise.all([
          cached(`stay:sentiment:${hotelId}`, 24 * 60 * 60_000, () => guestSentiment(hotel!.name, hotel!.city, request.signal)),
          hotel.description
            ? cached(`stay:about:${hotelId}`, 24 * 60 * 60_000, () => summariseAbout(hotel!.name, hotel!.description!, request.signal))
            : Promise.resolve(null),
        ])
      : [null, null];
    if (hotel && about) hotel = { ...hotel, description: about };

    const nights = rates.status === "fulfilled" ? rates.value.nights : Math.max(1, Math.round((Date.parse(checkout) - Date.parse(checkin)) / 864e5));
    return NextResponse.json({
      hotel,
      rooms: rates.status === "fulfilled" ? rates.value.rooms : null,
      reviews: reviews.status === "fulfilled" ? reviews.value : [],
      sentiment,
      nights,
      checkin,
      checkout,
      adults,
      roomCount: rooms,
      currency,
      assumedDates: assumed,
      freshness: { provider: "liteapi", retrievedAt: new Date().toISOString(), cacheTtlSeconds: 300 },
    });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Hotel details are unavailable right now");
  }
}
