// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApi, event, matchMedia, place, stay } from "../support/discovery-harness";

/** Characterization tests for Discover on a phone: the header's city pill and saved heart, the chip row, the feature tile and two-column grid. */
let tripId = "p0";
let data: Record<string, unknown>;
let header: { titleNode?: React.ReactNode; trailing?: React.ReactNode } = {};
let panel: null | { compareMode: boolean; setCompareMode: ReturnType<typeof vi.fn>; compareClear: ReturnType<typeof vi.fn>; compareList: unknown[]; compareToggle: ReturnType<typeof vi.fn>; compareHas: () => boolean; openPanel: ReturnType<typeof vi.fn> };

vi.mock("@/lib/phone-v2", () => ({ PHONE_V2: true }));
vi.mock("@/components/TripDataProvider", () => ({ useTripData: () => ({ data }) }));
vi.mock("@/components/TripPanelProvider", () => ({ useTripPanelMaybe: () => panel }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/PlaceCard", async () => ({ PlaceCard: (await import("../support/discovery-harness")).stubs.PlaceCard }));
vi.mock("@/components/EventCard", async () => ({ EventCard: (await import("../support/discovery-harness")).stubs.EventCard }));
vi.mock("@/features/stays/ui/StayResultCard", async () => ({ StayResultCard: (await import("../support/discovery-harness")).stubs.StayResultCard }));
vi.mock("@/features/places/ui/DiscoverTile", async () => ({ DiscoverTile: (await import("../support/discovery-harness")).stubs.DiscoverTile }));
vi.mock("@/components/AiSearchBar", async () => ({ AiSearchBar: (await import("../support/discovery-harness")).stubs.AiSearchBar }));
vi.mock("@/components/CityChips", async () => ({ CityChips: (await import("../support/discovery-harness")).stubs.CityChips }));
vi.mock("@/components/CityPill", async () => ({ CityPill: (await import("../support/discovery-harness")).stubs.CityPill }));
vi.mock("@/components/SwapView", async () => ({ SwapView: (await import("../support/discovery-harness")).stubs.SwapView }));
vi.mock("@/components/SegmentedSwitch", async () => ({ SegmentedSwitch: (await import("../support/discovery-harness")).stubs.SegmentedSwitch }));
vi.mock("@/components/shell/PhoneHeader", () => ({ PHONE_ROUND: "round", useSetPhoneHeader: (h: typeof header) => { header = h; } }));
vi.mock("@/features/conversation/ui/blocks/ui", () => ({ CompareMark: () => null }));

import { DiscoverySurface } from "../../features/places/ui/DiscoverySurface";

let n = 0;
let api: ReturnType<typeof createApi>;
const u = () => userEvent.setup({ pointerEventsCheck: 0 });
const show = (props: Partial<React.ComponentProps<typeof DiscoverySurface>> = {}) =>
  render(<DiscoverySurface tripId={tripId} view="results" onViewChange={() => undefined} initialSaved={[]} {...props} />);
const modes = (testId: string) => screen.queryAllByTestId(testId).map((e) => `${e.textContent!.trim()}:${e.getAttribute("data-mode")}`);

const PLACES = {
  "top sights": [place("s1", "Louvre", { rating: 4.9, userRatingCount: 90000 }), place("s2", "Eiffel Tower")],
  "restaurants and cafes": [place("e1", "Chez Paul")],
  "highly rated": [place("s1", "Louvre")],
};

beforeEach(() => {
  sessionStorage.clear();
  tripId = `phone-${n++}`;
  data = { trip: { id: tripId, destination: "Paris, France", start_date: null, end_date: null, stops: null }, preferences: {}, decisions: [], itinerary: [], rejectedPlaceIds: [] };
  panel = null;
  header = {};
  api = createApi({ places: PLACES, events: [[event("https://t/1", "Jazz Night", "2026-11-01")]], stays: [stay("h1", "Hotel Lutetia")] });
  window.matchMedia = matchMedia(true);
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Discover on a phone", () => {
  it("shows one wide feature result first, then the rest two to a row, with no repeats across bands", async () => {
    show();
    await waitFor(() => expect(screen.queryAllByTestId("place").length + screen.queryAllByTestId("tile").length).toBeGreaterThan(2));
    const places = modes("place");
    expect(places[0]).toMatch(/:feature$/);
    expect(places.slice(1).every((p) => p.endsWith(":grid"))).toBe(true);
    // The Louvre is in both the sights band and the for-you band, but is listed once.
    expect(places.filter((p) => p.startsWith("Louvre"))).toHaveLength(1);
  });

  it("puts the city pill and the saved heart in the header", async () => {
    show();
    await waitFor(() => expect(header.titleNode).toBeTruthy());
    render(<>{header.titleNode}{header.trailing}</>);
    expect(screen.getByText("PILL Paris")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Saved places" })).toBeTruthy();
  });

  it("switches to saved when the heart is tapped, and shows how many are saved", async () => {
    const onViewChange = vi.fn();
    show({ onViewChange, initialSaved: [place("p1", "Kept One"), place("p2", "Kept Two")] as never });
    await waitFor(() => expect(header.trailing).toBeTruthy());
    cleanup();
    render(<>{header.trailing}</>);
    const heart = screen.getByRole("button", { name: "Saved places, 2" });
    await u().click(heart);
    expect(onViewChange).toHaveBeenCalledWith("saved");
  });

  it("lists the saved places under a 'Saved places' heading, and goes back with the heart", async () => {
    const onViewChange = vi.fn();
    show({ view: "saved", onViewChange, initialSaved: [place("p1", "Kept One")] as never });
    expect(await screen.findByRole("heading", { name: /Saved places/ })).toBeTruthy();
    await waitFor(() => expect(modes("place")).toEqual(["Kept One:feature"]));
    cleanup();
    render(<>{header.trailing}</>);
    expect(screen.getByRole("button", { name: "Back to ideas" })).toBeTruthy();
  });

  it("says nothing is saved yet, with a way to ask Roam", async () => {
    const view = show();
    await waitFor(() => expect(screen.queryAllByTestId("place").length).toBeGreaterThan(0));
    view.rerender(<DiscoverySurface tripId={tripId} view="saved" onViewChange={() => undefined} initialSaved={[]} />);
    expect(await screen.findByText("Nothing saved yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Ask Roam for ideas/ }).getAttribute("href")).toBe(`/trips/${tripId}/chat`);
  });

  it("picks a category from the chip row, and puts that ask into the 'Ask Roam instead' link when nothing matches", async () => {
    api = createApi({ places: {}, events: [], stays: [] });
    const user = u();
    show();
    await user.click(await screen.findByRole("button", { name: "Nightlife" }));
    expect(await screen.findByText("Nothing matched that")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Ask Roam instead/ }).getAttribute("href")).toBe(`/trips/${tripId}/chat?ask=${encodeURIComponent("Nightlife")}`);
  });

  it("opens the filter panel with the category's sub-types, counted on the filter button", async () => {
    api = createApi({ places: { "": [place("n1", "Club Le Pigalle")] }, events: [], stays: [] });
    const user = u();
    show();
    await user.click(await screen.findByRole("button", { name: "Nightlife" }));
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(await screen.findByRole("button", { name: "Clubs" }));
    expect(await screen.findByRole("button", { name: "Filters, 1 on" })).toBeTruthy();
    expect(api.placeQueries().some((q) => q.startsWith("nightclubs"))).toBe(true);
  });

  it("asks for a destination when the trip has none", async () => {
    (data.trip as Record<string, unknown>).destination = "";
    show();
    expect(await screen.findByText("Set a destination for this trip to see ideas here.")).toBeTruthy();
  });

  it("shows at most six of a band in the flat feed, however many it holds", async () => {
    const many = Array.from({ length: 20 }, (_, i) => place(`m${i}`, `Place ${i}`, { rating: 4 + (i % 10) / 20 }));
    api = createApi({ places: { "top sights": many, "restaurants and cafes": [], "guided tours": [], "highly rated": [] }, events: [], stays: [] });
    show();
    await waitFor(() => expect(screen.queryAllByTestId("place").length).toBe(6));
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
  });
});
