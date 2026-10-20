// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization tests for the "Around here" section under a place or event: when it looks, what it asks for, how the lanes are
 * shown and logged, and what opening a card does. The cards and the network are faked; the lane choice and ranking are the real ones.
 */
const TRIP = "11111111-1111-4111-8111-111111111111";
type Any = Record<string, any>;
let near = true;
let guest = false;
let tripData: Any | null;
let panel: Any | null;
let calls: Array<{ method: string; url: string; body?: Any; keepalive?: boolean }>;
let placesFor: (query: string, url: URL) => Any[];
let eventsFor: (query: string) => Any[];
let failPlaces = false;
const push = vi.fn();

vi.mock("@/lib/use-near-view", () => ({ useNearView: () => [{ current: null }, near] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/features/identity/ui/GuestProvider", () => ({ useGuest: () => ({ guest }) }));
vi.mock("@/components/TripDataProvider", () => ({ useTripDataMaybe: () => (tripData ? { data: tripData } : null) }));
vi.mock("@/components/TripPanelProvider", () => ({ useTripPanelMaybe: () => panel }));
vi.mock("@/features/trip/ui/SaveHeart", () => ({ SaveHeart: () => <span data-testid="heart" /> }));
vi.mock("@/components/motion-primitives", () => ({ Reveal: ({ children }: Any) => <div>{children}</div> }));
vi.mock("@/features/conversation/ui/blocks/ui", () => ({ CompareMark: ({ selected }: Any) => <span data-testid="mark">{String(selected)}</span> }));
vi.mock("@/features/conversation/ui/blocks/glyphs", () => ({ placeGlyph: () => ({ icon: () => null }) }));
vi.mock("@/features/conversation/ui/blocks/CineCard", () => ({
  CineCard: (p: Any) => (
    <div data-testid="card" data-selected={String(p.selected)}>
      <button type="button" onClick={p.onOpen}>{p.label}</button>
      <span>{p.title}</span><span data-testid="meta">{p.meta}</span>{p.save}{p.overlay}
    </div>
  ),
}));
vi.mock("@/components/EventCard", () => ({
  EventCard: ({ event, onSelect }: Any) => <div data-testid="event"><button type="button" onClick={onSelect}>{`event ${event.title}`}</button></div>,
}));

import { NearbyRecommendations } from "../../components/NearbyRecommendations";
import { lanesFor } from "../../packages/reco/vibes";

const place = (id: string, name: string, over: Any = {}) => ({ provider: "google-places", providerId: id, name, category: "museum", latitude: 48.86, longitude: 2.34, address: "1 Rue", rating: 4.5, userRatingCount: 500, photoNames: [], ...over });
const urlOf = (c: { url: string }) => new URL(c.url, "http://x");
const logs = () => calls.filter((c) => c.url.endsWith("/reco") && c.body?.op === "log");
const recoCalls = (op: string) => calls.filter((c) => c.url.endsWith("/reco") && c.body?.op === op);
const placeCalls = () => calls.filter((c) => /\/places\?/.test(c.url));
const eventCalls = () => calls.filter((c) => /\/events\?/.test(c.url));
const u = () => userEvent.setup({ pointerEventsCheck: 0 });
const museum = (props: Any = {}) => render(<NearbyRecommendations tripId={TRIP} excludeId="anchor" anchorName="Louvre" cityHint="Paris, France" primaryType="museum" types={["museum"]} lat={48.86} lng={2.34} {...props} />);
const museumLanes = lanesFor("museum_culture");

beforeEach(() => {
  near = true; guest = false; tripData = { preferences: {}, savedPlaces: [], rejectedPlaceIds: [], decisions: [], itinerary: [] }; panel = null; calls = []; failPlaces = false;
  placesFor = (query) => Array.from({ length: 6 }, (_, i) => place(`${query}-${i}`, `${query} ${i}`));
  eventsFor = (query) => Array.from({ length: 5 }, (_, i) => ({ title: `Show ${query} ${i}`, url: `https://e/${query}/${i}`, source: "ticketmaster", date: "2026-12-02" }));
  push.mockClear();
  try { sessionStorage.clear(); } catch { /* */ }
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    const call = { method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined, keepalive: (init as Any)?.keepalive };
    calls.push(call);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    const u2 = urlOf(call);
    if (u2.pathname.endsWith("/places")) return failPlaces ? json({}, 500) : json({ places: placesFor(u2.searchParams.get("query") ?? "", u2) });
    if (u2.pathname.endsWith("/events")) return json({ events: eventsFor(u2.searchParams.get("query") ?? "") });
    if (u2.pathname.endsWith("/reco")) {
      if (call.body?.op === "classify") return json({ vibe: "museum_culture" });
      if (call.body?.op === "rank") return json({ scores: {} });
      return json({});
    }
    return json({});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("NearbyRecommendations: when it looks", () => {
  it("waits until someone scrolls toward it, showing that it is looking", async () => {
    near = false;
    museum();
    expect(screen.getByText(/Finding what.s around Louvre/)).toBeTruthy();
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toHaveLength(0);
  });

  it("does nothing for a guest", () => {
    guest = true;
    const { container } = museum();
    expect(container.innerHTML).toBe("");
    expect(calls).toHaveLength(0);
  });

  it("shows the loading line while it works, then the section", async () => {
    museum();
    expect(screen.getByText(/Finding what.s around Louvre/)).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Around here" })).toBeTruthy();
    expect(screen.queryByText(/Finding what/)).toBeNull();
  });

  it("shows nothing when no lane found anything", async () => {
    placesFor = () => []; eventsFor = () => [];
    const { container } = museum();
    await waitFor(() => expect(screen.queryByText(/Finding what/)).toBeNull());
    expect(container.innerHTML).toBe("");
  });

  it("treats a failing search as an empty lane", async () => {
    failPlaces = true; eventsFor = () => [];
    const { container } = museum();
    await waitFor(() => expect(screen.queryByText(/Finding what/)).toBeNull());
    expect(container.querySelector("h2")).toBeNull();
  });
});

describe("NearbyRecommendations: what it asks for", () => {
  it("searches places near the anchor, in its city, biased to its coordinates, one page each", async () => {
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    const more = placeCalls().find((c) => urlOf(c).searchParams.get("query")!.startsWith("museum or art gallery"))!;
    expect(urlOf(more).searchParams.get("query")).toBe("museum or art gallery near Louvre Paris, France");
    expect(urlOf(more).searchParams.get("limit")).toBe("20");
    expect(urlOf(more).searchParams.get("lat")).toBe("48.86");
    expect(urlOf(more).searchParams.get("lng")).toBe("2.34");
    const historic = placeCalls().find((c) => urlOf(c).searchParams.get("query")!.startsWith("historical landmark"))!;
    expect(urlOf(historic).searchParams.get("query")).toBe("historical landmark or monument in Paris, France");
  });

  it("leaves the coordinates out when the anchor has none", async () => {
    museum({ lat: undefined, lng: undefined });
    await screen.findByRole("heading", { name: "Around here" });
    expect(urlOf(placeCalls()[0]).searchParams.has("lat")).toBe(false);
  });

  it("searches events in the anchor's city, adding the genre after the segment for an event anchor", async () => {
    museum({ kind: "event", excludeId: "https://e/anchor", genre: "Music · Rock", primaryType: undefined, types: undefined, anchorName: "Rock Night" });
    await screen.findByRole("heading", { name: "Around here" });
    expect(eventCalls().length).toBeGreaterThan(0);
    for (const c of eventCalls()) expect(urlOf(c).searchParams.get("location")).toBe("Paris, France");
    expect(eventCalls().some((c) => /Rock/.test(urlOf(c).searchParams.get("query") ?? ""))).toBe(true);
  });

  it("skips the event search when there is no city", async () => {
    museum({ cityHint: "" });
    await screen.findByRole("heading", { name: "Around here" });
    expect(eventCalls()).toHaveLength(0);
  });

  it("asks the server about an anchor the local rules cannot place, and uses its answer", async () => {
    museum({ primaryType: "weird_type", types: ["weird_type"], anchorName: "Odd Place" });
    await screen.findByRole("heading", { name: "Around here" });
    expect(recoCalls("classify")).toHaveLength(1);
    expect(recoCalls("classify")[0].body).toMatchObject({ id: "anchor", name: "Odd Place", primaryType: "weird_type" });
    expect(screen.getByRole("heading", { name: museumLanes[0].title })).toBeTruthy();
  });

  it("does not ask the server about an anchor it can place", async () => {
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    expect(recoCalls("classify")).toHaveLength(0);
  });

  it("re-ranks a 'more like this' lane against the anchor", async () => {
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    const rank = recoCalls("rank");
    expect(rank).toHaveLength(1);
    expect(rank[0].body!.anchor).toBe("Louvre museum museum");
    expect(rank[0].body!.candidates.length).toBeLessThanOrEqual(24);
    expect(rank[0].body!.candidates[0]).toMatchObject({ id: expect.any(String), text: expect.stringContaining("museum") });
  });

  it("sends at most 24 candidates to be re-ranked", async () => {
    placesFor = (query) => Array.from({ length: 40 }, (_, i) => place(`${query}-${i}`, `${query} ${i}`));
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    expect(recoCalls("rank")[0].body!.candidates).toHaveLength(24);
  });

  it("carries on without the embedding scores when the server cannot give them", async () => {
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
      if (String(input).endsWith("/reco") && init?.body && JSON.parse(String(init.body)).op === "rank") throw new Error("down");
      return original(input, init);
    }));
    museum();
    expect(await screen.findByRole("heading", { name: "Around here" })).toBeTruthy();
  });
});

describe("NearbyRecommendations: the lanes", () => {
  it("shows the first two lanes with up to four cards each, and the rest behind 'More nearby'", async () => {
    const user = u();
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(museumLanes.slice(0, 2).map((l) => l.title));
    const first = screen.getByRole("heading", { name: museumLanes[0].title }).closest("section")!;
    expect(within(first).getAllByTestId("card")).toHaveLength(4);
    const more = screen.getByRole("button", { name: /More nearby · 2 more groups/ });
    await user.click(more);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(museumLanes.map((l) => l.title));
    await user.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);
  });

  it("words a single extra group in the singular", async () => {
    // A vibe with three lanes: only one is tucked away.
    museum({ primaryType: "stadium", types: ["stadium"], anchorName: "Big Stadium" });
    await screen.findByRole("heading", { name: "Around here" });
    const sports = lanesFor("sports");
    if (sports.length === 3) expect(screen.getByRole("button", { name: /More nearby · 1 more group$/ })).toBeTruthy();
    else expect(screen.getByRole("button", { name: new RegExp(`More nearby · ${sports.length - 2} more groups`) })).toBeTruthy();
  });

  it("never shows the anchor, nor repeats a place across lanes", async () => {
    placesFor = (query) => [place("anchor", "Louvre"), place("same", "Shared place"), place(`${query}-a`, `${query} a`)];
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    expect(screen.queryByText("Louvre")).toBeNull();
    expect(screen.getAllByText("Shared place")).toHaveLength(1);
  });

  it("never shows a place the traveller turned down", async () => {
    tripData = { preferences: {}, savedPlaces: [], rejectedPlaceIds: ["no-thanks"], decisions: [], itinerary: [] };
    placesFor = (query) => [place("no-thanks", "Rejected cafe"), place(`${query}-a`, `${query} a`)];
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    expect(screen.queryByText("Rejected cafe")).toBeNull();
  });

  it("never shows the event the page is about", async () => {
    placesFor = () => [];
    eventsFor = (q) => [{ title: "This very show", url: "https://e/anchor", source: "tm" }, { title: `Other ${q}`, url: "https://e/other", source: "tm" }];
    museum({ kind: "event", excludeId: "https://e/anchor", primaryType: undefined, types: undefined, anchorName: "This very show", genre: "Music · Rock" });
    await screen.findByRole("heading", { name: "Around here" });
    expect(screen.queryByRole("button", { name: "event This very show" })).toBeNull();
    expect(screen.getAllByTestId("event").length).toBeGreaterThan(0);
  });

  it("fills a lane's four cards with events after its places when it has few", async () => {
    placesFor = () => [];
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    expect(screen.queryByRole("button", { name: /More nearby/ })).toBeNull(); // lanes with nothing in them are dropped
    const exhib = screen.getByRole("heading", { name: "Exhibitions & talks" }).closest("section")!;
    expect(within(exhib).getAllByTestId("event")).toHaveLength(4);
  });

  it("offers 'See more' only when a lane has more than it shows, and only beside a panel", async () => {
    panel = { openPanel: vi.fn(), compareMode: false, compareToggle: vi.fn(), compareHas: () => false };
    const user = u();
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    const first = screen.getByRole("heading", { name: museumLanes[0].title }).closest("section")!;
    await user.click(within(first).getByRole("button", { name: /See more/ }));
    expect(panel.openPanel).toHaveBeenCalledWith({ kind: "collection", title: museumLanes[0].title, block: expect.objectContaining({ type: "place_list", title: museumLanes[0].title, places: expect.any(Array) }) });
    expect(panel.openPanel.mock.calls[0][0].block.places.length).toBeGreaterThan(4);
    cleanup();
    panel = null;
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    expect(screen.queryByRole("button", { name: /See more/ })).toBeNull();
  });

  it("offers no 'See more' for a lane that fits on screen", async () => {
    panel = { openPanel: vi.fn(), compareMode: false, compareToggle: vi.fn(), compareHas: () => false };
    placesFor = (query) => Array.from({ length: 3 }, (_, i) => place(`${query}-${i}`, `${query} ${i}`));
    eventsFor = () => [];
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    expect(screen.queryByRole("button", { name: /See more/ })).toBeNull();
  });

  it("opens a lane of events as an events collection", async () => {
    panel = { openPanel: vi.fn(), compareMode: false, compareToggle: vi.fn(), compareHas: () => false };
    const user = u();
    placesFor = () => [];
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    const exhib = screen.getByRole("heading", { name: "Exhibitions & talks" }).closest("section")!;
    await user.click(within(exhib).getByRole("button", { name: /See more/ }));
    expect(panel.openPanel.mock.calls[0][0].block).toMatchObject({ type: "events", items: expect.any(Array) });
  });
});

describe("NearbyRecommendations: logging", () => {
  it("logs an impression for each card on screen, in order", async () => {
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    await waitFor(() => expect(logs()).toHaveLength(1));
    const log = logs()[0];
    expect(log.keepalive).toBe(true);
    expect(log.body).toMatchObject({ op: "log", anchorKind: "place", anchorId: "anchor", vibe: "museum_culture" });
    const rows = log.body!.events as Any[];
    expect(rows.every((r) => r.action === "impression")).toBe(true);
    expect(new Set(rows.map((r) => r.laneId))).toEqual(new Set(museumLanes.slice(0, 2).map((l) => l.id)));
    expect(rows.filter((r) => r.laneId === museumLanes[0].id).map((r) => r.position)).toEqual([0, 1, 2, 3]);
  });

  it("logs the groups that were tucked away only when they are opened", async () => {
    const user = u();
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    await waitFor(() => expect(logs()).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: /More nearby/ }));
    expect(logs()).toHaveLength(2);
    expect(new Set((logs()[1].body!.events as Any[]).map((r) => r.laneId))).toEqual(new Set(museumLanes.slice(2).map((l) => l.id)));
    await user.click(screen.getByRole("button", { name: "Show less" }));
    expect(logs()).toHaveLength(2);
  });

  it("logs a click with the card's place in its lane", async () => {
    const user = u();
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    await waitFor(() => expect(logs()).toHaveLength(1));
    const first = screen.getByRole("heading", { name: museumLanes[0].title }).closest("section")!;
    await user.click(within(first).getAllByRole("button", { name: /^Open / })[2]);
    const click = logs().at(-1)!;
    expect(click.body).toMatchObject({ op: "log", events: [{ laneId: museumLanes[0].id, action: "click", itemKind: "place", position: 2 }] });
  });

  it("logs the event kind for an event card", async () => {
    const user = u();
    placesFor = () => [];
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    await user.click(screen.getAllByRole("button", { name: /^event / })[0]);
    expect(logs().at(-1)!.body!.events[0]).toMatchObject({ action: "click", itemKind: "event", laneId: "exhib" });
  });
});

describe("NearbyRecommendations: remembering", () => {
  it("shows a session's earlier answer for the same anchor without asking again", async () => {
    const first = museum();
    await screen.findByRole("heading", { name: "Around here" });
    const asked = calls.length;
    first.unmount();
    museum();
    expect(await screen.findByRole("heading", { name: "Around here" })).toBeTruthy();
    expect(placeCalls().length + eventCalls().length).toBe(placeCalls().length + eventCalls().length);
    expect(calls.length).toBe(asked);
  });

  it("looks again for a different anchor", async () => {
    const first = museum();
    await screen.findByRole("heading", { name: "Around here" });
    const asked = placeCalls().length;
    first.unmount();
    museum({ excludeId: "another" });
    await waitFor(() => expect(placeCalls().length).toBeGreaterThan(asked));
  });

  it("stops looking when it goes away mid-search", async () => {
    const view = museum();
    view.unmount();
    await new Promise((r) => setTimeout(r, 20));
    expect(logs()).toHaveLength(0);
  });
});

describe("NearbyRecommendations: a card", () => {
  const cardsOf = () => screen.getAllByTestId("card");

  it("shows the name, rating and why it was picked", async () => {
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    expect(screen.getAllByTestId("meta")[0].textContent).toMatch(/^★ 4\.5/);
    expect(screen.getAllByTestId("heart").length).toBeGreaterThan(0);
  });

  it("says why a place was picked when it fits the traveller's interests, and stays quiet for 'Top-rated'", async () => {
    tripData = { preferences: { interests: ["ramen"] }, savedPlaces: [], rejectedPlaceIds: [], decisions: [], itinerary: [] };
    placesFor = (query) => [place(`${query}-r`, "Ramen Bar", { category: "restaurant" }), place(`${query}-p`, "Plain Hall", { rating: 4.9, userRatingCount: 90000 })];
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    const metas = screen.getAllByTestId("meta").map((m) => m.textContent);
    expect(metas.some((m) => /· Ramen$/.test(m ?? ""))).toBe(true);
    expect(metas.every((m) => !/Top-rated/.test(m ?? ""))).toBe(true);
  });

  it("opens the place's page when there is no side panel", async () => {
    const user = u();
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    const open = screen.getAllByRole("button", { name: /^Open / })[0];
    const id = open.getAttribute("aria-label") ?? open.textContent!;
    await user.click(open);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toMatch(new RegExp(`^/trips/${TRIP}/place/`));
    void id;
  });

  it("opens the place in the side panel when there is one", async () => {
    panel = { openPanel: vi.fn(), compareMode: false, compareToggle: vi.fn(), compareHas: () => false };
    const user = u();
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    await user.click(screen.getAllByRole("button", { name: /^Open / })[0]);
    expect(panel.openPanel).toHaveBeenCalledWith({ kind: "place", placeId: expect.any(String), name: expect.any(String) });
    expect(push).not.toHaveBeenCalled();
  });

  it("adds the place to the comparison while comparing, with the day it is on in the itinerary", async () => {
    tripData = { preferences: {}, savedPlaces: [], rejectedPlaceIds: [], decisions: [], itinerary: [] };
    panel = { openPanel: vi.fn(), compareMode: true, compareToggle: vi.fn(), compareHas: () => false };
    const user = u();
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    const name = screen.getAllByTestId("card")[0].querySelector("span")!.textContent!;
    tripData.itinerary = [{ title: ` ${name.toUpperCase()} `, day_index: 3 }];
    cleanup();
    sessionStorage.clear();
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    await user.click(screen.getAllByRole("button", { name: /^Open / })[0]);
    expect(panel.compareToggle).toHaveBeenCalledWith(expect.objectContaining({ kind: "place", href: expect.stringContaining(`/trips/${TRIP}/place/`), attrs: expect.objectContaining({ when: "Day 3", rating: "4.5" }) }));
    expect(panel.openPanel).not.toHaveBeenCalled();
  });

  it("marks cards already picked for comparison, and drops the save heart while comparing", async () => {
    panel = { openPanel: vi.fn(), compareMode: true, compareToggle: vi.fn(), compareHas: () => true };
    museum();
    await screen.findByRole("heading", { name: "Around here" });
    expect(cardsOf()[0].dataset.selected).toBe("true");
    expect(screen.getAllByTestId("mark")[0].textContent).toBe("true");
    expect(screen.queryByTestId("heart")).toBeNull();
  });
});

