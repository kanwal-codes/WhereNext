// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization tests for the side-by-side place table (the /compare page and the chat panel): fetching the places, the rows and
 * which pick is best at what, the distance from where you stay, choosing one, and the phone's version. Data, motion and the toast are faked.
 */
const TRIP = "11111111-1111-4111-8111-111111111111";
type Any = Record<string, any>;
let tripData: Any | null;
let guest = false;
let details: Record<string, Any | null>;
const openGate = vi.fn();
const announce = vi.fn();
const toast = vi.fn();
const fetchDetails = vi.fn();
let calls: Array<{ url: string; init?: RequestInit }>;
let postStatus = 200;
let savedFetch: Any;

vi.mock("@/components/TripDataProvider", () => ({ useTripData: () => ({ data: tripData }) }));
vi.mock("@/features/identity/ui/GuestProvider", () => ({ useGuest: () => ({ guest, openGate }) }));
vi.mock("@/components/use-distance", () => ({ useDistance: () => (km: number) => `${km.toFixed(1)} km` }));
vi.mock("@/components/Skeleton", () => ({ Skeleton: () => <div data-testid="skeleton" /> }));
vi.mock("@/components/ExternalLink", () => ({ ExternalLink: ({ href, children }: Any) => <a href={href}>{children}</a> }));
vi.mock("@/lib/application/workspace-events", () => ({ announceWorkspaceChange: (...a: unknown[]) => announce(...a) }));
vi.mock("@/lib/application/toast", () => ({ notifyToast: (...a: unknown[]) => toast(...a) }));
vi.mock("next/link", () => ({ __esModule: true, default: ({ href, children, ...rest }: Any) => <a href={href} {...rest}>{children}</a> }));
vi.mock("motion/react", () => ({ AnimatePresence: ({ children }: Any) => <>{children}</>, motion: { div: ({ children, className }: Any) => <div className={className}>{children}</div> } }));
vi.mock("@/features/places/application/placeDetailsCache", () => ({ fetchPlaceDetails: (...a: unknown[]) => fetchDetails(...a) }));

import { CompareView } from "../../components/CompareView";

const WEEK = ["Monday: 9:00 AM – 6:00 PM", "Tuesday: 9:00 AM – 7:00 PM", "Wednesday: 10:00 AM – 8:00 PM", "Thursday: Closed", "Friday: x", "Saturday: x", "Sunday: Closed"];
const place = (id: string, name: string, over: Any = {}) => ({
  id, displayName: { text: name }, formattedAddress: `${name} street`, primaryType: "museum", rating: 4.5, userRatingCount: 1000, priceLevel: "PRICE_LEVEL_MODERATE",
  location: { latitude: 48.86, longitude: 2.34 }, googleMapsUri: `https://maps.google.com/?q=${id}`, regularOpeningHours: { weekdayDescriptions: WEEK }, photos: [{ name: `places/${id}/photos/1` }], ...over,
});
const u = () => userEvent.setup({ pointerEventsCheck: 0 });
const view = (ids: string[], onIdsChange?: (ids: string[]) => void) => render(<CompareView tripId={TRIP} ids={ids} onIdsChange={onIdsChange} />);
const table = () => document.querySelector(".min-w-\\[560px\\]") as HTMLElement;
const rowOf = (label: string) => within(table()).getByText(label).parentElement as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-02T12:00:00")); // a Wednesday
  guest = false; postStatus = 200;
  tripData = { savedPlaces: [], decisions: [], itinerary: [] };
  details = { a: place("a", "Louvre"), b: place("b", "Orsay", { rating: 4.8, userRatingCount: 400, priceLevel: "PRICE_LEVEL_INEXPENSIVE", location: { latitude: 48.87, longitude: 2.33 } }), c: place("c", "Rodin", { rating: 4.2, userRatingCount: 2500, priceLevel: "PRICE_LEVEL_EXPENSIVE" }) };
  savedFetch = { places: [] };
  openGate.mockClear(); announce.mockClear(); toast.mockClear();
  fetchDetails.mockReset();
  fetchDetails.mockImplementation(async (_t: string, id: string) => ({ place: details[id] ?? null }));
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (init?.method === "POST") return new Response("{}", { status: postStatus });
    return new Response(JSON.stringify(savedFetch), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("CompareView: what is asked for", () => {
  it("asks for two or more picks, and points to Discover", () => {
    view(["a"]);
    expect(screen.getByText("Nothing to compare yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Discover" }).getAttribute("href")).toBe(`/trips/${TRIP}/discover`);
    expect(fetchDetails.mock.calls.map((c) => c[1])).toEqual(["a"]); // the single pick is still fetched, ready for the second
  });

  it("shows a skeleton while the first places load", async () => {
    let release!: () => void;
    fetchDetails.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ place: details.a }); }));
    view(["a", "b"]);
    expect(await screen.findByTestId("skeleton")).toBeTruthy();
    release();
  });

  it("waits for every pick before showing the first table", async () => {
    let releaseB!: () => void;
    fetchDetails.mockImplementation((_t: string, id: string) => (id === "a" ? Promise.resolve({ place: details.a }) : new Promise((resolve) => { releaseB = () => resolve({ place: details.b }); })));
    view(["a", "b"]);
    expect(await screen.findByTestId("skeleton")).toBeTruthy();
    expect(screen.queryByText("Louvre")).toBeNull();
    releaseB();
    await screen.findAllByText("Orsay");
    expect(screen.queryByTestId("skeleton")).toBeNull();
  });

  it("keeps the table in place while a newly added pick loads", async () => {
    const { rerender } = view(["a", "b"]);
    await screen.findAllByText("Louvre");
    let releaseC!: () => void;
    fetchDetails.mockImplementation(() => new Promise((resolve) => { releaseC = () => resolve({ place: details.c }); }));
    rerender(<CompareView tripId={TRIP} ids={["a", "b", "c"]} />);
    await waitFor(() => expect(fetchDetails).toHaveBeenCalledTimes(3));
    expect(screen.queryByTestId("skeleton")).toBeNull();
    expect(within(table()).getByText("Louvre")).toBeTruthy();
    releaseC();
    await screen.findAllByText("Rodin");
  });

  it("fetches each place once, and only the new one when a pick is added", async () => {
    const { rerender } = view(["a", "b"]);
    await screen.findAllByText("Louvre");
    expect(fetchDetails.mock.calls.map((c) => c[1]).sort()).toEqual(["a", "b"]);
    rerender(<CompareView tripId={TRIP} ids={["a", "b", "c"]} />);
    await screen.findAllByText("Rodin");
    expect(fetchDetails.mock.calls.map((c) => c[1]).sort()).toEqual(["a", "b", "c"]);
  });

  it("leaves out a place whose details could not be loaded", async () => {
    details.b = null;
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    expect(screen.queryByText("Orsay")).toBeNull();
  });
});

describe("CompareView: the table", () => {
  it("has a column per place and the rows in order", async () => {
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    const labels = Array.from(table().querySelectorAll(".col-span-full > div:first-child")).map((e) => e.textContent);
    expect(labels).toEqual(["Type", "Rating", "Reviews", "Price", "Hours", "Source"]);
    expect(within(table()).getByRole("link", { name: "Louvre" }).getAttribute("href")).toBe(`/trips/${TRIP}/place/a`);
    expect(within(table()).getByText("Louvre street")).toBeTruthy();
  });

  it("marks the best rated, the most reviewed and the lowest price", async () => {
    view(["a", "b", "c"]);
    await screen.findAllByText("Louvre");
    const rating = rowOf("Rating");
    expect(within(rating).getByText("Best rated").parentElement?.textContent).toContain("4.8");
    expect(within(rowOf("Reviews")).getByText("Most reviewed").parentElement?.textContent).toContain("2,500");
    expect(within(rowOf("Price")).getByText("Lowest").parentElement?.textContent).toContain("$");
    expect(within(rating).getAllByText("Best rated")).toHaveLength(1);
  });

  it("shows today's hours, and 'See listing' when there are none", async () => {
    details.b = place("b", "Orsay", { regularOpeningHours: undefined });
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    const hours = rowOf("Hours");
    expect(hours.textContent).toContain("Wednesday: 10:00 AM – 8:00 PM");
    expect(hours.textContent).toContain("See listing");
  });

  it("reads Sunday's hours from the end of the week", async () => {
    vi.setSystemTime(new Date("2026-12-06T12:00:00")); // a Sunday
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    expect(rowOf("Hours").textContent).toContain("Sunday: Closed");
  });

  it("links the source, or just names it", async () => {
    details.b = place("b", "Orsay", { googleMapsUri: undefined });
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    const source = rowOf("Source");
    expect(within(source).getAllByText("Google Maps")).toHaveLength(2);
    expect(within(source).getAllByRole("link")).toHaveLength(1);
  });

  it("shows a dash for what a place does not have", async () => {
    details.b = place("b", "Orsay", { rating: undefined, userRatingCount: undefined, priceLevel: undefined });
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    expect(within(rowOf("Rating")).getByText("—")).toBeTruthy();
    expect(within(rowOf("Reviews")).getByText("—")).toBeTruthy();
    expect(within(rowOf("Price")).getByText("—")).toBeTruthy();
    expect(within(rowOf("Price")).getByText("Lowest")).toBeTruthy(); // the one that has a price is still the lowest
  });

  it("names no lowest price when nobody has one", async () => {
    details.a = place("a", "Louvre", { priceLevel: undefined });
    details.b = place("b", "Orsay", { priceLevel: undefined });
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    expect(within(table()).queryByText("Lowest")).toBeNull();
  });

  it("does not crown a most-reviewed place with no reviews", async () => {
    details.a = place("a", "Louvre", { userRatingCount: 0 });
    details.b = place("b", "Orsay", { userRatingCount: 0 });
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    expect(within(table()).queryByText("Most reviewed")).toBeNull();
  });
});

describe("CompareView: how far from where you stay", () => {
  const stay = { kind: "stay", value: { provider: "liteapi", hotelId: "h", hotelName: "Hotel X", roomName: "R", board: null, refundable: true, checkin: "2026-12-01", checkout: "2026-12-04", nights: 3, nightlyAmount: 1, totalAmount: 3, currency: "EUR", latitude: 48.86, longitude: 2.34, address: null, thumbnail: null } };

  it("adds a row from the locked stay, and marks the closest", async () => {
    tripData = { ...tripData, decisions: [stay] };
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    const row = rowOf("From your stay");
    expect(row.textContent).toContain("0.0 km");
    expect(within(row).getByText("Closest").parentElement?.textContent).toContain("0.0 km");
    const labels = Array.from(table().querySelectorAll(".col-span-full > div:first-child")).map((e) => e.textContent);
    expect(labels).toEqual(["Type", "Rating", "Reviews", "Price", "From your stay", "Hours", "Source"]);
  });

  it("falls back to the locked plans on the itinerary, nearest of them", async () => {
    tripData = { ...tripData, itinerary: [
      { title: "Dinner", metadata: { locked: true, latitude: 48.87, longitude: 2.33 } },
      { title: "Tour", metadata: { locked: true, latitude: 40, longitude: 0 } },
      { title: "Idea", metadata: { latitude: 48.86, longitude: 2.34 } },
      { title: "No place", metadata: { locked: true } },
    ] };
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    const row = rowOf("From your plans");
    // Orsay sits on the dinner; the Louvre is about 1.3 km away. Unlocked ideas do not count.
    expect(within(row).getByText("Closest").parentElement?.textContent).toMatch(/^0\.0 km/);
  });

  it("prefers the stay over the plans", async () => {
    tripData = { ...tripData, decisions: [stay], itinerary: [{ title: "Dinner", metadata: { locked: true, latitude: 48.87, longitude: 2.33 } }] };
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    expect(within(table()).queryByText("From your plans")).toBeNull();
    expect(within(table()).getByText("From your stay")).toBeTruthy();
  });

  it("has no distance row without anything to measure from, and a dash for a place with no location", async () => {
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    expect(within(table()).queryByText(/From your/)).toBeNull();
    cleanup();
    tripData = { ...tripData, decisions: [stay] };
    details.b = place("b", "Orsay", { location: undefined });
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    expect(within(rowOf("From your stay")).getByText("—")).toBeTruthy();
  });

  it("ignores a stay without coordinates", async () => {
    tripData = { ...tripData, decisions: [{ ...stay, value: { ...stay.value, latitude: null, longitude: null } }] };
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    expect(within(table()).queryByText(/From your/)).toBeNull();
  });
});

describe("CompareView: removing a pick", () => {
  it("offers it only with more than two picks and somewhere to report it", async () => {
    view(["a", "b", "c"]);
    await screen.findAllByText("Louvre");
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    cleanup();
    view(["a", "b"], vi.fn());
    await screen.findAllByText("Louvre");
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
  });

  it("drops the chosen one from the ids", async () => {
    const onIdsChange = vi.fn();
    const user = u();
    view(["a", "b", "c"], onIdsChange);
    await screen.findAllByText("Louvre");
    await user.click(within(table()).getByRole("button", { name: "Remove Orsay from comparison" }));
    expect(onIdsChange).toHaveBeenCalledWith(["a", "c"]);
  });
});

describe("CompareView: choosing one", () => {
  beforeEach(() => { vi.useRealTimers(); });

  it("marks places already on the trip, from the trip's own data", async () => {
    tripData = { ...tripData, savedPlaces: [{ places: { provider_id: "a" } }] };
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    const buttons = within(table()).getAllByRole("button");
    expect(buttons[0].textContent).toContain("On the trip");
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true);
    expect(buttons[1].textContent).toBe("Choose this");
    expect(calls.some((c) => c.url.endsWith("/places") && !c.init?.method)).toBe(false);
  });

  it("asks the server which are saved when the trip data is not at hand", async () => {
    tripData = null;
    savedFetch = { places: [{ providerId: "b" }, {}] };
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    await waitFor(() => expect(within(table()).getAllByRole("button")[1].textContent).toContain("On the trip"));
    expect(calls[0].url).toBe(`/api/trips/${TRIP}/places`);
  });

  it("saves the place, shows it saved at once, and tells the workspace", async () => {
    const user = u();
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    await user.click(within(table()).getAllByRole("button", { name: "Choose this" })[0]);
    expect(within(table()).getAllByRole("button")[0].textContent).toContain("On the trip");
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Louvre saved to the trip.", "success"));
    const post = calls.find((c) => c.init?.method === "POST")!;
    expect(post.url).toBe(`/api/trips/${TRIP}/places`);
    expect(JSON.parse(String(post.init?.body))).toMatchObject({ provider: "google-places", providerId: "a", name: "Louvre", latitude: 48.86, longitude: 2.34, photoNames: ["places/a/photos/1"] });
    expect(announce).toHaveBeenCalledWith("places");
  });

  it("puts it back and says so when saving fails", async () => {
    const user = u();
    postStatus = 500;
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    await user.click(within(table()).getAllByRole("button", { name: "Choose this" })[0]);
    await waitFor(() => expect(toast).toHaveBeenCalledWith("That didn’t save. Try again.", "error"));
    expect(within(table()).getAllByRole("button")[0].textContent).toBe("Choose this");
    expect(announce).not.toHaveBeenCalled();
  });

  it("opens the sign-in gate for a guest instead of saving", async () => {
    const user = u();
    guest = true;
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    await user.click(within(table()).getAllByRole("button", { name: "Choose this" })[0]);
    expect(openGate).toHaveBeenCalledWith("save places");
    expect(calls.some((c) => c.init?.method === "POST")).toBe(false);
  });

  it("does nothing for a place with no location to save", async () => {
    const user = u();
    details.a = place("a", "Louvre", { location: undefined });
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    await user.click(within(table()).getAllByRole("button", { name: "Choose this" })[0]);
    expect(calls.some((c) => c.init?.method === "POST")).toBe(false);
    expect(within(table()).getAllByRole("button")[0].textContent).toBe("Choose this");
  });
});

describe("CompareView: on the phone", () => {
  beforeEach(() => { });
  const phone = () => document.querySelector(".lg\\:hidden") as HTMLElement;

  it("asks 'A or B?' for two, and counts more", async () => {
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    expect(within(phone()).getByRole("heading", { level: 2 }).textContent).toBe("Louvre or Orsay?");
    cleanup();
    view(["a", "b", "c"]);
    await screen.findAllByText("Rodin");
    expect(within(phone()).getByRole("heading", { level: 2 }).textContent).toBe("Comparing 3 places");
  });

  it("shows each pick as a photo that opens the place, with a way to choose", async () => {
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    expect(within(phone()).getByRole("link", { name: "Open Louvre" }).getAttribute("href")).toBe(`/trips/${TRIP}/place/a`);
    const img = phone().querySelector("img")!;
    expect(img.getAttribute("src")).toContain(encodeURIComponent("places/a/photos/1"));
    expect(within(phone()).getAllByRole("button", { name: "Choose this" })).toHaveLength(2);
  });

  it("stands in a pin for a place with no photo", async () => {
    details.a = place("a", "Louvre", { photos: undefined });
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    expect(phone().querySelectorAll("img")).toHaveLength(1);
  });

  it("marks the best of each fact with a dot, and reads hours without the weekday", async () => {
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    const rating = within(phone()).getByText("Rating").parentElement!;
    expect(rating.querySelectorAll(".sr-only")).toHaveLength(1);
    expect(rating.textContent).toContain("4.8");
    const hours = within(phone()).getByText("Hours").parentElement!;
    expect(hours.textContent).toContain("10:00 AM – 8:00 PM");
    expect(hours.textContent).not.toContain("Wednesday");
  });

  it("removes a pick from the photo when there are more than two", async () => {
    const onIdsChange = vi.fn();
    const user = u();
    view(["a", "b", "c"], onIdsChange);
    await screen.findAllByText("Rodin");
    await user.click(within(phone()).getByRole("button", { name: "Remove Rodin from comparison" }));
    expect(onIdsChange).toHaveBeenCalledWith(["a", "b"]);
  });

  it("marks no best when only one place has loaded", async () => {
    details.b = null;
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    expect(phone().querySelectorAll(".sr-only")).toHaveLength(0);
  });

  it("offers no remove on the photo with only two picks", async () => {
    view(["a", "b"], vi.fn());
    await screen.findAllByText("Louvre");
    expect(within(phone()).queryByRole("button", { name: /Remove/ })).toBeNull();
  });

  it("shows a dash for what a pick does not have, and marks one already on the trip", async () => {
    tripData = { ...tripData, savedPlaces: [{ places: { provider_id: "a" } }] };
    details.b = place("b", "Orsay", { rating: undefined, userRatingCount: undefined, priceLevel: undefined });
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    expect(within(within(phone()).getByText("Rating").parentElement!).getByText("—")).toBeTruthy();
    expect(within(within(phone()).getByText("Reviews").parentElement!).getByText("—")).toBeTruthy();
    expect(within(within(phone()).getByText("Price").parentElement!).getByText("—")).toBeTruthy();
    const onTrip = within(phone()).getByRole("button", { name: /On the trip/ }) as HTMLButtonElement;
    expect(onTrip.disabled).toBe(true);
    expect((within(phone()).getByRole("button", { name: "Choose this" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("hides the desktop table on a phone", async () => {
    view(["a", "b"]);
    await screen.findAllByText("Louvre");
    expect(table().parentElement?.className).toContain("max-lg:hidden");
  });

});
