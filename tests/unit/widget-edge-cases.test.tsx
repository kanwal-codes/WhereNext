import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AssistantBlock } from "../../packages/contracts/assistant";
import { layoverNote, pickFares } from "../../features/conversation/ui/blocks/FlightWidget";

vi.mock("@/components/CompareView", () => ({ CompareView: () => <div /> }));
import { MessageBlocks } from "../../features/conversation/ui/blocks/MessageBlocks";

const render = (blocks: AssistantBlock[]) => renderToStaticMarkup(<MessageBlocks blocks={blocks} tripId="trip-1" onFollowup={vi.fn()} />);
const offer = (id: string, price: string, minutes: number, stops = 0) => ({ id, airline: `Air ${id}`, price, currency: "CAD", departAt: "2026-11-15T10:00:00", arriveAt: "2026-11-15T18:00:00", durationMinutes: minutes, stops });

describe("flight picks", () => {
  it("has none for no flights, and one 'only option' for a single flight", () => {
    expect(pickFares([])).toEqual([]);
    const one = pickFares([offer("a", "900", 480)] as never);
    expect(one).toHaveLength(1);
    expect(one[0].labels).toEqual(["The only option"]);
  });
  it("merges Best and Cheapest when one fare wins both, and never invents a third pick", () => {
    const picks = pickFares([offer("cheap", "790", 500), offer("slow", "900", 900, 1)] as never);
    expect(picks.length).toBeLessThanOrEqual(2);
    const labels = picks.flatMap((p) => p.labels);
    expect(labels).toEqual(expect.arrayContaining(["Cheapest", "Fastest"]));
    expect(picks.find((p) => p.offer.id === "cheap")?.labels).toContain("Cheapest");
  });
  it("gives the cheapest and the fastest their own picks when they differ", () => {
    const picks = pickFares([offer("cheap", "700", 900, 1), offer("fast", "1100", 420), offer("mid", "800", 500)] as never);
    expect(picks.find((p) => p.labels.includes("Cheapest"))?.offer.id).toBe("cheap");
    expect(picks.find((p) => p.labels.includes("Fastest"))?.offer.id).toBe("fast");
  });
});

describe("layover notes", () => {
  const leg = (extra: object) => ({ from: "YYZ", departAt: "x", to: "YUL", toName: "Montréal Trudeau Airport", arriveAt: "y", minutes: 80, ...extra });
  it("says an overnight stop is overnight, a tight change is tight, and a very long wait is long", () => {
    expect(layoverNote(leg({ layoverMinutes: 580, overnight: true }) as never)).toMatchObject({ tone: "night", text: expect.stringContaining("Overnight in Montréal Trudeau (YUL)") });
    expect(layoverNote(leg({ layoverMinutes: 38 }) as never)).toMatchObject({ tone: "caution", text: expect.stringContaining("Only 38 min") });
    expect(layoverNote(leg({ layoverMinutes: 420 }) as never)).toMatchObject({ tone: "caution", text: expect.stringContaining("7h 00m layover") });
    expect(layoverNote(leg({ layoverMinutes: 95 }) as never)).toMatchObject({ tone: "neutral", text: expect.stringContaining("1h 35m layover") });
  });
  it("still says there is a stop when the wait is not known", () => {
    expect(layoverNote(leg({}) as never)).toMatchObject({ tone: "neutral", text: expect.stringContaining("Stop in Montréal Trudeau (YUL)") });
  });
});

describe("flights card states", () => {
  it("shows a single flight as one card and no list", () => {
    const html = render([{ type: "flights", retrievedAt: "t", origin: "Toronto", destination: "London", items: [offer("a", "900", 480)] } as unknown as AssistantBlock]);
    expect(html).toContain("The only option");
    expect(html).not.toContain("Show 1 more");
  });
});

describe("route edge cases", () => {
  const route = { type: "route_summary" as const, from: "Hotel", to: "Café Nord", mode: "walking", durationSeconds: 180, distanceMeters: 250, steps: [], retrievedAt: "t" };
  it("answers a three-minute walk in one line, with no map or steps", () => {
    const html = render([route]);
    expect(html).toContain("You are nearly there");
    expect(html).not.toContain("The route from");
  });
  it("writes a journey over a day as days and hours, and folds long step lists", () => {
    const long = { ...route, mode: "driving", durationSeconds: (26 * 60 + 40) * 60, distanceMeters: 2_214_000, steps: Array.from({ length: 8 }, (_, i) => `DRIVE Highway ${i} (1 h)`) };
    const html = render([long]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(html).toContain("1 d");
    expect(html).toContain("Show 3 more steps");
  });
  it("labels equal times 'Same time' instead of two Fastest badges", () => {
    const base = { type: "route_summary" as const, from: "A", to: "B", distanceMeters: 1000, steps: [], retrievedAt: "t" };
    const html = render([{ ...base, mode: "driving", durationSeconds: 1500 }, { ...base, mode: "transit", durationSeconds: 1500 }, { ...base, mode: "walking", durationSeconds: 8400 }]);
    expect(html).toContain("Same time");
    expect(html.match(/>Fastest</g)?.length).toBe(1);
  });
});

describe("route comparison grouping", () => {
  const base = { type: "route_summary" as const, from: "King's Cross", to: "Heathrow", distanceMeters: 31200, retrievedAt: "t" };
  const path: Array<[number, number]> = [[-0.12, 51.53], [-0.45, 51.47]];
  it("shows one tab per mode, with the transit routes listed under a single Transit tab", () => {
    const html = render([
      { ...base, mode: "driving", durationSeconds: 3900, steps: [], path },
      { ...base, mode: "transit", durationSeconds: 3900, steps: ["TRANSIT Piccadilly (60 min)"], path },
      { ...base, mode: "transit", durationSeconds: 4020, steps: ["TRANSIT Piccadilly (62 min)"], path },
      { ...base, mode: "transit", durationSeconds: 4500, steps: ["TRANSIT Elizabeth line (70 min)"], path },
    ]);
    expect(html.match(/role="tab"/g)?.length).toBe(2);
    expect(html).toContain("3 routes");
    expect(html).toContain("Same time");
    expect(html).toContain("The route from");
  });
});

describe("budget edge cases", () => {
  const budget = (extra: object) => ({ type: "budget" as const, currency: "GBP", perPerson: true, summary: "x", lines: [{ category: "Food", low: 30, typical: 60, high: 90 }, { category: "Museums", low: 0, typical: 0, high: 0, note: "free on Sundays" }], dailyTotal: { low: 30, typical: 60, high: 90 }, ...extra });
  it("writes zero as Free, never £0", () => {
    const html = render([budget({})]);
    expect(html).toContain("Free");
    expect(html).not.toContain("£0");
  });
  it("calls an exact fit exactly that", () => {
    const html = render([budget({ setBudget: 60 })]);
    expect(html).toContain("Right on your £60 a day");
    expect(html).toContain("Exactly on budget");
  });
  it("says estimated figures are rough, in the foot", () => {
    expect(render([budget({ estimated: true })])).toContain("treat these as rough");
  });
});

describe("weather edge cases", () => {
  const day = (label: string, max: number, min: number) => ({ label, max, min, condition: "clear" as const, wet: false });
  const wx = (days: ReturnType<typeof day>[]) => ({ type: "weather" as const, retrievedAt: "t", location: "Yellowknife", mode: "forecast" as const, headline: "Cold", packing: [], days });
  it("writes a true minus sign", () => {
    expect(render([wx([day("Wed", -23, -31), day("Thu", -19, -27), day("Fri", -14, -22)])])).toContain("−23°");
  });
  it("draws no curve for fewer than three days", () => {
    expect(render([wx([day("Wed", 2, -1), day("Thu", 3, 0)])])).not.toContain("Highs and lows across the week");
    expect(render([wx([day("Wed", 2, -1), day("Thu", 3, 0), day("Fri", 4, 1)])])).toContain("Highs and lows across the week");
  });
});

describe("itinerary edge cases", () => {
  const plan = (days: number, extra: object = {}) => ({ type: "itinerary" as const, days: Array.from({ length: days }, (_, i) => ({ label: `Day ${i + 1}`, stops: [{ title: "Stop", time: "Morning" }] })), ...extra });
  it("has no tab strip for one day, a strip for a few, and a selector past twelve", () => {
    expect(render([plan(1)])).not.toContain('role="tablist"');
    expect(render([plan(4)])).toContain('role="tablist"');
    const many = render([plan(20)]);
    expect(many).toContain("<select");
    expect(many).not.toContain('role="tablist"');
  });
  it("numbers the stops when none has a time", () => {
    const html = render([{ type: "itinerary", days: [{ label: "Day 1", stops: [{ title: "Colosseum" }, { title: "Forum" }] }] }]);
    expect(html).not.toContain("lucide-church");
    expect(html).toContain(">1</span>");
  });
});

describe("list widgets", () => {
  it("draws nothing for a checklist with no items, and folds a long list behind Show all", () => {
    const empty = render([{ type: "checklist", groups: [{ title: "Empty", items: [] }] }]);
    expect(empty).not.toContain("Checklist");
    expect(empty).not.toContain("0 of 0");
    const groups = Array.from({ length: 5 }, (_, i) => ({ title: `Group ${i + 1}`, items: [{ text: `Item ${i + 1}` }] }));
    const html = render([{ type: "checklist", groups }]);
    expect(html).toContain("Show all");
    expect(html).toContain("Group 1");
    expect(html).not.toContain("Item 4");
  });
  it("folds five areas to three behind a button", () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ name: `Area ${i + 1}`, blurb: "x", tags: [] }));
    const html = render([{ type: "options", kind: "area", intro: "x", items }]);
    expect(html).toContain("Area 3");
    expect(html).not.toContain(">Area 4<");
    expect(html).toContain("Show 2 more");
  });
  it("folds a comparison of more than four options to three columns", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ label: `Opt ${i + 1}`, cells: ["Opt", "x"] }));
    const html = render([{ type: "comparison", title: "T", columns: ["Option", "Vibe"], rows }]);
    expect(html).toContain("Opt 3");
    expect(html).not.toContain("Opt 4");
    expect(html).toContain("3 more options hidden");
  });
  it("keeps the first two sections of a long answer open and the rest as headings", () => {
    const sections = Array.from({ length: 5 }, (_, i) => ({ heading: `Part ${i + 1}`, bullets: [{ text: `Detail ${i + 1}` }] }));
    const html = render([{ type: "structured_answer", intro: "x", sections }]);
    expect(html).toContain("Detail 2");
    expect(html).not.toContain("Detail 4");
    expect(html).toContain("Part 4");
  });
});

describe("receipts", () => {
  it("says a cleared value was cleared, rather than 'Not set'", () => {
    const html = render([{ type: "trip_update", changes: [{ field: "dates", label: "Dates", from: "2026-09-30", to: null }] }]);
    expect(html).toContain("Dates cleared");
    expect(html).toContain("Cleared");
    expect(html).not.toContain("Not set");
  });
  it("draws no fact strip when there are no facts", () => {
    const html = render([{ type: "trip_summary", title: "A new trip", facts: [], rows: [{ label: "Destination", value: "Not chosen yet" }] }]);
    expect(html).toContain("Not chosen yet");
    expect(html).not.toContain("Dates");
  });
});

describe("cards", () => {
  it("says a stay has no price rather than showing zero, with no add button", () => {
    const html = render([{ type: "stays", retrievedAt: "t", location: "Lisbon", checkin: "2026-10-15", checkout: "2026-10-18", nights: 3, items: [{ hotelId: "h1", name: "No Price Inn", nightlyPrice: "0", totalPrice: "0", currency: "EUR" }] } as unknown as AssistantBlock]);
    expect(html).toContain("Price unavailable for these dates");
    expect(html).not.toContain('aria-label="Rooms &amp; details: No Price Inn"');
  });
  it("puts the category where the rating would be, when there is no rating", () => {
    const html = render([{ type: "place_list", places: [{ provider: "g", providerId: "p1", name: "Café Nord", category: "cafe", latitude: 1, longitude: 2, address: null, sourceUrl: null, trust: "sourced" }] }]);
    expect(html).toContain("Café");
    expect(html).not.toMatch(/>0\.0</);
  });
});
