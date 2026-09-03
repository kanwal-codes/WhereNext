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
    expect(html).toContain("Checked against your trip · 2026-10-26 → 2026-11-01");
    expect(html).toContain("during your trip");
    expect(html).toContain("3 days after your trip");
    expect(html).toContain("2 days before your trip");
  });

  it("events block: 'Major event' badge only at rank ≥ 65", () => {
    const html = render([{ type: "events", retrievedAt: "t", items: [
      { title: "Huge Festival", url: "https://x/a", source: "predicthq", rank: 88 },
      { title: "Small Gig", url: "https://x/b", source: "eventbrite", rank: 30 },
    ] }]);
    const major = html.match(/Major event/g) ?? [];
    expect(major).toHaveLength(1);
    expect(html).toContain("Huge Festival");
  });

  it("comparison block: a plain table with a bestForYou line", () => {
    const html = render([{ type: "comparison", title: "Alfama vs Bairro Alto", columns: ["Option", "Vibe", "Cost"],
      rows: [{ label: "Alfama", cells: ["Alfama", "quiet", "€€"] }, { label: "Bairro Alto", cells: ["Bairro Alto", "lively", "€€"] }],
      bestForYou: { label: "Alfama", reason: "quieter for a couple who dislike crowds" } }]);
    expect(html).toContain("<table");
    expect(html).toContain("Alfama vs Bairro Alto");
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
});
