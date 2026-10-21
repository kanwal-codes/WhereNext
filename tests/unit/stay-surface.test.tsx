// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization tests for the Stay search screen: what it asks the hotel search for, how the results, filters and AI search
 * behave, and what opening or comparing a hotel does. The result card, panel and heavy children are faked.
 */
const TRIP = "11111111-1111-4111-8111-111111111111";
type Any = Record<string, any>;
let data: Any;
let panel: Any | null;
let items: Any[];
let stayApi: Any | "fail" | "empty";
let calls: string[];
let signals: AbortSignal[];
let hold: Array<{ resolve: () => void; body: Any }> | null;
let cities: Any;
const push = vi.fn();
const prefetch = vi.fn();
const directive = { current: null as null | ((d: Any) => void) };

vi.mock("@/components/TripDataProvider", () => ({ useTripData: () => ({ tripId: TRIP, data }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/client/use-trip-city", () => ({ useTripCity: () => cities }));
vi.mock("@/features/stays/application/useTripStays", () => ({ useTripStays: () => ({ items }) }));
vi.mock("@/features/stays/application/useStayDetails", () => ({ prefetchStayDetails: (...a: unknown[]) => prefetch(...a) }));
vi.mock("@/components/TripPanelProvider", () => ({ useTripPanelMaybe: () => panel }));
vi.mock("@/components/CityChips", () => ({ CityChips: ({ stops, current, onPick, className }: Any) => <div data-testid="city-chips" className={className}>{stops.map((s: Any) => <button key={s.city} type="button" aria-pressed={s.city === current} onClick={() => onPick(s.city)}>{s.city}</button>)}</div> }));
vi.mock("@/components/CityPill", () => ({ CityPill: ({ city }: Any) => <span>pill {city}</span> }));
vi.mock("@/components/SwapView", () => ({ SwapView: ({ children }: Any) => <div>{children}</div> }));
vi.mock("@/components/Skeleton", () => ({ SkeletonList: () => <div>loading skeleton</div> }));
vi.mock("@/components/AiSearchBar", () => ({ AiSearchBar: ({ onDirective, placeholder }: Any) => { directive.current = onDirective; return <div data-testid="ai" data-placeholder={placeholder} />; } }));
vi.mock("@/features/stays/ui/StayResultCard", () => ({
  StayResultCard: (p: Any) => (
    <div data-testid={`card-${p.stay.hotelId}`} data-href={p.href} data-locked={String(p.locked)} data-comparing={String(p.comparing)} data-selected={String(p.selected)}>
      <button type="button" onClick={p.onOpen}>{`open ${p.stay.name}`}</button>
    </div>
  ),
}));
let narrow = false;
let headerTitle: React.ReactNode = null;
vi.mock("@/components/shell/PhoneHeader", () => ({ useSetPhoneHeader: ({ titleNode }: Any) => { headerTitle = titleNode ?? null; } }));
vi.mock("@/lib/use-media-query", () => ({ useMediaQuery: (q: string) => (q.includes("max-width") ? narrow : false) }));

import { StaySurface } from "../../features/stays/ui/StaySurface";

const hotel = (id: string, name: string, over: Any = {}) => ({
  hotelId: id, name, address: null, city: "Paris", latitude: 48.85, longitude: 2.35, stars: 4, rating: 8.6, reviewCount: 100, thumbnail: null,
  nightlyAmount: 200, totalAmount: 800, currency: "EUR", boardName: "Breakfast", refundable: true, propertyType: "Hotel", rooms: [], ...over,
});
const result = (options: Any[], over: Any = {}) => ({
  location: "Paris", checkin: "2026-12-01", checkout: "2026-12-05", assumedDates: false, nights: 4, adults: 2, rooms: 1, currency: "EUR", options,
  facets: { priceMin: 100, priceMax: 400, stars: [3, 4, 5], boards: ["Breakfast", "Room only"], propertyTypes: ["Hotel", "Apartment"] }, ...over,
});
const searches = () => calls.filter((c) => c.includes("/stays?"));
const lastSearch = () => new URL(searches().at(-1)!, "http://x").searchParams;
const u = () => userEvent.setup({ pointerEventsCheck: 0 });
const renderStay = () => render(<StaySurface tripId={TRIP} destination="Paris, France" />);

beforeEach(() => {
  data = { decisions: [], trip: { id: TRIP, destination: "Paris, France", start_date: "2026-12-01", end_date: "2026-12-05", travelers: 2 } };
  panel = null;
  items = [];
  stayApi = result([hotel("h1", "Hotel Un"), hotel("h2", "Hotel Deux", { nightlyAmount: 150 })]);
  calls = [];
  signals = [];
  hold = null;
  cities = { stops: [{ city: "Paris", startDate: "2026-12-01", endDate: "2026-12-05" }], estimated: false, stop: { city: "Paris", startDate: "2026-12-01", endDate: "2026-12-05" }, city: "Paris", setCity: vi.fn(), hasChoice: false };
  narrow = false; headerTitle = null;
  push.mockClear(); prefetch.mockClear();
  try { sessionStorage.clear(); } catch { /* */ }
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (init?.signal) signals.push(init.signal);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/stays?")) {
      if (stayApi === "fail") return json({}, 500);
      if (stayApi === "empty") return json(result([]));
      if (hold) { const body = stayApi; return new Promise<Response>((resolve) => hold!.push({ body, resolve: () => resolve(json(body)) })); }
      return json(stayApi);
    }
    return json({});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("StaySurface: the search", () => {
  it("looks for the trip's dates and party, cheapest first, and lists what comes back", async () => {
    renderStay();
    await screen.findByTestId("card-h1");
    const qs = lastSearch();
    expect(Object.fromEntries(qs)).toEqual({ adults: "2", rooms: "1", sort: "price", checkin: "2026-12-01", checkout: "2026-12-05" });
    expect(screen.getByTestId("card-h2")).toBeTruthy();
  });

  it("shows a skeleton while the first search is out", async () => {
    renderStay();
    expect(screen.getByText("loading skeleton")).toBeTruthy();
    await screen.findByTestId("card-h1");
    expect(screen.queryByText("loading skeleton")).toBeNull();
  });

  it("starts from the booked stay's dates before the trip's own", async () => {
    data.decisions = [{ kind: "stay", value: { provider: "liteapi", hotelId: "x", hotelName: "Booked", roomName: "R", board: null, refundable: true, checkin: "2026-12-02", checkout: "2026-12-04", nights: 2, nightlyAmount: 1, totalAmount: 2, currency: "EUR", latitude: 1, longitude: 2, address: null, thumbnail: null } }];
    renderStay();
    await screen.findByTestId("card-h1");
    expect(lastSearch().get("checkin")).toBe("2026-12-02");
    expect(lastSearch().get("checkout")).toBe("2026-12-04");
  });

  it("starts from the trip's party, up to 24 (the steppers themselves stop at 16)", async () => {
    data.trip.travelers = 40;
    renderStay();
    await screen.findByTestId("card-h1");
    expect(lastSearch().get("adults")).toBe("24");
    cleanup();
    data.trip.travelers = null;
    sessionStorage.clear();
    renderStay();
    await waitFor(() => expect(lastSearch().get("adults")).toBe("2"));
  });

  it("searches one city at a time on a multi-city trip, for the nights spent there", async () => {
    cities = { ...cities, hasChoice: true, city: "Lyon", stop: { city: "Lyon", startDate: "2026-12-05", endDate: "2026-12-08" }, stops: [{ city: "Paris" }, { city: "Lyon" }] };
    renderStay();
    await screen.findByTestId("card-h1");
    expect(lastSearch().get("location")).toBe("Lyon");
    expect(lastSearch().get("checkin")).toBe("2026-12-05");
    expect(lastSearch().get("checkout")).toBe("2026-12-08");
  });

  it("reuses a recent identical search from this session instead of asking again", async () => {
    const first = renderStay();
    await screen.findByTestId("card-h1");
    expect(searches()).toHaveLength(1);
    first.unmount();
    renderStay();
    await screen.findByTestId("card-h1");
    expect(searches()).toHaveLength(1);
  });

  it("says so when the search fails, and tries again on request", async () => {
    stayApi = "fail";
    const user = u();
    renderStay();
    expect((await screen.findAllByText("We couldn't load hotels just now. Try again in a moment.")).length).toBeGreaterThan(0);
    stayApi = result([hotel("h1", "Hotel Un")]);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByTestId("card-h1");
  });

  it("explains an empty result", async () => {
    stayApi = "empty";
    renderStay();
    expect((await screen.findAllByText("Nothing matched — loosen the filters or change the dates.")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("warns that example dates were used", async () => {
    stayApi = result([hotel("h1", "Hotel Un")], { assumedDates: true });
    renderStay();
    expect(await screen.findByText("Example dates, set yours above for accurate prices.")).toBeTruthy();
  });

  it("shows 15 hotels, then more on request", async () => {
    stayApi = result(Array.from({ length: 20 }, (_, i) => hotel(`h${i}`, `Hotel ${i}`)));
    const user = u();
    renderStay();
    await screen.findByTestId("card-h0");
    expect(screen.getAllByTestId(/^card-/)).toHaveLength(15);
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getAllByTestId(/^card-/)).toHaveLength(20);
  });
});

describe("StaySurface: overlapping searches", () => {
  it("shows the answer to the latest search even when an earlier one finishes after it", async () => {
    hold = [];
    renderStay();
    await waitFor(() => expect(hold!).toHaveLength(1));
    stayApi = result([hotel("new", "New answer")]);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "rating" } });
    await waitFor(() => expect(hold!).toHaveLength(2));
    act(() => hold![1].resolve());
    await screen.findByTestId("card-new");
    act(() => hold![0].resolve()); // the first search answers late, with the old list
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("card-new")).toBeTruthy();
    expect(screen.queryByTestId("card-h1")).toBeNull();
  });

  it("cancels the search still running when a new one starts", async () => {
    hold = [];
    renderStay();
    await waitFor(() => expect(hold!).toHaveLength(1));
    expect(signals[0].aborted).toBe(false);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "rating" } });
    await waitFor(() => expect(hold!).toHaveLength(2));
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });
});

describe("StaySurface: dates and party", () => {
  const dateInputs = () => Array.from(document.querySelectorAll<HTMLInputElement>('input[type="date"]'));

  it("searches again for new dates, and bars a check-out before the check-in", async () => {
    renderStay();
    await screen.findByTestId("card-h1");
    expect(dateInputs()[1].min).toBe("2026-12-01");
    fireEvent.change(dateInputs()[0], { target: { value: "2026-12-02" } });
    await waitFor(() => expect(lastSearch().get("checkin")).toBe("2026-12-02"));
    fireEvent.change(dateInputs()[1], { target: { value: "2026-12-07" } });
    await waitFor(() => expect(lastSearch().get("checkout")).toBe("2026-12-07"));
  });

  it("changes the number of guests and rooms within their limits", async () => {
    const user = u();
    renderStay();
    await screen.findByTestId("card-h1");
    await user.click(screen.getByRole("button", { name: "More Guests" }));
    await waitFor(() => expect(lastSearch().get("adults")).toBe("3"));
    await user.click(screen.getByRole("button", { name: "More Rooms" }));
    await waitFor(() => expect(lastSearch().get("rooms")).toBe("2"));
    expect(screen.getByRole("button", { name: "Fewer Rooms" }).hasAttribute("disabled")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Fewer Rooms" }));
    expect(screen.getByRole("button", { name: "Fewer Rooms" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("4 nights · 3 guests · 1 room")).toBeTruthy();
  });

  it("summarises the nights, guests and rooms on the phone's folded bar", async () => {
    renderStay();
    await screen.findByTestId("card-h1");
    expect(screen.getByText("4 nights · 2 guests · 1 room")).toBeTruthy();
  });

  it("opens and closes the folded bar", async () => {
    const user = u();
    renderStay();
    await screen.findByTestId("card-h1");
    const toggle = screen.getByRole("button", { name: /Edit/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: /Done/ }).getAttribute("aria-expanded")).toBe("true");
  });
});

describe("StaySurface: filters and sort", () => {
  const openFilters = async (user: ReturnType<typeof u>) => { await screen.findByTestId("card-h1"); await user.click(screen.getAllByRole("button", { name: /^Filters/ })[0]); };

  it("re-sorts from the sort menu", async () => {
    renderStay();
    await screen.findByTestId("card-h1");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "rating" } });
    await waitFor(() => expect(lastSearch().get("sort")).toBe("rating"));
  });

  it("filters by stars, board, type and free cancellation, and counts them on the button", async () => {
    const user = u();
    renderStay();
    await openFilters(user);
    await user.click(screen.getByRole("button", { name: "4" }));
    await waitFor(() => expect(lastSearch().get("stars")).toBe("4"));
    await user.click(screen.getByRole("button", { name: "5" }));
    await waitFor(() => expect(lastSearch().get("stars")).toBe("4,5"));
    await user.click(screen.getByRole("button", { name: "Breakfast" }));
    await waitFor(() => expect(lastSearch().get("boards")).toBe("Breakfast"));
    await user.click(screen.getByRole("button", { name: "Apartment" }));
    await waitFor(() => expect(lastSearch().get("propertyTypes")).toBe("Apartment"));
    await user.click(screen.getByRole("checkbox", { name: "Free cancellation only" }));
    await waitFor(() => expect(lastSearch().get("refundable")).toBe("1"));
    expect(screen.getByRole("button", { name: /^Filters · 5/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "4" }));
    await waitFor(() => expect(lastSearch().get("stars")).toBe("5"));
  });

  it("caps the price from the slider, and lets go of the cap at the top", async () => {
    const user = u();
    renderStay();
    await openFilters(user);
    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(slider.min).toBe("100");
    expect(slider.max).toBe("400");
    fireEvent.change(slider, { target: { value: "250" } });
    await waitFor(() => expect(lastSearch().get("priceMax")).toBe("250"));
    sessionStorage.clear(); // going back to the first search would otherwise be answered from this session's cache
    fireEvent.change(slider, { target: { value: "400" } });
    await waitFor(() => expect(lastSearch().get("priceMax")).toBeNull());
  });

  it("clears every filter at once", async () => {
    const user = u();
    renderStay();
    await openFilters(user);
    await user.click(screen.getByRole("button", { name: "4" }));
    await user.click(screen.getByRole("checkbox", { name: "Free cancellation only" }));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "250" } });
    await waitFor(() => expect(lastSearch().get("priceMax")).toBe("250"));
    sessionStorage.clear();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(lastSearch().get("refundable")).toBeNull());
    expect(lastSearch().get("stars")).toBeNull();
    expect(lastSearch().get("priceMax")).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });

  it("offers type and price filters only when there is something to choose between", async () => {
    stayApi = result([hotel("h1", "Hotel Un")], { facets: { priceMin: 100, priceMax: 100, stars: [], boards: [], propertyTypes: ["Hotel"] } });
    const user = u();
    renderStay();
    await openFilters(user);
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByText("Type of place")).toBeNull();
    expect(screen.queryByText("Star rating")).toBeNull();
    expect(screen.queryByText("Board")).toBeNull();
  });
});

describe("StaySurface: asking Roam", () => {
  it("applies what Roam understood: a place to be near, a price, stars, boards, types, refundable, sort, and party size", async () => {
    renderStay();
    await screen.findByTestId("card-h1");
    act(() => directive.current!({ location: "Gare de Lyon", priceMax: 250, stars: [4], boards: ["Breakfast"], propertyTypes: ["Apartment"], refundable: true, sort: "rating", adults: 3, rooms: 2 }));
    await waitFor(() => expect(lastSearch().get("location")).toBe("Gare de Lyon"));
    expect(Object.fromEntries(lastSearch())).toMatchObject({ priceMax: "250", stars: "4", boards: "Breakfast", propertyTypes: "Apartment", refundable: "1", sort: "rating", adults: "3", rooms: "2" });
  });

  it("limits party size that Roam asks for", async () => {
    renderStay();
    await screen.findByTestId("card-h1");
    act(() => directive.current!({ adults: 99, rooms: 99 }));
    await waitFor(() => expect(lastSearch().get("adults")).toBe("16"));
    expect(lastSearch().get("rooms")).toBe("8");
  });

  it("says what it is searching near, and goes back to the destination on 'clear'", async () => {
    const user = u();
    renderStay();
    await screen.findByTestId("card-h1");
    act(() => directive.current!({ location: "Gare de Lyon" }));
    expect(await screen.findByText("Gare de Lyon")).toBeTruthy();
    sessionStorage.clear();
    await user.click(screen.getByRole("button", { name: /clear/ }));
    await waitFor(() => expect(lastSearch().get("location")).toBeNull());
    expect(screen.queryByText("Searching near")).toBeNull();
  });

  it("offers a placeholder that names the destination", async () => {
    renderStay();
    await screen.findByTestId("card-h1");
    expect(screen.getByTestId("ai").getAttribute("data-placeholder")).toContain("near Paris station");
  });
});

describe("StaySurface: opening and comparing", () => {
  it("goes to the hotel's page with the dates and party when there is no side panel", async () => {
    const user = u();
    renderStay();
    await user.click(await screen.findByRole("button", { name: "open Hotel Un" }));
    expect(push).toHaveBeenCalledWith(`/trips/${TRIP}/stay/h1?checkin=2026-12-01&checkout=2026-12-05&adults=2&rooms=1`);
  });

  it("opens the hotel in the side panel when there is one", async () => {
    const user = u();
    panel = { openPanel: vi.fn(), compareMode: false, compareToggle: vi.fn(), compareHas: () => false };
    renderStay();
    await user.click(await screen.findByRole("button", { name: "open Hotel Un" }));
    expect(panel.openPanel).toHaveBeenCalledWith({ kind: "stay", hotelId: "h1", name: "Hotel Un", checkin: "2026-12-01", checkout: "2026-12-05" });
    expect(push).not.toHaveBeenCalled();
  });

  it("adds the hotel to the comparison while comparing, with its price, rating and place", async () => {
    const user = u();
    panel = { openPanel: vi.fn(), compareMode: true, compareToggle: vi.fn(), compareHas: (id: string) => id === "h2" };
    renderStay();
    await user.click(await screen.findByRole("button", { name: "open Hotel Un" }));
    expect(panel.openPanel).not.toHaveBeenCalled();
    expect(panel.compareToggle).toHaveBeenCalledWith({
      id: "h1", kind: "stay", name: "Hotel Un", href: `/trips/${TRIP}/stay/h1?checkin=2026-12-01&checkout=2026-12-05&adults=2&rooms=1`, subtitle: "4★ · Breakfast",
      attrs: { price: expect.stringContaining("200"), priceValue: 200, rating: "8.6/10", ratingValue: 8.6, lat: 48.85, lng: 2.35, detail: "4-star, Breakfast, free cancellation" },
    });
    expect(screen.getByTestId("card-h1").dataset.comparing).toBe("true");
    expect(screen.getByTestId("card-h1").dataset.selected).toBe("false");
    expect(screen.getByTestId("card-h2").dataset.selected).toBe("true");
  });

  it("marks the hotel already chosen for the trip", async () => {
    data.decisions = [{ kind: "stay", value: { provider: "liteapi", hotelId: "h2", hotelName: "Hotel Deux", roomName: "R", board: null, refundable: true, checkin: "2026-12-01", checkout: "2026-12-05", nights: 4, nightlyAmount: 1, totalAmount: 4, currency: "EUR", latitude: 1, longitude: 2, address: null, thumbnail: null } }];
    renderStay();
    await screen.findByTestId("card-h1");
    expect(screen.getByTestId("card-h2").dataset.locked).toBe("true");
    expect(screen.getByTestId("card-h1").dataset.locked).toBe("false");
  });

  it("warms up the hotel's details when the pointer or focus arrives", async () => {
    renderStay();
    const card = (await screen.findByTestId("card-h1")).closest("li")!;
    fireEvent.pointerEnter(card);
    expect(prefetch).toHaveBeenCalledWith(TRIP, "h1", { checkin: "2026-12-01", checkout: "2026-12-05" });
  });
});

describe("StaySurface: bookings and cities", () => {
  it("prefers the place Roam was asked to search near over the city picked", async () => {
    cities = { ...cities, hasChoice: true, city: "Lyon", stop: { city: "Lyon", startDate: "2026-12-05", endDate: "2026-12-08" }, stops: [{ city: "Paris" }, { city: "Lyon" }] };
    renderStay();
    await screen.findByTestId("card-h1");
    act(() => directive.current!({ location: "Part-Dieu" }));
    await waitFor(() => expect(lastSearch().get("location")).toBe("Part-Dieu"));
  });

  it("forgets the 'near' place when another city is picked", async () => {
    cities = { ...cities, hasChoice: true, city: "Paris", stop: { city: "Paris", startDate: "2026-12-01", endDate: "2026-12-05" }, stops: [{ city: "Paris" }, { city: "Lyon" }] };
    const view = renderStay();
    await screen.findByTestId("card-h1");
    act(() => directive.current!({ location: "Gare de Lyon" }));
    expect(await screen.findByText("Gare de Lyon")).toBeTruthy();
    cities = { ...cities, city: "Lyon", stop: { city: "Lyon", startDate: "2026-12-05", endDate: "2026-12-08" } };
    view.rerender(<StaySurface tripId={TRIP} destination="Paris, France" />);
    await waitFor(() => expect(screen.queryByText("Gare de Lyon")).toBeNull());
  });

  it("does not warn about a stay that ends the day these nights start, or starts the day they end", async () => {
    items = [{ id: "a", title: "Before", date: "2026-11-28", endDate: "2026-12-01", status: "confirmed", category: "stay" }, { id: "b", title: "After", date: "2026-12-05", endDate: "2026-12-08", status: "confirmed", category: "stay" }];
    renderStay();
    await screen.findByTestId("card-h1");
    expect(screen.queryByText(/already have/)).toBeNull();
  });

  it("warns about a one-night stay that has no end date", async () => {
    items = [{ id: "a", title: "One night", date: "2026-12-02", status: "confirmed", category: "stay" }];
    renderStay();
    expect((await screen.findAllByRole("status")).some((n) => n.textContent?.includes("One night"))).toBe(true);
  });

  it("warns when these nights overlap a stay already booked, and links to the bookings", async () => {
    items = [{ id: "b", title: "Hotel Lutetia", date: "2026-12-02", endDate: "2026-12-04", status: "confirmed", category: "stay" }];
    renderStay();
    const msg = (await screen.findAllByRole("status")).find((n) => n.textContent?.includes("already have"))!;
    expect(msg.textContent).toContain("Hotel Lutetia");
    expect(within(msg).getByRole("link", { name: "See your bookings" }).getAttribute("href")).toBe(`/trips/${TRIP}/bookings`);
  });

  it("ignores a cancelled stay and one on other nights", async () => {
    items = [{ id: "b", title: "Cancelled", date: "2026-12-02", endDate: "2026-12-04", status: "cancelled", category: "stay" }, { id: "c", title: "Later", date: "2026-12-10", endDate: "2026-12-12", status: "confirmed", category: "stay" }];
    renderStay();
    await screen.findByTestId("card-h1");
    expect(screen.queryByText(/already have/)).toBeNull();
  });

  it("moves the search to the city picked, with the nights spent there", async () => {
    const user = u();
    cities = { ...cities, hasChoice: true, city: "Paris", stop: { city: "Paris", startDate: "2026-12-01", endDate: "2026-12-05" }, stops: [{ city: "Paris" }, { city: "Lyon" }] };
    const view = renderStay();
    await screen.findByTestId("card-h1");
    await user.click(screen.getByRole("button", { name: "Lyon" }));
    expect(cities.setCity).toHaveBeenCalledWith("Lyon");
    cities = { ...cities, city: "Lyon", stop: { city: "Lyon", startDate: "2026-12-05", endDate: "2026-12-08" } };
    view.rerender(<StaySurface tripId={TRIP} destination="Paris, France" />);
    await waitFor(() => expect(lastSearch().get("location")).toBe("Lyon"));
    await waitFor(() => expect(lastSearch().get("checkin")).toBe("2026-12-05"));
  });
});

describe("StaySurface: on the phone", () => {
  beforeEach(() => { narrow = true; });

  it("puts the city in the header, and drops the city chips", async () => {
    renderStay();
    await screen.findByTestId("card-h1");
    expect(headerTitle).toBeTruthy();
    const { container } = render(<>{headerTitle}</>);
    expect(container.textContent).toBe("pill Paris");
    expect(screen.getByTestId("city-chips").className).toContain("max-lg:hidden");
    expect(screen.getByTestId("ai").getAttribute("data-placeholder")).toBe("Ask Roam about stays");
  });

  it("has a round filters button that says how many are on", async () => {
    const user = u();
    renderStay();
    await screen.findByTestId("card-h1");
    const round = screen.getAllByRole("button", { name: "Filters" })[0];
    expect(round.getAttribute("aria-pressed")).toBe("false");
    await user.click(round);
    await user.click(screen.getByRole("button", { name: "4" }));
    await waitFor(() => expect(lastSearch().get("stars")).toBe("4"));
    expect(screen.getByRole("button", { name: "Filters, 1 on" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("sorts and toggles free cancellation from chips", async () => {
    const user = u();
    renderStay();
    await screen.findByTestId("card-h1");
    await user.click(screen.getByRole("button", { name: "Free cancellation" }));
    await waitFor(() => expect(lastSearch().get("refundable")).toBe("1"));
    await user.click(screen.getAllByRole("button", { name: /^Filters/ })[0]);
    await user.click(screen.getByRole("button", { name: "Guest rating" }));
    await waitFor(() => expect(lastSearch().get("sort")).toBe("rating"));
  });
});
