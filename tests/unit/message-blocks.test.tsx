import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AssistantBlock } from "../../packages/contracts/assistant";
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

  it("renders a route_summary with steps", () => {
    const html = render([{ type: "route_summary", from: "Airport", to: "Belém", mode: "transit", durationSeconds: 4200, distanceMeters: 22000, steps: ["TRANSIT 208 → Cais Sodré (35 min)"], retrievedAt: "t" }]);
    expect(html).toContain("Airport");
    expect(html).toContain("70 min");
    expect(html).toContain("22.0 km");
    expect(html).toContain("Cais Sodré");
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
    expect(html).toContain("2026-09-12 · Blue Note");
    expect(html).toContain('href="https://tm.example/jazz"');
    expect(html).toMatch(/dates and availability can change/i);
  });

  it("renders a flights list with fares and a freshness note", () => {
    const html = render([{ type: "flights", retrievedAt: "2026-09-02T00:00:00Z", origin: "Toronto", destination: "London", dateNote: "Example date 2026-10-13 — no travel date set yet", items: [
      { airline: "Air Canada", price: "812.40", currency: "CAD", durationMinutes: 491, stops: 0, departAt: "2026-10-13T18:20:00", arriveAt: "2026-10-14T06:31:00" },
    ] }]);
    expect(html).toContain("Toronto");
    expect(html).toContain("Air Canada");
    expect(html).toContain("812.40 CAD");
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
    expect(html).toContain("230 EUR");
    expect(html).toContain("690 EUR total");
    expect(html).toContain("9.4/10 (1,200)");
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
});
