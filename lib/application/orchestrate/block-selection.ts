import type { AssistantBlock, PlaceCard } from "@/packages/contracts/assistant";
import type { Place } from "@/packages/contracts/place";
import { formatDistanceKm, haversineKm, nearest, usesMiles } from "@/lib/application/geo";
import type { TripContext } from "@/lib/application/trip-context";
import type { ResolvedTurn, ToolCall } from "@/lib/application/turn-resolver";
import type { RetrievedEvidence, EventResult } from "@/lib/application/retrieve";
import type { WeatherCard } from "@/lib/application/weather-card";
import { toFlightItem } from "@/lib/application/flight-items";
import { toStayCardItem } from "@/lib/application/stay-items";
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

const DORM_ASK = /\b(?:dorms?|dormitor(?:y|ies)|hostels?|shared rooms?|bunk(?:s| beds?)?)\b/i;
const DORM_LIKE = /hostel|dorm|backpack|auberge de jeunesse|bunk|capsule|pod\b/i;

/** The traveller asked for dorm beds or hostels and none of the results is one: say so on the card instead of letting hotels pass as the answer. */
export function dormMismatchNote(prompt: string | undefined, names: string[]): string | null {
  if (!prompt || !DORM_ASK.test(prompt) || names.length === 0) return null;
  return names.some((name) => DORM_LIKE.test(name)) ? null : "You asked for dorms or hostels — these are hotels; no dorm beds came back.";
}

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
  /** The saved-trip card, when the traveller asked for the whole picture. */
  tripSummaryBlock?: AssistantBlock | null;
  /** The traveller's message, for checks that depend on their wording (dorms, not hotels). */
  prompt?: string;
  cardPlaces: Place[];
  cardPlaceGroups: Array<{ label: string; places: Place[] }>;
  eventCall: Extract<ToolCall, { tool: "events" }> | undefined;
  eventsInWindow: EventResult[];
  photoUrl: (name: string) => string;
}): AssistantBlock[] {
  const { resolved, evidence, tripCtx, itineraryBlock, budgetBlock, optionsBlock, structuredAnswerBlock, weatherCard, tripUpdateReceipt, tripSummaryBlock, prompt, cardPlaces, cardPlaceGroups, eventCall, eventsInWindow, photoUrl } = params;

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
  const miles = usesMiles(tripCtx.preferences.country);
  const distanceToLocked = (place: { latitude: number; longitude: number }): string | undefined => {
    if (!resolved.proximityMatters) return undefined;
    if (tripCtx.accommodationAnchor) {
      return `${formatDistanceKm(haversineKm(place, tripCtx.accommodationAnchor), miles)} from ${tripCtx.accommodationAnchor.title}`;
    }
    if (tripCtx.lockedPlaces.length === 0) return undefined;
    const hit = nearest({ latitude: place.latitude, longitude: place.longitude }, tripCtx.lockedPlaces);
    return hit ? `${formatDistanceKm(hit.km, miles)} from ${hit.target.title}` : undefined;
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
  for (const route of evidence.routes.slice(0, 5)) {
    blocks.push({
      type: "route_summary",
      from: route.from, to: route.to, mode: route.mode,
      durationSeconds: route.durationSeconds, distanceMeters: route.distanceMeters, fare: route.fare,
      steps: route.steps.slice(0, 12), departureTime: route.departureTime, arrivalTime: route.arrivalTime, ...(route.path ? { path: route.path } : {}),
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
      dateNote: (search.assumedDate ? `Example date ${search.departureDate} — no travel date set yet` : `Departing ${search.departureDate}`) + (search.returnDate ? `, returning ${search.returnDate}` : ""),
      departureDate: search.departureDate,
      assumedDate: search.assumedDate,
      ...(search.returnDate ? { returnDate: search.returnDate } : {}),
      ...(search.originId ? { originId: search.originId.slice(0, 60) } : {}),
      ...(search.destinationId ? { destinationId: search.destinationId.slice(0, 60) } : {}),
      ...(search.insights ? { insights: search.insights } : {}),
      items: search.offers.slice(0, 12).map(toFlightItem),
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
      dateNote: [
        search.assumedDates ? `Example dates ${search.checkin} → ${search.checkout} — set your real dates` : `${search.checkin} → ${search.checkout}`,
        dormMismatchNote(prompt, search.options.slice(0, 6).map((option) => option.name)),
      ].filter(Boolean).join(" · ").slice(0, 140),
      detailHotel: search.detail?.hotelName,
      adults: search.adults,
      items: search.options.slice(0, 6).map((option) => toStayCardItem(option, option.latitude != null && option.longitude != null ? distanceToLocked({ latitude: option.latitude, longitude: option.longitude }) : undefined)),
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
  if (tripSummaryBlock && blocks.length === 0) blocks.push(tripSummaryBlock);
  // A place search that ran and found nothing, with nothing else to show: a designed "nothing found" card, not a bare sentence.
  // Not when a provider failed (that is "couldn't check", a different message) or when something else is already answering.
  const searched = resolved.toolPlan.find((call) => call.tool === "search_places");
  if (searched && PLACE_INTENTS.has(resolved.intent) && blocks.length === 0 && evidence.places.length === 0 && evidence.unavailableProviders.length === 0) {
    blocks.push({ type: "empty_result", what: `${searched.query} in ${searched.location}`.slice(0, 160), hint: "Try a wider area, a different kind of place, or ask me to broaden it." });
  }
  if (weatherCard) blocks.unshift({ type: "weather", retrievedAt: evidence.retrievedAt, ...weatherCard });
  // A change receipt leads the reply, above whatever the turn is actually answering — the user
  // needs to see "Destination updated: X -> Y" before anything built on the NEW destination.
  if (tripUpdateReceipt) blocks.unshift(tripUpdateReceipt);

  return blocks;
}
