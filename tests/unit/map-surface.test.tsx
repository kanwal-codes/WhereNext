// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization tests for the Getting-around map: what lands on the map, the day-by-day panel, the Browse tab and the panel that
 * floats over the map. The map itself (WebGL) and the heavy children are faked; what is checked is what the screen hands them.
 */
const TRIP = "11111111-1111-4111-8111-111111111111";
type Any = Record<string, any>;
let data: Any;
let desktop = true;
let phoneV2 = false;
let mapProps: Any = {};
let transportProps: Any = {};
let timelineProps: Record<number, Any> = {};
let headerTrailing: React.ReactNode = null;
let routePlan: Any | "fail" | null;
let geocode: { lng: number; lat: number } | null;
let calls: string[];

vi.mock("@/components/TripDataProvider", () => ({ useTripData: () => ({ tripId: TRIP, data }) }));
vi.mock("@/lib/use-media-query", () => ({ useMediaQuery: (q: string) => (q.includes("min-width") ? desktop : !desktop) }));
vi.mock("@/lib/phone-v2", () => ({ get PHONE_V2() { return phoneV2; } }));
vi.mock("@/components/shell/PhoneHeader", () => ({ PHONE_ROUND: "round", useSetPhoneHeader: ({ trailing }: { trailing?: React.ReactNode }) => { headerTrailing = trailing ?? null; } }));
vi.mock("@/components/SegmentedSwitch", () => ({
  SegmentedSwitch: ({ options, value, onChange, label }: { options: Array<{ key: string; label: string }>; value: string; onChange: (k: string) => void; label: string }) => (
    <div role="group" aria-label={label}>{options.map((o) => <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)}>{o.label}</button>)}</div>
  ),
}));
vi.mock("next/dynamic", () => ({
  default: () => function TripMapStub(props: Any) { mapProps = props; return <div data-testid="trip-map" />; },
}));
vi.mock("@/features/maps/ui/RouteTimeline", () => ({
  RouteTimeline: (props: Any) => {
    timelineProps[props.day.day] = props;
    return (
      <div data-testid={`timeline-${props.day.day}`}>
        <span>date:{props.date ?? "none"}</span>
        <button type="button" onClick={() => props.onHoverLeg(0)}>hover leg {props.day.day}</button>
        <button type="button" onClick={() => props.onHoverLeg(null)}>unhover {props.day.day}</button>
        <button type="button" onClick={props.onLegChosen}>choose leg {props.day.day}</button>
      </div>
    );
  },
}));
vi.mock("@/features/transport/ui/TransportSurface", () => ({
  TransportSurface: (props: Any) => { transportProps = props; return <div data-testid="transport">{props.searchSlot}</div>; },
}));
vi.mock("@/features/transport/ui/RentalCarList", () => ({ RentalCarList: ({ center }: { center: Any }) => <div data-testid="rentals">{center.lat},{center.lng}</div> }));
vi.mock("@/components/AiSearchBar", () => ({
  AiSearchBar: ({ onDirective }: { onDirective: (d: Any) => void }) => <button type="button" onClick={() => onDirective({ from: "Paris", to: "Lyon", modes: ["train"] })}>ask</button>,
}));
vi.mock("@/components/motion-primitives", () => ({ Reveal: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import { MapSurface } from "../../features/maps/ui/MapSurface";

const leg = (over: Any = {}) => ({
  fromId: "a", fromName: "A", toId: "b", toName: "B", kind: "local", mode: "walk", minutes: 12, km: 1, fare: null, departure: null, arrival: null,
  steps: [], polyline: [[2.35, 48.85], [2.36, 48.86]], note: null, alternatives: [], timeFit: null, ...over,
});
const day = (n: number, over: Any = {}) => ({ day: n, stops: [], legs: [], summary: { movingMinutes: 0, transitRides: 0, fare: null }, ...over });
const stop = (id: string, name: string, lng: number, lat: number) => ({ id, name, lng, lat });
const row = (id: string, title: string, day_index: number, lat?: number, lng?: number, provider_id?: string) => ({ id, title, day_index, metadata: lat == null ? null : { latitude: lat, longitude: lng, provider_id } });
const rpCalls = () => calls.filter((c) => c.includes("/route-plan"));

function renderMap(props: Partial<React.ComponentProps<typeof MapSurface>> = {}) {
  const onTab = vi.fn();
  const view = render(<MapSurface tripId={TRIP} tab="trip" onTab={onTab} {...props} />);
  return { onTab, ...view };
}

beforeEach(() => {
  data = { trip: { origin: "Toronto", destination: "Paris", start_date: "2026-12-01" }, itinerary: [], savedPlaces: [], decisions: [] };
  desktop = true;
  phoneV2 = false;
  mapProps = {}; transportProps = {}; timelineProps = {}; headerTrailing = null;
  routePlan = null;
  geocode = { lng: 2.35, lat: 48.85 };
  calls = [];
  try { sessionStorage.clear(); } catch { /* */ }
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = String(input);
    calls.push(url);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/route-plan")) return routePlan === "fail" ? json({}, 500) : routePlan ? json(routePlan) : json({}, 404);
    if (url.includes("/geocode")) return geocode ? json(geocode) : json({}, 404);
    return json({});
  }));
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
  Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true });
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const u = () => userEvent.setup({ pointerEventsCheck: 0 });
const pinNames = () => (mapProps.pins as Any[]).map((p) => p.name);

describe("MapSurface: pins", () => {
  it("explains an empty trip instead of showing a blank map", () => {
    renderMap();
    expect(screen.getByText(/Add stops to your itinerary or save places from Discover/)).toBeTruthy();
    expect(screen.queryByTestId("trip-map")).toBeNull();
    expect(screen.getByRole("group", { name: "Map view" })).toBeTruthy();
  });

  it("pins itinerary stops that have a location, linked to the place when it is known", async () => {
    data.itinerary = [row("i1", "Louvre", 1, 48.86, 2.34, "g/1"), row("i2", "No location", 1), row("i3", "Zero", 1, 0, 0), row("i4", "Eiffel", 2, 48.858, 2.294)];
    renderMap();
    await screen.findByTestId("trip-map");
    expect(mapProps.pins).toEqual([
      { id: "it-i1", name: "Louvre", lng: 2.34, lat: 48.86, kind: "see", day: 1, href: `/trips/${TRIP}/place/g%2F1` },
      { id: "it-i4", name: "Eiffel", lng: 2.294, lat: 48.858, kind: "see", day: 2, href: undefined },
    ]);
  });

  it("folds in the stops the route plan found for itinerary items saved without a location", async () => {
    routePlan = { days: [day(1, { stops: [stop("i1", "Louvre", 2.34, 48.86), stop("i9", "Musée d'Orsay", 2.32, 48.86)] })], unplaced: [] };
    data.itinerary = [row("i1", "Louvre", 1, 48.86, 2.34), row("i9", "Orsay", 1)];
    renderMap();
    await waitFor(() => expect(pinNames()).toContain("Musée d'Orsay"));
    expect(pinNames()).toEqual(["Louvre", "Musée d'Orsay"]);
  });

  it("adds saved places by what they are, skipping ones already pinned at the same spot", async () => {
    data.itinerary = [row("i1", "Louvre", 1, 48.86, 2.34)];
    data.savedPlaces = [
      { places: { id: "s1", name: "Café X", provider_id: "g/x", category: "cafe", metadata: { latitude: 48.87, longitude: 2.35 } } },
      { places: { id: "s2", name: "Same spot", category: "museum", metadata: { latitude: 48.86, longitude: 2.34 } } },
      { places: { id: "s3", name: "Park", category: "park", metadata: { latitude: 48.88, longitude: 2.36 } } },
      { places: { id: "s4", name: "Hotel", category: "lodging", metadata: { latitude: 48.89, longitude: 2.37 } } },
      { places: { id: "s5", name: "Museum", category: "museum", metadata: { latitude: 48.9, longitude: 2.38 } } },
      { places: { id: "s6", name: "Nowhere", category: "museum", metadata: null } },
    ];
    renderMap();
    await screen.findByTestId("trip-map");
    const pins = mapProps.pins as Any[];
    expect(pins.map((p) => [p.name, p.kind])).toEqual([["Louvre", "see"], ["Café X", "eat"], ["Park", "do"], ["Hotel", "stay"], ["Museum", "see"]]);
    expect(pins[1]).toMatchObject({ id: "s1", href: `/trips/${TRIP}/place/g%2Fx` });
    expect(pins[1].day).toBeUndefined();
  });

  it("puts the booked stay first", async () => {
    data.itinerary = [row("i1", "Louvre", 1, 48.86, 2.34)];
    data.decisions = [{ kind: "stay", value: { provider: "liteapi", hotelId: "h/1", hotelName: "Hotel Lutetia", roomName: "R", board: null, refundable: true, checkin: "2026-12-01", checkout: "2026-12-05", nights: 4, nightlyAmount: 1, totalAmount: 4, currency: "EUR", latitude: 48.85, longitude: 2.33, address: null, thumbnail: null } }];
    renderMap();
    await screen.findByTestId("trip-map");
    expect((mapProps.pins as Any[])[0]).toEqual({ id: "stay", name: "Hotel Lutetia", lng: 2.33, lat: 48.85, kind: "stay", href: `/trips/${TRIP}/stay/h%2F1` });
    expect(pinNames()).toEqual(["Hotel Lutetia", "Louvre"]);
  });
});

describe("MapSurface: days and the plan", () => {
  const twoDays = () => {
    data.itinerary = [row("i1", "Louvre", 1, 48.86, 2.34), row("i2", "Eiffel", 2, 48.858, 2.294), row("i3", "Orsay", 2, 48.86, 2.32)];
  };

  it("lands on the first day and shows its stops numbered in visit order", async () => {
    twoDays();
    renderMap();
    await screen.findByTestId("trip-map");
    await waitFor(() => expect(mapProps.activeDay).toBe(1));
    expect(screen.getByRole("button", { name: "Day 1", pressed: true })).toBeTruthy();
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["1Louvre"]);
    expect(screen.getByText("Numbered in visit order.")).toBeTruthy();
  });

  it("switches day from the chips", async () => {
    const user = u();
    twoDays();
    renderMap();
    await screen.findByTestId("trip-map");
    await user.click(screen.getByRole("button", { name: "Day 2" }));
    expect(mapProps.activeDay).toBe(2);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["1Eiffel", "2Orsay"]);
    expect(screen.getByRole("button", { name: "Day 2", pressed: true })).toBeTruthy();
  });

  it("has no day chips for a single day", async () => {
    data.itinerary = [row("i1", "Louvre", 1, 48.86, 2.34)];
    renderMap();
    await screen.findByTestId("trip-map");
    expect(screen.queryByRole("button", { name: "Day 1" })).toBeNull();
  });

  it("opens on the day a link from chat asked for", async () => {
    twoDays();
    renderMap({ start: { day: 2 } });
    await screen.findByTestId("trip-map");
    expect(mapProps.activeDay).toBe(2);
  });

  it("includes days that exist only in the route plan", async () => {
    routePlan = { days: [day(1), day(3)], unplaced: [] };
    data.itinerary = [row("i1", "Louvre", 1, 48.86, 2.34)];
    renderMap();
    await screen.findByRole("button", { name: "Day 3" });
    expect(screen.getByRole("button", { name: "Day 1" })).toBeTruthy();
  });

  it("shows the day's timeline, with the date, once the plan has legs", async () => {
    routePlan = { days: [day(1, { legs: [leg()] }), day(2, { legs: [leg()] })], unplaced: [] };
    twoDays();
    renderMap();
    const tl = await screen.findByTestId("timeline-1");
    expect(within(tl).getByText("date:Tue, Dec 1")).toBeTruthy();
    expect(screen.queryByTestId("timeline-2")).toBeNull();
    expect(screen.queryByText("Numbered in visit order.")).toBeNull();
  });

  it("shows the date as none when the trip has no start date", async () => {
    data.trip.start_date = null;
    routePlan = { days: [day(1, { legs: [leg()] })], unplaced: [] };
    twoDays();
    renderMap();
    expect(await within(await screen.findByTestId("timeline-1")).findByText("date:none")).toBeTruthy();
  });

  it("shows the timeline for a day with only bookings", async () => {
    routePlan = { days: [day(1, { booked: [{ kind: "flight", title: "AF1", detail: null }] })], unplaced: [] };
    data.itinerary = [row("i1", "Louvre", 1, 48.86, 2.34)];
    renderMap();
    await screen.findByTestId("timeline-1");
  });

  it("says it is working out the legs while the plan has none yet", async () => {
    routePlan = { days: [day(1)], unplaced: [] };
    data.itinerary = [row("i1", "Louvre", 1, 48.86, 2.34)];
    renderMap();
    expect(await screen.findByText("Working out how to get between these stops…")).toBeTruthy();
  });

  it("keeps the plan quiet when the request fails", async () => {
    routePlan = "fail";
    data.itinerary = [row("i1", "Louvre", 1, 48.86, 2.34)];
    renderMap();
    await waitFor(() => expect(rpCalls()).toHaveLength(1));
    expect(screen.getByText("Numbered in visit order.")).toBeTruthy();
  });

  it("shows the last plan at once from this session, then refreshes it", async () => {
    const cached = { days: [day(1, { legs: [leg()] })], unplaced: [] };
    sessionStorage.setItem(`route-plan:v2:${TRIP}:i1:1`, JSON.stringify(cached));
    routePlan = { days: [day(1, { legs: [leg()] }), day(2)], unplaced: [] };
    data.itinerary = [row("i1", "Louvre", 1, 48.86, 2.34)];
    renderMap();
    expect(screen.getByTestId("timeline-1")).toBeTruthy();
    await screen.findByRole("button", { name: "Day 2" });
    expect(JSON.parse(sessionStorage.getItem(`route-plan:v2:${TRIP}:i1:1`)!).days).toHaveLength(2);
  });

  it("asks again when a different way of getting between two stops is locked in", async () => {
    const user = u();
    routePlan = { days: [day(1, { legs: [leg()] })], unplaced: [] };
    data.itinerary = [row("i1", "Louvre", 1, 48.86, 2.34)];
    renderMap();
    await user.click(await screen.findByRole("button", { name: "choose leg 1" }));
    await waitFor(() => expect(rpCalls()).toHaveLength(2));
  });

  it("asks again when the itinerary changes", async () => {
    routePlan = { days: [day(1)], unplaced: [] };
    data.itinerary = [row("i1", "Louvre", 1, 48.86, 2.34)];
    const view = renderMap();
    await waitFor(() => expect(rpCalls()).toHaveLength(1));
    data = { ...data, itinerary: [...data.itinerary, row("i2", "Eiffel", 1, 48.858, 2.294)] };
    view.rerender(<MapSurface tripId={TRIP} tab="trip" onTab={view.onTab} />);
    await waitFor(() => expect(rpCalls()).toHaveLength(2));
  });
});

describe("MapSurface: the lines on the map", () => {
  const journey = (over: Any = {}) => leg({
    mode: "transit", minutes: 25,
    steps: [
      { mode: "walk", minutes: 5, polyline: [[0, 0], [0, 1]], from: "Home", to: "Gare" },
      { mode: "subway", minutes: 10, polyline: [[0, 1], [0, 2]], from: "Gare", to: "Centre" },
      { mode: "bus", minutes: 10, polyline: [[0, 2], [0, 3]], from: "Centre", to: "Work" },
    ],
    ...over,
  });
  const setup = async (legs: Any[]) => {
    routePlan = { days: [day(1, { legs }), day(2, { legs: [leg({ polyline: [[9, 9], [9, 8]] })] })], unplaced: [] };
    data.itinerary = [row("i1", "Louvre", 1, 48.86, 2.34), row("i2", "Eiffel", 2, 48.858, 2.294)];
    const view = renderMap();
    await screen.findByTestId("timeline-1");
    return view;
  };

  it("draws a journey that changes vehicle as its parts, each in its own mode, for the day shown", async () => {
    await setup([journey()]);
    expect(mapProps.legs).toEqual([
      { polyline: [[0, 0], [0, 1]], mode: "walk", dim: false },
      { polyline: [[0, 1], [0, 2]], mode: "subway", dim: false },
      { polyline: [[0, 2], [0, 3]], mode: "bus", dim: false },
    ]);
  });

  it("draws a journey whole when its parts have no lines", async () => {
    await setup([journey({ steps: [{ mode: "walk", minutes: 5 }, { mode: "bus", minutes: 5, polyline: [[0, 0], [1, 1]] }] })]);
    expect(mapProps.legs).toEqual([{ polyline: [[2.35, 48.85], [2.36, 48.86]], mode: "transit", dim: false }]);
  });

  it("dims the other hops while the pointer is on one, and says how long that hop takes", async () => {
    const user = u();
    await setup([journey(), leg({ mode: "walk", polyline: [[5, 5], [5, 6]] })]);
    await user.click(screen.getByRole("button", { name: "hover leg 1" }));
    expect((mapProps.legs as Any[]).map((l) => l.dim)).toEqual([false, false, false, true]);
    expect(mapProps.overlay.pills).toEqual([{ id: "hover", polyline: [[2.35, 48.85], [2.36, 48.86]], text: "25 min", tone: "main" }]);
    await user.click(screen.getByRole("button", { name: "unhover 1" }));
    expect((mapProps.legs as Any[]).every((l) => l.dim === false)).toBe(true);
    expect(mapProps.overlay.pills).toEqual([]);
  });

  it("marks where the day changes vehicle", async () => {
    await setup([journey()]);
    expect(mapProps.overlay.nodes).toHaveLength(1);
    expect(mapProps.overlay.nodes[0]).toMatchObject({ id: "d1-0-2", at: [0, 2] });
  });

  it("names the ways of getting around that the day uses", async () => {
    await setup([journey()]);
    const key = screen.getByRole("list", { name: "Map key" });
    expect(within(key).getAllByRole("listitem")).toHaveLength(3);
  });

  it("shows no key when the day has no drawn legs", async () => {
    routePlan = { days: [day(1, { legs: [leg({ polyline: [] })] })], unplaced: [] };
    data.itinerary = [row("i1", "Louvre", 1, 48.86, 2.34)];
    renderMap();
    await screen.findByTestId("timeline-1");
    expect(screen.queryByRole("list", { name: "Map key" })).toBeNull();
  });
});

describe("MapSurface: Browse", () => {
  const browse = (props: Partial<React.ComponentProps<typeof MapSurface>> = {}) => renderMap({ tab: "browse", ...props });

  it("shows an empty map and the transport search, even on an empty trip", async () => {
    browse();
    await screen.findByTestId("transport");
    expect(mapProps.pins).toEqual([]);
    expect(mapProps.browse).toBeNull();
  });

  it("centres on the destination when nothing is pinned yet", async () => {
    browse();
    await waitFor(() => expect(mapProps.center).toEqual([2.35, 48.85]));
    expect(calls.some((c) => c.includes(`/api/trips/${TRIP}/geocode?q=Paris`))).toBe(true);
    expect(transportProps.near).toEqual([2.35, 48.85]);
  });

  it("does not look the destination up when something is pinned, and searches near the first pin", async () => {
    data.itinerary = [row("i1", "Louvre", 1, 48.86, 2.34)];
    browse();
    await screen.findByTestId("transport");
    expect(calls.some((c) => c.includes("/geocode"))).toBe(false);
    expect(transportProps.near).toEqual([2.34, 48.86]);
  });

  it("draws the route chosen in the transport search, and clears it", async () => {
    browse();
    await screen.findByTestId("transport");
    const legs = [{ polyline: [[0, 0], [1, 1]], mode: "train", dim: false }];
    act(() => transportProps.onRoute(legs, { nodes: [], pills: [] }));
    expect(mapProps.browse).toEqual({ legs });
    expect(mapProps.overlay).toEqual({ nodes: [], pills: [] });
    expect(within(screen.getByRole("list", { name: "Map key" })).getAllByRole("listitem")).toHaveLength(1);
    act(() => transportProps.onRoute(null));
    expect(mapProps.browse).toBeNull();
    expect(screen.queryByRole("list", { name: "Map key" })).toBeNull();
  });

  it("turns what Roam understood from a search into a preset for the transport search", async () => {
    const user = u();
    browse();
    await user.click(await screen.findByRole("button", { name: "ask" }));
    expect(transportProps.preset).toMatchObject({ from: "Paris", to: "Lyon", modes: ["train"] });
    expect(typeof transportProps.preset.nonce).toBe("number");
  });

  it("starts from the preset a link from chat carried", async () => {
    const preset = { from: "A", to: "B", modes: [], nonce: 1 };
    browse({ start: { preset } });
    await screen.findByTestId("transport");
    expect(transportProps.preset).toBe(preset);
  });

  it("offers rental cars near the destination, and hides them again", async () => {
    const user = u();
    browse();
    await screen.findByTestId("transport");
    await user.click(await screen.findByRole("button", { name: "Find a rental car near Paris" }));
    expect(screen.getByTestId("rentals").textContent).toBe("48.85,2.35");
    await user.click(screen.getByRole("button", { name: "Hide rental cars" }));
    expect(screen.queryByTestId("rentals")).toBeNull();
  });

  it("offers no rental cars when it cannot tell where to look", async () => {
    geocode = null;
    browse();
    await screen.findByTestId("transport");
    await waitFor(() => expect(calls.some((c) => c.includes("/geocode"))).toBe(true));
    expect(screen.queryByRole("button", { name: /rental car/ })).toBeNull();
  });
});

describe("MapSurface: tabs and the panel", () => {
  it("switches between My trip and Browse", async () => {
    const user = u();
    const { onTab } = renderMap();
    await user.click(screen.getByRole("button", { name: "Browse" }));
    expect(onTab).toHaveBeenCalledWith("browse");
    expect(screen.getByRole("button", { name: "My trip", pressed: true })).toBeTruthy();
  });

  it("makes room for the panel on a wide screen, and gives the map back when it is hidden", async () => {
    const user = u();
    data.itinerary = [row("i1", "Louvre", 1, 48.86, 2.34)];
    renderMap();
    await screen.findByTestId("trip-map");
    expect(mapProps.inset).toEqual({ left: 436 });
    await user.click(screen.getByRole("button", { name: "Hide the trip panel to see the full map" }));
    expect(mapProps.inset).toEqual({ left: 0 });
    const show = screen.getByRole("button", { name: "Show the trip panel" });
    expect(show.textContent).toContain("Day 1");
    await user.click(show);
    expect(mapProps.inset).toEqual({ left: 436 });
  });

  it("is a bottom sheet on a narrow screen that collapses to a peek", async () => {
    const user = u();
    desktop = false;
    data.itinerary = [row("i1", "Louvre", 1, 48.86, 2.34)];
    renderMap();
    await screen.findByTestId("trip-map");
    expect(mapProps.inset.left).toBeUndefined();
    expect(mapProps.inset.bottom).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Collapse to see the map" }));
    expect(screen.getByRole("button", { name: "Expand for trip details" })).toBeTruthy();
    expect(mapProps.inset.bottom).toBe(96);
  });

  it("puts the other view behind a round header button on the phone", async () => {
    const user = u();
    desktop = false;
    phoneV2 = true;
    data.itinerary = [row("i1", "Louvre", 1, 48.86, 2.34)];
    const { onTab } = renderMap();
    await screen.findByTestId("trip-map");
    const { getByRole } = render(<>{headerTrailing}</>);
    await user.click(getByRole("button", { name: "Browse the map" }));
    expect(onTab).toHaveBeenCalledWith("browse");
  });

  it("has no header button off the phone", async () => {
    data.itinerary = [row("i1", "Louvre", 1, 48.86, 2.34)];
    renderMap();
    await screen.findByTestId("trip-map");
    expect(headerTrailing).toBeNull();
  });
});

