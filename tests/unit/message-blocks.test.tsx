import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AssistantBlock } from "../../packages/contracts/assistant";

// CompareView pulls trip context from a provider we don't mount here; the block-routing
// decision (live side-by-side vs static table) is what this suite checks.
vi.mock("@/components/CompareView", () => ({ CompareView: () => <div data-testid="compare-view" /> }));

import { MessageBlocks } from "../../features/conversation/ui/blocks/MessageBlocks";

const handlers = { tripId: "trip-1", onFollowup: vi.fn() };
const render = (blocks: AssistantBlock[]) => renderToStaticMarkup(<MessageBlocks blocks={blocks} {...handlers} />);

describe("MessageBlocks", () => {
  it("renders a place card with distance to a locked place", () => {
    const html = render([{ type: "place_list", places: [{ provider: "g", providerId: "p1", name: "Belém Tower", category: "tourist_attraction", latitude: 1, longitude: 2, address: "Belém", sourceUrl: null, trust: "sourced", distanceToLocked: "1.1 km from Jerónimos Monastery" }] }]);
    expect(html).toContain("Belém Tower");
    expect(html).toContain("1.1 km from Jerónimos Monastery");
    expect(html).not.toContain("From provider"); // the default trust label is noise on every card
  });

  it("shows a trust label only when it is not the default", () => {
    const place = { provider: "g", providerId: "p1", name: "Belém Tower", category: null, latitude: 1, longitude: 2, address: null, sourceUrl: null, trust: "estimated" as const };
    expect(render([{ type: "place_list", places: [place] }])).toContain("Estimated");
  });

  it("makes the place card head a button when onOpenPlace is supplied", () => {
    const place = { provider: "g", providerId: "p1", name: "Belém Tower", category: null, latitude: 1, longitude: 2, address: null, sourceUrl: null, trust: "sourced" as const };
    const withOpen = renderToStaticMarkup(<MessageBlocks blocks={[{ type: "place_list", places: [place] }]} {...handlers} onOpenPlace={vi.fn()} />);
    expect(withOpen).toContain('aria-label="Open Belém Tower"');
    const withoutOpen = render([{ type: "place_list", places: [place] }]);
    expect(withoutOpen).not.toContain('aria-label="Open Belém Tower"');
  });

  it("keeps conversation result sections to four cards and offers the complete set", () => {
    const places = Array.from({ length: 6 }, (_, index) => ({
      provider: "g",
      providerId: `p${index}`,
      name: `Museum ${index + 1}`,
      category: "museum",
      latitude: 1,
      longitude: 2,
      address: null,
      sourceUrl: null,
      trust: "sourced" as const,
    }));
    const html = renderToStaticMarkup(
      <MessageBlocks
        blocks={[{ type: "place_list", title: "art museums", places }]}
        {...handlers}
        onOpenCollection={vi.fn()}
      />,
    );
    expect(html).toContain("Art museums");
    expect(html).toContain("See all");
    expect(html).toContain("Museum 4");
    expect(html).not.toContain("Museum 5");

    const full = renderToStaticMarkup(<MessageBlocks blocks={[{ type: "place_list", title: "art museums", places }]} {...handlers} preview={false} />);
    expect(full).toContain("Museum 6");
    expect(full).not.toContain("See more");
  });

  it("renders a route_summary with steps", () => {
    const html = render([{ type: "route_summary", from: "Airport", to: "Belém", mode: "transit", durationSeconds: 4200, distanceMeters: 22000, steps: ["TRANSIT 208 → Cais Sodré (35 min)"], retrievedAt: "t" }]);
    expect(html).toContain("Airport");
    expect(html.replace(/<[^>]+>/g, "")).toContain("1 h 10 min");
    expect(html).toContain("22.0 km");
    expect(html).toContain("Cais Sodré");
  });

  it("groups consecutive route_summary blocks for the same from/to into one comparison, fastest first", () => {
    const html = render([
      { type: "route_summary", from: "Hotel", to: "Belém", mode: "driving", durationSeconds: 900, distanceMeters: 8000, steps: [], retrievedAt: "t" },
      { type: "route_summary", from: "Hotel", to: "Belém", mode: "transit", durationSeconds: 1800, distanceMeters: 9000, steps: [], retrievedAt: "t" },
    ]);
    expect(html).toContain("Drive");
    expect(html).toContain("Transit");
    expect(html).toContain("Fastest");
    expect(html).toContain("15 min");
    expect(html).toContain("30 min");
    // Only one "Fastest" tag, and it belongs to the shorter (driving) leg.
    expect(html.match(/Fastest/g)?.length).toBe(1);
    expect(html.indexOf("Drive")).toBeLessThan(html.indexOf("Fastest"));
  });

  it("does not group route_summary blocks for different from/to pairs", () => {
    const html = render([
      { type: "route_summary", from: "Hotel", to: "Belém", mode: "driving", durationSeconds: 900, distanceMeters: 8000, steps: [], retrievedAt: "t" },
      { type: "route_summary", from: "Belém", to: "Airport", mode: "driving", durationSeconds: 1200, distanceMeters: 15000, steps: [], retrievedAt: "t" },
    ]);
    expect(html).not.toContain("Fastest"); // single-route cards, no comparison rendered
    expect(html).toContain("Hotel");
    expect(html).toContain("Airport");
  });

  it("renders a checklist grouped with reasons", () => {
    const html = render([{ type: "checklist", groups: [{ title: "Packing", items: [{ text: "Rain shell", why: "showers likely" }] }] }]);
    expect(html).toContain("Packing");
    expect(html).toContain("Rain shell");
    expect(html).toContain("showers likely");
  });

  it("renders an events list with ticket links and a freshness note", () => {
    const html = render([{ type: "events", retrievedAt: "2026-09-02T00:00:00Z", items: [
      { title: "Jazz Fest", url: "https://tm.example/jazz", date: "2026-09-12", venue: "Blue Note", source: "ticketmaster" },
    ] }]);
    expect(html).toContain("Jazz Fest");
    expect(html).toContain("Sat, Sep 12"); // date is formatted for reading, venue shown alongside
    expect(html).toContain("Blue Note");
    expect(html).toContain('href="https://tm.example/jazz"');
    expect(html).toMatch(/dates and availability can change/i);
  });

  it("renders a flights list with fares and a freshness note", () => {
    const html = render([{ type: "flights", retrievedAt: "2026-09-02T00:00:00Z", origin: "Toronto", destination: "London", dateNote: "Example date 2026-10-13 — no travel date set yet", items: [
      { airline: "Air Canada", price: "812.40", currency: "CAD", durationMinutes: 491, stops: 0, departAt: "2026-10-13T18:20:00", arriveAt: "2026-10-14T06:31:00" },
    ] }]);
    expect(html).toContain("Toronto");
    expect(html).toContain("Air Canada");
    expect(html).toContain("CA$812.40");
    expect(html).toContain("8h 11m");
    expect(html).toContain("nonstop");
    expect(html).toMatch(/fares change/i);
  });

  it("renders stays as a card carousel with nightly rates, a rooms drill-down, and a freshness note", () => {
    const block: AssistantBlock = { type: "stays", retrievedAt: "2026-09-02T00:00:00Z", location: "Lisbon", checkin: "2026-10-15", checkout: "2026-10-18", nights: 3, dateNote: "Example dates 2026-10-15 → 2026-10-18 — set your real dates", detailHotel: "Torel Palace", items: [
      { hotelId: "h1", name: "Torel Palace", nightlyPrice: "230", totalPrice: "690", currency: "EUR", stars: 5, rating: 9.4, reviews: 1200, board: "Breakfast", refundable: true, distanceToLocked: "400 m from Jerónimos Monastery" },
    ], rooms: [
      { name: "Deluxe Room", boardName: "Breakfast", refundable: true, maxOccupancy: 2, nightlyAmount: 230, totalAmount: 690, currency: "EUR" },
    ] };
    const html = render([block]);
    expect(html).toContain("Torel Palace");
    expect(html).toContain("€230");
    expect(html).toContain("€690 total");
    expect(html).toContain("9.4/10 guests (1,200)");
    expect(html).toContain("400 m from Jerónimos Monastery");
    expect(html).toContain("Rooms at Torel Palace");
    expect(html).toContain("Deluxe Room");
    expect(html).not.toContain("google.com/maps");
    expect(html).not.toContain('aria-label="Open Torel Palace"');
    expect(html).toMatch(/taxes and fees may be added/i);

    const onOpenStay = vi.fn();
    const withOpen = renderToStaticMarkup(<MessageBlocks blocks={[block]} {...handlers} onOpenStay={onOpenStay} />);
    expect(withOpen).toContain('aria-label="Open Torel Palace"');
    expect(withOpen).toMatch(/Rooms &amp; details/);
  });

  it("renders actions and clarifying chips", () => {
    expect(render([{ type: "actions", items: [{ label: "Where to stay?", prompt: "Where should we stay?" }] }])).toContain("Where to stay?");
    const clarify = render([{ type: "clarifying_question", question: "How many nights?", chips: ["2", "3-4"] }]);
    expect(clarify).toContain("3-4");
    expect(clarify).not.toContain("How many nights?"); // the question already streams as the reply text
  });

  it("renders no chip UI for a clarifying_question with no chips", () => {
    const html = render([{ type: "clarifying_question", question: "which?", chips: [] }]);
    expect(html).not.toContain("btn-chip");
    expect(html).not.toContain("which?");
  });

  it("events block: shows the trip window header and a per-row offset chip", () => {
    const html = render([{ type: "events", retrievedAt: "t", window: { start: "2026-10-26", end: "2026-11-01" }, items: [
      { title: "In-Trip Show", url: "https://x/1", date: "2026-10-29", source: "ticketmaster", relToTrip: "in", offsetDays: 0 },
      { title: "Just After", url: "https://x/2", date: "2026-11-04", source: "ticketmaster", relToTrip: "after", offsetDays: 3 },
      { title: "Just Before", url: "https://x/3", date: "2026-10-24", source: "eventbrite", relToTrip: "before", offsetDays: 2 },
    ] }]);
    expect(html).toContain("Checked against your trip · Oct 26 – Nov 1");
    expect(html).toContain("during your trip");
    expect(html).toContain("3 days after your trip");
    expect(html).toContain("2 days before your trip");
  });

  it("events block: 'Major event' badge only at rank ≥ 65", () => {
    const html = render([{ type: "events", retrievedAt: "t", items: [
      { title: "Huge Festival", url: "https://x/a", source: "ticketmaster", rank: 88 },
      { title: "Small Gig", url: "https://x/b", source: "eventbrite", rank: 30 },
    ] }]);
    const major = html.match(/Major event/g) ?? [];
    expect(major).toHaveLength(1);
    expect(html).toContain("Huge Festival");
  });

  it("events block: a popular in-trip event becomes a featured card, not a list row", () => {
    const block: AssistantBlock = { type: "events", retrievedAt: "t", window: { start: "2026-10-26", end: "2026-10-30" }, items: [
      { title: "Michel Rivard", url: "https://x/mr", date: "2026-10-29", venue: "L'Etoile", source: "ticketmaster", imageUrl: "https://img.example/mr.jpg", relToTrip: "in", offsetDays: 0, rank: 70 },
      { title: "Small Local Gig", url: "https://x/gig", date: "2026-10-28", source: "eventbrite", relToTrip: "in", offsetDays: 0 },
    ] };
    const html = renderToStaticMarkup(<MessageBlocks blocks={[block]} {...handlers} onOpenEvent={vi.fn()} />);
    expect(html).toContain("https://img.example/mr.jpg"); // featured card image
    expect(html).toContain("More on while you’re there"); // list header appears once there's a featured card
    expect(html).toContain("Small Local Gig");
    expect(html).toMatch(/Details/); // per-event side-panel opener
    // the featured event is not repeated as a list row below the "More on…" header
    const listSection = html.slice(html.indexOf("More on"));
    expect(listSection).not.toContain("Michel Rivard");
  });

  it("events block: same act at the same venue on several nights collapses to one card with a date range", () => {
    const html = render([{ type: "events", retrievedAt: "t", items: [
      // Different provider spellings + a duplicate night — still one act.
      { title: "Yebba", url: "https://tm/yebba-26", date: "2026-10-26", venue: "L'Olympia, Montreal", source: "ticketmaster" },
      { title: "YEBBA at L Olympia", url: "https://eb/yebba-26", date: "2026-10-26", venue: "L'Olympia", source: "eventbrite" },
      { title: "YEBBA", url: "https://tm/yebba-27", date: "2026-10-27", venue: "L'Olympia", source: "ticketmaster" },
      { title: "Some Other Act", url: "https://tm/other", date: "2026-10-28", venue: "Corona", source: "ticketmaster" },
    ] }]);
    const visible = html.replace(/aria-label="[^"]*"/g, ""); // the buttons now carry the act's name in their accessible label
    expect((visible.match(/Yebba|YEBBA/g) ?? [])).toHaveLength(1); // one card, not three
    expect(html).toContain("Mon, Oct 26 – Tue, Oct 27"); // the date section shows the span
    expect(html).not.toContain("· 3 dates"); // the duplicate night did not become a third date
    expect(html).toContain("Some Other Act"); // a single-date act is untouched
  });

  it("events block: no side-panel opener without an onOpenEvent handler", () => {
    const html = render([{ type: "events", retrievedAt: "t", items: [
      { title: "Jazz Fest", url: "https://tm.example/jazz", date: "2026-09-12", source: "ticketmaster" },
    ] }]);
    expect(html).not.toMatch(/>Details</);
  });

  it("weather block: seasonal card shows month, high/low, headline and packing chips", () => {
    const html = render([{ type: "weather", retrievedAt: "t", location: "Montréal", mode: "seasonal", month: "October",
      headline: "Cool and damp — bring layers", highC: 11, lowC: 3, condition: "clouds", rainyDays: 9,
      packing: ["Warm layer", "Waterproof shell"], days: [] }]);
    expect(html).toContain("Typical October");
    expect(html).toContain("11°");
    expect(html).toContain("3°");
    expect(html).toContain("Cool and damp — bring layers");
    expect(html).toContain("about 9 rainy days");
    expect(html).toContain("Waterproof shell");
  });

  it("weather block: forecast card shows a per-day strip", () => {
    const html = render([{ type: "weather", retrievedAt: "t", location: "Lisbon", mode: "forecast",
      headline: "Mild — a light jacket for evenings", packing: ["Light jacket"], days: [
        { label: "Fri", min: 12, max: 19, condition: "clear", wet: false },
        { label: "Sat", min: 13, max: 18, condition: "rain", wet: true },
      ] }]);
    expect(html).toContain("Mild — a light jacket for evenings");
    expect(html).toContain("Fri");
    expect(html).toContain("19°");
    expect(html).toContain("Sat");
  });

  it("structured_answer block: renders section headings and bullets with optional detail", () => {
    const html = render([{ type: "structured_answer", intro: "Metro rundown.", sections: [
      { heading: "Fares", bullets: [{ text: "Single ride", detail: "3.75 CAD" }, { text: "Weekend pass", detail: "15.25 CAD" }] },
      { heading: "Hours", bullets: [{ text: "Roughly 5:30am to 1am" }] },
    ] }]);
    expect(html).toContain("Fares");
    expect(html).toContain("Single ride");
    expect(html).toContain("3.75 CAD");
    expect(html).toContain("Hours");
    expect(html).toContain("Roughly 5:30am to 1am");
  });

  it("options block: renders area cards with blurb, tags and a best-for line", () => {
    const html = render([{ type: "options", kind: "area", intro: "Base in the Plateau.", items: [
      { name: "Plateau-Mont-Royal", blurb: "Leafy and bohemian, cafés and murals everywhere.", tags: ["walkable", "cafes"], meta: "central · walkable", bestFor: "cafés & wandering" },
      { name: "Mile End", blurb: "Indie shops and bagels.", tags: ["indie"] },
    ] }]);
    expect(html).toContain("Plateau-Mont-Royal");
    expect(html).toContain("Leafy and bohemian");
    expect(html).toContain("walkable");
    expect(html).toContain("central · walkable");
    expect(html).toMatch(/Best for cafés &amp; wandering/);
    expect(html).toContain("Mile End");
  });

  it("options block: day-trip cards show the travel-time meta", () => {
    const html = render([{ type: "options", kind: "daytrip", intro: "Québec City wins.", items: [
      { name: "Québec City", blurb: "Walled old town.", tags: ["historic"], meta: "3h by train" },
      { name: "Mont-Tremblant", blurb: "Mountain village.", tags: ["nature"], meta: "1h30 by car" },
    ] }]);
    expect(html).toContain("Québec City");
    expect(html).toContain("3h by train");
  });

  it("budget block: renders category rows, a daily total and a fits/over badge", () => {
    const html = render([{ type: "budget", currency: "CAD", perPerson: true, summary: "~120/day each.",
      lines: [
        { category: "Food & drink", low: 30, typical: 55, high: 100, note: "casual spots" },
        { category: "Local transit", low: 8, typical: 12, high: 20 },
      ],
      dailyTotal: { low: 38, typical: 67, high: 120 }, setBudget: 150, tripNote: "excludes flights & hotel" }]);
    expect(html).toContain("Daily spend");
    expect(html).toContain("per person");
    expect(html).toContain("Food &amp; drink");
    expect(html).toContain("casual spots");
    expect(html).toContain("Typical day");
    expect(html).toContain("67");
    expect(html).toMatch(/Fits your CA\$150\/day/);
    expect(html).toContain("excludes flights &amp; hotel");
  });

  it("budget block: 'Over your' badge when the typical total exceeds the set budget", () => {
    const html = render([{ type: "budget", currency: "USD", perPerson: true, summary: "over budget",
      lines: [{ category: "Food", low: 40, typical: 90, high: 160 }, { category: "Fun", low: 20, typical: 60, high: 120 }],
      dailyTotal: { low: 60, typical: 150, high: 280 }, setBudget: 100 }]);
    expect(html).toMatch(/Over your \$100\/day/);
  });

  it("stays block: in the chat the search is one summary line (place, days, guests) that opens to edit", () => {
    const hotel = { hotelId: "g:tok1", name: "Hotel Blue", nightlyPrice: "93", totalPrice: "279", currency: "CAD", rating: 9, reviews: 120 };
    const html = render([{ type: "stays", retrievedAt: "t", location: "Zagreb, Croatia", checkin: "2026-11-15", checkout: "2026-11-18", nights: 3, adults: 3, dateNote: "2026-11-15 → 2026-11-18", items: [hotel] }]);
    expect(html).toContain("Zagreb, Croatia");
    expect(html).toContain("3 nights");
    expect(html).toContain("3 guests");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('aria-label="Check-in date"');
    expect(html).not.toContain("Example dates");
  });

  it("stays block: the header says how many stays are in the row (a narrow column shows only one and a sliver)", () => {
    const hotel = (n: number) => ({ hotelId: `g:tok${n}`, name: `Hotel ${n}`, nightlyPrice: "93", totalPrice: "279", currency: "CAD" });
    const html = render([{ type: "stays", retrievedAt: "t", location: "Madrid", checkin: "2026-11-07", checkout: "2026-11-15", nights: 8, dateNote: "x", items: [hotel(1), hotel(2), hotel(3)] }]);
    expect(html).toMatch(/Stays in Madrid<span[^>]*>3<\/span>/);
  });

  it("stays block: \"See all\" sits at the right edge of the Sort row, not in the header", () => {
    const hotel = (n: number) => ({ hotelId: `g:tok${n}`, name: `Hotel ${n}`, nightlyPrice: "93", totalPrice: "279", currency: "CAD", rating: 8 + n / 10 });
    const block: AssistantBlock = { type: "stays", retrievedAt: "t", location: "Madrid", checkin: "2026-11-07", checkout: "2026-11-15", nights: 8, dateNote: "x", items: [1, 2, 3, 4, 5, 6].map(hotel) };
    const html = renderToStaticMarkup(<MessageBlocks blocks={[block]} {...handlers} onOpenCollection={vi.fn()} />);
    expect(html.match(/aria-label="See all/g)).toHaveLength(1);
    expect(html.indexOf("Sort by")).toBeGreaterThan(-1);
    expect(html.indexOf('aria-label="See all')).toBeGreaterThan(html.indexOf("Sort by"));
  });

  it("stays block: when the days are a guess the full search opens straight away", () => {
    const hotel = { hotelId: "g:tok1", name: "Hotel Blue", nightlyPrice: "93", totalPrice: "279", currency: "CAD" };
    const html = render([{ type: "stays", retrievedAt: "t", location: "Zagreb, Croatia", checkin: "2026-11-15", checkout: "2026-11-18", nights: 3, adults: 3, dateNote: "Example dates 2026-11-15 → 2026-11-18 — set your real dates", items: [hotel] }]);
    expect(html).toContain("Looking for stays in Zagreb, Croatia. Change");
    expect(html).toContain('aria-label="Check-in date"');
    expect(html).toContain('aria-label="Check-out date"');
  });

  it("stays block: guesses at the days are called out, and the see-all list has no bar", () => {
    const hotel = { hotelId: "g:tok1", name: "Hotel Blue", nightlyPrice: "93", totalPrice: "279", currency: "CAD" };
    const block: AssistantBlock = { type: "stays", retrievedAt: "t", location: "Zagreb", checkin: "2026-11-15", checkout: "2026-11-18", nights: 3, dateNote: "Example dates 2026-11-15 → 2026-11-18 — set your real dates", items: [hotel] };
    expect(render([block])).toContain("Example dates, pick yours above");
    const all = renderToStaticMarkup(<MessageBlocks blocks={[block]} {...handlers} preview={false} />);
    expect(all).not.toContain('aria-label="Check-in date"');
  });

  it("flights block: shows the day the fares are for with a way to change it", () => {
    const item = { id: "o1", airline: "British Airways", price: "280.22", currency: "USD", durationMinutes: 605, stops: 0, departAt: "2026-11-15T10:50:00", arriveAt: "2026-11-16T02:55:00" };
    const html = render([{ type: "flights", retrievedAt: "t", origin: "Toronto, Canada", destination: "Zagreb, Croatia", dateNote: "Example date 2026-11-15 — no travel date set yet", departureDate: "2026-11-15", assumedDate: true, items: [item] }]);
    expect(html).toContain("Sun, Nov 15");
    expect(html).toContain('aria-label="Departure date"');
    expect(html).toContain('aria-label="Depart: next day"');
    expect(html).not.toContain("Example date, pick yours below"); // the day sits in the pill; no extra line saying so
  });

  it("flights block: a converted fare is marked approximate, in the trip's currency, with the footnote saying so", () => {
    const item = { airline: "British Airways", price: "398.99", currency: "CAD", listedPrice: "280.22", listedCurrency: "USD", durationMinutes: 605, stops: 0, departAt: "2026-11-15T10:50:00", arriveAt: "2026-11-16T02:55:00" };
    const html = render([{ type: "flights", retrievedAt: "t", origin: "Toronto", destination: "Zagreb", dateNote: "Departing 2026-11-15", departureDate: "2026-11-15", items: [item] }]);
    expect(html).toContain("≈");
    expect(html).toContain("CA$398.99");
    expect(html).toContain("per person, in CAD, converted from USD at today");
  });

  it("flights block: an unconverted US dollar fare says US$, never a bare $", () => {
    const item = { airline: "Iberia", price: "286.50", currency: "USD", durationMinutes: 605, stops: 0, departAt: "2026-11-15T10:50:00", arriveAt: "2026-11-16T02:55:00" };
    const html = render([{ type: "flights", retrievedAt: "t", origin: "A", destination: "B", dateNote: "Departing 2026-11-15", items: [item] }]);
    expect(html).toContain("US$286.50");
    expect(html).not.toContain("≈");
  });

  it("flights block: a round trip shows both days, a way to edit the route, and Google's read on the price", () => {
    const item = { airline: "Air France", price: "1171", currency: "CAD", durationMinutes: 765, stops: 1, departAt: "2026-11-15T18:30:00", arriveAt: "2026-11-16T13:15:00", flightNumbers: ["AF 357", "OU 471"], logo: "https://logo/af.png" };
    const html = render([{ type: "flights", retrievedAt: "t", origin: "Toronto, Ontario, Canada", destination: "Zagreb, Croatia", dateNote: "Departing 2026-11-15, returning 2026-11-22", departureDate: "2026-11-15", returnDate: "2026-11-22", originId: "/m/0h7h6", destinationId: "/m/0h7h6x", insights: { level: "low", lowest: 1171, typicalLow: 1250, typicalHigh: 1500 }, items: [item] }]);
    expect(html).toContain("Sun, Nov 15");
    expect(html).toContain("Sun, Nov 22");
    expect(html).toContain('aria-label="Return date"');
    // The header names the route once; the places to change it stay closed until "Edit route" is pressed.
    expect(html).toContain("Edit route");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Flying from");
    expect(html).not.toContain("Swap from and to");
    expect(html).toContain("Prices are low for these dates");
    expect(html).toContain("AF 357 · OU 471");
    expect(html).toContain("round trip");
    expect(html).toContain("for the round trip, in CAD");
  });

  it("flights block: a one-way card has no return day", () => {
    const item = { airline: "Iberia", price: "286.50", currency: "CAD", durationMinutes: 605, stops: 0, departAt: "2026-11-15T10:50:00", arriveAt: "2026-11-16T02:55:00" };
    const html = render([{ type: "flights", retrievedAt: "t", origin: "A", destination: "B", dateNote: "Departing 2026-11-15", departureDate: "2026-11-15", items: [item] }]);
    expect(html).not.toContain('aria-label="Return date"');
    expect(html).not.toContain("round trip");
  });

  it("flights block: a card saved before the date field existed still reads its day from the note", () => {
    const item = { airline: "Iberia", price: "286.50", currency: "USD", durationMinutes: 605, stops: 0, departAt: "2026-11-15T10:50:00", arriveAt: "2026-11-16T02:55:00" };
    const html = render([{ type: "flights", retrievedAt: "t", origin: "A", destination: "B", dateNote: "Departing 2026-12-02", items: [item] }]);
    expect(html).toContain("Wed, Dec 2");
    expect(html).not.toContain("Example date");
  });

  it("itinerary block: says plainly that days with nothing in them are open, and offers to find more", () => {
    const html = render([{ type: "itinerary", title: "5 days in Rome", days: [
      { label: "Day 1", stops: [{ title: "Colosseum" }] },
      { label: "Day 2", stops: [{ title: "Pantheon" }] },
      { label: "Day 3", stops: [{ title: "Trevi Fountain" }] },
      { label: "Day 4", subtitle: "Open day", open: true, stops: [] },
      { label: "Day 5", subtitle: "Open day", open: true, stops: [] },
    ] }]);
    expect(html).toContain("Day 4 and Day 5 are open");
    expect(html).toContain("rather than pad them out");
    expect(html).toContain("Find more for Day 4 and Day 5");
    expect(html).toContain("5 days in Rome");
  });

  it("itinerary block: a full plan shows no open-days notice", () => {
    expect(render([{ type: "itinerary", days: [{ label: "Day 1", stops: [{ title: "Mount Royal" }] }] }])).not.toContain("are open");
  });

  it("itinerary block: renders day sections, stops, notes, and a link for a real place", () => {
    const block: AssistantBlock = { type: "itinerary", title: "2 days in Montréal", days: [
      { label: "Day 1", subtitle: "Old town", stops: [
        { time: "Morning", title: "Notre-Dame Basilica", note: "Go early", placeId: "p1", kind: "sight" },
        { time: "Evening", title: "Walk the Old Port", kind: "activity" },
      ] },
      { label: "Day 2", stops: [{ title: "Jean-Talon Market", note: "Lunch here", placeId: "p2", kind: "food" }] },
    ] };
    const withOpen = renderToStaticMarkup(<MessageBlocks blocks={[block]} {...handlers} onOpenPlace={vi.fn()} />);
    expect(withOpen).toContain("2 days in Montréal");
    expect(withOpen).toContain("Day 1");
    expect(withOpen).toContain("Day 2"); // day tabs
    expect(withOpen).toContain("Notre-Dame Basilica");
    expect(withOpen).toContain("Go early");
    expect(withOpen).toContain("Morning");
    expect(withOpen).toMatch(/<button[^>]*>Notre-Dame Basilica/); // real place → clickable
    expect(withOpen).toContain("Add whole plan"); // bulk-commit action, not just per-place add
  });

  it("comparison block: attribute-major layout with option chips and a bestForYou line", () => {
    const html = render([{ type: "comparison", title: "Alfama vs Bairro Alto", columns: ["Option", "Vibe", "Cost"],
      rows: [{ label: "Alfama", cells: ["Alfama", "quiet", "€€"] }, { label: "Bairro Alto", cells: ["Bairro Alto", "lively", "€€"] }],
      bestForYou: { label: "Alfama", reason: "quieter for a couple who dislike crowds" } }]);
    expect(html).toContain("<table"); // attribute rows × option columns, options named once in the header
    expect(html).toContain("Alfama vs Bairro Alto");
    expect(html).toContain("Vibe"); // attribute heading (the redundant "Option" column is dropped)
    expect(html).not.toMatch(/>Option</);
    expect(html).toContain("quiet");
    expect(html).toContain("lively");
    expect(html).toContain("quieter for a couple who dislike crowds");
  });

  it("comparison block: renders a live side-by-side (not a table) when it carries ≥2 place ids", () => {
    const html = render([{ type: "comparison", title: "M1NT vs Bar Rouge", columns: ["Option", "x"],
      rows: [{ label: "M1NT", cells: ["M1NT", "a"] }, { label: "Bar Rouge", cells: ["Bar Rouge", "b"] }],
      bestForYou: null, placeIds: ["g:m1nt", "g:barrouge"] }]);
    expect(html).not.toContain("<table");
    expect(html).toContain('data-testid="compare-view"');
    expect(html).toContain("M1NT vs Bar Rouge");
  });

  it("offers a Details button on flights, a budget, and a day only when onOpenPanel is supplied", () => {
    const blocks: AssistantBlock[] = [
      { type: "flights", retrievedAt: "2026-09-02T00:00:00Z", origin: "Toronto", destination: "Montreal", items: [{ airline: "Air Canada", price: "212", currency: "CAD", durationMinutes: 78, stops: 0, departAt: "2026-11-26T18:05:00", arriveAt: "2026-11-26T19:23:00" }] },
      { type: "budget", currency: "CAD", perPerson: true, summary: "About CA$116 a day", lines: [{ category: "Food", low: 30, typical: 45, high: 65 }, { category: "Transit", low: 8, typical: 12, high: 20 }], dailyTotal: { low: 38, typical: 57, high: 85 } },
      { type: "itinerary", days: [{ label: "Day 1", stops: [{ title: "Mount Royal" }] }] },
    ];
    const without = render(blocks);
    expect(without).not.toContain("Details");
    expect(without).not.toContain("Open Day 1");
    const withOpen = renderToStaticMarkup(<MessageBlocks blocks={blocks} {...handlers} onOpenPanel={vi.fn()} />);
    expect(withOpen.replace(/aria-label="[^"]*"/g, "").match(/Details/g)).toHaveLength(2); // visible labels; each button also has a named accessible label
    expect(withOpen).toContain('aria-label="Details: Air Canada');
    expect(withOpen).toContain('aria-label="Budget details"');
    expect(withOpen).toContain("Open Day 1");
  });

  it("renders an empty_result card with what was looked for and how to widen it", () => {
    const html = render([{ type: "empty_result", what: "vegan poutine in Montreal", hint: "Try a wider area." }]);
    expect(html).toContain("Nothing found for vegan poutine in Montreal");
    expect(html).toContain("Try a wider area.");
  });
});
