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
vi.mock("@/components/Skeleton", () => ({ Skeleton: () => <div data-skeleton="" /> }));
vi.mock("@/components/AiSearchBar", () => ({ AiSearchBar: ({ onDirective, placeholder }: Any) => { directive.current = onDirective; return <div data-testid="ai" data-placeholder={placeholder} />; } }));
vi.mock("@/features/stays/ui/StayResultCard", () => ({
  StayResultCard: (p: Any) => (
    <div data-testid={`card-${p.stay.hotelId}`} data-href={p.href} data-locked={String(p.locked)} data-comparing={String(p.comparing)} data-selected={String(p.selected)} data-pricing={String(Boolean(p.pricing))}>
      <button type="button" onClick={p.onOpen}>{`open ${p.stay.name}`}</button>
    </div>
  ),
}));
// The place field is a cmdk list, which measures itself with ResizeObserver (jsdom has none).
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
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
  cities = { stops: [{ city: "Paris", startDate: "2026-12-01", endDate: "2026-12-05" }], estimated: false, stop: { city: "Paris", startDate: "2026-12-01", endDate: "2026-12-05" }, city: "Paris", setCity: vi.fn(), hasChoice: false, scoped: false, area: null, setArea: vi.fn(), broad: false, parent: "Paris" };
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
    const { container } = renderStay();
    expect(container.querySelector("[data-skeleton]")).toBeTruthy();
    await screen.findByTestId("card-h1");
    expect(container.querySelector("[data-skeleton]")).toBeNull();
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
    cities = { ...cities, hasChoice: true, scoped: true, city: "Lyon", stop: { city: "Lyon", startDate: "2026-12-05", endDate: "2026-12-08" }, stops: [{ city: "Paris" }, { city: "Lyon" }] };
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
    expect(await screen.findByText("The hotel sites aren't answering right now. Try again in a moment.")).toBeTruthy();
    stayApi = result([hotel("h1", "Hotel Un")]);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByTestId("card-h1");
  });

  it("keeps the list it had when a refresh fails, and says the prices are the last ones", async () => {
    const user = u();
    renderStay();
    await screen.findByTestId("card-h1");
    stayApi = "fail";
    await user.click(screen.getByRole("button", { name: "More Guests" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/last ones we had/)).toBeTruthy();
    expect(screen.getByTestId("card-h1")).toBeTruthy();
    stayApi = result([hotel("h3", "Hotel Trois")]);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByTestId("card-h3");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("tells an offline reader to reconnect, not that the hotels are down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    renderStay();
    expect(await screen.findByText("You're offline")).toBeTruthy();
    expect(screen.getByText("Reconnect and the hotels will load.")).toBeTruthy();
  });

  it("explains an empty result, and offers new dates", async () => {
    stayApi = "empty";
    renderStay();
    expect(await screen.findByText("No stays for those dates")).toBeTruthy();
    expect(screen.getByText(/Nothing came back for/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change dates" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("shows the hotels without a note above them when example dates were used", async () => {
    stayApi = result([hotel("h1", "Hotel Un")], { assumedDates: true });
    renderStay();
    expect(await screen.findByTestId("card-h1")).toBeTruthy();
    expect(screen.queryByText(/Example dates/)).toBeNull();
  });

  it("opens the dates and the filters as sheets over the page on a phone, not inline", async () => {
    const user = u();
    narrow = true;
    renderStay();
    await screen.findByTestId("card-h1");
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(within(render(<>{headerTitle}</>).container).getByRole("button", { name: /^Dates, guests and place/ }));
    const dates = await screen.findByRole("dialog", { name: "Dates and guests" });
    expect(within(dates).getByText("Check-in")).toBeTruthy();
    await user.click(within(dates).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getAllByRole("button", { name: "Filters" })[0]);
    const filters = await screen.findByRole("dialog", { name: "Sort and filter" });
    expect(within(filters).getByText("Price per night")).toBeTruthy();
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

describe("StaySurface: while a search is refreshed", () => {
  it("keeps the hotels but holds their prices back while new dates are looked up, then shows the new ones", async () => {
    const user = u();
    renderStay();
    await screen.findByTestId("card-h1");
    expect(screen.getByTestId("card-h1").getAttribute("data-pricing")).toBe("false");
    hold = [];
    await user.click(screen.getByRole("button", { name: "More Guests" }));
    await waitFor(() => expect(hold!).toHaveLength(1));
    expect(screen.getByTestId("card-h1").getAttribute("data-pricing")).toBe("true");
    expect(screen.getByText(/Checking prices for/)).toBeTruthy();
    act(() => hold![0].resolve());
    await waitFor(() => expect(screen.getByTestId("card-h1").getAttribute("data-pricing")).toBe("false"));
  });

  it("opens a hotel for the dates asked for, not the dates of the list still on screen", async () => {
    const user = u();
    renderStay();
    await screen.findByTestId("card-h1");
    hold = [];
    fireEvent.change(document.querySelectorAll<HTMLInputElement>('input[type="date"]')[0], { target: { value: "2026-12-02" } });
    await waitFor(() => expect(hold!).toHaveLength(1));
    expect(screen.getByTestId("card-h1").getAttribute("data-href")).toContain("checkin=2026-12-02");
    expect(user).toBeTruthy();
  });

  it("drops the list for a skeleton when the area changes, because none of those hotels belong to the new place", async () => {
    const { container } = renderStay();
    await screen.findByTestId("card-h1");
    hold = [];
    act(() => directive.current!({ location: "Gare de Lyon" }));
    await waitFor(() => expect(hold!).toHaveLength(1));
    expect(screen.queryByTestId("card-h1")).toBeNull();
    expect(container.querySelector("[data-skeleton]")).toBeTruthy();
  });
});

describe("StaySurface: overlapping searches", () => {
  it("shows the answer to the latest search even when an earlier one finishes after it", async () => {
    hold = [];
    renderStay();
    await waitFor(() => expect(hold!).toHaveLength(1));
    stayApi = result([hotel("new", "New answer")]);
    await u().click(screen.getByRole("button", { name: "More Guests" }));
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
    await u().click(screen.getByRole("button", { name: "More Guests" }));
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
  });

  it("opens the dates and guests from the header pill and closes them with Done", async () => {
    const user = u();
    narrow = true;
    renderStay();
    await screen.findByTestId("card-h1");
    await user.click(within(render(<>{headerTitle}</>).container).getByRole("button", { name: /^Dates, guests and place/ }));
    const dates = await screen.findByRole("dialog", { name: "Dates and guests" });
    expect(dates.querySelector('input[aria-label="Place"]')).toBeTruthy();
    await user.click(within(dates).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("StaySurface: filters and sort", () => {
  const openFilters = async (user: ReturnType<typeof u>) => { await waitFor(() => expect(document.querySelector("[data-testid^='card-']")).toBeTruthy()); await user.click(screen.getAllByRole("button", { name: /^Filters/ })[0]); };
  const varied = () => result([
    hotel("a", "Hotel A", { stars: 4, nightlyAmount: 120, rating: 8.0, boardName: "Breakfast", propertyType: "Hotel", refundable: true, rooms: [{ boardName: "Breakfast", refundable: true }] }),
    hotel("b", "Hotel B", { stars: 5, nightlyAmount: 380, rating: 9.6, boardName: "Room only", propertyType: "Apartment", refundable: false, rooms: [{ boardName: "Room only", refundable: false }] }),
    hotel("c", "Hotel C", { stars: 3, nightlyAmount: 200, rating: 9.0, boardName: "Room only", propertyType: "Hotel", refundable: false, rooms: [{ boardName: "Room only", refundable: false }] }),
  ]);
  const shown = () => Array.from(document.querySelectorAll("[data-testid^='card-']")).map((e) => e.getAttribute("data-testid")!.slice(5));

  it("re-sorts from the sort menu at once, without asking the hotel sites again", async () => {
    stayApi = varied();
    renderStay();
    await screen.findByTestId("card-a");
    expect(shown()).toEqual(["a", "c", "b"]);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "rating" } });
    await waitFor(() => expect(shown()).toEqual(["b", "c", "a"]));
    expect(searches()).toHaveLength(1);
  });

  it("filters by stars, board, type and free cancellation at once, counts them on the button, and never searches again", async () => {
    stayApi = varied();
    const user = u();
    renderStay();
    await openFilters(user);
    await screen.findByTestId("card-a");
    await user.click(screen.getByRole("button", { name: "4" }));
    expect(shown()).toEqual(["a"]);
    await user.click(screen.getByRole("button", { name: "5" }));
    expect(shown()).toEqual(["a", "b"]);
    await user.click(screen.getByRole("button", { name: "Breakfast" }));
    expect(shown()).toEqual(["a"]);
    await user.click(screen.getByRole("button", { name: "Apartment" }));
    expect(shown()).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Apartment" }));
    await user.click(screen.getByRole("checkbox", { name: "Free cancellation only" }));
    expect(shown()).toEqual(["a"]);
    expect(screen.getByRole("button", { name: /^Filters · 4/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "4" }));
    expect(shown()).toEqual([]);
    expect(searches()).toHaveLength(1);
  });

  it("caps the price from the slider at once, shows it as a chip, and lets go of the cap at the top", async () => {
    stayApi = varied();
    const user = u();
    renderStay();
    await openFilters(user);
    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(slider.min).toBe("100");
    expect(slider.max).toBe("400");
    fireEvent.change(slider, { target: { value: "250" } });
    expect(shown()).toEqual(["a", "c"]);
    expect(screen.getByRole("button", { name: /^Remove: Up to .*250 a night/ })).toBeTruthy();
    fireEvent.change(slider, { target: { value: "400" } });
    expect(shown()).toEqual(["a", "c", "b"]);
    expect(searches()).toHaveLength(1);
  });

  it("takes a chip off to remove its filter, and clears every filter at once", async () => {
    stayApi = varied();
    const user = u();
    renderStay();
    await openFilters(user);
    await screen.findByTestId("card-a");
    await user.click(screen.getByRole("button", { name: "4" }));
    await user.click(screen.getByRole("checkbox", { name: "Free cancellation only" }));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "250" } });
    expect(shown()).toEqual(["a"]);
    await user.click(screen.getByRole("button", { name: "Remove: Free cancellation" }));
    expect(screen.queryByRole("button", { name: "Remove: Free cancellation" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(shown()).toEqual(["a", "c", "b"]);
    expect(screen.queryByRole("button", { name: /^Remove:/ })).toBeNull();
  });

  it("says which filter to loosen when they leave nothing, and clears them on request", async () => {
    stayApi = varied();
    const user = u();
    renderStay();
    await openFilters(user);
    await screen.findByTestId("card-a");
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("checkbox", { name: "Free cancellation only" }));
    expect(await screen.findByText("No stays match those filters")).toBeTruthy();
    expect(screen.getByText(/3 stays are available for/)).toBeTruthy();
    await user.click(screen.getAllByRole("button", { name: "Clear filters" }).at(-1)!);
    expect(shown()).toEqual(["a", "c", "b"]);
  });

  it("reaches further with a deeper search only when a capped first page leaves too few matches", async () => {
    stayApi = result([hotel("a", "Hotel A", { stars: 4 }), hotel("b", "Hotel B", { stars: 5 })], { capped: true, total: 30 });
    const user = u();
    renderStay();
    await openFilters(user);
    await screen.findByTestId("card-a");
    stayApi = result([hotel("deep1", "Deep One", { stars: 5 })], { deep: true, capped: true, total: 30 });
    await user.click(screen.getByRole("button", { name: "5" }));
    await waitFor(() => expect(searches()).toHaveLength(2));
    expect(lastSearch().get("deep")).toBe("1");
    expect(lastSearch().get("stars")).toBe("5");
    await screen.findByTestId("card-deep1");
  });

  it("offers type and price filters only when there is something to choose between", async () => {
    stayApi = result([hotel("h1", "Hotel Un")], { facets: { priceMin: 100, priceMax: 100, stars: [], boards: [], propertyTypes: ["Hotel"] } });
    const user = u();
    renderStay();
    await openFilters(user);
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByText("Type of place")).toBeNull();
    expect(screen.queryByText("Star rating")).toBeNull();
    expect(screen.queryByText("Meals")).toBeNull();
  });

  it("puts the screen back as it was left: the same filters after the reader comes back", async () => {
    stayApi = varied();
    const user = u();
    const first = renderStay();
    await openFilters(user);
    await screen.findByTestId("card-a");
    await user.click(screen.getByRole("button", { name: "4" }));
    first.unmount();
    renderStay();
    await screen.findByTestId("card-a");
    expect(shown()).toEqual(["a"]);
  });
});

describe("StaySurface: asking Roam", () => {
  it("applies what Roam understood: the place and party search again; the price, stars, boards, types, refundable and order apply at once", async () => {
    stayApi = result([hotel("a", "Hotel A", { stars: 4, nightlyAmount: 120, rating: 9, boardName: "Breakfast", refundable: true, propertyType: "Apartment", rooms: [{ boardName: "Breakfast", refundable: true }] }), hotel("b", "Hotel B", { stars: 5, nightlyAmount: 380 })]);
    renderStay();
    await screen.findByTestId("card-a");
    act(() => directive.current!({ location: "Gare de Lyon", priceMax: 250, stars: [4], boards: ["Breakfast"], propertyTypes: ["Apartment"], refundable: true, sort: "rating", adults: 3, rooms: 2 }));
    await waitFor(() => expect(lastSearch().get("location")).toBe("Gare de Lyon"));
    expect(Object.fromEntries(lastSearch())).toMatchObject({ adults: "3", rooms: "2", location: "Gare de Lyon" });
    expect(lastSearch().get("priceMax")).toBeNull();
    expect(lastSearch().get("stars")).toBeNull();
    await screen.findByTestId("card-a");
    expect(screen.queryByTestId("card-b")).toBeNull();
    for (const chip of [/^Remove: Near Gare de Lyon/, /^Remove: Up to/, /^Remove: 4 stars/, /^Remove: Free cancellation/, /^Remove: Breakfast/, /^Remove: Apartment/]) expect(screen.getByRole("button", { name: chip })).toBeTruthy();
  });

  it("applies a price range and the dates it names, and shows the range", async () => {
    stayApi = result([hotel("a", "Hotel A", { nightlyAmount: 120 }), hotel("b", "Hotel B", { nightlyAmount: 180 }), hotel("c", "Hotel C", { nightlyAmount: 320 })]);
    renderStay();
    await screen.findByTestId("card-a");
    act(() => directive.current!({ priceMin: 150, priceMax: 200, checkin: "2026-12-10", checkout: "2026-12-14" }));
    await waitFor(() => expect(lastSearch().get("checkin")).toBe("2026-12-10"));
    expect(lastSearch().get("checkout")).toBe("2026-12-14");
    await screen.findByTestId("card-b");
    expect(screen.queryByTestId("card-a")).toBeNull();
    expect(screen.queryByTestId("card-c")).toBeNull();
    expect(screen.getByRole("button", { name: /^Remove: .*150.*200 a night/ })).toBeTruthy();
  });

  it("moves only the start when only a start is named, keeping the length of the stay; and only the length when only a length is", async () => {
    renderStay();
    await screen.findByTestId("card-h1");
    act(() => directive.current!({ checkin: "2026-12-10" }));
    await waitFor(() => expect(lastSearch().get("checkin")).toBe("2026-12-10"));
    expect(lastSearch().get("checkout")).toBe("2026-12-14");
    act(() => directive.current!({ nights: 2 }));
    await waitFor(() => expect(lastSearch().get("checkout")).toBe("2026-12-12"));
    expect(lastSearch().get("checkin")).toBe("2026-12-10");
    act(() => directive.current!({ checkin: "2027-01-03", nights: 3 }));
    await waitFor(() => expect(lastSearch().get("checkout")).toBe("2027-01-06"));
  });

  it("sorts high to low from a sentence, at once", async () => {
    stayApi = result([hotel("a", "Hotel A", { nightlyAmount: 100 }), hotel("b", "Hotel B", { nightlyAmount: 300 })]);
    renderStay();
    await screen.findByTestId("card-a");
    act(() => directive.current!({ sort: "price_desc" }));
    await waitFor(() => expect(Array.from(document.querySelectorAll("[data-testid^='card-']")).map((e) => e.getAttribute("data-testid"))).toEqual(["card-b", "card-a"]));
    expect(screen.getByText(/Most expensive first/)).toBeTruthy();
    expect(searches()).toHaveLength(1);
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
    const chip = await screen.findByRole("button", { name: "Remove: Near Gare de Lyon" });
    sessionStorage.clear();
    await user.click(chip);
    await waitFor(() => expect(lastSearch().get("location")).toBeNull());
    expect(screen.queryByRole("button", { name: /^Remove: Near/ })).toBeNull();
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
    cities = { ...cities, hasChoice: true, scoped: true, city: "Lyon", stop: { city: "Lyon", startDate: "2026-12-05", endDate: "2026-12-08" }, stops: [{ city: "Paris" }, { city: "Lyon" }] };
    renderStay();
    await screen.findByTestId("card-h1");
    act(() => directive.current!({ location: "Part-Dieu" }));
    await waitFor(() => expect(lastSearch().get("location")).toBe("Part-Dieu"));
  });

  it("forgets the 'near' place when another city is picked", async () => {
    cities = { ...cities, hasChoice: true, scoped: true, city: "Paris", stop: { city: "Paris", startDate: "2026-12-01", endDate: "2026-12-05" }, stops: [{ city: "Paris" }, { city: "Lyon" }] };
    const view = renderStay();
    await screen.findByTestId("card-h1");
    act(() => directive.current!({ location: "Gare de Lyon" }));
    expect(await screen.findByRole("button", { name: "Remove: Near Gare de Lyon" })).toBeTruthy();
    cities = { ...cities, city: "Lyon", stop: { city: "Lyon", startDate: "2026-12-05", endDate: "2026-12-08" } };
    view.rerender(<StaySurface tripId={TRIP} destination="Paris, France" />);
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Remove: Near/ })).toBeNull());
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
    cities = { ...cities, hasChoice: true, scoped: true, city: "Paris", stop: { city: "Paris", startDate: "2026-12-01", endDate: "2026-12-05" }, stops: [{ city: "Paris" }, { city: "Lyon" }] };
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
    expect(container.textContent).toBe("Paris");
    expect(screen.getByTestId("city-chips").className).toContain("max-lg:hidden");
    expect(screen.getByTestId("ai").getAttribute("data-placeholder")).toBe("Try “Dec 10–14, 4 stars, under 200”");
  });

  it("has a Filter button on the count line that opens the filters", async () => {
    const user = u();
    renderStay();
    await screen.findByTestId("card-h1");
    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(screen.getByRole("button", { name: "4" }));
    expect(screen.getByRole("button", { name: /^Remove: .*4/ })).toBeTruthy();
  });

  it("sorts and toggles free cancellation from chips", async () => {
    const user = u();
    renderStay();
    await screen.findByTestId("card-h1");
    await user.click(screen.getByRole("button", { name: "Free cancellation" }));
    expect(screen.getByRole("button", { name: "Remove: Free cancellation" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(screen.getByRole("button", { name: "Guest rating" }));
    expect(searches()).toHaveLength(1);
  });
});
