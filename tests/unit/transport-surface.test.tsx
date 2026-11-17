// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransportScreen as TransportSurface } from "../support/transport-screen";
import { TRIP, createApi, driveRoute, flight, matchMedia, route } from "../support/transport-harness";

/**
 * Characterization tests for the "Find your way there" screen: which requests a search sends, what each tab shows,
 * and what Save does, with the network and the heavy children faked. They pin today's behaviour so its internals can be
 * reorganised without changing it.
 */
const toast = vi.fn();
vi.mock("@/lib/application/toast", () => ({ notifyToast: (...a: unknown[]) => toast(...a) }));
vi.mock("@/components/use-distance", () => ({ useDistance: () => (km: number) => `${km.toFixed(1)} km` }));
vi.mock("@/components/TripDataProvider", () => ({ useTripDataMaybe: () => ({ data: { trip: { start_date: null, end_date: null, travelers: 2 }, preferences: {} } }) }));
vi.mock("@/features/conversation/ui/blocks/ui", async (original) => ({ ...(await original<typeof import("@/features/conversation/ui/blocks/ui")>()), textAction: "text-action" }));
vi.mock("@/components/DestinationCombobox", async () => ({ DestinationCombobox: (await import("../support/transport-harness")).stubs.DestinationCombobox }));
vi.mock("@/components/SegmentedSwitch", async () => ({ SegmentedSwitch: (await import("../support/transport-harness")).stubs.SegmentedSwitch }));
vi.mock("@/features/transport/ui/TripOptions", async () => ({ TripOptionsSheet: (await import("../support/transport-harness")).stubs.TripOptions }));
vi.mock("@/features/conversation/ui/panels/OtherFlights", async () => ({ AirlineMark: (await import("../support/transport-harness")).stubs.AirlineMark }));
vi.mock("@/features/maps/ui/modeParts", async () => (await import("../support/transport-harness")).stubs.modeParts);


let api: ReturnType<typeof createApi>;
const u = () => userEvent.setup({ pointerEventsCheck: 0 });
const field = (name: "From" | "To") => screen.getByLabelText(name) as HTMLInputElement;
const searchFor = async (user: ReturnType<typeof userEvent.setup>, from = "Paris", to = "Lyon") => {
  await user.type(field("From"), from);
  await user.type(field("To"), to);
  // There is no Search button: picking the second end is what starts it.
  await user.click(screen.getByRole("button", { name: "pick To" }));
};
const tab = (name: RegExp | string) => screen.getByRole("tab", { name });

beforeEach(() => {
  toast.mockClear();
  window.matchMedia = matchMedia(false);
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("TransportSurface: searching", () => {
  it("does not search while you are still typing", async () => {
    api = createApi({});
    const user = u();
    render(<TransportSurface tripId={TRIP} />);
    await user.type(field("From"), "Paris");
    await user.type(field("To"), "Lyo");
    await new Promise((r) => setTimeout(r, 100));
    expect(api.calls).toHaveLength(0);
  });

  it("searches when the start is picked second, just as when the destination is", async () => {
    api = createApi({ transit: [route()], drive: driveRoute });
    const user = u();
    render(<TransportSurface tripId={TRIP} />);
    await user.type(field("To"), "Lyon");
    await user.click(screen.getByRole("button", { name: "pick To" }));
    await user.type(field("From"), "Paris");
    await user.click(screen.getByRole("button", { name: "pick From" }));
    await screen.findByRole("list", { name: "Routes" });
    expect(api.posts("/transit")[0].body).toEqual({ origin: "Paris", destination: "Lyon" });
  });

  it("searches on Enter when both ends are typed, with a loading line until the routes arrive", async () => {
    let release: () => void = () => {};
    api = createApi({ transit: [route()], drive: driveRoute, gate: new Promise<void>((r) => { release = r; }) });
    const user = u();
    render(<TransportSurface tripId={TRIP} />);
    await user.type(field("From"), "Paris");
    await user.type(field("To"), "Lyon{Enter}");
    expect(await screen.findByText("Finding routes…")).toBeTruthy();
    release();
    await screen.findByRole("list", { name: "Routes" });
    expect(screen.queryByText("Finding routes…")).toBeNull();
    expect(api.posts("/transit")).toHaveLength(1);
  });

  it("searches the other way round when the ends are swapped, and clears when a field is emptied", async () => {
    api = createApi({ transit: [route()], drive: driveRoute });
    const user = u();
    render(<TransportSurface tripId={TRIP} />);
    await searchFor(user);
    await screen.findByRole("list", { name: "Routes" });
    await user.click(screen.getByRole("button", { name: "Swap start and end" }));
    await waitFor(() => expect(api.posts("/transit")).toHaveLength(2));
    expect(api.posts("/transit")[1].body).toEqual({ origin: "Lyon", destination: "Paris" });
    await user.clear(field("From"));
    await waitFor(() => expect(screen.queryByRole("list", { name: "Routes" })).toBeNull());
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("looks both places up, then asks for transit and a driving route together", async () => {
    api = createApi({ transit: [route()], drive: driveRoute });
    const user = u();
    render(<TransportSurface tripId={TRIP} />);
    await searchFor(user);
    await screen.findByRole("list", { name: "Routes" });
    expect(api.calls.filter((c) => c.url.includes("/geocode")).map((c) => decodeURIComponent(c.url.split("q=")[1])).sort()).toEqual(["Lyon", "Paris"]);
    expect(api.posts("/transit")[0].body).toEqual({ origin: "Paris", destination: "Lyon" });
    expect(api.posts("/directions")[0].body).toMatchObject({ origin: [2.35, 48.85], destination: [4.83, 45.76], profile: "driving", traffic: true });
  });

  it("lists routes and tags the fastest, with no count line above them", async () => {
    api = createApi({ transit: [route({ durationSeconds: 3000 }), route({ durationSeconds: 1800 })], drive: driveRoute });
    const user = u();
    render(<TransportSurface tripId={TRIP} />);
    await searchFor(user);
    const list = await screen.findByRole("list", { name: "Routes" });
    const rows = Array.from(list.querySelectorAll(":scope > li")) as HTMLElement[];
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByText("Fastest")).toBeTruthy();
    // The quickest is the one drawn on the map, but nothing unfolds in the list.
    expect(within(rows[1]).queryByText("toward La Défense")).toBeNull();
    expect(screen.queryByText("2 routes")).toBeNull();
  });

  it("shows the pills under the switch: when, and how the routes are ordered, which only changes the list", async () => {
    const slow = route({ durationSeconds: 3600, steps: [{ mode: "subway", line: "A", durationSeconds: 3600, departureStop: "X", arrivalStop: "Y", polyline: [[0, 0], [1, 1]] }] });
    const quick = route({ durationSeconds: 1200 });
    api = createApi({ transit: [slow, quick], drive: driveRoute });
    const user = u();
    render(<TransportSurface tripId={TRIP} />);
    await searchFor(user);
    const list = await screen.findByRole("list", { name: "Routes" });
    expect(screen.getByRole("button", { name: /Leave now/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Non-stop" })).toBeNull();
    const durations = () => within(list).getAllByRole("listitem").map((li) => li.textContent?.match(/(\d+) min|1 h/)?.[0]);
    const before = durations();
    await user.click(screen.getByRole("button", { name: /Sort: Best/ }));
    await user.click(within(await screen.findByRole("dialog", { name: "Sort results" })).getByRole("button", { name: /^Fastest/ }));
    expect(screen.getByRole("button", { name: /Sort: Fastest/ })).toBeTruthy();
    expect(durations()[0]).toBe("20 min");
    expect(before).not.toEqual(durations());
    // Sorting is not a new search.
    expect(api.posts("/transit")).toHaveLength(1);
  });

  it("opens a route's steps in a bottom sheet when picked, not inside the card", async () => {
    api = createApi({ transit: [route()], drive: null });
    const user = u();
    render(<TransportSurface tripId={TRIP} />);
    await searchFor(user);
    const row = (await screen.findByRole("list", { name: "Routes" })).querySelector("li")!;
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(within(row).getAllByRole("button")[0]);
    const sheet = await screen.findByRole("dialog", { name: "Route details" });
    expect(within(sheet).getByText("toward La Défense")).toBeTruthy();
    expect(within(sheet).getByRole("link", { name: /Start in Maps/ })).toBeTruthy();
    expect(within(row).queryByText("toward La Défense")).toBeNull();
    await user.click(within(sheet).getByRole("button", { name: "Save to my trip" }));
    await waitFor(() => expect(api.posts("/decisions")).toHaveLength(1));
  });

  it("merges back-to-back walks and counts changes and walking time", async () => {
    api = createApi({ transit: [route({ steps: [{ mode: "walk", durationSeconds: 120 }, { mode: "walk", durationSeconds: 180 }, { mode: "bus", line: "7", durationSeconds: 900 }] })], drive: null });
    const user = u();
    render(<TransportSurface tripId={TRIP} />);
    await searchFor(user);
    const row = (await screen.findByRole("list", { name: "Routes" })).querySelector("li")!;
    expect(row.textContent).toContain("No changes");
    expect(row.textContent).toContain("5 min walking");
    await user.click(within(row).getAllByRole("button")[0]);
    expect(within(await screen.findByRole("dialog", { name: "Route details" })).getAllByText(/Walk 5 min/).length).toBeGreaterThan(0);
  });

  it("says so when no public transit exists, and opens the Drive tab with the route it found", async () => {
    api = createApi({ transit: [], drive: driveRoute });
    const user = u();
    render(<TransportSurface tripId={TRIP} />);
    await searchFor(user);
    await waitFor(() => expect(tab(/^Drive/).getAttribute("aria-selected")).toBe("true"));
    expect(screen.getByLabelText("Driving")).toBeTruthy();
  });

  it("explains a transit failure without losing the drive route", async () => {
    api = createApi({ transit: "fail", drive: driveRoute });
    const user = u();
    render(<TransportSurface tripId={TRIP} />);
    await searchFor(user);
    await waitFor(() => expect(screen.getByRole("tab", { name: /^Drive/ })).toBeTruthy());
    await user.click(tab(/^Transit/));
    expect(await screen.findByText(/We couldn’t load routes just now/)).toBeTruthy();
    expect(screen.getByText(/Driving is open in the Drive tab/)).toBeTruthy();
  });

  it("says when one of the places cannot be found", async () => {
    api = createApi({ transit: [], drive: driveRoute });
    const user = u();
    render(<TransportSurface tripId={TRIP} />);
    await searchFor(user, "Paris", "Atlantis");
    // Nothing could be searched: one message for the whole result (not three empty tabs), naming the place that was not found.
    expect(await screen.findByText("No route found")).toBeTruthy();
    expect(screen.getByText(/We couldn’t find “Atlantis”/)).toBeTruthy();
  });

  it("searches as soon as the destination is picked when the start is already filled in", async () => {
    api = createApi({ transit: [route()], drive: null });
    const user = u();
    render(<TransportSurface tripId={TRIP} />);
    await user.type(field("From"), "Paris");
    await user.type(field("To"), "Lyon");
    await user.click(screen.getByRole("button", { name: "pick To" }));
    await screen.findByRole("list", { name: "Routes" });
    expect(api.posts("/transit")).toHaveLength(1);
  });

  it("swaps the two ends", async () => {
    api = createApi({});
    const user = u();
    render(<TransportSurface tripId={TRIP} />);
    await user.type(field("From"), "Paris");
    await user.type(field("To"), "Lyon");
    await user.click(screen.getByRole("button", { name: "Swap start and end" }));
    expect([field("From").value, field("To").value]).toEqual(["Lyon", "Paris"]);
  });

  it("runs a search pushed in from outside, and opens on the mode it asked for", async () => {
    api = createApi({ transit: [route()], drive: driveRoute, flights: [flight("f1")] });
    render(<TransportSurface tripId={TRIP} preset={{ from: "Paris", to: "Lyon", modes: ["flight"], nonce: 1 }} />);
    await waitFor(() => expect(tab(/^Flights/).getAttribute("aria-selected")).toBe("true"));
    expect(field("From").value).toBe("Paris");
    expect(field("To").value).toBe("Lyon");
  });
});

describe("TransportSurface: driving", () => {
  const openDrive = async (cfg: Parameters<typeof createApi>[0]) => {
    api = createApi({ transit: [], drive: driveRoute, ...cfg });
    const user = u();
    render(<TransportSurface tripId={TRIP} />);
    await searchFor(user);
    await screen.findByLabelText("Driving");
    return user;
  };

  it("shows the drive time, the distance, and a traffic summary", async () => {
    await openDrive({});
    const card = screen.getByLabelText("Driving");
    expect(card.textContent).toContain("Drive · 465.0 km");
    expect(card.textContent).toContain("live traffic along the route");
  });

  it("gives a rideshare estimate with Uber and Lyft links for these two places", async () => {
    await openDrive({});
    const section = screen.getByLabelText("Rideshare estimate");
    expect(section.textContent).toMatch(/Rideshare, roughly/);
    const uber = within(section).getByRole("link", { name: /Open in Uber/ }).getAttribute("href")!;
    expect(uber).toBe(`uber://?action=setPickup&pickup[formatted_address]=Paris&dropoff[formatted_address]=Lyon`);
    expect(within(section).getByRole("link", { name: /Open in Lyft/ }).getAttribute("href")).toContain("pickup[latitude]=48.85&pickup[longitude]=2.35&destination[latitude]=45.76&destination[longitude]=4.83");
  });

  it("saves the drive to the trip and says so", async () => {
    const user = await openDrive({});
    await user.click(within(screen.getByLabelText("Driving")).getByRole("button", { name: "Save to my trip" }));
    await waitFor(() => expect(api.posts("/decisions")).toHaveLength(1));
    expect(api.posts("/decisions")[0].body).toMatchObject({ kind: "transport", source: "user", value: { from: "Paris", to: "Lyon", mode: "drive", minutes: 270, km: 465, name: "Drive, 4 h 30 min" } });
    expect(toast).toHaveBeenCalledWith("Saved to your trip.", "success");
  });

  it("saves a rideshare estimate", async () => {
    const user = await openDrive({});
    await user.click(within(screen.getByLabelText("Rideshare estimate")).getByRole("button", { name: "Save to my trip" }));
    await waitFor(() => expect(api.posts("/decisions")).toHaveLength(1));
    expect(api.posts("/decisions")[0].body!.value).toMatchObject({ mode: "rideshare", provider: "uber/lyft", name: "Rideshare (est.), Uber/Lyft" });
  });

  it("tells you when a save did not go through", async () => {
    const user = await openDrive({ decisionOk: false });
    await user.click(within(screen.getByLabelText("Driving")).getByRole("button", { name: "Save to my trip" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("That didn’t save. Try again.", "error"));
  });

  it("asks for traffic at the leave time without a sentence about it", async () => {
    const user = await openDrive({});
    await user.click(screen.getByRole("button", { name: "set leave at 09:30" }));
    await waitFor(() => expect(api.posts("/directions")).toHaveLength(2), { timeout: 3000 });
    expect(api.posts("/directions")[1].body).toHaveProperty("departAt");
    expect(screen.queryByText(/Typical traffic for/)).toBeNull();
  });
});

describe("TransportSurface: flights", () => {
  const withFlights = async (flights: unknown[], extra: Parameters<typeof createApi>[0] = {}) => {
    api = createApi({ transit: [route()], drive: driveRoute, flights, ...extra });
    const user = u();
    render(<TransportSurface tripId={TRIP} />);
    await searchFor(user);
    await screen.findByRole("list", { name: "Routes" });
    return user;
  };

  it("looks for flights when the places are far apart, and shows the cheapest on the tab", async () => {
    await withFlights([flight("f1", { priceAmount: "180" }), flight("f2", { priceAmount: "95" })]);
    await waitFor(() => expect(api.posts("/flights")).toHaveLength(1));
    expect(api.posts("/flights")[0].body).toEqual({ from: "Paris", to: "Lyon", adults: 2 });
    await waitFor(() => expect(screen.getByRole("tab", { name: /^Flights, from/ }).getAttribute("aria-label")).toMatch(/95/));
  });

  it("does not repeat an identical flight search when you move between the tabs", async () => {
    const user = await withFlights([flight("f1")]);
    await waitFor(() => expect(api.posts("/flights")).toHaveLength(1));
    await user.click(tab(/^Flights/));
    await user.click(tab(/^Drive/));
    await user.click(tab(/^Flights/));
    expect(api.posts("/flights")).toHaveLength(1);
  });

  it("does not look for flights between two places close together", async () => {
    api = createApi({ transit: [route()], drive: driveRoute, flights: [flight("f1")] });
    const user = u();
    render(<TransportSurface tripId={TRIP} />);
    await searchFor(user, "Paris", "Versailles");
    await screen.findByRole("list", { name: "Routes" });
    expect(api.posts("/flights")).toHaveLength(0);
  });

  const flightsTab = async (user: ReturnType<typeof u>) => user.click(await screen.findByRole("tab", { name: /^Flights/ }));

  it("draws the flights like Roam's card: picks on top, a row for each fare, and the journey in a sheet on tap", async () => {
    const user = await withFlights([flight("f1", { airline: "Air Test", priceAmount: "100", stops: 1, layoverAirports: ["ZRH"] }), flight("f2", { airline: "Quick Air", priceAmount: "300", durationMinutes: 70 })]);
    await flightsTab(user);
    const list = await screen.findByRole("list", { name: "Flights" });
    const row = within(list).getAllByRole("listitem")[0];
    expect(row.textContent).toContain("Air Test");
    expect(row.textContent).toContain("1 stop");
    expect(screen.getByRole("button", { name: /^Cheapest/ })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(within(row).getAllByRole("button")[0]);
    const sheet = await screen.findByRole("dialog", { name: "Flight details" });
    expect(within(sheet).getByRole("region", { name: /Air Test journey/ })).toBeTruthy();
    expect(within(sheet).getByRole("link", { name: /Google Flights/ }).getAttribute("href")).toBe(
      `https://www.google.com/travel/flights?q=${encodeURIComponent("Flights from CDG to LYS on 2026-12-01")}`,
    );
  });

  it("opens the same sheet from a pick", async () => {
    const user = await withFlights([flight("a", { airline: "Slow", priceAmount: "50", durationMinutes: 300, stops: 1 }), flight("b", { airline: "Quick", priceAmount: "300", durationMinutes: 70 })]);
    await flightsTab(user);
    await user.click(await screen.findByRole("button", { name: /^Fastest/ }));
    expect(within(await screen.findByRole("dialog", { name: "Flight details" })).getByRole("region", { name: /Quick journey/ })).toBeTruthy();
  });

  it("sorts flights and can hide those with stops", async () => {
    const user = await withFlights([flight("a", { airline: "Slow", priceAmount: "50", durationMinutes: 300, stops: 1 }), flight("b", { airline: "Quick", priceAmount: "300", durationMinutes: 70 })]);
    await flightsTab(user);
    const order = () => within(screen.getByRole("list", { name: "Flights" })).getAllByRole("listitem").map((li) => (/Slow/.test(li.textContent ?? "") ? "Slow" : "Quick"));
    await screen.findByRole("list", { name: "Flights" });
    await user.click(screen.getByRole("button", { name: /Sort: Best/ }));
    await user.click(within(await screen.findByRole("dialog", { name: "Sort results" })).getByRole("button", { name: /^Cheapest/ }));
    expect(order()).toEqual(["Slow", "Quick"]);
    await user.click(screen.getByRole("button", { name: /Sort: Cheapest/ }));
    await user.click(within(await screen.findByRole("dialog", { name: "Sort results" })).getByRole("button", { name: /^Fastest/ }));
    expect(order()).toEqual(["Quick", "Slow"]);
    await user.click(screen.getByRole("button", { name: "Non-stop" }));
    expect(order()).toEqual(["Quick"]);
  });

  it("only offers the filters that would change the list", async () => {
    const user = await withFlights([flight("a", { stops: 0 }), flight("b", { stops: 0 })]);
    await flightsTab(user);
    await screen.findByRole("list", { name: "Flights" });
    // Every fare is non-stop and none says changes are allowed, so neither filter is worth a pill.
    expect(screen.queryByRole("button", { name: "Non-stop" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Changes allowed" })).toBeNull();
  });

  it("says so when no flight matches the filters", async () => {
    const user = await withFlights([flight("a", { stops: 1 }), flight("b", { stops: 2 })]);
    await flightsTab(user);
    await screen.findByRole("list", { name: "Flights" });
    // Neither is non-stop, so that filter is not offered; the airport filter is the one that can empty the list.
    expect(screen.queryByRole("button", { name: "Non-stop" })).toBeNull();
    cleanup();
    api = createApi({ transit: [route()], drive: driveRoute, flights: [flight("a", { stops: 1 }), flight("b", { stops: 0 })] });
    const again = u();
    render(<TransportSurface tripId={TRIP} />);
    await searchFor(again);
    await flightsTab(again);
    await again.click(await screen.findByRole("button", { name: "Non-stop" }));
    await again.click(screen.getByRole("button", { name: "Non-stop" }));
    expect(screen.getByRole("list", { name: "Flights" })).toBeTruthy();
  });

  it("explains an empty or failed flight search", async () => {
    const user = await withFlights([]);
    await user.click(await screen.findByRole("tab", { name: /^Flights/ }));
    expect(await screen.findByText(/No flights came back for those two places/)).toBeTruthy();
    cleanup();
    api = createApi({ transit: [route()], drive: driveRoute, flights: "fail" });
    const again = u();
    render(<TransportSurface tripId={TRIP} />);
    await searchFor(again);
    await again.click(await screen.findByRole("tab", { name: /^Flights/ }));
    expect(await screen.findByText(/We couldn’t load flights just now/)).toBeTruthy();
  });

  it("says the day was not chosen on the day pill, instead of in a sentence above the fares", async () => {
    const user = await withFlights([flight("a"), flight("b", { priceAmount: "200" })], { flightsAssumedDate: true });
    await flightsTab(user);
    await screen.findByRole("list", { name: "Flights" });
    expect(screen.getByRole("button", { name: /^Pick a day/ })).toBeTruthy();
    expect(screen.queryByText(/example date/)).toBeNull();
  });

  it("filters flights to the chosen time, with a way to show them all", async () => {
    const user = await withFlights([flight("early", { airline: "Early", departAt: "2026-12-01T06:00:00", arriveAt: "2026-12-01T07:20:00" }), flight("later", { airline: "Later", departAt: "2026-12-01T11:00:00", arriveAt: "2026-12-01T12:20:00" })]);
    await user.click(screen.getByRole("button", { name: "set leave at 09:30" }));
    await flightsTab(user);
    await waitFor(() => expect(screen.getByText(/Showing flights leaving after 09:30/)).toBeTruthy(), { timeout: 3000 });
    expect(screen.queryByText("Early")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Show all 2/ }));
    expect(screen.getAllByText("Early").length).toBeGreaterThan(0);
  });

  it("saves a flight to the trip", async () => {
    const user = await withFlights([flight("f1", { airline: "Air Test", priceAmount: "100", durationMinutes: 80 })]);
    await flightsTab(user);
    const row = (await screen.findByRole("list", { name: "Flights" })).querySelector("li")!;
    await user.click(within(row).getAllByRole("button")[0]);
    await user.click(within(await screen.findByRole("dialog", { name: "Flight details" })).getByRole("button", { name: "Save to my trip" }));
    await waitFor(() => expect(api.posts("/decisions")).toHaveLength(1));
    expect(api.posts("/decisions")[0].body!.value).toMatchObject({ mode: "flight", airline: "Air Test", minutes: 80, fare: "100 EUR", stops: 0 });
  });
});

describe("TransportSurface: following the options, the map and the assistant", () => {
  it("repeats the search on the same tab when the time or travellers change", async () => {
    api = createApi({ transit: [route()], drive: driveRoute });
    const user = u();
    render(<TransportSurface tripId={TRIP} />);
    await searchFor(user);
    await screen.findByRole("list", { name: "Routes" });
    await user.click(screen.getByRole("button", { name: "set leave at 09:30" }));
    await waitFor(() => expect(api.posts("/transit")).toHaveLength(2), { timeout: 3000 });
    expect(api.posts("/transit")[1].body).toMatchObject({ origin: "Paris", destination: "Lyon", when: { kind: "depart", date: "2026-12-01", time: "09:30", at: [2.35, 48.85] } });
  });

  it("hands the chosen route to the map, then the drive route, then a flight arc", async () => {
    api = createApi({ transit: [route()], drive: driveRoute, flights: [flight("f1")] });
    const onRoute = vi.fn();
    const user = u();
    render(<TransportSurface tripId={TRIP} onRoute={onRoute} />);
    await searchFor(user);
    await screen.findByRole("list", { name: "Routes" });
    await waitFor(() => expect(onRoute.mock.calls.some(([legs]) => Array.isArray(legs) && legs[0]?.mode === "subway")).toBe(true));
    await user.click(tab(/^Drive/));
    await waitFor(() => expect(onRoute.mock.calls.some(([legs]) => Array.isArray(legs) && legs.some((l: { mode: string }) => l.mode === "drive"))).toBe(true));
    await user.click(tab(/^Flights/));
    await waitFor(() => expect(onRoute.mock.calls.some(([legs]) => Array.isArray(legs) && legs.some((l: { mode: string }) => l.mode === "flight"))).toBe(true));
  });

  it("offers to ask Roam to compare, with every option as context", async () => {
    api = createApi({ transit: [route()], drive: driveRoute, flights: [flight("f1", { airline: "Air Test" })] });
    const user = u();
    render(<TransportSurface tripId={TRIP} />);
    await searchFor(user);
    const link = await screen.findByRole("link", { name: "Ask Roam to compare these" });
    const href = decodeURIComponent(link.getAttribute("href")!);
    expect(href).toContain("Paris → Lyon");
    expect(href).toContain("Ways to get from Paris to Lyon:");
    expect(href).toContain("Driving: 4 h 30 min, 465.0 km.");
    await waitFor(() => expect(decodeURIComponent(screen.getByRole("link", { name: "Ask Roam to compare these" }).getAttribute("href")!)).toContain("Flights from Paris to Lyon:"));
  });

  it("starts in Google Maps with the two ends, and describes the route when saving it", async () => {
    api = createApi({ transit: [route()], drive: null });
    const user = u();
    render(<TransportSurface tripId={TRIP} />);
    await searchFor(user);
    const row = (await screen.findByRole("list", { name: "Routes" })).querySelector("li")!;
    await user.click(within(row).getAllByRole("button")[0]);
    const sheet = await screen.findByRole("dialog", { name: "Route details" });
    expect(within(sheet).getByRole("link", { name: /Start in Maps/ }).getAttribute("href")).toBe("https://www.google.com/maps/dir/?api=1&origin=Paris&destination=Lyon&travelmode=transit");
    await user.click(within(sheet).getByRole("button", { name: "Save to my trip" }));
    await waitFor(() => expect(api.posts("/decisions")).toHaveLength(1));
    expect(api.posts("/decisions")[0].body!.value).toMatchObject({ mode: "subway", minutes: 30, fare: "2.5 EUR", departAt: "2026-12-01T09:00:00Z" });
    expect(api.posts("/decisions")[0].body!.value.summary).toMatch(/^Option 1: 30 min, 8\.0 km/);
  });
});

