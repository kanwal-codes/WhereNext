// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const feedState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const tripState = vi.hoisted(() => ({ destination: "Montreal, Canada" }));

vi.mock("@/components/TripDataProvider", () => ({ useTripData: () => ({ tripId: "t1", data: { trip: { destination: tripState.destination }, preferences: {}, savedPlaces: [] } }) }));
vi.mock("@/lib/client/use-trip-city", () => ({ useTripCity: () => ({ scoped: false, hasChoice: false, broad: false, city: "Montreal", stops: [], area: null, setCity: () => {}, setArea: () => {}, stop: null, parent: "Montreal", estimated: false }) }));
vi.mock("@/lib/use-media-query", () => ({ useMediaQuery: () => true }));
vi.mock("@/components/shell/PhoneHeader", () => ({ PHONE_ROUND: "", useSetPhoneHeader: () => {} }));
vi.mock("@/components/CityPill", () => ({ CityPill: () => null }));
vi.mock("@/components/AiSearchBar", () => ({ AiSearchBar: () => null }));
vi.mock("@/components/PlaceCard", () => ({ PlaceCard: ({ place }: { place: { name: string } }) => <div data-testid="tile">{place.name}</div> }));
vi.mock("@/features/places/application/useSavedPlaces", () => ({ useSavedPlaces: () => ({ saved: [] }) }));
vi.mock("@/features/places/application/useDiscoverFeed", () => ({ useDiscoverFeed: () => feedState.current }));

import { EatSurface } from "@/features/eat/ui/EatSurface";

const place = (name: string, o: Record<string, unknown> = {}) => ({ kind: "place" as const, place: { providerId: name, name, ...o } });
const feed = (o: Record<string, unknown>) => ({ error: false, retry: vi.fn(), subs: [], setSubs: vi.fn(), toggleSub: vi.fn(), items: [], loading: false, message: "", applyDirective: vi.fn(), ...o });
const show = () => render(<EatSurface tripId="t1" view="results" onViewChange={() => {}} />);

beforeEach(() => { tripState.destination = "Montreal, Canada"; });
afterEach(cleanup);

describe("EatSurface states", () => {
  it("shows the places, with the pills that would change them", () => {
    feedState.current = feed({ items: [place("A", { rating: 4.8, openNow: true }), place("B", { rating: 3, openNow: false })] });
    show();
    expect(screen.getAllByTestId("tile")).toHaveLength(2);
    const pills = within(screen.getByRole("group", { name: "Sort and filter" }));
    expect(pills.getByRole("button", { name: "Open now" })).toBeTruthy();
    expect(pills.getByRole("button", { name: /^Sort:/ })).toBeTruthy();
  });
  it("says it could not load places, and tries again", () => {
    const f = feed({ error: true });
    feedState.current = f;
    show();
    expect(screen.getByText("We couldn’t load places")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(f.retry).toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "Sort and filter" })).toBeNull();
  });
  it("says there is nothing to show when nothing came back", () => {
    feedState.current = feed({});
    show();
    expect(screen.getByText("No places to show")).toBeTruthy();
  });
  it("asks for a destination when the trip has none", () => {
    tripState.destination = "";
    feedState.current = feed({});
    show();
    expect(screen.getByText("Where are you going?")).toBeTruthy();
  });
  it("shows a skeleton while loading, not a message", () => {
    feedState.current = feed({ loading: true });
    show();
    expect(screen.queryByText("No places to show")).toBeNull();
    expect(screen.getByRole("group", { name: "Sort and filter" })).toBeTruthy();
  });
});
