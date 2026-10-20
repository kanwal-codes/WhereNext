import type { ResolvedTurn } from "@/lib/application/turn-resolver";
import type { Evidence } from "@/lib/application/orchestrate/retrieve-plan";

/**
 * What the model is shown of the evidence, and what the cards are built from: the (at most six) places that get cards, trimmed
 * sources/events/flights/stays, the events guidance for the system prompt, and the URLs a reply may link to.
 */
export function compactEvidence(input: { evidence: Evidence; toolPlan: ResolvedTurn["toolPlan"]; requestedImages: boolean; photoUrl: (name: string) => string }) {
  const { evidence, toolPlan, requestedImages, photoUrl } = input;
  // The model must only see the places it will actually get cards for, so its reply can't
  // reference a place with no card. This slice IS the `place_list` block below.
  const cardPlaceGroups = (evidence.placeGroups?.length ?? 0) > 1
    ? evidence.placeGroups!.map((group) => ({ ...group, places: group.places.slice(0, 6) }))
    : [{ label: "", places: evidence.places.slice(0, 6) }];
  const cardPlaces = cardPlaceGroups.flatMap((group) => group.places);
  // search-places.ts fetches phone/website/hours/openNow specifically so questions like "what
  // time does X open" can be answered — but they used to stop right here: dropped from this
  // compaction before ever reaching COMPOSE's evidence text, so the model had no way to know
  // they existed (live-caught: "what time does Bar George open on weekdays" got "aren't
  // available in what I have on hand" even though the enrichment had already fetched
  // `regularOpeningHours` for that exact place a few lines up the pipeline).
  const compactPlaces = cardPlaces.map((place) => ({
    provider: place.provider, providerId: place.providerId, name: place.name, category: place.category, address: place.address,
    rating: place.rating, userRatingCount: place.userRatingCount, sourceUrl: place.sourceUrl, photoName: place.photoNames?.[0],
    phone: place.phone, websiteUri: place.websiteUri, openingHours: place.openingHours, openNow: place.openNow,
  }));
  const compactSources = evidence.sources.map((source) => ({ title: source.title, url: source.url, content: source.content.slice(0, 700) }));
  const compactEvents = evidence.events.slice(0, 8).map((event) => ({
    name: event.title, date: event.date, venue: event.venue, url: event.url,
    whenVsTrip: event.relToTrip === "in" ? "during the trip"
      : event.relToTrip === "before" ? `${event.offsetDays}d before the trip`
      : event.relToTrip === "after" ? `${event.offsetDays}d after the trip` : undefined,
    // Internal ranking hint only — a coarse bucket, never a number the model can quote.
    prominence: typeof event.rank === "number" ? (event.rank >= 70 ? "major" : event.rank >= 45 ? "notable" : "small") : undefined,
  }));
  const eventsInWindow = evidence.events.filter((event) => event.relToTrip === "in");
  const nearestEventMiss = evidence.events
    .filter((event) => event.relToTrip === "before" || event.relToTrip === "after")
    .sort((a, b) => (a.offsetDays ?? 0) - (b.offsetDays ?? 0))[0];
  const eventCall = toolPlan.find((call): call is Extract<typeof call, { tool: "events" }> => call.tool === "events");
  // A single clear in-window event the traveller is building the trip around — threaded into
  // the itinerary builder below as a fixed stop, not just a card off to the side. Ambiguous
  // (0 or 2+ candidates, e.g. an artist playing multiple nights) is left for the traveller to
  // pick via the clarifying chips below; only a single unambiguous match anchors the plan.
  const anchorEvent = eventsInWindow.length === 1
    ? { title: eventsInWindow[0].title, venue: eventsInWindow[0].venue, date: eventsInWindow[0].startDate ?? eventsInWindow[0].date ?? "", time: eventsInWindow[0].date?.match(/(\d{2}:\d{2})\s*$/)?.[1] }
    : null;
  const eventsGuidance = compactEvents.length
    ? [
        "The events shown as cards are the ONLY events you may present as confirmed; never state a date or venue for one that is not a card, and do not restate every title/date/venue/link.",
        "Describe an event the way a traveller would want to hear it: who is performing or what it is, what they're known for, the kind of night out it makes, and how it fits the traveller's interests. `prominence` is an internal hint for which one or two to lead with — never mention it, a popularity/pull score, a number, crowd size, or the data source. If you genuinely don't know the act, keep it to one plain line and don't pad with vague hype.",
        eventsInWindow.length
          ? `${eventsInWindow.length} fall during the trip — lead with the one or two that best fit the traveller's interests, and say why in traveller terms.`
          : nearestEventMiss
            ? `NONE fall in the trip window. Lead with the closest: "${nearestEventMiss.title}"${nearestEventMiss.date ? ` on ${nearestEventMiss.date}` : ""}, ${nearestEventMiss.offsetDays} day${nearestEventMiss.offsetDays === 1 ? "" : "s"} ${nearestEventMiss.relToTrip === "before" ? "before the traveller arrives" : "after the traveller leaves"} — do not just say there is nothing on.`
            : "None are on for the trip dates — say so plainly.",
        eventCall?.artist && eventsInWindow.length >= 2
          ? `The traveller asked specifically about "${eventCall.artist}", who plays ${eventsInWindow.length} nights during the trip (${eventsInWindow.map((e) => e.date).filter(Boolean).join(", ")}). List each night and ASK which one they want — do not choose for them.`
          : "",
      ].filter(Boolean).join(" ")
    : compactSources.length
      ? "There are no verified event cards. If a web source clearly names a relevant show you may mention it as \"listed on <source>\" — never assert its date or venue — otherwise say you found no confirmed events for those dates and suggest checking a venue's own calendar closer to the trip."
      : "";
  const compactFlights = evidence.flights.map((search) => ({
    origin: search.origin, destination: search.destination, departureDate: search.departureDate, exampleDate: search.assumedDate,
    offers: search.offers.map((offer) => ({
      airline: offer.airline, price: `${offer.priceAmount} ${offer.priceCurrency}`, listedByAirline: offer.listedAmount ? `${offer.listedAmount} ${offer.listedCurrency} (converted at today's rate, so approximate)` : undefined,
      operatingAirline: offer.operatingAirline, cabinClass: offer.cabinClass, baggage: offer.baggage,
      airports: offer.originAirport && offer.destinationAirport ? `${offer.originAirport} → ${offer.destinationAirport}` : undefined,
      hours: +(offer.durationMinutes / 60).toFixed(1), stops: offer.stops, departs: offer.departAt, arrives: offer.arriveAt,
    })),
  }));
  const compactStays = evidence.stays.map((search) => ({
    location: search.location, checkin: search.checkin, checkout: search.checkout, nights: search.nights, exampleDates: search.assumedDates,
    // Google Hotels says nothing about what a rate includes and flags free cancellation only sometimes: absent is "not stated", never "no".
    ...(search.provider === "serpapi" ? { source: `Google Hotels, for ${search.adults ?? 2} guest${(search.adults ?? 2) === 1 ? "" : "s"}; ratings out of 10; board and cancellation not stated` } : {}),
    hotels: search.options.map((option) => ({
      name: option.name, nightly: `${option.nightlyAmount} ${option.currency}`, total: `${option.totalAmount} ${option.currency}`,
      stars: option.stars, rating: option.rating, reviews: option.reviewCount,
      ...(search.provider === "serpapi" ? (option.refundable ? { freeCancellation: true } : {}) : { board: option.boardName, refundable: option.refundable }),
    })),
    rooms: search.detail ? { hotel: search.detail.hotelName, options: search.detail.rooms.map((room) => ({ name: room.name, nightly: `${room.nightlyAmount} ${room.currency}`, total: `${room.totalAmount} ${room.currency}`, board: room.boardName, refundable: room.refundable })) } : null,
  }));
  const allowedUrls = new Set<string>([
    ...compactSources.map((source) => source.url),
    ...compactEvents.map((event) => event.url),
    ...compactPlaces.flatMap((place) => (place.sourceUrl ? [place.sourceUrl] : [])),
    ...(requestedImages ? compactPlaces.flatMap((place) => (place.photoName ? [photoUrl(place.photoName)] : [])) : []),
  ]);
  return { cardPlaceGroups, cardPlaces, compactPlaces, compactSources, compactEvents, eventsInWindow, eventCall, anchorEvent, eventsGuidance, compactFlights, compactStays, allowedUrls };
}
