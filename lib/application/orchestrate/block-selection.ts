import type { AssistantBlock, PlaceCard } from "@/packages/contracts/assistant";
import type { Place } from "@/packages/contracts/place";
import { formatDistanceKm, haversineKm, nearest } from "@/lib/application/geo";
import type { TripContext } from "@/lib/application/trip-context";
import type { ResolvedTurn, ToolCall } from "@/lib/application/turn-resolver";
import type { RetrievedEvidence, EventResult } from "@/lib/application/retrieve";
import type { WeatherCard } from "@/lib/application/weather-card";
import type { buildItineraryPlan } from "@/lib/application/itinerary-plan";
import type { buildBudgetBreakdown } from "@/lib/application/budget-plan";
import type { buildExploreOptions } from "@/lib/application/explore-options";
import type { buildStructuredAnswer } from "@/lib/application/structured-answer";

/**
 * The place-card/itinerary/events gating logic (Phase 1.3.2,
 * docs/overhaul/roadmap/phase-1-structural-refactor.md) — which structured blocks a turn shows,
 * assembled from RETRIEVE's evidence and the side block-builders, not model JSON. Extracted
 * verbatim out of `runAssistantTurn`'s STRUCTURE section: this is the exact logic that took a
 * live investigation to explain during the "why doesn't it show Google Maps cards" conversation
 * — a named, tested file is what would have made that answer immediate instead of requiring a
 * live debugging session.
 */

const PLACE_INTENTS = new Set(["discovery", "nightlife", "food", "activities", "history_culture", "stays", "compare"]);

export function selectBlocks(params: {
  resolved: ResolvedTurn;
  evidence: RetrievedEvidence;
  tripCtx: TripContext;
  itineraryBlock: Awaited<ReturnType<typeof buildItineraryPlan>>;
  budgetBlock: Awaited<ReturnType<typeof buildBudgetBreakdown>>;
  optionsBlock: Awaited<ReturnType<typeof buildExploreOptions>>;
  structuredAnswerBlock: Awaited<ReturnType<typeof buildStructuredAnswer>>;
  weatherCard: WeatherCard | null;
  tripUpdateReceipt: AssistantBlock | null;
  cardPlaces: Place[];
  cardPlaceGroups: Array<{ label: string; places: Place[] }>;
  eventCall: Extract<ToolCall, { tool: "events" }> | undefined;
  eventsInWindow: EventResult[];
  photoUrl: (name: string) => string;
}): AssistantBlock[] {
  const { resolved, evidence, tripCtx, itineraryBlock, budgetBlock, optionsBlock, structuredAnswerBlock, weatherCard, tripUpdateReceipt, cardPlaces, cardPlaceGroups, eventCall, eventsInWindow, photoUrl } = params;

  const blocks: AssistantBlock[] = [];
  // Gated on the traveller's OWN wording (RESOLVE's `proximityMatters`), not just on a locked
  // place existing — live-caught: this used to show unconditionally on every single card
  // whenever anything was locked, so a plain "recommend some restaurants" carried a "1.3 km from
  // Breakfast at Cafe Olimpico" line nobody asked about. "nearby", "near my hotel", "closest to
  // the park I'm visiting", "somewhere after the concert" turn distance into an actual decision
  // factor; a plain request for recommendations doesn't, even though the results are found the
  // same way either way. When it DOES apply, it's the direct, explicit answer to something the
  // traveller asked — so it shows regardless of how far, unlike the threshold-gated "near your
  // stay" nudge on a passively-browsed card (Discover, "Around here"; see NEARBY_STAY_KM). A
  // locked accommodation is the one anchor worth naming specifically: it's the fixed point every
  // day of the trip radiates from, unlike a locked breakfast reservation, which just happens to
  // have coordinates too. Falls back to nearest-of-any-locked-thing only when no accommodation is
  // locked yet, so an early-planning trip with a locked opening dinner still gets SOME anchor —
  // and that fallback naturally becomes "the concert venue" once a concert is a locked itinerary
  // item and it's the nearest one, with no separate event-anchor lookup needed.
  const distanceToLocked = (place: { latitude: number; longitude: number }): string | undefined => {
    if (!resolved.proximityMatters) return undefined;
    if (tripCtx.accommodationAnchor) {
      return `${formatDistanceKm(haversineKm(place, tripCtx.accommodationAnchor))} from ${tripCtx.accommodationAnchor.title}`;
    }
    if (tripCtx.lockedPlaces.length === 0) return undefined;
    const hit = nearest({ latitude: place.latitude, longitude: place.longitude }, tripCtx.lockedPlaces);
    return hit ? `${formatDistanceKm(hit.km)} from ${hit.target.title}` : undefined;
  };
  // A concert / named-act / specific-kind event query is about the EVENT, not the venue.
  // Suppress the place cards (the arena, the club) so the events block below carries the turn.
  // Gated on `intent` alone (not "any events call exists") so a multi-topic turn — "restaurants
  // near the Bruno Mars show" — keeps its unrelated search_places results; the router already
  // sets intent "events" whenever the ask is actually about the event itself.
  const eventFocused = resolved.intent === "events";
  if (itineraryBlock) blocks.push(itineraryBlock);
  if (budgetBlock) blocks.push(budgetBlock);
  if (optionsBlock) blocks.push(optionsBlock);
  if (structuredAnswerBlock) blocks.push(structuredAnswerBlock);
  if (cardPlaces.length > 0 && PLACE_INTENTS.has(resolved.intent) && !eventFocused && !itineraryBlock && !optionsBlock) {
    for (const group of cardPlaceGroups) blocks.push({
      type: "place_list",
      ...(group.label ? { title: group.label.slice(0, 80) } : {}),
      places: group.places.map((place): PlaceCard => ({
        provider: place.provider, providerId: place.providerId, name: place.name, category: place.category,
        latitude: place.latitude, longitude: place.longitude, address: place.address,
        rating: place.rating, userRatingCount: place.userRatingCount, priceLevel: place.priceLevel,
        sourceUrl: place.sourceUrl, photoNames: place.photoNames,
        photoUrl: place.photoNames?.[0] ? photoUrl(place.photoNames[0]) : undefined,
        distanceToLocked: distanceToLocked(place),
        trust: "sourced",
      })),
    });
  }
  for (const route of evidence.routes.slice(0, 3)) {
    blocks.push({
      type: "route_summary",
      from: route.from, to: route.to, mode: route.mode,
      durationSeconds: route.durationSeconds, distanceMeters: route.distanceMeters, fare: route.fare,
      steps: route.steps.slice(0, 12), departureTime: route.departureTime, arrivalTime: route.arrivalTime,
      retrievedAt: evidence.retrievedAt,
    });
  }
  if (evidence.events.length > 0) {
    const dateScoped = evidence.events.some((event) => event.relToTrip);
    blocks.push({
      type: "events",
      retrievedAt: evidence.retrievedAt,
      ...(dateScoped && tripCtx.trip?.start_date && tripCtx.trip?.end_date
        ? { window: { start: tripCtx.trip.start_date, end: tripCtx.trip.end_date } }
        : {}),
      items: evidence.events.slice(0, 8).map((event) => ({
        title: event.title, url: event.url, date: event.date, venue: event.venue, source: event.source,
        ...(event.imageUrl ? { imageUrl: event.imageUrl } : {}),
        ...(event.relToTrip ? { relToTrip: event.relToTrip, offsetDays: event.offsetDays } : {}),
        ...(typeof event.rank === "number" ? { rank: Math.round(event.rank) } : {}),
      })),
    });
    // Named act with more than one night inside the trip — offer the dates as pickable chips.
    if (eventCall?.artist && eventsInWindow.length >= 2) {
      blocks.push({
        type: "clarifying_question",
        question: `Which ${eventCall.artist} night?`,
        chips: eventsInWindow
          .map((event) => (event.date ?? "").trim())
          .filter(Boolean)
          .slice(0, 6)
          .map((date) => `${eventCall.artist} · ${date}`.slice(0, 48)),
      });
    }
  }
  for (const search of evidence.flights) {
    if (search.offers.length === 0) continue;
    blocks.push({
      type: "flights",
      retrievedAt: evidence.retrievedAt,
      origin: search.origin.slice(0, 80),
      destination: search.destination.slice(0, 80),
      dateNote: search.assumedDate ? `Example date ${search.departureDate} — no travel date set yet` : `Departing ${search.departureDate}`,
      items: search.offers.slice(0, 8).map((offer) => ({
        id: offer.id?.slice(0, 240),
        airline: offer.airline.slice(0, 80),
        operatingAirline: offer.operatingAirline?.slice(0, 80),
        price: offer.priceAmount.slice(0, 20),
        currency: offer.priceCurrency.slice(0, 8),
        durationMinutes: offer.durationMinutes,
        stops: offer.stops,
        departAt: offer.departAt.slice(0, 40),
        arriveAt: offer.arriveAt.slice(0, 40),
        originAirport: offer.originAirport?.slice(0, 8),
        destinationAirport: offer.destinationAirport?.slice(0, 8),
        cabinClass: offer.cabinClass?.slice(0, 40),
        baggage: offer.baggage?.slice(0, 120),
        layoverAirports: offer.layoverAirports?.slice(0, 6),
        aircraft: offer.aircraft?.slice(0, 120),
        fareConditions: offer.fareConditions?.slice(0, 4),
        expiresAt: offer.expiresAt?.slice(0, 40),
      })),
    });
  }
  for (const search of evidence.stays) {
    if (search.options.length === 0) continue;
    blocks.push({
      type: "stays",
      retrievedAt: evidence.retrievedAt,
      location: search.location.slice(0, 120),
      checkin: search.checkin,
      checkout: search.checkout,
      nights: search.nights,
      dateNote: search.assumedDates ? `Example dates ${search.checkin} → ${search.checkout} — set your real dates` : `${search.checkin} → ${search.checkout}`,
      detailHotel: search.detail?.hotelName,
      items: search.options.slice(0, 6).map((option) => ({
        hotelId: option.hotelId.slice(0, 120),
        name: option.name.slice(0, 160),
        nightlyPrice: String(option.nightlyAmount),
        totalPrice: String(option.totalAmount),
        currency: option.currency.slice(0, 8),
        stars: option.stars ?? undefined,
        rating: option.rating ?? undefined,
        reviews: option.reviewCount ?? undefined,
        board: option.boardName ?? undefined,
        refundable: option.refundable,
        distanceToLocked: option.latitude != null && option.longitude != null ? distanceToLocked({ latitude: option.latitude, longitude: option.longitude }) : undefined,
        thumbnailUrl: option.thumbnail?.startsWith("http") ? option.thumbnail : undefined,
        latitude: option.latitude ?? undefined,
        longitude: option.longitude ?? undefined,
        address: option.address?.slice(0, 200) ?? undefined,
        city: option.city?.slice(0, 80) ?? undefined,
      })),
      rooms: search.detail?.rooms.slice(0, 12).map((room) => ({
        name: room.name.slice(0, 120),
        boardName: room.boardName,
        refundable: room.refundable,
        maxOccupancy: room.maxOccupancy,
        nightlyAmount: room.nightlyAmount,
        totalAmount: room.totalAmount,
        currency: room.currency.slice(0, 8),
      })),
    });
  }
  if (weatherCard) blocks.unshift({ type: "weather", retrievedAt: evidence.retrievedAt, ...weatherCard });
  // A change receipt leads the reply, above whatever the turn is actually answering — the user
  // needs to see "Destination updated: X -> Y" before anything built on the NEW destination.
  if (tripUpdateReceipt) blocks.unshift(tripUpdateReceipt);

  return blocks;
}
